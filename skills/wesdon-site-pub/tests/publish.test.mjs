import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseSiteConf, readPosts } from "../scripts/publish.mjs";

test(".siteconf accepts comments, empty lines and quoted values", () => {
  assert.deepEqual(parseSiteConf("# default\nSITE_URL=https://www.wesdon.tech\nADMIN_EMAIL='editor@example.com'\n\nPOST_TYPE=blog\n"), {
    SITE_URL: "https://www.wesdon.tech",
    ADMIN_EMAIL: "editor@example.com",
    POST_TYPE: "blog",
  });
});

test(".siteconf rejects malformed entries", () => {
  assert.throws(() => parseSiteConf("SITE_URL"), /KEY=value/);
});

test("current directory .siteconf overrides global defaults by field", async () => {
  const root = await mkdtemp(join(tmpdir(), "wesdon-site-pub-"));
  const home = join(root, "home");
  const project = join(root, "project");
  await (await import("node:fs/promises")).mkdir(home);
  await (await import("node:fs/promises")).mkdir(project);
  await writeFile(join(home, ".siteconf"), "SITE_URL=https://global.example\nADMIN_EMAIL=global@example.com\nADMIN_PASSWORD=global-password\nPOST_TYPE=news\n");
  await writeFile(join(project, ".siteconf"), "SITE_URL=https://current.example\nADMIN_EMAIL=current@example.com\nADMIN_PASSWORD=current-password\n");
  assert.deepEqual(await loadConfig(project, home), {
    siteUrl: "https://current.example",
    email: "current@example.com",
    password: "current-password",
    type: "news",
  });
});

test("中文标题使用持久化英文映射，不使用文件编号", async () => {
  const source = await mkdtemp(join(tmpdir(), "wesdon-slug-map-"));
  const file = "01_企业知识库.md";
  const mapFile = join(source, "slug-map.json");
  const mapping = JSON.stringify({ [file]: "enterprise-ai-knowledge-base-guide" }, null, 2);
  await writeFile(join(source, file), "# 企业如何建设 AI 知识库\n\n介绍企业知识库的建设方法。\n");
  await writeFile(mapFile, mapping);

  const first = await readPosts(source, mapFile);
  const retry = await readPosts(source, mapFile);
  assert.equal(first[0].slug, "enterprise-ai-knowledge-base-guide");
  assert.deepEqual(retry, first);
  assert.equal(await readFile(mapFile, "utf8"), mapping);
});

test("增加排序更靠前的稿件不改变已有映射", async () => {
  const source = await mkdtemp(join(tmpdir(), "wesdon-slug-order-"));
  const mapFile = join(source, "slug-map.json");
  const mapping = { "b.md": "enterprise-ai-knowledge-base-guide" };
  await writeFile(join(source, "b.md"), "# 企业如何建设 AI 知识库\n\n建设方法。\n");
  await writeFile(mapFile, JSON.stringify(mapping));
  const before = await readPosts(source, mapFile);

  await writeFile(join(source, "a.md"), "# AI 客服如何降低人工成本\n\n客服成本分析。\n");
  await writeFile(mapFile, JSON.stringify({ ...mapping, "a.md": "reduce-support-costs-with-ai" }));
  const after = await readPosts(source, mapFile);
  assert.equal(after[0].name, "a.md");
  assert.equal(after.find((post) => post.name === "b.md").slug, before[0].slug);
});

test("映射中的重复 Slug 被拒绝", async () => {
  const source = await mkdtemp(join(tmpdir(), "wesdon-slug-duplicate-"));
  await writeFile(join(source, "a.md"), "# 企业知识库\n\n企业知识库正文。\n");
  await writeFile(join(source, "b.md"), "# 客服知识库\n\n客服知识库正文。\n");
  const mapFile = join(source, "slug-map.json");
  await writeFile(mapFile, JSON.stringify({ "a.md": "ai-knowledge-base", "b.md": "ai-knowledge-base" }));
  await assert.rejects(readPosts(source, mapFile), /重复Slug/);
});

test("映射中的中文或连续连字符不合法", async () => {
  const source = await mkdtemp(join(tmpdir(), "wesdon-slug-invalid-"));
  await writeFile(join(source, "a.md"), "# 企业知识库\n\n企业知识库正文。\n");
  const mapFile = join(source, "slug-map.json");
  for (const slug of ["企业知识库", "ai--knowledge-base"]) {
    await writeFile(mapFile, JSON.stringify({ "a.md": slug }));
    await assert.rejects(readPosts(source, mapFile), /Slug 不合法/);
  }
});
