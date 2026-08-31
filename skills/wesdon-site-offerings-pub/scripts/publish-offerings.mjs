#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";

const types = new Set(["product", "service"]);
const statuses = new Set(["draft", "published", "archived"]);

function text(value, limit = 10_000) { return String(value ?? "").trim().slice(0, limit); }

export function parseSiteConf(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const value = line.trim();
    if (!value || value.startsWith("#")) return [];
    const separator = value.indexOf("=");
    if (separator < 1) throw new Error(".siteconf 每个配置项都必须是 KEY=value。");
    const key = value.slice(0, separator).trim();
    let item = value.slice(separator + 1).trim();
    if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) item = item.slice(1, -1);
    return [[key, item]];
  }));
}

async function optionalConfig(file) {
  try { return parseSiteConf(await readFile(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return {}; throw error; }
}

export async function loadConfig(cwd = process.cwd(), home = homedir()) {
  const config = { ...await optionalConfig(join(home, ".siteconf")), ...await optionalConfig(join(cwd, ".siteconf")) };
  const missing = ["SITE_URL", "ADMIN_EMAIL", "ADMIN_PASSWORD"].filter((key) => !config[key]);
  if (missing.length) throw new Error(`缺少发布配置：${missing.join("、")}`);
  return { siteUrl: config.SITE_URL.replace(/\/$/, ""), email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD };
}

function parseFrontmatter(raw, name) {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("---\n")) throw new Error(`${name} 缺少前置元数据。`);
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) throw new Error(`${name} 的前置元数据未正确结束。`);
  const metadata = Object.fromEntries(normalized.slice(4, closing).split("\n").map((line) => {
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`${name} 的元数据必须使用 键: 值。`);
    return [line.slice(0, separator).trim(), text(line.slice(separator + 1))];
  }));
  return { metadata, markdown: normalized.slice(closing + 5).trim() };
}

function sections(markdown) {
  const matches = [...markdown.matchAll(/^##(?!#)[ \t]+(.+)\n([\s\S]*?)(?=^##(?!#)[ \t]+|(?![\s\S]))/gm)];
  return new Map(matches.map((match) => [match[1].trim(), match[2].trim()]));
}

function requiredSection(map, heading, name) {
  const value = text(map.get(heading));
  if (!value) throw new Error(`${name} 缺少“${heading}”区块。`);
  return value;
}

function list(value) {
  return value.split("\n").map((line) => line.match(/^\s*-\s+(.+)$/)?.[1] ?? "").map((item) => text(item, 500)).filter(Boolean);
}

function cards(value, name, heading) {
  if (!value) return [];
  const items = [...value.matchAll(/^###[ \t]+(.+)\n([\s\S]*?)(?=^###[ \t]+|(?![\s\S]))/gm)].map((match) => ({ title: text(match[1], 120), text: text(match[2], 1_000) })).filter((item) => item.title && item.text);
  if (!items.length) throw new Error(`${name} 的“${heading}”应使用三级标题加说明文字。`);
  return items;
}

function faq(value, name) {
  return cards(value, name, "常见问题").map((item) => ({ question: item.title, answer: item.text }));
}

function heading(markdown, name) {
  const first = markdown.match(/^#[ \t]+(.+)$/m)?.[1];
  if (!first) throw new Error(`${name} 缺少一级标题。`);
  return text(first, 200);
}

export function parseOfferingMarkdown(raw, name = "source.md") {
  const { metadata, markdown } = parseFrontmatter(raw, name);
  const type = text(metadata.type, 20);
  const status = text(metadata.status || "draft", 20);
  const slug = text(metadata.slug, 180).toLowerCase();
  if (!types.has(type)) throw new Error(`${name} 的 type 只能是 product 或 service。`);
  if (!statuses.has(status)) throw new Error(`${name} 的 status 不正确。`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${name} 的 Slug 不合法。`);
  const map = sections(markdown);
  const detailContent = type === "product" ? {
    capabilities: cards(map.get("核心能力") ?? "", name, "核心能力"),
    fit: list(map.get("适用场景") ?? ""),
    boundary: text(map.get("实施边界"), 2_000),
    faq: map.has("常见问题") ? faq(map.get("常见问题"), name) : [],
    ctaLabel: text(metadata.ctaLabel || "预约产品演示", 60),
  } : {
    situations: list(map.get("适用问题") ?? ""),
    scope: cards(map.get("交付范围") ?? "", name, "交付范围"),
    preparation: list(map.get("开始前准备") ?? ""),
    steps: cards(map.get("推进步骤") ?? "", name, "推进步骤"),
    boundary: text(map.get("服务边界"), 2_000),
    faq: map.has("常见问题") ? faq(map.get("常见问题"), name) : [],
    ctaLabel: text(metadata.ctaLabel || "联系咨询", 60),
  };
  const sortOrder = Number.parseInt(metadata.sortOrder || "0", 10);
  return {
    name, type, status, slug, title: heading(markdown, name), summary: requiredSection(map, "摘要", name).slice(0, 3_000),
    label: text(metadata.label, 160), eyebrow: text(metadata.eyebrow, 160), coverImage: text(metadata.coverImage, 2_000),
    detailContent, sortOrder: Number.isInteger(sortOrder) ? Math.max(-9_999, Math.min(9_999, sortOrder)) : 0,
    seoTitle: text(metadata.seoTitle, 200), seoDescription: text(metadata.seoDescription, 500), publishedAt: null,
  };
}

export async function readOfferings(source) {
  const directory = resolve(source);
  const names = (await readdir(directory)).filter((name) => extname(name).toLowerCase() === ".md").sort();
  if (!names.length) throw new Error("源目录中没有 Markdown 文件。");
  const items = await Promise.all(names.map(async (name) => parseOfferingMarkdown(await readFile(join(directory, name), "utf8"), name)));
  const keys = items.map((item) => `${item.type}:${item.slug}`);
  if (new Set(keys).size !== keys.length) throw new Error("源稿存在同类型重复 Slug。");
  return items;
}

async function login(config) {
  const response = await fetch(`${config.siteUrl}/api/auth/login`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: config.email, password: config.password, returnTo: "/admin" }) });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (response.status !== 303 || !cookie) throw new Error(`CMS 登录失败（HTTP ${response.status}）。`);
  return cookie;
}

async function existingItems(config, cookie, type) {
  const response = await fetch(`${config.siteUrl}/api/offerings?admin=1&type=${type}`, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error(`产品/服务列表读取失败（HTTP ${response.status}）。`);
  return (await response.json()).items ?? [];
}

export async function publishOfferings({ source, cwd = process.cwd(), publish = false }) {
  const [config, items] = await Promise.all([loadConfig(cwd), readOfferings(source)]);
  const cookie = await login(config);
  const byType = new Map(await Promise.all([...types].map(async (type) => [type, await existingItems(config, cookie, type)])));
  const conflicts = items.filter((item) => byType.get(item.type).some((existing) => existing.slug === item.slug));
  if (conflicts.length) throw new Error(`官网存在同类型 Slug 冲突：${conflicts.map((item) => `${item.type}/${item.slug}`).join("；")}`);
  const titleHints = items.filter((item) => [...types].some((type) => byType.get(type).some((existing) => existing.title === item.title))).map((item) => item.title);
  if (!publish) return { mode: "dry-run", sourceCount: items.length, types: count(items, "type"), statuses: count(items, "status"), duplicateSlugCount: 0, titleHints };
  const created = [];
  for (const item of items) {
    const response = await fetch(`${config.siteUrl}/api/offerings`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(item) });
    const result = await response.json();
    if (!response.ok || !result.item) throw new Error(`创建失败：${item.title}（${result.error ?? `HTTP ${response.status}`}）。已创建 ${created.length} 项。`);
    const url = `${config.siteUrl}/${item.type === "product" ? "products" : "services"}/${item.slug}`;
    if (item.status === "published") {
      const publicResponse = await fetch(url);
      const html = await publicResponse.text();
      const pageTitle = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      if (publicResponse.status !== 200 || !pageTitle.includes(item.title)) throw new Error(`公开页验证失败：${url}。已创建 ${created.length + 1} 项。`);
    }
    created.push({ title: item.title, type: item.type, status: item.status, url: item.status === "published" ? url : "" });
  }
  return { mode: "published", sourceCount: items.length, types: count(items, "type"), statuses: count(items, "status"), duplicateSlugCount: 0, titleHints, created };
}

function count(items, field) { return Object.fromEntries([...new Set(items.map((item) => item[field]))].map((value) => [value, items.filter((item) => item[field] === value).length])); }

function parseArgs(args) {
  const options = { source: "", dryRun: false, publish: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--source") options.source = args[++index] ?? "";
    else if (args[index] === "--dry-run") options.dryRun = true;
    else if (args[index] === "--publish") options.publish = true;
    else throw new Error(`未知参数：${args[index]}`);
  }
  if (!options.source) throw new Error("请使用 --source 指定产品/服务源目录。");
  if (options.dryRun && options.publish) throw new Error("--dry-run 与 --publish 不能同时使用。");
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { const options = parseArgs(process.argv.slice(2)); console.log(JSON.stringify(await publishOfferings({ source: options.source, publish: options.publish }), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
