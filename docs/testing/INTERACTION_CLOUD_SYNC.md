# 云端交互与生命周期优化（2026-10-28）

本轮仅源码、离线动态测试和纯编译。没有连接 Staging API/Neon、写数据库、迁移、部署或 Git 提交推送。既有 `.local/phone-staging.json`、预览配置脚本修改和上一轮源码修改完整保留。

## 行为与安全边界

- 首页 `onShow` 完全不再读取 `stall_merchant_home_preference_v1` 决定跳转。该键兼容保留，但历史偏好不触发导航；只有明确点击商家入口或主动商家登录才进入工作台。原测试中“初次自动恢复商家”已按新的产品要求改为“初次也不重定向”，服务端鉴权及跨目标导航断言保留。
- auth 的 permissionOnly 参数仅对 categories 权限探测启用同身份/API/店铺的 singleflight 与 15 秒内存结果。页面可同步查询近期成功状态；正常分类数据请求、显式进入工作台的再次确认、其他商家读写均不使用结果缓存。首次没有证明仍等待服务端。缓存从不写为永久角色；过期重验、退出清除、身份上下文变更不复用，401/403 不缓存成功，网络失败不冒充撤权。
- 工作台已有界面、设置草稿及数量在临时错误时保留，数量读取失败明确标为可能过期。个人中心同身份授权入口不闪烁。订单筛选/备注/ETA、营业设置保留上一轮修复。
- 客服以 local-clientKey 行立即显示“发送中（未确认）”，清空输入，服务端确认替换临时行。失败保留行及原 clientKey，只有用户点击重试才重发。读请求合并当前消息而非旧快照，临时行不进入分页游标/已读上报。隐藏停轮询，销毁后的 send/refresh/finally 不修改页面。内存仅保留最近一个会话；账号/API/店铺/角色及商家完整 conversation ID 严格匹配，退出清除，不把内存保留当持久消息数据库。
- support API 的 SELECT/RETURNING 增加服务端保存的 clientKey 字段，授权边界和事务/幂等机制不变。现有 backend/src/support.mjs 已使用发送者 advisory lock、会话 FOR UPDATE、相同 key 内容比对及持久唯一约束；本轮仅重新验证模拟 handler 行为，没有重新验证真实 PG 锁。
- 分类只缓存同上下文已确认列表/版本，恢复页面先显示缓存，再真实读取。写入用 pending 乐观列表，成功直接采用服务端 items/revision，不追加全量读取；失败恢复原已确认列表并保留输入、显示 failed。版本冲突须重新读取后由用户核对重试。POST 本来没有幂等键，本轮不自动重试不确定的新增，以免重复创建；不能声称分类新增实现 exactly-once。
- 分类读请求合并，读取/写入有代际保护。拖动开始使旧读取对当前页面失效；账号 A→B→A 也不能接受老写入。隐藏保留同身份内容，销毁后忽略响应。拖动按 16ms 时间门限合并触摸更新，仅变更 active/受影响行的 transform；松手立即采用最终位置、最多提交一次。稳定 wx:key=id，拖动不更换输入模板，不依赖固定延迟结束动画。
- 同类已确认清空问题也修复在商品列表、客服收件箱和备注标签页；仍保留身份切换清空、权限拒绝清空及服务端校验。

## 可重复测试

新增 backend/tests/interaction-cloud-sync.test.mjs：48 项动态测试；扩展 merchant-customer-support-handoff.test.mjs 一个服务端 clientKey 回归。测试使用 Node TypeScript 去类型后执行实际控制器和工具函数、可控 Promise/微信 transport/时钟，未复制业务算法。HTTP/数据库适配器是合成边界，不能推广为 Staging、真机或 PostgreSQL 集成验收。

联合命令（包含三种真实纯编译构建）：

```powershell
node --test backend/tests/interaction-cloud-sync.test.mjs backend/tests/merchant-resume-lifecycle.test.mjs backend/tests/frontend-navigation*.test.mjs backend/tests/build-navigation-isolation.test.mjs backend/tests/phone-preview-safety.test.mjs backend/tests/merchant-entry-contract.test.mjs backend/tests/merchant-customer-support-handoff.test.mjs
npx tsc --noEmit
npm run check:boundaries
npm run check:build-output
node --check backend/src/support.mjs
node --check backend/tests/interaction-cloud-sync.test.mjs
git diff --check
```

实际最终结果：联合 **246通过、0失败、0跳过**。其中新增 interaction 48项、support handler新增1项；包含既有回归的联合数量不与历史轮次简单累加。三目标实际纯编译、TypeScript、依赖边界、构建产物检查、3份相关MJS语法检查及git diff --check通过。初次空白检查发现auth.ts多余EOF空行，已仅修复空白后复查通过。

## 本轮文件清单

源码（既有未提交修复继续保留）：

- miniprogram/pages/index/index.ts
- miniprogram/pages/admin/admin.ts
- miniprogram/pages/profile/profile.ts
- miniprogram/modules/shared/runtime/auth.ts
- miniprogram/pages/admin-categories/admin-categories.ts
- miniprogram/pages/admin-categories/admin-categories.wxml
- miniprogram/pages/admin-categories/admin-categories.wxss
- miniprogram/utils/merchantCategoriesCloud.ts
- miniprogram/modules/features/chat/controller.ts
- miniprogram/modules/features/chat/view.wxml
- miniprogram/modules/shared/domain/chat.ts
- miniprogram/modules/merchant/controllers/chat.ts
- backend/src/support.mjs
- miniprogram/pages/admin-products/admin-products.ts
- miniprogram/pages/support-inbox/support-inbox.ts
- miniprogram/pages/admin-note-tags/admin-note-tags.ts

测试：

- backend/tests/interaction-cloud-sync.test.mjs（新增）
- backend/tests/merchant-customer-support-handoff.test.mjs
- backend/tests/build-navigation-isolation.test.mjs（自动导航预期按新需求调整，其他鉴权/隔离断言保留）
- backend/tests/merchant-entry-contract.test.mjs（同上）
- backend/tests/merchant-resume-lifecycle.test.mjs（接入新增权限查询函数的合成依赖，原断言保留）

文档：本文件（新增）、TEST_STATUS.md、TEST_HISTORY.md。

本轮没有修改原先已改的 scripts/phone-preview-profile.mjs、.local配置、admin-orders.ts、store-hours.ts；它们的已有未提交状态仍保留。没有直接编辑dist产物，只有正常纯编译生成对应目标。

## 性能测量口径

以下为一次离线自动化执行的观测，不设机器速度阈值；重跑测试会输出当前数值。测试的关键断言是网络 Promise 尚未完成时 UI 状态已经更新，非凭固定延迟判定成功。这里测量的是 JS setData 调用完成，不是屏幕像素呈现。

| 项目 | 合成环境单次观测 | 未验证部分 |
|---|---|---|
| 发消息到本地状态更新 | 0.485ms | 微信渲染帧及真实服务器确认耗时 |
| 新增分类到 pending | 0.194ms | 真机渲染及保存 RTT |
| 改分类名称到 pending | 0.102ms | 真机渲染及保存 RTT |
| 删除确认后到 pending | 0.099ms | 真机渲染及保存 RTT |
| 已授权页面恢复同步状态 | 0.319ms | 真机进程调度与首帧 |
| 200 个触摸事件/合成 200ms | 13 次局部位置 patch | 手机 FPS、触摸延迟、长列表表现 |
| 10 个同上下文并发权限检查 | 1 个真实 wx.request mock；15s 内重用结果 | 整个页面的其他数据请求仍独立存在 |
| 分类写入成功 | 1 个写请求；0 个后续强制 GET | 其他设备同时修改后的实际冲突体验 |

不要把这些数字描述成真机达到 60FPS 或 Render 冷启动通过。冷启动/超时仅通过可控未完成 Promise 与明确失败响应验证状态保留。

## 构建、预览与外部依赖

Combined/Customer/Merchant 在联合测试中实际编译并检查页面归属和产物，TypeScript/边界/语法/空白检查分别执行。

本轮尝试 `npm run preview:phone -- --prepare ".local/phone-staging.json"`，仍在 build-miniapp.mjs 替换 dist/phone-preview 时 EPERM；没有强删、改权限或手动修补 dist。现有环境无 handle.exe，未能确定持锁 PID，不能断言一定是微信工具锁定。关闭该项目/相关终端或解除系统占用后重新运行；成功前不要把旧包当本轮预览。

Staging 尚未部署本轮 support API 的 clientKey 返回字段。旧服务器可完成发送响应后的 ID 合并和同 key 重试；响应丢失时，要靠下一次显式重试确认。只有服务端带 clientKey，轮询才可以精确消除对应本地未确认行。必须另行授权部署后才可验收此场景，无需迁移。

## 真机验收（人工）

1. 成功重建 phone-preview 后，在开发者工具重新编译预览，普通顾客和 owner 分别用真实身份验证。未授权账号不能进入管理，清除/替换会话、切换店铺后不出现旧私有数据。
2. owner 进入工作台后切顾客首页、个人中心、商家入口反复十次；首页始终停留顾客页。工作台滚动、输入起送金额但不保存，后台返回不变。
3. 客服发送真实测试消息，记录发送按钮点击、本地“发送中”首帧、服务端确认三个时间点；暂断网后重试同一消息，不能重复；切账号/会话检查隔离。上线本轮后端后验证“服务端成功但响应丢失、轮询确认”分支。
4. 新增/改名/删除真实测试分类；观察 pending→confirmed，慢网内容不闪白。删除仍有商品的分类应失败恢复。两设备编辑制造409，不能覆盖另一设备结果，必须刷新核对。
5. 编辑分类输入期间拖动，输入不消失；记录性能面板/真机调试的 setData 次数、触摸与屏幕呈现时间，不用模拟器结果代替手机结论。松手只产生一个排序写请求。
6. 再次进入分类页立即有已确认列表；断网显示错误而不是清空。记录机型、系统/微信版本、类别数量、网络、API 请求数、本地反馈与最终确认的分段耗时。

尚未真实执行上述手机、网络故障注入、跨设备冲突、Render 冷启动或服务器权限撤销验收；既有真实 PG/支付/交付阻断不因本轮离线通过而解除。
