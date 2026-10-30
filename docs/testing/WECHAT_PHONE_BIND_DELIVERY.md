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


## 商家真实手机号测试前的准备顺序（不执行正式数据库操作）
1. 在独立测试数据库核实 `023_customer_identity_groundwork.sql` 已按审查版本执行；确认三张账号相关表存在、手机号全局唯一约束生效，并核对现有微信登录账户能关联至 `customer_accounts`。不得在正式库直接试跑。
2. 审查 `migrations/proposals/wechat-verified-phone-binding.sql` 的授权目标、最小权限和回滚计划。该文件是**提案**，单纯提交 GitHub 不代表已经授权。
3. 确认测试后端使用独立测试数据库，才考虑启用 `PAYMENT_DB_ENV=isolated-test`、`CUSTOMER_ACCOUNT_MAPPING_ENABLED=true`、`WECHAT_PHONE_BIND_ENABLED=true`。不得为了绕过门禁而把正式环境伪装为隔离测试环境。
4. 在服务端核对 `WX_APPID` / `WX_APPSECRET` 对应真实小程序，且具备微信官方手机号授权能力；任何密钥不得放进前端或 GitHub。
5. 先跑模拟测试与三端构建，再用独立 PostgreSQL 集成测试验证账号关联、首次绑定、重复绑定、换绑、冲突和事务回滚。完成这些后，才安排商家 +86 实号授权。
6. 真实验收时只在商家许可下测试：同意授权、拒绝授权、读取脱敏号码、退出再登录后仍能读取以及绑定冲突。正式腾讯云迁移与生产开关属于另外的上线审批。

### 自动化与真实环境的边界
`node --test backend/tests/wechat-phone-bind.test.mjs` 包含数据库结构及授权提案的静态防回退检查；它**不会连接 PostgreSQL**、**不会执行 SQL**，也不能证明实际测试库已经迁移或获得权限。


## 新增：只读数据库预检（尚未连接真实环境）
脚本：`backend/scripts/check-phone-binding-readiness.mjs`。只读取数据库目录、约束与当前角色权限，不执行 DDL、GRANT、INSERT、UPDATE，也不会读取手机号记录。需要在有 `backend/node_modules` 的环境中执行，提前设置以下**专用隔离测试环境变量**：

- `PAYMENT_DB_ENV=isolated-test`
- `CUSTOMER_ACCOUNT_MAPPING_ENABLED=true`
- `PHONE_PREFLIGHT_DATABASE_URL`（仅隔离测试库的授权连接字符串，包含 `sslmode=verify-full`）
- `PHONE_PREFLIGHT_EXPECTED_HOST`（事先核对过的测试数据库主机）
- `PHONE_PREFLIGHT_EXPECTED_DATABASE`（事先核对过的测试数据库名）
- `PHONE_PREFLIGHT_EXPECTED_ROLE`（事先核对过的隔离数据库应用角色）

先在 Neon 控制台独立核对分支身份，不能只凭主机名假定安全。命令：`node backend/scripts/check-phone-binding-readiness.mjs`（从项目根目录运行）。不要在 GitHub Actions 或日志中提交密码、连接字符串。即使输出 `status=inspected`，也只表示静态结构与当前连接的权限检查完成；不代表手机号授权已开通，更不能取代真实 PostgreSQL 事务测试。

预检现在会在连接角色不符、手机号读写权限不足、手机号唯一约束或微信身份唯一约束缺失时返回失败，不会把权限不足误报为准备完成。检查本身仍为只读。
