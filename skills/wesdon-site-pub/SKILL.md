---
name: wesdon-site-pub
description: 将已审核的 Markdown 文章发布、批量发布、检查或验证到 Wesdon 官网 CMS 时使用。根据中文标题生成并保存英文 Slug 映射，复用已有映射；从 .siteconf 读取站点配置，防止标题或 Slug 冲突及意外重复发布。不用于产品服务内容或部署。
---

# Wesdon 官网文章发布

将已审核的 Markdown 源稿发布到 Wesdon CMS。这个流程把“内容发布”与部署、数据库迁移和结构性配置变更分开：它只创建文章和验证公开页。

运行要求：Node.js 22 或更高版本，以及到已配置 Wesdon CMS 的网络访问。

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
2. 按下节准备完整的 `slug-map.json`：复用已有值，仅为缺少映射的稿件根据标题生成英文 Slug。保存后展示“文件名 → 标题 → Slug”及映射文件绝对路径；预演和发布都必须传入同一个 `--slug-map`。
3. 先登录 `/api/auth/login`，分页读取 `/api/posts`，检查标题与 Slug 均未占用。任何冲突都停止；不得通过加随机后缀绕过冲突。
4. 展示新生成的映射和预演结果，得到用户对映射及本次发布的明确确认后才传入 `--publish`，逐篇调用 `/api/posts`，使用 `published` 状态。若稿件或映射变化，重新预演并确认；除非源稿另有提供，不虚构封面、案例、数据、SEO 承诺或标签。
5. 每篇创建后访问公开 URL：`blog` 对应 `/insights/<slug>`，`news` 对应 `/news/<slug>`。只有 HTTP 200 且页面 `<title>` 包含文章标题才算发布成功。
6. 出现任一创建或公开页验证失败时立即停止。报告已成功发布的标题、失败原因及未尝试的剩余篇数；不要盲目重试或删除已发布内容。

## 英文 Slug 映射

翻译和语义概括由运行此 Skill 的 Codex 完成，发布脚本只读取映射，不调用翻译 API，也无需额外 API 密钥。

1. 用户指定映射文件时优先使用该文件；否则检查源稿目录下的 `slug-map.json`。存在时先读取，不重新生成已映射的值；不存在时在该位置创建。源稿与映射保存在仓库外的内容工作目录；若默认位置不可写或位于网站源码仓库，先确认一个仓库外的持久位置，不用临时目录保存唯一副本。
2. 映射键是完整文件名（含 `.md`），值是英文 Slug。对缺少映射的稿件，以 Markdown 一级标题为依据，必要时参考正文消除歧义；翻译并概括为简短英文短语，保留品牌名、产品名及 AI 等常用缩写，不添加标题未表达的承诺。无法确定含义时请用户确认，不编造翻译。
3. 新生成值采用小写英文、数字和单连字符，满足 `^[a-z0-9]+(?:-[a-z0-9]+)*$`。例如“企业如何建设 AI 知识库”可生成 `enterprise-ai-knowledge-base-guide`。不要默认退回 `article-01`，不要以拼音替代英文翻译或添加随机后缀。
4. 保存前确认 JSON 顶层为对象、本次每个 `.md` 都有非空字符串映射、所有值格式合法且本批次无重复。已有值不合法、映射文件损坏或出现冲突时停止并报告，不静默修复。补充缺项时保留已有条目；未经用户授权，不更改已确认的映射。
5. 先将完整映射持久保存，再进行预演。重试、重新排序或增加稿件时复用已保存的值；文件改名或标题变化时核对原映射，不据此自动更改已发布 URL。映射稳定不代表可以安全重复发布，部分成功后仍须检查官网现有内容，禁止盲目重试整批。

映射格式：

```json
{
  "01_企业知识库.md": "enterprise-ai-knowledge-base-guide"
}
```

## 命令

先预演：

```bash
node /path/to/wesdon-site-pub/scripts/publish.mjs \
  --source "/absolute/path/to/markdown-directory" \
  --slug-map "/absolute/path/to/markdown-directory/slug-map.json" \
  --dry-run
```

确认预演无冲突且获得发布授权后：

```bash
node /path/to/wesdon-site-pub/scripts/publish.mjs \
  --source "/absolute/path/to/markdown-directory" \
  --slug-map "/absolute/path/to/markdown-directory/slug-map.json" \
  --publish
```

直接运行脚本且不传 `--slug-map`（或映射缺项）仍会使用旧的编号回退规则。此 Skill 必须先检查映射完整性并显式传入文件，不能把脚本的回退行为当作自动翻译。

## 交付报告

完成后报告：映射文件路径、源稿总数、标题/Slug 去重结果、已发布篇数、每篇公开 URL 与验证结果。绝不回显配置或凭据。

## 离线验证

修改脚本后运行：

```bash
node --test /path/to/wesdon-site-pub/tests/publish.test.mjs
```

离线测试覆盖配置合并、映射读取、排序变化后的稳定性及 Slug 校验。`evals/evals.json` 提供 Skill 行为评估场景，包含英文映射生成、复用与发布授权；这些场景不等同于已执行的自动化测试。
