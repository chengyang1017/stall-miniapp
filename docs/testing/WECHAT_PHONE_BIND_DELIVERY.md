# 微信手机号绑定交付说明（仅中国大陆 +86）

## 实现范围
- 使用现有微信登录会话；用户必须先登录。
- 仅允许微信官方 `getPhoneNumber` 一次性 code，经后端接口验证，不接受前端填写的手机号作为已验证身份。
- 仅接受中国大陆 +86 十一位号码，持久化 E.164 格式，拒绝 +60 等其他号码。
- `customer_verified_phones` 中按账户唯一、手机号全局唯一；出现跨账号冲突返回 409，绝不合并账号、订单、商家权限。
- 保留隔离测试门禁：`PAYMENT_DB_ENV=isolated-test`、`CUSTOMER_ACCOUNT_MAPPING_ENABLED=true`、`WECHAT_PHONE_BIND_ENABLED=true`；未启用时拒绝写入。
- 客户端复用原有 `dist/phone-preview`，不要求新增微信开发者工具项目。

## 代码与数据库
- 前端：`miniprogram/pages/customer-account/customer-account.ts` 和 `.wxml`
- API：`POST /v1/customer/phone/wechat-bind`，`GET /v1/customer/phone`
- 服务：`backend/src/customerWechatPhone.mjs`
- 数据库：先审查和部署已存在的 `backend/sql/023_customer_identity_groundwork.sql`，再审查 `backend/migrations/proposals/wechat-verified-phone-binding.sql` 的最小权限；后者不是自动迁移。
- 凭据：仅服务器保存 `WX_APPID`、`WX_APPSECRET`，切勿提交源码或公开给客户端。

## 交付前必须完成（未进行）
1. 审查微信小程序主体是否具备正式手机号授权能力及相关计费要求。
2. 在获得授权的独立环境准备数据库结构及权限，确认角色、迁移顺序和回滚办法。
3. 进行后端真实 PostgreSQL 集成测试，包括跨账号并发、号码重新绑定与无权访问；模拟数据库测试不能代替。
4. 用实际中国大陆 +86 手机号在商家交付时验收同意、拒绝、已被其他账号绑定、重新登录、读取脱敏手机号。
5. 再单独审批正式腾讯云部署、密钥注入和 feature gate 开启。现阶段没有部署或执行真实手机号授权。

## 已有自动化测试
`node --test backend/tests/wechat-phone-bind.test.mjs backend/tests/customerIdentity.test.mjs backend/tests/wechat-login.test.mjs`

以上测试使用模拟微信返回和模拟事务。最后一次由用户在 2026-10-30 本地执行得到 24/24 通过；后续代码调整仍需重新执行，不应引用这一结果为新提交已验证。
