#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

const allowedTypes = new Set(["blog", "news"]);

function parseArgs(args) {
  const options = { dryRun: false, publish: false, source: "", slugMap: "" };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--dry-run") options.dryRun = true;
    else if (value === "--publish") options.publish = true;
    else if (value === "--source") options.source = args[++index] ?? "";
    else if (value === "--slug-map") options.slugMap = args[++index] ?? "";
    else throw new Error(`未知参数：${value}`);
  }
  if (!options.source) throw new Error("请使用 --source 指定 Markdown 源目录。");
  if (options.dryRun && options.publish) throw new Error("--dry-run 与 --publish 不能同时使用。");
  return options;
}

export function parseSiteConf(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const separator = trimmed.indexOf("=");
    if (separator < 1) throw new Error(".siteconf 每个配置项都必须是 KEY=value。");
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[key, value]];
  }));
}

async function optionalConfig(file) {
  try { return parseSiteConf(await readFile(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return {}; throw error; }
}

export async function loadConfig(cwd = process.cwd(), home = homedir()) {
  const config = { ...await optionalConfig(join(home, ".siteconf")), ...await optionalConfig(join(cwd, ".siteconf")) };
  const required = ["SITE_URL", "ADMIN_EMAIL", "ADMIN_PASSWORD"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length) throw new Error(`缺少发布配置：${missing.join("、")}`);
  const type = config.POST_TYPE || "blog";
  if (!allowedTypes.has(type)) throw new Error("POST_TYPE 只能是 blog 或 news。");
  return { siteUrl: config.SITE_URL.replace(/\/$/, ""), email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD, type };
}

function summaryFrom(body) {
  return body.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#"))?.slice(0, 600) ?? "";
}

function defaultSlug(file, index) {
  const number = basename(file).match(/^(\d{1,3})[_-]/)?.[1] ?? String(index + 1).padStart(2, "0");
  return `article-${number}`;
}

export async function readPosts(source, slugMapFile = "") {
  const slugMap = slugMapFile ? JSON.parse(await readFile(resolve(slugMapFile), "utf8")) : {};
  const names = (await readdir(resolve(source))).filter((name) => extname(name).toLowerCase() === ".md").sort();
  if (!names.length) throw new Error("源目录中没有 Markdown 文件。");
  const posts = await Promise.all(names.map(async (name, index) => {
    const raw = (await readFile(join(resolve(source), name), "utf8")).replace(/\r\n/g, "\n").trim();
    const lines = raw.split("\n");
    const headingIndex = lines.findIndex((line) => line.trim());
    if (headingIndex < 0 || !lines[headingIndex].startsWith("# ")) throw new Error(`${name} 的首个非空行必须是一级标题。`);
    const title = lines[headingIndex].slice(2).trim();
    const bodyMarkdown = lines.slice(headingIndex + 1).join("\n").trim();
    const summary = summaryFrom(bodyMarkdown);
    const slug = String(slugMap[name] ?? defaultSlug(name, index)).trim().toLowerCase();
    if (!title || !bodyMarkdown || !summary) throw new Error(`${name} 缺少标题、正文或摘要。`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${name} 的 Slug 不合法：${slug}`);
    return { name, title, slug, summary, bodyMarkdown };
  }));
  for (const field of ["title", "slug"]) {
    if (new Set(posts.map((post) => post[field])).size !== posts.length) throw new Error(`源稿存在重复${field === "title" ? "标题" : "Slug"}。`);
  }
  return posts;
}

async function login(config) {
  const response = await fetch(`${config.siteUrl}/api/auth/login`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: config.email, password: config.password, returnTo: "/admin" }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (response.status !== 303 || !cookie) throw new Error(`CMS 登录失败（HTTP ${response.status}）。`);
  return cookie;
}

async function listExisting(config, cookie) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${config.siteUrl}/api/posts?page=${page}&pageSize=50`, { headers: { Cookie: cookie } });
    if (!response.ok) throw new Error(`文章列表读取失败（HTTP ${response.status}）。`);
    const result = await response.json();
    items.push(...(result.items ?? []));
    if (items.length >= Number(result.total ?? 0)) return items;
  }
}

export async function publishBatch({ source, slugMap, cwd = process.cwd(), publish = false }) {
  const [config, posts] = await Promise.all([loadConfig(cwd), readPosts(source, slugMap)]);
  const cookie = await login(config);
  const existing = await listExisting(config, cookie);
  const titleSet = new Set(existing.map((post) => post.title));
  const slugSet = new Set(existing.map((post) => post.slug));
  const conflicts = posts.filter((post) => titleSet.has(post.title) || slugSet.has(post.slug));
  if (conflicts.length) throw new Error(`官网存在标题或 Slug 冲突：${conflicts.map((post) => post.title).join("；")}`);
  if (!publish) return { mode: "dry-run", sourceCount: posts.length, duplicateTitleCount: 0, duplicateSlugCount: 0 };

  const published = [];
  for (const post of posts) {
    const response = await fetch(`${config.siteUrl}/api/posts`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ type: config.type, status: "published", ...post, coverImage: "", coverAlt: "", tags: [], seoTitle: "", seoDescription: "", publishedAt: null }),
    });
    const result = await response.json();
    if (!response.ok || !result.item) throw new Error(`创建失败：${post.title}（${result.error ?? `HTTP ${response.status}`}）。已成功发布 ${published.length} 篇。`);
    const url = `${config.siteUrl}/${config.type === "news" ? "news" : "insights"}/${post.slug}`;
    const publicResponse = await fetch(url);
    const html = await publicResponse.text();
    const pageTitle = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    if (publicResponse.status !== 200 || !pageTitle.includes(post.title)) throw new Error(`公开页验证失败：${url}。已成功发布 ${published.length + 1} 篇。`);
    published.push({ title: post.title, url, status: result.item.status });
  }
  return { mode: "published", sourceCount: posts.length, duplicateTitleCount: 0, duplicateSlugCount: 0, published };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await publishBatch({ source: options.source, slugMap: options.slugMap, publish: options.publish });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
