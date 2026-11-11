# 商家成员邀请（待后端审核与验收）

## 行为
- 店主（merchant_members.role=owner）在商家「账号与权限」生成随机 24 字节、一次性、24 小时有效的邀请码；服务器只保存 SHA-256 摘要，最多 5 个未使用且未过期的邀请码。
- 接收者先以自己的微信身份登录，再输入邀请码加入，赋予 manager 角色；店主账号、session、密钥均不共享。
- 客户端只负责输入和展示；生成与兑换均经过服务器 authentication，生成还强制检查 owner。
- 兑换时数据库事务锁定邀请码，防止同时兑换。跨店铺邀请码不能用于不同 merchant；角色不由客户端指定。
- 因现有 merchant_members 以 merchant_id 而非 store_id 授权，同一商户名下多个店铺可能共享该权限。若未来要求每店独立授权，应先迁移成员模型。
- 已新增店主专用成员列表及撤权接口（按成员匿名标识显示，不暴露微信 OpenID）。目前仍缺少邀请码撤销、成员操作审计和分级功能权限，不能视为成熟的员工权限管理。

## 上线前置条件
1. 由后端维护人审查 `backend/sql/038_merchant_member_invitations.sql` 与当前迁移账本，先在隔离测试数据库执行；不可直接迁移生产库。
2. 复核 manager 在订单、退款、支付、备份等全部路由的权限范围，必要时实现细分权限再开放邀请。
3. 验证 owner、manager、普通顾客各自生成邀请码；检查跨店兑换、重复兑换、并发兑换、已过期、错误码、登出后权限同步。
4. 测试实际微信登录与退出、扫码预览和组合包。远端 Render/Neon/Tencent 未部署、更未验收。
5. 正式交付前验证**店主撤销成员权限**及受影响会话的即时拒绝；补充邀请码取消与操作审计。

- `GET /v1/merchant/stores/:slug/members`：仅店主查看现有成员的匿名标识和角色。
- `DELETE /v1/merchant/stores/:slug/members/:memberKey`：仅店主撤销非 owner 成员权限。

## 路由
- `POST /v1/merchant/stores/:slug/member-invitations`：owner 生成邀请码。
- `POST /v1/merchant/stores/:slug/member-invitations/redeem`：已验证微信会话兑换，body `{"invitationCode":"..."}`。
