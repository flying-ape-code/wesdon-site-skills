---
name: wesdon-site-offerings-pub
description: 发布或预检 Wesdon 官网的产品与服务内容。用户要求创建、批量发布、导入、检查或验证官网产品、服务、解决方案、交付服务卡片及其 Markdown 源稿时使用本技能。它通过 CMS offerings 接口处理 product/service 两种内容，先检查源稿、同类型 Slug 和既有记录，再在明确授权后发布并验证公开页；不用于文章、部署、迁移或默认内容导入。
compatibility: 需要 Node.js 22+、网络访问和配置完毕的 Wesdon CMS。
---

# Wesdon 产品与服务内容发布

将已审核的产品或服务 Markdown 源稿发布到官网 CMS。产品/服务是固定字段的长期业务内容，不是文章：发布流程与 `wesdon-site-pub` 分开，避免把文章正文误写入 `offerings` 数据表。

## 执行边界

仅当内容所有者明确指定源稿，并明确授权“发布”时使用 `--publish`。只要求检查、整理、预演或生成草稿时，使用默认的 `--dry-run`。

本技能只通过已认证的 `/api/offerings` 创建内容及验证公开页；不执行部署、数据库迁移、重建容器或 `npm run content:import-offerings`。接口不可用通常表示站点尚未完成结构发布，应停止并转交 `wesdon-site-release` 的发布流程。

若官网已有相同类型、同一 Slug 的产品或服务，停止并报告。不要把“发布”解释为覆盖更新；只有内容所有者明确指定要更新的现有记录时，才另行执行更新。

## 配置

按字段合并两个可选配置文件：

1. `~/.siteconf`：全局默认；
2. 当前工作目录的 `.siteconf`：同名字段覆盖全局默认。

不要 `source` 配置文件。每行一个 `KEY=value`，可含空行与 `#` 注释。

```ini
SITE_URL=https://www.example.com
ADMIN_EMAIL=editor@example.com
ADMIN_PASSWORD=replace-with-secret-manager-value
```

`SITE_URL`、`ADMIN_EMAIL`、`ADMIN_PASSWORD` 均为必填。凭据只能保存在忽略的 `.siteconf` 或受管密钥系统中；不得打印、提交、复制到报告或放入命令行参数。

## 源稿格式

源目录中的每个 `.md` 对应一项产品或服务。文件名只用于阅读排序；唯一标识使用前置元数据中的 `slug`。

```markdown
---
type: service
slug: enterprise-ai-implementation-diagnosis
status: published
sortOrder: 10
label: 实施服务
eyebrow: AI IMPLEMENTATION
ctaLabel: 预约诊断
seoTitle: 企业 AI 落地诊断 | 品牌名
seoDescription: 面向企业团队的 AI 落地诊断服务。
---

# 企业 AI 落地诊断

## 摘要

先识别一个明确业务问题，再形成可验证的实施建议。

## 适用问题

- 客服、报价或知识查询存在重复人工工作
- 团队尚未确定 AI 项目的优先级

## 交付范围

### 现状梳理

识别流程、数据和协作中的关键约束。

## 开始前准备

- 提供现有流程和可讨论的业务样本

## 推进步骤

### 明确问题

与业务负责人确认优先级和验收口径。

## 服务边界

具体实施范围、周期和费用以双方确认的服务安排为准。

## 常见问题

### 是否直接包含系统开发？

是否开发及交付范围以双方确认的服务安排为准。
```

前置元数据只允许单行 `键: 值`。必填字段为 `type`（`product` 或 `service`）和 `slug`；`status` 默认为 `draft`，可为 `draft`、`published` 或 `archived`。`slug` 只能使用小写英文、数字和连字符。

每项必须有一级标题和“摘要”。产品可使用“核心能力、适用场景、实施边界、常见问题”；服务可使用“适用问题、交付范围、开始前准备、推进步骤、服务边界、常见问题”。列表采用 `- 项目`，卡片/步骤和 FAQ 采用三级标题加说明文字。未提供的可选区块会保持为空，不应虚构能力、交付、数据、价格、案例或效果承诺。

## 发布步骤

1. 检查每个 Markdown 的元数据、标题、摘要、类型专属区块及源稿内的同类型 Slug；任何格式问题立即停止。
2. 登录 `/api/auth/login`，分别读取源稿涉及的 `product` 与 `service` 列表；检查同类型 Slug 冲突。标题相同会报告供人工确认，但不会据此猜测更新目标。
3. 默认执行预演，只报告可创建的数量、类型、标题和 Slug；不写入 CMS。
4. 只有用户明确授权后才使用 `--publish`。按文件名顺序逐项创建，保留源稿给出的状态和排序。若任一创建失败，立即停止，报告已创建项目及未尝试数量；不要盲目重试。
5. 对状态为 `published` 的每项，验证 `/products/<slug>` 或 `/services/<slug>` 返回 HTTP 200，且页面 `<title>` 包含名称。草稿与归档内容不要求公开页可访问，但要报告其后台创建状态。

## 命令

先预演：

```bash
node /Users/yansunbin/.agents/skills/wesdon-site-offerings-pub/scripts/publish-offerings.mjs \
  --source "/absolute/path/to/offerings-directory" \
  --dry-run
```

确认预演无问题且取得发布授权后：

```bash
node /Users/yansunbin/.agents/skills/wesdon-site-offerings-pub/scripts/publish-offerings.mjs \
  --source "/absolute/path/to/offerings-directory" \
  --publish
```

## 交付报告

只报告源稿总数、按类型和状态的数量、标题提示、Slug 冲突结果、已创建数量，以及已发布项目的公开 URL 和验证结果。绝不回显配置或凭据。

## 离线验证

修改脚本后运行：

```bash
node --test /Users/yansunbin/.agents/skills/wesdon-site-offerings-pub/tests/publish-offerings.test.mjs
```

测试用例位于 `evals/evals.json`，覆盖配置合并、Markdown 解析、同类型冲突阻断和公开页验证。
