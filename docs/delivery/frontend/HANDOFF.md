# 前后端交接与待协调事项

## 2026-10-30｜FE-07 小票需求评审交接

详见[RECEIPTS_REQUIREMENTS.md](RECEIPTS_REQUIREMENTS.md)，含状态/字段/唯一键/跨表归属/并发退款/分享导出权限及验收矩阵。当前仅文档；现有215项回归通过不代表新增小票或真实收退款功能已完成。没有改backend/src、SQL、生产配置或负责人档案。

后端需确认商户模式、可信支付/退款入口、canonical资金与异常迟到/重复扣款、原单/顾客实付/优惠及退款口径、迁移约束、退款额度占用与审批、身份映射、逐店权限、保存导出、持久任务/查单/对账与保留策略，并交付已实现的API/错误码及隔离测试证据。前端随后实现双方入口、列表/详情/状态/保存分享/导出及真实编译页面测试；当前不调用假定接口、不伪造正式票。真实支付、迁移与部署仍单独授权。

本地zh@71ff30e，远端main@a28c1ef只读；PR#5已由负责人合并，保留其历史。平台与真机仍WAITING_FOR_OWNER_PREVIEW；本次无可预览的小票新页面。下一独立任务是按负责人评审反馈收敛接口字段/状态映射，不能把待协调后端实现自行勾选完成。

## 2026-10-27｜FE-01｜zh

### FE-01-P1 已修复：独立端构建回归

复现（基线 b308134）：npm ci 后运行 npm run build:customer / build:merchant，分别在 index 的 /pages/admin/admin 与 admin 的 /pages/index/index 导航失败。profile 另有同样的商家直接导航，修复首次问题后也需隔离。

修复：Customer 使用现有 singleAppHost → customer/navigation 别名；Merchant 新增 singleAppHost → merchant/navigation 别名。页面经适配器导航并按角色关闭无效跨端入口，Combined 保留新鲜服务端权限检查、商家偏好及显式返回顾客。无 API、数据库或支付协议变化。回退可 revert 本文所在提交，回退后将恢复原独立构建失败。

### FE-01-T1：需协调旧导航测试（合并前处理）

实际执行 backend/tests/frontend-navigation-runtime.test.mjs 与 merchant-entry-contract.test.mjs：8/16 失败。前者抽取 handler 的 VM 未注入新角色常量/导航适配器，报 ReferenceError: CAN_OPEN_MERCHANT is not defined / CAN_OPEN_CUSTOMER is not defined；后者两项绑定旧字面量。

期望：负责人批准后，在其测试维护范围更新夹具依赖和断言；不要通过恢复跨端字面量或放宽构建边界让测试通过。可参考 apps/tests/navigation.test.cjs：直接加载三个真实构建的 CommonJS 页面，内存 wx 覆盖身份变化、拒绝、重复点击和隐藏。11 项通过，选定离线集共33项通过。旧失败日志保留，未修改 backend/**。

### FE-02 需要的隔离 staging 契约

- 确认首版 Combined、隔离 HTTPS API origin、可用店铺 slug / 店铺码（通过受控渠道提供测试会话，不提交仓库）。
- /v1/store-entry/store/:slug 与 /v1/store-entry/scene/:scene：返回 storeSlug/storeName，需可用及失效入口数据。
- /v1/auth/wechat 与已授权商家 /v1/merchant/stores/:slug/categories：提供顾客、owner/manager/只读、无权限/过期会话场景；权限以服务器为准。
- 商品分页 products/categories/hasMore/nextCursor、库存/价格变化与配送规则：需空店铺、末页、售罄、缺货、暂停、不可配送的数据；不在前端伪造成功。
- /v1/stores/:slug/orders：保留服务器定价、Idempotency-Key 与 unpaid 结果；前端当前提示“订单已创建（待支付）/尚未扣款”。需负责人提供幂等重放/冲突/迟到响应联调用例。
- 支付路径与 wx.requestPayment 参数、取消/未知结果的可信查询协议尚未提供；不猜测 /pay 或 /refund。
- 私有送达凭证、客服、GPS/评价相关权限/迁移/审核状态由负责人确认；未连接或修改任何后端。

尚无真实 staging 请求，因此没有真实 HTTP 错误码或业务差异结论。API 样例仅描述现有前端契约，后续使用脱敏测试数据留档。原负责人档案 [TEST_STATUS](../../testing/TEST_STATUS.md)、[RELEASE_CHECKLIST](../../testing/RELEASE_CHECKLIST.md) 未修改，请负责人在审核后整合。

## 2026-10-27｜FE-02 纠正与后端协作分支阅读记录

最新分工：微信平台编译/预览/真机由项目负责人完成，标记 WAITING_FOR_OWNER_PREVIEW，本前端开发者不安装、不登录、不运行微信工具。FE-01-T1 旧夹具现已获授权修复：6个VM依赖问题、2个导航字面量问题；另扩大白名单发现2个同类契约断言，已修复，失败证据保留。无后端业务/API/SQL修改。

本地 RELEASE_GATE.md 与 docs/delivery/backend/HANDOFF.md 未存在；已只读查看 origin/backend/be-01-release-baseline@cd034562b71638b686cd7551660296873975cd30。其 RELEASE_GATE=BLOCKED，HANDOFF 同样说明 legacy 单AppID、unpaid、可信支付未实现、staging/私有R2待确认。未 merge / cherry-pick，不把其文件当作本分支已有。

待后端提供：受控隔离 staging 地址、店铺/顾客/商家权限用例、稳定错误码及库存配送边界数据；支付仍需真实服务端创建/结果查询/通知验签协议。正式联调尚未运行，没有新增“已部署API差异”的结论。前端可先处理登录并发与迟到响应，若需要服务器改动另行交接。

## 2026-10-27｜FE-03 纯前端身份修复交接

没有新增后端接口需求。loginWithWechat仍POST /v1/auth/wechat，服务端token格式与现有Bearer约束一致；只在前端阻止旧上下文保存响应，新增15秒超时。服务端仍负责真实身份和商家membership。

离线复现并修复旧登录覆盖新身份/退出、商家隐藏后跳转及旧logout finally覆盖新验证；22项新夹具最终通过，总前端回归143项。真实微信登录/会话撤销、staging和跨设备尚未验证，由负责人按PREVIEW_HANDOFF.md回传结果。负责人分支无需迁入本地，当前未改backend/src、SQL、Docker或其档案。

## 2026-10-27｜审核与预览入口

前端产品SHA91074bc20666693effe12f29594c7a3253ab6b4c，已推送zh，草稿PR https://github.com/chengyang1017/stall-miniapp/pull/2 待负责人审核；未合并。PREVIEW_HANDOFF.md现提供明确SHA与逐步操作，请负责人回传平台/设备证据。后端分支推进到b6b66f9后HANDOFF与RELEASE_GATE读取结果未变化，未迁入其文件。

## 2026-10-27｜FE-04 进度核查与预览依赖

当前DEVELOPMENT，完整18项状态见STATUS_AUDIT.md。原先旧8项测试失败已解决；本轮新增本机DEMO结算修复最终169项离线验证通过，无后端API改动。实际平台、staging、多角色/多设备、图片/客服/支付等尚未全面验收。

负责人需检查Combined/Customer的checkout→orders：合成资料演示建单、正确返回订单Tab、显示待支付；重复点击/取消/页面离开/营业暂停/价格变化重确认；导航失败后本机订单仍在。云端订单接口仍保持服务端定价和unpaid，不将该DEMO测试当作真实订单/支付验收。

待联调依赖继续为明确隔离staging地址、店铺/顾客/owner/manager/只读用例、错误码与真实私有图片配置。微信工具和iOS/Android由负责人另一台电脑执行，WAITING_FOR_OWNER_PREVIEW，不要求本前端开发者安装或登录。

## 2026-10-30｜同步协作状态

用户要求最新main合并后继续zh：main@3dcb568及其后端变更已随Git合并接入，无额外backend/src/sql/testing编辑。新版账号/手机号/权限缓存、catalog控制器与zh前端防护已整合；离线170项通过，真实环境未在本轮执行。后续API依赖/旧FE-05候选按main当前实现重新核对。

## 2026-10-30｜FE-06 收藏/浏览交接

本轮实现设备本地收藏与历史，没有修改backend/src/sql/testing，也没有调用假定的favorites/history API。清理小程序本地存储会删除记录，不跨设备同步；已在列表页说明。账号/店铺隔离由既有opaque cacheScope+origin+slug实现，访客独立。

如未来需要跨设备同步，需后端负责人另行提供：身份/店铺限定的收藏增删与分页读取、浏览上报去重/分页、清空/删除及保留策略、统一错误码、离线冲突合并和本机数据迁移协议。此处仅交接需求，没有创建/调用这些路由或修改数据库。当前列表只用现有公开商品查询按最多40ID一批重新确认价格/在售状态。

负责人需在Combined/Customer验详情收藏与回显、首页/我的复用入口、自动历史/去重/删除/清空、切账号/店铺、网络失败、下架/缺货、重启持久化；Merchant应无新增入口。离线215通过仅代表白名单，平台/设备仍WAITING_FOR_OWNER_PREVIEW。
# FE-06 最终回执｜2026-10-30

受测提交ab809a80b0d2590388dc18eda35af830d1796d1c（zh），功能提交b7a2300，main基线8293716。最终再次实跑`npm run verify:frontend`：215通过/0失败/0跳过，证据`evidence/20261030-library-synced.txt`。预览入口和核验步骤以PREVIEW_HANDOFF.md顶部FE-06为准；下方保留历史材料。

收藏与浏览记录仅本机持久化，按账号/店铺/API隔离；现有后端没有对应同步接口，跨设备/重装恢复不在本次已实现范围。负责人接手微信平台与iOS/Android验收，状态WAITING_FOR_OWNER_PREVIEW；有截图/错误后继续独立复现修复。下一项独立工作为处理负责人预览反馈；不再凭空新增功能。当前DEVELOPMENT，未正式交付。旧PR#2由负责人关闭，本轮单独创建草稿PR而不重开旧PR。

## 2026-10-31 SBX-01
Partial Sandbox channel foundation implemented; DEVELOPMENT, full lifecycle incomplete. Details, files/variables, commands/evidence, external test steps and remaining implementation: [SANDBOX_PAYMENT_STAGE.md](SANDBOX_PAYMENT_STAGE.md). Backend payment 83/0/0, final frontend 221/0/0; first frontend 170 pass/45 fail preserved and harness fixes documented. Platform WAITING_FOR_OWNER_PREVIEW; no provider/PG runtime, migration or deployment. Baseline main@18f18f7; isolated codex/sandbox-payment-channels branch preserves collaborator state. Next: durable attempt/event ledger, duplicate collection compensation, refunds and receipts.

## 2026-10-31 SBX-02 — durable Sandbox lifecycle

Continues PR #7 on codex/sandbox-payment-channels, baseline cd3097a. Implemented migration 027, single-active durable attempts, signed event audit/provider recovery, full/partial refunds using existing jobs, late/duplicate compensation, immutable receipts and checkout/orders/detail/merchant panels. Current implementation, files, environment/ACL/isolation gates, actual test evidence and owner steps: [SANDBOX_PAYMENT_LIFECYCLE.md](SANDBOX_PAYMENT_LIFECYCLE.md).

Final payment 83 pass/0 fail/0 skip; new WASM PostgreSQL lifecycle 35/0/0; frontend 230/0/0 with three strict TypeScript builds. Additional selected order/Staging regression 140 pass/1 fail/0 skip: P7-39 also fails on read-only cd3097a baseline (62/1/0); original tests and current business policy not weakened. Windows native PGlite directory restart failed; preserved logs, separate persisted-archive fresh-process recovery passed. No Neon/native multi-connection, Stripe Test or WeChat runtime acceptance; WAITING_FOR_OWNER_PREVIEW. DEVELOPMENT retained on evidence, no automatic feature enable/migration/deployment/funds.

Next independent task: owner-reviewed isolated migration/ACL setup and real Neon multi-connection + Stripe Test/channel/WeChat acceptance using the linked steps; resolve existing P7-39 policy/test mismatch before release. Product SHA/remote confirmation appended after commit.
