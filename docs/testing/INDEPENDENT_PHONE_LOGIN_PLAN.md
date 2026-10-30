# 商家自有手机号登录：安全实施边界

目标：保留微信一键登录，同时支持独立 +86 短信验证码登录。所有登录方式须关联同一个 `customer_accounts.id`，但不得通过手机号相同自动合并已有账号或继承商家权限。

## 当前已实现
- 微信登录继续使用既有 `/v1/auth/wechat` 与历史会话；生产行为不变。
- 微信手机号授权绑定单独实现，须在隔离测试环境开启并完成真实验收。
- `customerPhoneIdentity.mjs` 提供仅供服务端**已验证手机号**调用的事务型账号绑定基础逻辑，拒绝未经验证的输入、跨账号手机号冲突和非 +86 格式。
- **尚无独立短信登录 API、短信发送、短信提供商或前端入口。** 本次仅做隔离的基础模块和测试，不启用新功能。

## 后续开发门槛
1. 选择腾讯云短信或其他合规服务商，完成模板与签名审核；核算短信费用和适用地区。
2. 服务端随机验证码、短有效期、散列存储、每个手机号及 IP 的发送/验证限流、失败次数、重放防护、统一错误反馈，防止账号枚举。
3. 仅服务器验证 OTP 成功后，才允许关联账号；绑定已有账号需先验证当前会话所有权，绑定其他身份时不得直接覆盖。
4. 独立手机号登录产生**独立服务端 session**，同时制定订单数据从旧微信 subject 迁移到统一 account_id 的兼容方案；未经设计不要复用微信外部 subject。
5. PostgreSQL 独立环境真实测试并核查最小权限，再进行用户授权测试。腾讯云部署另外审批。
6. 手机号可被运营商回收，设计更换、注销、恢复机制，敏感操作需再验证。


## 先手机号、后微信：双向账号绑定
- 已增加 `backend/src/customerIdentityLink.mjs` 的非 HTTP、非自动启用服务端事务基础方法。只有当前账号所有权已验证、微信身份也经服务端微信接口验证后，才能关联至同一 `customer_accounts.id`。
- 若微信身份属于其他账号，返回冲突；若当前账号已有不同微信身份，拒绝覆盖；若重复绑定同一身份，返回已关联。
- 反方向（先微信、后手机号）暂由 `customerPhoneIdentity.mjs` 提供隔离的事务基础逻辑；两者都不会自动合并已存在的不同账号。
- **注意**：`verifiedByWechat` 和 `accountOwnershipVerified` 是内部调用方必须严格履行的前置约定，不能接受客户端声称的布尔值。正式 HTTP API 还未实现，必须在真实登录会话下验证账号所有权、由服务端兑换微信 code 后才能调用。
- 先手机号的账号与旧微信订单/会话如何统一迁移仍需独立设计，不能只改登录按钮就认定历史数据已经打通。
- 本次补充 `node --test backend/tests/customer-identity-link.test.mjs backend/tests/customer-phone-identity.test.mjs` 用于事务与冲突防回退测试，须在本地执行并再做数据库集成验证。


## 自有账户 Session 隔离（新增）
- 新增 `backend/src/customerAccountSessions.mjs`：仅供未来完成服务端验证的独立登录流程调用；会话对应 `customer_accounts.id`，不伪造微信 `external_subject`。
- 新增未执行的迁移提案 `backend/migrations/proposals/024_customer_account_sessions.sql`：随机令牌仅存 SHA-256 哈希，具备过期和撤销字段，默认撤销 PUBLIC 权限。执行前须审查数据库角色授权、清理任务及回滚计划。
- 新增 `backend/tests/customer-account-sessions.test.mjs`；静态/模拟测试不能替代真实 PostgreSQL 集成验证。
- `verifiedLogin` 仅是内部方法的防误调用前置条件，**不是 OTP 验证实现，也不能由请求体直接赋值**；实际短信供应商、短信发送、抗滥用、账户恢复和合法的 phone-session 入口都尚未开发。
- 旧版 `auth_sessions` 仍用于现有微信登录和商家权限。两套会话不互认，直到订单归属和权限迁移完成，绝不能直接用新账号会话调用旧版订单/商家接口。
