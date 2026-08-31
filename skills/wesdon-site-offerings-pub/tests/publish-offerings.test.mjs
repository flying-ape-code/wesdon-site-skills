import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseOfferingMarkdown, parseSiteConf, publishOfferings, readOfferings } from "../scripts/publish-offerings.mjs";

const service = `---
type: service
slug: ai-implementation-diagnosis
status: published
sortOrder: 10
label: 实施服务
---
# 企业 AI 落地诊断
## 摘要
先识别明确业务问题。
## 适用问题
- 重复人工工作
## 交付范围
### 现状梳理
识别流程约束。
## 开始前准备
- 提供业务样本
## 推进步骤
### 明确问题
确认验收口径。
## 服务边界
范围以双方确认的安排为准。
## 常见问题
### 是否直接包含系统开发？
以双方确认的安排为准。`;

const product = `---
type: product
slug: knowledge-workbench
---
# 企业知识工作台
## 摘要
让团队基于已确认资料进行检索和协作。
## 核心能力
### 知识检索
基于已接入资料提供检索入口。
## 适用场景
- 团队知识查询
## 实施边界
接入范围以双方确认的实施安排为准。`;

test(".siteconf 解析注释和引号", () => {
  assert.deepEqual(parseSiteConf("# comment\nSITE_URL=https://example.com\nADMIN_EMAIL='editor@example.com'\n"), { SITE_URL: "https://example.com", ADMIN_EMAIL: "editor@example.com" });
});

test("当前目录 .siteconf 按字段覆盖全局配置", async () => {
  const root = await mkdtemp(join(tmpdir(), "wesdon-offerings-"));
  const home = join(root, "home"); const project = join(root, "project");
  await mkdir(home); await mkdir(project);
  await writeFile(join(home, ".siteconf"), "SITE_URL=https://global.example\nADMIN_EMAIL=global@example.com\nADMIN_PASSWORD=global\n");
  await writeFile(join(project, ".siteconf"), "SITE_URL=https://current.example\nADMIN_EMAIL=current@example.com\nADMIN_PASSWORD=current\n");
  assert.deepEqual(await loadConfig(project, home), { siteUrl: "https://current.example", email: "current@example.com", password: "current" });
});

test("服务 Markdown 映射为固定 CMS 字段", () => {
  const item = parseOfferingMarkdown(service, "service.md");
  assert.equal(item.type, "service");
  assert.equal(item.slug, "ai-implementation-diagnosis");
  assert.equal(item.detailContent.scope[0].title, "现状梳理");
  assert.equal(item.detailContent.steps[0].text, "确认验收口径。");
});

test("产品 Markdown 映射为产品专属字段", () => {
  const item = parseOfferingMarkdown(product, "product.md");
  assert.equal(item.type, "product");
  assert.equal(item.detailContent.capabilities[0].title, "知识检索");
  assert.deepEqual(item.detailContent.fit, ["团队知识查询"]);
});

test("同类型重复 Slug 在联网前阻断", async () => {
  const root = await mkdtemp(join(tmpdir(), "wesdon-offerings-"));
  await writeFile(join(root, "a.md"), service);
  await writeFile(join(root, "b.md"), service.replace("# 企业 AI 落地诊断", "# 第二项诊断"));
  await assert.rejects(readOfferings(root), /同类型重复 Slug/);
});

test("缺少摘要时拒绝源稿", () => {
  assert.throws(() => parseOfferingMarkdown(service.replace("## 摘要\n先识别明确业务问题。\n", ""), "service.md"), /缺少“摘要”/);
});

test("发布后验证服务公开页标题", async () => {
  const root = await mkdtemp(join(tmpdir(), "wesdon-offerings-"));
  const source = join(root, "source");
  await mkdir(source);
  await writeFile(join(root, ".siteconf"), "SITE_URL=https://cms.example\nADMIN_EMAIL=editor@example.com\nADMIN_PASSWORD=secret\n");
  await writeFile(join(source, "service.md"), service);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url).endsWith("/api/auth/login")) return new Response("", { status: 303, headers: { "set-cookie": "session=test; Path=/" } });
    if (String(url).includes("/api/offerings?admin=1&type=")) return Response.json({ items: [] });
    if (String(url).endsWith("/api/offerings") && options.method === "POST") return Response.json({ item: { id: 1 } }, { status: 201 });
    if (String(url).endsWith("/services/ai-implementation-diagnosis")) return new Response("<title>企业 AI 落地诊断 | 品牌名</title>", { status: 200 });
    throw new Error(`unexpected request: ${url}`);
  };
  try {
    const result = await publishOfferings({ source, cwd: root, publish: true });
    assert.equal(result.created.length, 1);
    assert.equal(result.created[0].url, "https://cms.example/services/ai-implementation-diagnosis");
    assert.equal(calls.filter((call) => call.method === "POST" && call.url.endsWith("/api/offerings")).length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("官网同类型 Slug 冲突时不创建内容", async () => {
  const root = await mkdtemp(join(tmpdir(), "wesdon-offerings-"));
  const source = join(root, "source");
  await mkdir(source);
  await writeFile(join(root, ".siteconf"), "SITE_URL=https://cms.example\nADMIN_EMAIL=editor@example.com\nADMIN_PASSWORD=secret\n");
  await writeFile(join(source, "service.md"), service);
  const originalFetch = globalThis.fetch;
  let created = false;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/auth/login")) return new Response("", { status: 303, headers: { "set-cookie": "session=test; Path=/" } });
    if (String(url).includes("type=service")) return Response.json({ items: [{ slug: "ai-implementation-diagnosis", title: "已有服务" }] });
    if (String(url).includes("type=product")) return Response.json({ items: [] });
    if (options.method === "POST") created = true;
    return Response.json({});
  };
  try {
    await assert.rejects(publishOfferings({ source, cwd: root, publish: true }), /Slug 冲突/);
    assert.equal(created, false);
  } finally { globalThis.fetch = originalFetch; }
});
