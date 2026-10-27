# 前后端交接与待协调事项

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
