# 前端交付进度

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
