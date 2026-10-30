# 手机换绑提交原子性（准备阶段）
换绑的持久化事务必须一起执行：更新 `customer_verified_phones`、写入尾号级 `customer_phone_rotation_audit`、撤销 `customer_account_sessions` 内该账号的独立登录会话。任一步出错都 ROLLBACK，不可只成功更新号码。

迁移提案：`backend/migrations/proposals/025_customer_phone_rotation_audit.sql`；尚未执行。现有微信旧会话 `auth_sessions` **不会**因本操作自动撤销，旧版订单和商家授权身份也尚未迁移，所以正式换绑 API 必须继续关闭。

重要：当前 `rotateVerifiedPhone` 仍接收内部验证布尔值，调用方必须实现不可伪造的服务端近期认证和新手机号证明，不能以 HTTP 请求体中的标志为依据。完整生产切换还需审计表最小权限、会话边界、失败回滚 PostgreSQL 集成测试、用户通知及支持工单。
