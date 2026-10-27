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

## 2026-10-27｜FE-02｜zh｜恢复、同步、旧夹具修复

现场：Git root=C:/project development/stall-miniapp，HEAD=4278c40802cdf7054a4a785bec00171743e5214f，开始工作区干净；Node24.11.1/npm11.6.2。git fetch origin 后 main=b308134，远端原无zh；git push -u origin zh 成功，git ls-remote --heads origin zh 返回4278c40802cdf7054a4a785bec00171743e5214f。未改main或后端协作分支。

复现命令：node --test backend/tests/frontend-navigation-runtime.test.mjs backend/tests/merchant-entry-contract.test.mjs。修前16项：8通过/8失败/0跳过，详见 evidence/fe02-legacy-before.txt；修后16通过/0失败/0跳过，详见 evidence/fe02-legacy-after.txt。

8项失败逐项归因（均与4278c40引入适配器的前端变更有关）：

1. profile: a verified merchant explicitly enters workspace and saves preference：旧VM缺CAN_OPEN_MERCHANT/导航适配器。
2. profile: rejected permission never navigates or stores merchant preference：同上。
3. profile: simultaneous taps make only one authorization request：同上。
4. profile: hiding while permission is pending prevents late navigation：同上。
5. profile: session identity changes invalidate a pending authorization：同上。
6. merchant workbench: customer switch navigates to home tab：旧VM缺CAN_OPEN_CUSTOMER/navigateCustomerShop。
7. app opening cannot route to merchant without fresh authorized request：仍寻找旧直接wx.navigateTo字面量，现检查授权/响应/identity顺序、真实adapter本体与Customer构建别名。
8. merchant can choose the customer shop without creating another AppID：仍寻找页面wx.switchTab，现检查guard、导入别名、真实adapter与Merchant别名。

没有删除、跳过、降低这些安全行为要求，VM注入真实Combined adapter，直接运行实际wx mock动作。扩大前端白名单首次npm run verify:frontend：121项119通过/2失败/0跳过；另外2个frontend-navigation.test.mjs契约仍匹配旧跳转与旧guard字面量，失败日志evidence/fe02-verify.txt。修复为实际adapter和新角色guard后再次运行同一命令：**121通过/0失败/0跳过/0待办**，evidence/fe02-verify-fixed.txt。

verify:frontend实际依次执行边界、三目标TypeScript构建、全产物检查、三产物静态预览扫描、明确11文件离线测试白名单。Combined125模块36页258文件，Customer72模块13页136文件，Merchant84模块19页153文件。预览扫描每目标0错误/1个预编译JS下的插件警告；不是微信平台结果。未执行全backend/tests通配、live/staging/DB/Docker测试。

本地RELEASE_GATE和backend/HANDOFF缺失；已git show读取远端backend/be-01-release-baseline固定cd034562b71638b686cd7551660296873975cd30文件，只读，无合并。PL-01/05按最新用户分工改为WAITING_FOR_OWNER_PREVIEW，微信工具与iOS/Android验收3类均未运行；staging/生产/真实支付未运行，不计入121离线测试。具体未运行用例未枚举完毕，不伪造“未运行总用例数”。

## 2026-10-27｜FE-03｜登录竞态回归

基线172aa7d254432f97de924ebcf8032361fc29cb22。先新增实际编译auth模块的离线wx回调夹具，初次尝试因旧代码没有拒绝旧请求而留下未完成promise，手动中断；保留fe03-auth-before.txt，不作为完整测试结果。补齐负例的旧回调，使失败能完整退出，执行 node --test --test-timeout=5000 apps/tests/auth-session.test.cjs：10项1通过/9失败/0跳过，fe03-auth-repro.txt；其中8项分别验证店铺变更、后端变更、退出、身份替换、并发登录、调用页失效两阶段、无效token，另1项明确请求timeout缺失。没有网络/微信/后端调用。

修复后增加Combined/Merchant真实编译商家页生命周期回归，首次npm run verify:frontend：141/141通过，fe03-verify.txt。进一步新增旧logout响应覆盖新验证的2个负例，执行同一auth文件：22项20通过/2失败/0跳过，fe03-logout-before.txt；修复logout UI回写序号后再次运行 npm run verify:frontend：**143通过/0失败/0跳过/0取消/0待办**，fe03-verify-final.txt。

最终白名单12文件，包含新增22个auth/商家页用例。验证：当前正常login、微信code阶段切店铺、exchange阶段切后端/退出/身份替换、后发login优先、页面失活两阶段、无效令牌、HTTP/网络失败；Combined与Merchant分别测权限成功/隐藏/旧finally/忙碌输入重复验证/离开时exchange/旧logout覆盖新身份。

三目标重新构建：Combined125模块36页258产物，Customer72模块13页136产物，Merchant84模块19页153产物；边界与全产物检查PASS。预览静态扫描均0错误/1个预编译JS插件警告。上述143为最终覆盖总数，不能与重叠的121或141相加。代码/文档diff检查排除保持原样的原始证据输出中的空白行；业务与测试源码检查通过。

微信平台、iOS、Android 3类验收WAITING_FOR_OWNER_PREVIEW，当前均无运行证据；CLOUD-STAGING/真实微信登录/真实支付/生产未运行，未运行用例总数未枚举，不能记成0。后端业务测试、数据库、Docker及旧B0未操作。

## 2026-10-27｜FE-02/03 同步回执与验证范围

FE-02提交172aa7d254432f97de924ebcf8032361fc29cb22、FE-03产品提交91074bc20666693effe12f29594c7a3253ab6b4c，均普通push成功并各自用git ls-remote核验远端SHA；未推main。GitHub草稿PR#2已创建，未合并。最后的交接文档回执不改源码/测试/构建配置，不因文档变化重复业务测试。受测产品SHA固定91074bc20666693effe12f29594c7a3253ab6b4c，最终证据fe03-verify-final.txt。

fetch后只读复核后端分支b6b66f9的交接与门禁，无接口增量。没有执行后端新脚本、数据库或Docker命令。完整测试用例未运行总数不详；只报告明确白名单143个全部通过，平台/真机/真实服务分别保持待验。
