# Wesdon 多网站运维 Skills

这是一组用于团队交付和维护多个 Wesdon 客户官网的 Codex Skills。它们只定义安全工作流，不包含网站源码、客户资料、密码、数据库连接串或 SSH 密钥。

## Skills

- `wesdon-site-provisioning`：新客户站点资料核验、独立部署、验收与台账登记。
- `wesdon-site-release`：既有站点更新、灰度、验收与回滚记录。
- `wesdon-site-inspection`：只读巡检、备份检查和企业微信智能表格同步。
- `wesdon-site-retirement`：经明确授权的客户站点下线与删除。

## 安装

将所需 Skill 目录复制到每位成员的 `~/.agents/skills/` 下，然后重新打开 Codex。

```sh
cp -R skills/wesdon-site-* ~/.agents/skills/
```

## 企业微信运维台账

巡检 Skill 从操作员自己的受管配置读取以下值；不要把它写入仓库或 Skill 内容：

```ini
WECOM_SITE_OPS_TABLE_URL=https://doc.weixin.qq.com/smartsheet/...
```

智能表格只保存站点状态、巡检和变更记录，不保存密码、数据库 URL、SSH 私钥或完整备份内容。生产发布、密码重置和删除操作仍须由发布负责人明确授权。
