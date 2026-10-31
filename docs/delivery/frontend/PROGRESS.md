# 前端交付进度

## 当前现场｜2026-10-30｜FE-07 电子小票需求补充

已按用户新需求完成[电子小票状态/数据/权限评审稿](RECEIPTS_REQUIREMENTS.md)：订单业务/履约/支付尝试/退款分离，取消与未知结果处理、超时关单和迟到到账、并发退款占用额度、唯一票据/资金/事件约束、成交快照/跨期对账、本店/本人权限与导出分享边界。仅文档提案，未实现小票/微信支付/退款、未修改后端/SQL或现有入口。

本地zh基线71ff30e，工作区起始干净；fetch只读见main@a28c1ef，PR#5已由负责人合并。远端独立顾客会话演进不被当成本地已合并/已测试。RELEASE_GATE.md和backend/HANDOFF.md本地均存在，支付仍有未完成门槛，本轮没有修改负责人档案。

实际执行npm run verify:frontend：215通过、0失败、0跳过、三目标构建/边界/产物检查通过；证据evidence/20261030-receipt-requirements.txt。这些是现有前端回归，不是小票专项通过。真实PG/微信V3/资金/平台/真机未运行；小票代码尚未实现，不能标完成。

当前DEVELOPMENT；下一步为项目/后端评审商户模式、迁移/身份/逐店权限、异常资金、优惠/退款口径及真实API，确认后前端实现双方小票页面及编译页面测试。无真实API前不猜路由、不显示模拟正式票。预览职责仍WAITING_FOR_OWNER_PREVIEW。

最终同步回执（2026-10-30）：main随后推进到8293716，差异仅为后端身份基础及其文档；已安全合并为zh的ab809a8，本地main也已快进。相对功能提交b7a2300，前端产品/构建脚本完全未变；仍在ab809a8再次实际运行全量前端检查，215通过、0失败、0跳过，详见20261030-library-synced.txt。b7a2300已推送并核验；最终纯文档回执检查后正常推送，不force、不推main。旧PR#2已由负责人关闭，不重新打开；本轮另建草稿PR供审查。以下保留早先现场记录，不以其旧基线覆盖本回执。

## 当前现场｜2026-10-30｜FE-06 收藏与浏览记录

用户明确要求在zh复用现有按钮实现收藏及浏览过的商品，并先检查再push。当前在zh；同步期间main再次推进到2f0aab3（账号页），已追加合并d9c05cc，保留之前b953d2c冲突处理和双方历史。未reset/force，原始6个zh提交仍保留。

FE-06已实现：商品详情底部收藏按钮切换实心/空心；成功确认商品后自动记录浏览历史；复用首页收藏、个人页收藏统计/服务入口和浏览记录入口；新增共享收藏/浏览列表页。取消/删除/清空、空态、存储失败、网络重试、下架/缺货状态、当前/历史价格标识均有处理。

保存范围明确为本机，按API/店铺/不含令牌的账号cacheScope隔离；访客、DEMO及账号互不合并，不跨设备同步。收藏上限200，浏览记录最近100件、去重并最近优先。没有收藏/历史后端接口，未改backend/src/sql/testing；云端列表只调用现有公共商品查询重新确认状态，不伪造云端保存或当前售价。

最终npm run verify:frontend：215通过/0失败/0跳过（原170+新45），Combined139模块39页377产物，Customer85模块16页253产物，Merchant90模块19页249产物；边界/产物/三目标构建通过，静态预览每目标0错误/1历史插件警告。检查无旧收藏占位提示残留、无商家端收藏模块、代码diff检查通过，原始证据20261030-library-final.txt。

当前DEVELOPMENT：本次有界功能已完成离线验证，平台/真机仍WAITING_FOR_OWNER_PREVIEW；跨设备云端同步未实现，需要后端另行契约/授权。微信真实预览与整体交付不得从215离线通过推断。下一项：负责人按FE-06步骤验收；可独立继续此前FE-05候选，但需先以main新代码复核，不能直接套旧缺陷结论。


## 当前现场｜2026-10-30｜SYNC-MAIN

用户要求更新朋友已合并的main后继续zh。开始zh/origin/zh=5a0499d333bde7970c528689d77f675df668e3a7，工作区干净。fetch后origin/main=3dcb568（Merge PR#1），本地main由b308134快进到3dcb568；main尚未包含zh的6个提交，因此在zh合并origin/main，保留双方历史，不reset/rebase/force。

16个冲突文件按新版结构合并：首页保留main的catalog控制器与“不自动恢复商家工作台”行为；保留新版账号/手机号/权限缓存、商家workspace和cloud-only预览配置；共享auth同时保留main预览校验/错误码与zh的最新登录/上下文/可见性/令牌校验；本地checkout保留zh确认保护及notice，同时保留main只移除本次购买商品的购物车行为；订单保留main筛选入口和paymentLabel，叠加zh一次性notice。没有改动main的backend/src、sql、testing内容。

最终npm run verify:frontend：170通过/0失败/0跳过；三目标构建、边界、产物通过，Combined137模块38页372产物、Customer83模块15页248产物、Merchant90模块19页249产物。初测49项旧夹具/旧预期不兼容保留日志，未删/跳测试；适配新版首页、5个Tab、paymentLabel和异步缓存链后全绿。

继续工作分支zh。此次只做同步/冲突兼容和验证，不开展新的业务功能、真实API/支付/微信工具或生产操作；平台结果不从离线验证推断。旧FE-05候选须结合main的新源码重新评估，不直接照旧审计结论实施。


## 当前状态｜2026-10-27｜FE-04（最新）

**DEVELOPMENT，尚未进入最终收尾。** 上一轮FE-02/03已完成并推送；本轮开始local/origin zh均524c6dc040d47dcb0e35243f2c345dc85c45b890，main=b308134，工作区干净。重跑既有verify:frontend：143通过/0失败/0跳过。

完整判断见 [STATUS_AUDIT.md](STATUS_AUDIT.md)：任务书18项及原A—E阶段未全部完成，很多页面只有源码/部分离线证据，不能报告完成百分比。微信工具/iOS/Android仍WAITING_FOR_OWNER_PREVIEW，无实际回传；staging、真实登录/支付及完整多角色业务待联调。

FE-04（P0本地演示结算）：已复现并修复redirectTo跳orders Tab、重复确认弹窗、页面离开后建单、暂停营业与价格变更未重新确认等问题。改为合法switchTab，缓存Tab也能接收一次性/身份隔离的新演示订单提示；确认前后统一检查营业、配送、库存、地址、起送与时段，价格/数量/配送快照变化需重新确认。保存成功但导航失败明确提示已保存/未支付，不当作建单失败要求重建。仅影响DEMO，不改后端/支付。

新增26项实际编译checkout→存储/库存/购物车→orders页面回归，覆盖Combined/Customer两端。修前26项6通过/20失败（包括新增明确反馈要求）；首次完整回归35项失败来自旧夹具缺新增takeCreatedDemoOrder依赖和1个错误redirectTo契约，保留日志并修复夹具，未删/跳测试。最终npm run verify:frontend：169通过/0失败/0跳过；三目标构建/边界/产物通过，静态预览扫描各0错误/1历史插件警告。见TEST_LOG及fe04-verify-final.txt。

本轮有界任务完成后按Git历史提交推送，产品提交以 `fix(frontend): make demo checkout confirmation and tab navigation safe` 定位，精确SHA在PREVIEW_HANDOFF同步回执追加。草稿PR#2仍待审核，不自动合并。

下一项自主FE-05：用延迟mock验证云端checkout提交/结果弹窗的隐藏/卸载、切上下文、旧finally、结果弹窗回调；源码候选已定位，但未实测前不报“已确认缺陷”。商品详情异步加购/立即购买、地址切换及商家经营异常矩阵也未全量审完。继续离线工作，无需用户再找提示词；负责人并行处理预览交接。个人前端职责尚未全部验收，商城未正式交付。


## 当前状态｜2026-10-27｜FE-03（最新）

状态 DEVELOPMENT，未达到前端平台验收/客户交付。FE-02已提交172aa7d254432f97de924ebcf8032361fc29cb22并推送，远端SHA核验一致。4278c40也已在zh远端。

FE-03（P0身份隔离/可靠性）：已用真实编译auth模块复现切店铺/后端、退出、替换身份及并发登录后旧响应写回会话；修前10项1通过9失败（包含缺少显式请求超时/无效令牌校验）。新增最新登录序号+请求身份检查，商家页可见性取消回调、权限验证请求序号、忙碌输入保护和旧logout finally隔离。不修改后端协议/业务、SQL或生产设置。

最终 npm run verify:frontend：143通过/0失败/0跳过；三目标构建、边界和产物检查通过，静态预览扫描每目标0错误/1历史插件警告。新增22项隔离auth/商家生命周期测试，保留修前与中间失败证据；详见TEST_LOG.md及evidence/fe03-verify-final.txt。

平台/真机统一 WAITING_FOR_OWNER_PREVIEW，负责人另一台电脑执行，当前无回传证据。staging/支付等依赖仍未提供，不影响离线开发。当前个人范围尚未全部完成。

下一项自主任务 FE-04（P0候选）：本地演示checkout创建后使用redirectTo跳orders Tab（checkout.ts约238行），与本仓库微信类型文档“非tabBar页面”约束冲突；先用路由/实际页面夹具确认，修成合法Tab跳转并保留新订单提示，更新现有错误的源码契约测试。另继续审查账号/店铺切换、商品/购物车/结算异步结果的上下文保护。不得把源码候选当作已通过微信平台复现。


## 当前状态｜2026-10-27｜FE-02（覆盖下面历史状态）

状态：DEVELOPMENT。用户已授权普通 Commit/Push 到 zh；微信工具/平台/真机由项目负责人在另一台电脑负责，本前端开发者不安装、不登录、不运行微信开发者工具。相关验收统一为 WAITING_FOR_OWNER_PREVIEW，不能代替通过。

- 现场核验：Git 根目录正确，开始 zh 工作区干净，4278c40802cdf7054a4a785bec00171743e5214f 真实存在，origin=https://github.com/chengyang1017/stall-miniapp.git；远端 main=b308134，zh 原先不存在。已普通 push -u origin zh，远端核验为 4278c40802cdf7054a4a785bec00171743e5214f。
- 已复现旧16项测试的8项失败并保存 fe02-legacy-before.txt。修复真实 Combined 适配器注入、导航适配器断言；原16项全通过，未删/跳测试，未修改后端业务。
- 扩大离线前端检查时另发现2项旧字面量断言不兼容，保存 fe02-verify.txt；同步修复 frontend-navigation.test.mjs，不恢复有问题的跨端直跳。
- 新增根 AGENTS.md、永久 TASKS.md、DECISIONS.md、PREVIEW_HANDOFF.md；新增 npm run verify:frontend（明确离线白名单，三目标重建、边界/产物/预览扫描后运行前端测试）。
- 本地 docs/delivery/RELEASE_GATE.md / docs/delivery/backend/HANDOFF.md 尚不存在，但已只读查阅 origin/backend/be-01-release-baseline 的 cd034562b71638b686cd7551660296873975cd30 版本；没有合并/覆盖其文件。门禁仍 BLOCKED：真实支付、staging、微信平台、数据库/存储与客户签收等未验收。
- 测试最终结果见 TEST_LOG.md。保留 FE-01 及本轮失败历史。PL-07 旧夹具问题已修复；其余真实集成依赖未解除。

下一项可独立任务 FE-03（P0候选）：核验商家登录/权限验证在页面隐藏、编辑店铺/后端、并发登录与身份变化时的迟到响应；先用隔离夹具复现，确认缺陷后修复，不改服务端 API。项目负责人并行执行 PREVIEW_HANDOFF.md。当前未达到前端验收或客户交付条件。


## 2026-10-27｜FE-01｜zh

执行：协作开发者 / Codex。基线 HEAD 与 fetch 后 origin/main 均为 b308134b2df02c207ce827658b409dffb9186a1e，开始工作区干净。沿用用户指定 zh，覆盖任务建议的 frontend/* 命名。

状态：离线基线与前端修复已完成；平台验收 BLOCKED；整体交付未完成。PR / Push 未执行，仅本地提交；任务附件中的远程发布步骤等待用户明确授权。修复提交使用本文件所在提交（git log -1）。

- 已读 apps/BUILDING.md、backend/APP_SEPARATION_READINESS.md、docs/testing/RELEASE_CHECKLIST.md 及实际前端入口。
- Node v24.11.1，npm 11.6.2；Git 与 VS Code 已存在；npm ci 成功（3 包，审计 0 漏洞）。
- 初测 Combined 成功，Customer/Merchant 因页面直接写入异端导航失败，保留原始失败日志。
- FE-01-P1：首页恢复商家工作台、我的商家入口、工作台返回顾客入口统一经现有宿主导航适配器；Merchant 增加角色别名，禁止跳不存在的顾客 Tab；保持 Combined 服务端权限验证及显式切回顾客行为。
- 三目标修复后构建、边界与产物检查全通过；页面 36 / 13 / 19，模块 125 / 72 / 84。
- 新增 apps/tests/navigation.test.cjs，直接执行实际编译页面、mock wx，无网络/数据库；11 项通过；加选定既有测试共 33 项通过。
- 另外运行旧导航测试：16 项中 8 通过、8 失败，原因为提取函数未注入适配器及匹配旧字面量。未改 backend/**；见 HANDOFF.md，不能宣称所有测试通过。
- 三产物预览静态扫描 0 错误，各 1 个 TypeScript 插件警告；输出已是 JS，不代表微信平台编译通过。
- 未发现微信开发者工具安装记录；微信模拟器 / 真机 NOT RUN。没有修改云端配置，没有启动后端、Docker、数据库、支付或生产服务。

下一步 FE-02：安装并导入微信开发者工具，先用 Combined 完成 DEMO 页面截图和操作验收；与负责人协调旧夹具更新；获得明确 staging API / 测试身份后再开展跨设备业务联调。当前仍以 Combined 为首版候选，不自行切成双 AppID。

相关：[测试](TEST_LOG.md)、[逐页验收](UI_CHECKLIST.md)、[阻塞](PLATFORM_BLOCKERS.md)、[交接](HANDOFF.md)、[如何预览](PREVIEW.md)。项目负责人原档案仅引用，不覆盖：[发布清单](../../testing/RELEASE_CHECKLIST.md)、[测试状态](../../testing/TEST_STATUS.md)。

## 2026-10-27｜本轮Git同步与审核回执

- 原4278c40802cdf7054a4a785bec00171743e5214f、FE-02的172aa7d254432f97de924ebcf8032361fc29cb22、FE-03的91074bc20666693effe12f29594c7a3253ab6b4c均已普通推送到origin/zh；FE-03推送后git ls-remote核验zh=91074bc20666693effe12f29594c7a3253ab6b4c、main仍b308134b2df02c207ce827658b409dffb9186a1e。
- 已建立并附加草稿PR https://github.com/chengyang1017/stall-miniapp/pull/2，zh→main，包含测试/未验项/接口依赖/回退/Commit，无自动合并。
- 本轮收尾只补充具体产品SHA与PR到永久文档，不改受测代码。最终143通过见fe03-verify-final.txt。下一项FE-04本地结算Tab导航候选，见上方；无须用户寻找新的提示词。
- fetch观察到后端负责人分支推进至b6b66f9（BE-02准备未执行）。已只读复核其HANDOFF/RELEASE_GATE，前端接口/门禁结论未变化；没有执行其只读Docker脚本，也没有合并/覆盖后端代码。
- 当前DEVELOPMENT：个人前端任务未全部验收，未进入RELEASE_CANDIDATE或DELIVERED。实际微信预览与iOS/Android待负责人反馈，staging/支付仍依赖后端与客户。

## 2026-10-27｜FE-04 Git同步回执

产品提交27646b30ab3d9b13d26db93de71e37b853c236db已Commit并普通Push到origin/zh，git ls-remote核验远端一致，工作区干净。后续仅补预览SHA/核查回执文档，不改变169项验证所测代码。草稿PR#2保留未合并；下一项FE-05见顶部，任务书整体未完、仍DEVELOPMENT及WAITING_FOR_OWNER_PREVIEW。

## 2026-10-31 SBX-01
Partial Sandbox channel foundation implemented; DEVELOPMENT, full lifecycle incomplete. Details, files/variables, commands/evidence, external test steps and remaining implementation: [SANDBOX_PAYMENT_STAGE.md](SANDBOX_PAYMENT_STAGE.md). Backend payment 83/0/0, final frontend 221/0/0; first frontend 170 pass/45 fail preserved and harness fixes documented. Platform WAITING_FOR_OWNER_PREVIEW; no provider/PG runtime, migration or deployment. Baseline main@18f18f7; isolated codex/sandbox-payment-channels branch preserves collaborator state. Next: durable attempt/event ledger, duplicate collection compensation, refunds and receipts.
