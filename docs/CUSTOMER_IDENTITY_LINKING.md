# 统一账号方案（设计准备，不代表已上线）

当前服务的 `auth_sessions.external_subject`、`orders.customer_subject` 和 `merchant_members.external_subject` 仍使用微信主体标识。不能直接把手机号当作 `external_subject`，否则订单与商家授权可能错乱。

## 本次已完成
- 添加非破坏性数据库结构：`customer_accounts`（稳定账号 ID）、`customer_login_identities`（已验证的微信/手机号登录身份）、`customer_verified_phones`（已验证的中国大陆手机号）。
- 微信身份唯一、手机号唯一；**绝不**按未验证的手机号自动合并账号。
- 只提交迁移文件；暂未执行迁移，未改变任何现有用户的登录、订单或权限。

## 后续实现前的安全要求
1. 微信登录经 `jscode2session` 取得可信 `openid`，服务端创建或查找账号，并在同一事务内绑定该微信身份。
2. 手机号必须通过有频率限制、有效期、错误次数上限的短信 OTP，或微信官方手机号授权核验，才能绑定；服务器不可信任客户端自报手机号。
3. 已属于其他账号的手机号必须走明确的冲突处理、重新验证和人工/受控合并流程；不能自动合并订单、商家角色或地址。
4. 必须先建立旧 `external_subject` 到新账号的兼容映射及回滚方案，再改动订单、会话与商家权限读取。
5. 不能只靠匹配电话完成微信账号和手机号账号合并；对回收号码、换绑与撤销旧会话要单独处理。
6. 未配置真实短信供应商之前，手机号登录入口应继续说明尚未开通。

迁移文件：`backend/sql/023_customer_identity_groundwork.sql`。
