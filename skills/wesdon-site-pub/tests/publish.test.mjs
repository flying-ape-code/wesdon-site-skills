import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parseSiteConf } from "../scripts/publish.mjs";

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
