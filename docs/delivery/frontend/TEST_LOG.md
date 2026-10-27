# 前端实测记录（追加保留）

## 2026-10-27｜FE-01｜zh｜基线 b308134

环境：Windows / Node v24.11.1 / npm 11.6.2 / Asia/Kuala_Lumpur。执行目录为仓库根目录。以下均非微信平台运行验收。

| 命令 | 初次结果 | 修复后结果 / 证据 |
| --- | --- | --- |
| git fetch origin main | 成功，本地 HEAD=origin/main=b308134b2df02c207ce827658b409dffb9186a1e | 未 merge / rebase / push |
| npm ci | 成功，added 3 packages，0 vulnerabilities（终端实测摘要） | lockfile 未改 |
| npm run check:boundaries | PASS 125/72/83 模块 | PASS 125/72/84，[日志](evidence/check-boundaries-fixed.log) |
| npm run build:combined | PASS | PASS 125 模块、36 页、258 文件，[日志](evidence/build-combined-fixed.log) |
| npm run build:customer | FAIL 异端 admin 导航 | PASS 72 模块、13 页、136 文件，[日志](evidence/build-customer-fixed.log) |
| npm run build:merchant | FAIL 异端 index 导航 | PASS 84 模块、19 页、153 文件，[日志](evidence/build-merchant-fixed.log) |
| npm run check:build-output | FAIL customer 缺 build-manifest | PASS 三目标，[日志](evidence/check-build-output-fixed.log) |

初测日志同目录无 -fixed 后缀，保留失败历史。初始原始错误：

- Customer: Navigation outside target: /pages/admin/admin in miniprogram/pages/index/index.ts
- Merchant: Navigation outside target: /pages/index/index in miniprogram/pages/admin/admin.ts
- 产物检查: ENOENT dist/customer/build-manifest.json（上游构建失败的结果）。

### 离线测试

执行：node --test apps/tests/navigation.test.cjs backend/tests/build-role-contracts.test.mjs backend/tests/frontend-navigation-lifecycle.test.mjs backend/tests/miniapp-preview-audit.test.mjs

最终 33/33 PASS，0 跳过，[完整日志](evidence/offline-regression-final.log)。其中新导航测试 11 项：Combined 授权恢复/拒绝、Customer 不跨端、Profile 权限拒绝/重复点击/隐藏/身份变化、Combined 返回顾客、Merchant 拒绝不存在 Tab。使用 staging.invalid 仅作为内存 mock 字符串，没有向其发送网络请求。

初版测试夹具误将首页展示配置的正常 public business 请求计入“禁止商家请求”，6/7；已将断言收窄为 merchant 请求与商家导航，7/7，再扩充至 11 项。保留 [初版日志](evidence/navigation-test.log) 和 [中间日志](evidence/offline-regression.log)。无对应产品逻辑修改。

另执行：node --test backend/tests/frontend-navigation-runtime.test.mjs backend/tests/merchant-entry-contract.test.mjs

16 项中 8 PASS / 8 FAIL：[日志](evidence/legacy-navigation.log)。6 项为旧 VM 未注入 CAN_OPEN_MERCHANT / CAN_OPEN_CUSTOMER；2 项仍匹配直接 wx.navigateTo / wx.switchTab 字面量，现改用宿主适配器。未跳过或改写它们；需负责人协调更新，不能视为整套测试已绿。新编译页面回归已覆盖对应授权、竞态与导航行为。

### 预览静态扫描

分别执行 node scripts/miniapp-preview-audit.mjs dist/combined、dist/customer、dist/merchant：三者退出 0，0 errors，各 1 warning TYPESCRIPT_PLUGIN_MISSING。构建产物由 tsc 预编译 JS 并清空 useCompilerPlugins；警告不是已证实的平台错误，不为消除警告改配置。[Combined](evidence/preview-combined.log)、[Customer](evidence/preview-customer.log)、[Merchant](evidence/preview-merchant.log)。

### 未运行

微信开发者工具版本/模式：N/A，未发现安装记录（检查常见 Program Files 目录及 HKCU/HKLM 卸载登记，只发现普通微信 3.9.12.17）。不代表已遍历所有自定义/便携安装位置。

WECHAT-DEVTOOLS BLOCKED / NOT RUN；截图 NOT RUN；DEMO 人工交互 NOT RUN；CLOUD-STAGING NOT RUN；Android / iPhone REAL-DEVICE NOT RUN；PRODUCTION NOT RUN。没有调用微信登录、支付、后端或真实测试数据。
