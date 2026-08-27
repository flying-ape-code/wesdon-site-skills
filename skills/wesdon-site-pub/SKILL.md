---
name: wesdon-site-pub
description: 将已审核的 Markdown 文章发布、批量发布、导入、检查或验证到 Wesdon 官网 CMS 时使用。适用于 wesdon.tech 的文章、洞察、博客、GEO 内容或 Markdown 稿件；从 .siteconf 读取非密钥发布设置，优先使用当前目录配置，并防止标题或 Slug 重复、意外重复发布及未经验证的公开页面。
compatibility: 需要 Node.js 22 或更高版本，以及到已配置 Wesdon CMS 的网络访问。
---

# Wesdon 官网文章发布

将已审核的 Markdown 源稿发布到 Wesdon CMS。这个流程把“内容发布”与部署、数据库迁移和结构性配置变更分开：它只创建文章和验证公开页。

## 何时执行

仅在内容所有者明确指定源稿并授权“发布”时执行 `--publish`。如果用户只要求检查、预演、整理或生成草稿，使用默认的 `--dry-run`，不要创建任何文章。

## 配置

按字段合并两个可选配置文件：

1. `~/.siteconf`：全局默认；
2. 当前工作目录的 `.siteconf`：同名字段覆盖全局默认。

不要 `source` 配置文件。配置采用一行一个 `KEY=value` 的格式，允许空行和以 `#` 开头的注释。

```ini
# ~/.siteconf
SITE_URL=https://www.wesdon.tech
ADMIN_EMAIL=editor@example.com
ADMIN_PASSWORD=replace-with-secret-manager-value
POST_TYPE=blog
```

`SITE_URL`、`ADMIN_EMAIL`、`ADMIN_PASSWORD` 是必填项；`POST_TYPE` 可选，默认 `blog`，仅可使用 `blog` 或 `news`。凭据只能保留在忽略的 `.siteconf` 或受管密钥系统中：不得打印、提交、复制到仓库，或放进日志、报告和命令行参数。

## 发布步骤

1. 检查源目录中的每个 `.md`：首个非空行为一级标题，标题以下为正文；拒绝空标题、空正文和重复标题。
2. 根据文件名生成唯一 Slug。默认形态是 `article-01`；如需语义化 Slug，使用 `--slug-map` 指向一个本地 JSON 映射文件。不要猜测或改写用户确认过的 Slug。
3. 先登录 `/api/auth/login`，分页读取 `/api/posts`，检查标题与 Slug 均未占用。任何冲突都停止；不得通过加随机后缀绕过冲突。
4. 在用户明确授权后才传入 `--publish`，逐篇调用 `/api/posts`，使用 `published` 状态。除非源稿另有提供，不虚构封面、案例、数据、SEO 承诺或标签。
5. 每篇创建后访问公开 URL：`blog` 对应 `/insights/<slug>`，`news` 对应 `/news/<slug>`。只有 HTTP 200 且页面 `<title>` 包含文章标题才算发布成功。
6. 出现任一创建或公开页验证失败时立即停止。报告已成功发布的标题、失败原因及未尝试的剩余篇数；不要盲目重试或删除已发布内容。

## 命令

先预演：

```bash
node /path/to/wesdon-site-pub/scripts/publish.mjs \
  --source "/absolute/path/to/markdown-directory" \
  --dry-run
```

确认预演无冲突且获得发布授权后：

```bash
node /path/to/wesdon-site-pub/scripts/publish.mjs \
  --source "/absolute/path/to/markdown-directory" \
  --slug-map "/absolute/path/to/slug-map.json" \
  --publish
```

Slug 映射的格式为文件名到 Slug 的映射：

```json
{
  "01_客服文章.md": "ecommerce-customer-service-faq-agent"
}
```

## 交付报告

完成后只报告：源稿总数、标题/Slug 去重结果、已发布篇数、每篇公开 URL 与验证结果。绝不回显配置或凭据。

## 离线验证

修改脚本后运行：

```bash
node --test /path/to/wesdon-site-pub/tests/publish.test.mjs
```

测试用例位于 `evals/evals.json`；它们覆盖本地配置优先级、发布前冲突阻断和成功后的公开页验证。
