# 顾客会话与商家权限边界（未上线的内部模块）

`resolveCustomerOnlySession` 只读取独立的 `customer_account_sessions`，只返回永久 UUID 账号身份 `{kind:'customer',accountId}`。它不会读取旧版 `auth_sessions` 或外部微信主体，因此不能用于 `merchantStores` / `permittedStore` 权限判定。

`requireCustomerIdentity` 供未来纯顾客 API 使用，拒绝微信外部 subject、商家身份与非法账号标识。**目前没有接入 HTTP 路由**，原有微信登录、商家权限及订单流程保持不变。

注意：这只是服务端身份边界，不代表完成微信/手机号双向登录、OTP、step-up 验证、会话迁移和真实换绑。现有旧微信会话仍不能直接按顾客账号撤销。任何部署须先做隔离库权限和真实 PostgreSQL 集成测试。
