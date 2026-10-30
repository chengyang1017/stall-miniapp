# 前端实测记录（追加保留）

## 2026-10-30｜FE-07 需求文档回归

受测现有产品源码71ff30e33f7e1482308744c6467613c306f46bbf，当前zh；本轮没有修改产品代码。实际命令`npm run verify:frontend`退出0：215通过、0失败、0跳过、0取消；三目标构建/源码边界/产物检查通过，静态预览每目标0错误及1个既有JS预编译插件警告。证据[evidence/20261030-receipt-requirements.txt](evidence/20261030-receipt-requirements.txt)。这不验证远端main后续新增源码，也不包含电子小票专项。

小票状态/约束/权限仅评审稿；专项测试尚未实施，未运行数量未枚举，不记为0或通过。真实PG并发/回滚、微信V3支付/退款、真实API、平台及iOS/Android均NOT RUN；平台责任为WAITING_FOR_OWNER_PREVIEW。提交前实际运行git diff --check通过；6份文档的25个相对链接均存在，无替换乱码字符或凭据模式匹配；源码目录差异为空。保留所有历史失败证据。

2026-10-30最终同步复测：受测提交ab809a80b0d2590388dc18eda35af830d1796d1c（main8293716+FE-06）。实际执行`npm run verify:frontend`退出0：215通过、0失败、0跳过、0取消；全部三目标构建、角色边界、产物检查通过。原始日志`evidence/20261030-library-synced.txt`。与功能提交b7a2300的前端代码无差异；新增main后端内容仅随合并保留，未单独运行后端/DB/平台/真机测试。WAITING_FOR_OWNER_PREVIEW不计作通过或跳过测试。

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

## 2026-10-27｜FE-04｜进度核验与本地结算

起点local/origin zh=524c6dc040d47dcb0e35243f2c345dc85c45b890。读取AGENTS、TASKS、全部前端永久档案及原任务书，fetch核验main/zh、只读复核后端协作分支b6b66f9的门禁/接口交接。未合并后端，未操作数据库/Docker或微信工具。全面判断见STATUS_AUDIT.md。

1. npm run verify:frontend 基线重跑：143通过/0失败/0跳过，evidence/fe04-baseline.txt。
2. 新增实际编译DEMO回归：node --test --test-timeout=5000 apps/tests/demo-checkout.test.cjs。修前26项6通过/20失败/0跳过，fe04-checkout-before.txt。模拟器中的路由mock依据仓库wx类型约束拒绝redirectTo打开Tab；不是实际微信平台报错。失败覆盖非法Tab跳转、重复弹窗、确认失败锁释放、隐藏/卸载、暂停营业、静默改价、导航失败反馈和一次性提示要求；不是20个互不重叠的产品缺陷。
3. 修复产品代码后首次npm run verify:frontend：169项134通过/35失败/0跳过，fe04-verify-first.txt；新26项均已通过。34项订单夹具抽取import时未注入新增takeCreatedDemoOrder，另1项错误要求redirectTo跳Tab。保留失败并显式注入只返回空notice的默认stub；真实notice由新编译模块回归测试，未弱化订单身份/分页安全断言。源契约改查switchTab、身份隔离notice和无Tab参数。
4. 定向命令 node --test --test-timeout=10000 apps/tests/demo-checkout.test.cjs backend/tests/frontend-navigation-flows.test.mjs backend/tests/frontend-navigation-orders-phase6.test.mjs：76通过/0失败/0跳过，fe04-checkout-fixed.txt。
5. 最终npm run verify:frontend：**169通过/0失败/0跳过/0取消/0待办**，fe04-verify-final.txt。三目标Combined125模块36页258产物、Customer72模块13页136产物、Merchant84模块19页153产物；边界/产物PASS，预览静态扫描每目标0错误/1插件警告。169是最后覆盖总数，不与143或76相加。

新26项各端13项：正确Tab与unpaid库存预留；一次确认；取消/失败保留购物车；隐藏/卸载失效；切云端不建本地单；营业/配送暂停重校验；价格变化重确认；导航失败保留已建订单不重建；立即购买仅清自身选择；缓存Tab重置筛选且提示不重放；跨身份/云模式notice失效。使用固定演示时钟、合成姓名/电话/地址、内存wx和真正编译模块；没有实际网络/微信/后端请求。

读取补充源码时一条终端命令长时间未返回，已等待原会话结束并检查输出；不把等待当作测试成功。最终完整验证已经正常退出0。源码/文档diff检查排除保留原样的原始证据日志，避免改写历史输出中的空白。

WECHAT-DEVTOOLS、iOS、Android三类验收均WAITING_FOR_OWNER_PREVIEW且无回传；真实staging/登录/支付/存储/多设备未运行，用例总数尚未枚举，不伪造0未运行。当前仍DEVELOPMENT。

### FE-04 提交与推送核验

产品SHA27646b30ab3d9b13d26db93de71e37b853c236db；普通git push origin zh成功，git ls-remote --heads origin zh返回相同SHA，status为zh...origin/zh且无修改。新增原任务书快照的Markdown尾随空白在提交前规范化；原失败/测试日志均未重写。最后的SHA/PR交接文档不改变产品、构建或测试文件，因此不为纯文档再次运行重复业务测试；受测代码一致性另用git diff核对。

## 2026-10-30｜SYNC-MAIN｜最新main合并回zh

本地main快进到远端3dcb568；zh保留旧6提交并合并该main。16个冲突已按新版产品行为和既有安全保护逐项处理。保留原始日志，未执行后端/live/数据库/生产/微信工具测试。

- 首次npm run verify:frontend：170项121通过/49失败/0跳过，evidence/20261030-main-sync-first.txt；构建及静态扫描已通过。失败包括旧首页自动商家跳转预期、旧4Tab数量与非Tab订单断言、订单entry存储mock缺key、profile函数提取跨入TS头像方法、admin导航mock名称、支付文案与新权限缓存Promise链的微任务等待。没有将其隐藏或删除。
- 定向node --test apps/tests/navigation.test.cjs apps/tests/auth-session.test.cjs apps/tests/demo-checkout.test.cjs backend/tests/frontend-navigation-runtime.test.mjs backend/tests/frontend-navigation-orders-phase6.test.mjs backend/tests/frontend-navigation.test.mjs：117通过/0失败/0跳过，evidence/20261030-main-sync-targeted.txt。保留授权拒绝/身份变化/隐藏/重复点击断言，按实际新版契约适配夹具。
- 最终npm run verify:frontend：170通过/0失败/0跳过/0取消；evidence/20261030-main-sync-final.txt。Combined137模块38页372产物、Customer83模块15页248产物、Merchant90模块19页249产物。静态预览扫描各0错误/1插件警告。170为最终覆盖总数，不叠加前两次。
- 无残留冲突标记；相对origin/main的backend/src、backend/sql、backend/testing无差异。用户指定继续zh；不推main、不自动合并PR。

本轮未执行微信平台/真机/staging/真实支付，不对朋友其他机器已有验收结果作额外判断；本机离线验证仍不能替代平台验收。

## 2026-10-30｜FE-06 收藏/浏览记录实测

前置同步：main再次前进到2f0aab3，仅账号资料页；已在zh普通merge（d9c05cc），不覆盖双方历史。最初检索确认首页/详情/个人页收藏和浏览记录均为unavailable占位，没有真实收藏或历史后端。只使用现有入口，不新造后端路由。

实现中首次脚本因profile.wxml CRLF锚点未匹配而停止，保留当时20261030-library-first.txt（170项通过仅表示当时既有测试，不作为完整功能验收）；补齐入口与独立新测试后npm run verify:frontend：208通过/0失败/0跳过，20261030-library-regression.txt。

补充真实模块重建恢复、旧云端详情响应、新旧清空/重载/切标签竞态，以及登录退出后统计更新；最终再次 npm run verify:frontend：**215通过/0失败/0跳过/0取消/0待办**，evidence/20261030-library-final.txt。新45项=9基础存储/隔离/边界用例+1跨模块会话恢复+每Combined/Customer17项+1Merchant不打包检查；215是最终覆盖总数，不叠加前两轮。

覆盖：收藏/取消、无伪造历史、MRU去重/100上限、200收藏拒绝溢出、浏览更新收藏快照、账号/store/API/guest/demo隔离、稳定cacheScope重登录恢复、旧scope拒绝读写、清空/删除仅当前kind、损坏记录/签名URL/额外字段过滤、不持久化Bearer；实际详情记录/无效详情/写入失败；列表实时价格/下架/缺货/删除/40ID分批/断网重试不回退demo/身份店铺切换及隐藏旧响应；清空取消/确认/跨身份/重载/标签切换；入口与数量；Merchant依赖隔离。

最终构建：Combined139模块39页377产物、Customer85模块16页253产物、Merchant90模块19页249产物。源码边界、产物清单通过；静态预览0错误、各1个历史预编译JS插件警告。代码/配置/Markdown diff检查通过（原始证据中的空白不为美化而改写），原占位提示已无匹配。相对origin/main的backend/src、sql、testing无差异。

测试使用合成商品、.invalid域名和内存wx，未连接真实微信/API/支付、未运行后端、数据库或Docker。平台/真机WAITING_FOR_OWNER_PREVIEW；实服务未运行项总数未枚举，不记成0。用户要求检查后push，本轮源代码和测试检查已完成，随后才提交推送。
