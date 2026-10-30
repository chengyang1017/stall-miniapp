# 购物车、首页、配送时段与地址交互修复（2026-10-28）

基于本地 HEAD `539f108389385e8605593a8e6de3c9a06e246186` 的实际源码；开始时工作区干净，已有上一轮修复在此基础上保留。本轮只做源码、合成网络动态测试和编译，不连接 Staging/Neon，不操作 Render、数据库、Docker、支付或部署；没有 Git 提交推送。

## 根因与实现

### 购物车

原 refreshCloud 每次清空 items、数量及金额；increase/decrease 等待商品库存校验后又刷新整页，快速点击产生重叠读取。

真实架构必须准确描述：cloudCart 是按 API/身份/店铺隔离的**设备购物车状态**，云端商品接口提供真实商品价格、上下架和库存；没有服务端购物车数量写入接口。本轮没有新增模拟商品或伪造购物车 API。

- 同上下文刷新保留完整列表；只有身份/API/店铺变更或明确401/403才清除旧展示，持久购物车不因读取失败被删除。
- 点击数量按钮立即局部 setData 更新该行数量，不先清空列表。已有 productId key 保留。
- 将连续数量意图串行合并，当前校验结束后检查最新目标数量；避免并行请求按返回顺序累加错误。0～99边界、已知有限库存及服务端商品快照继续检查。减至0是用户明确移除该商品，其余商品保留。
- 数量待确认时总金额和变化行小计显示 `--`，单价标为上次读取，禁用结算。新的有效价格只采用真实商品响应，不从旧促销价格猜测最终应付额。当前显示仍仅商品合计，订单金额、价格和库存由结算/下单服务器最终验证。
- 失败按实际已写入设备购物车的数量恢复，不覆盖其他行；商品读取失败明确标记过期/未确认。页面请求序号、意图版本、商品读取序号和身份共同隔离旧响应；旧失败（包括旧403）也不能清空更新请求刚确认的界面。
- 同进程切后台保留页面和待处理任务；页面被销毁时停止其UI更新。未通过校验的数量意图不承诺跨进程持久化，只保留实际已校验的设备数量。

合成测试中，十次同步快速加号合并为两次商品库存校验、一次最终商品读取（不含首次页面加载），数量立即可见。真实点击节奏和网络不同，请求数可能不同，不宣称固定节省比例。

### 首页

原 onShow 每次显示入口读取状态；CLOUD_ONLY 下 resolveStoreEntry 每次重新制造同一待解析入口；loadCloudHome 开始和失败都会清空产品、分类、营业及配送展示。

- 已成功解析的同一入口在当前进程复用；重复 app query 不再造成额外入口 HTTP 等待。显式新目标仍须真实解析，解析中的身份/上下文变化拒绝旧结果。
- 同身份、店铺返回时先保留产品/分类/营业/配送，后台重新读取。暂时失败显示上次内容及同步失败提示，不闪白；新身份/API/店铺立即清空旧数据。
- 明确HTTP权限拒绝与网络错误分开；公共商品及营业传输保留HTTP状态，不能把所有错误折叠成一个无类型异常。
- 继续保留“首页不按商家历史偏好自动跳转”的上一轮修复。

### 配送时段

真正的页面为 `pages/delivery/`，不是营业时间页面。现有 `PUT /v1/merchant/stores/:slug/delivery-rules` 接收完整配送配置与 expectedRevision，服务器沿用身份、店铺、数据结构、区域关联及版本冲突校验。

- 新增、编辑均使用微信原生 time picker（共4个）。新时段名称、开始/结束完整且 start < end 才进入配置并触发自动保存；完整配置仍通过原校验（星期、重叠、区域、特殊日期等）。不完整/非法内容保留为未保存，不伪造成功。
- 同一会话/API/店铺的 deliveryEditor 管理最新草稿、已确认快照、版本、写入任务和未完成输入。写入串行；快改时旧成功只推进版本，不能覆盖新输入，随后提交最新有效草稿。
- 时段改变触发当前已加入配置的合法配送草稿保存；API是完整配送配置写入，**不是只PATCH某个时段**。未添加的新区域/时段输入不在提交配置中。营业时间、公告、起送金额仍不在本接口提交字段里。其他配送设置仍可点“保存全部”。
- 未保存/保存中/已保存/失败待重试分别显示。页面离开后不重复发送任务，回到页面恢复草稿并核对服务器。HTTP超时保持“未确认”，仅在服务器快照与原待确认快照精确等价时才认定保存成功；其他版本冲突保留草稿并阻止盲目覆盖。
- 草稿仅在**当前进程内**保存，退出身份清除、不跨店铺复用。使用可用的离页提醒并提供可见提示；微信杀进程后不承诺恢复尚未确认的草稿。

### 地址

实际编辑表单在 `pages/addresses/addresses.ts` 内，没有单独 address-edit 页面。

旧调用链（代码可证）：writeCloudAddress 写入 → helper 再 GET地址 → 页面 refresh 再 GET地址+GET配送。一次保存共 **1写+3读**，UI成功提示还要等待这些读取。

新调用链：本地必填/大陆手机号等校验 → **1写** → 服务器ok立即显示成功、释放表单 → **后台1次GET地址**。不重复读取配送、不自动跳转。地址使用/编辑/默认/删除在该次列表确认前禁用，防止误用旧地址版本。若写入已确认而后台读取失败，明确显示“已保存、列表同步失败”，不会谎报写入失败或自动重发。

写入失败保留全部输入和创建 clientKey；相同内容重试仍复用原编号。更新/默认/删除保留 expectedVersion；身份变化、销毁及过期回调不修改新页面。服务端仍检查顾客归属、区域配置、坐标格式、版本和创建幂等。页面本地校验不替代服务端规则，地址可保存也不等于当前可配送，结算/订单继续最终校验。

## 延迟证据与测量边界

已确认的前端问题是多余网络依赖及等待顺序；不能仅凭源码认定几秒延迟发生在 Neon。

页面 data.addressTiming 记录：

- validationMs：本地字段处理到请求发起前。
- writeMs：写请求开始到服务器确认/失败，包含网络、Render排队/冷启动、后端和DB，**不是纯DB耗时**。
- listMs：唯一后台地址GET耗时，不再阻塞已确认保存。

动态测试使用可控时钟把写响应设为2400ms、列表响应设为200ms，验证这两个阶段正确分离，按钮即时进入保存中，写确认后表单已可用，不等待列表。此数字是测试输入，不是真实Staging延迟。

真机需在新预览包中重复同一合法测试地址保存，记录机型/网络、addressTiming和开发者工具Network各请求的开始、结束。要再拆分后端/数据库耗时，仍需经授权的后端观测或Server-Timing/数据库指标；本轮未访问服务器日志、未发送真实地址写请求，不虚构各层耗时。

## 测试和构建

新增 `backend/tests/frontend-interaction-state.test.mjs`：41项动态回归，执行实际页面函数、购物车/地址辅助函数、配送自动保存状态机与真实纯验证函数；只模拟网络、微信I/O、时钟，不复制业务算法。覆盖快速十连点、慢响应、乱序/旧错误、库存/数量/促销、首页保留、自动保存失败/快改/离开恢复/冲突、地址反馈与失败重试、401/403、身份和店铺隔离。

旧测试工具两处修正（不削弱断言）：

- frontend-navigation-guards.test.mjs 的真实checkout函数增加TypeScript回调标注后，VM工具需要先去类型，并给fixture补齐真实items/quantityPending状态。
- delivery-rules.test.mjs 原模拟DB对 clock_timestamp 查询也返回configuration，既有4项因此报错；补真实SQL形状的固定数据库时钟、确定性日期及未知SQL拒绝，原9项语义断言保留，另断言确实读取数据库时钟。没有修改后端配送规则。

联合命令：

```powershell
node --test backend/tests/frontend-interaction-state.test.mjs backend/tests/frontend-navigation*.test.mjs backend/tests/build-navigation-isolation.test.mjs backend/tests/phone-preview-safety.test.mjs backend/tests/merchant-entry-contract.test.mjs backend/tests/merchant-resume-lifecycle.test.mjs backend/tests/interaction-cloud-sync.test.mjs backend/tests/merchant-customer-support-handoff.test.mjs backend/tests/delivery-rules.test.mjs
npx tsc --noEmit
npm run check:boundaries
npm run check:build-output
node --check backend/tests/frontend-interaction-state.test.mjs
node --check backend/tests/frontend-navigation-guards.test.mjs
node --check backend/tests/delivery-rules.test.mjs
git diff --check
```

实际最终联合：**296通过、0失败、0跳过**。新增文件41项通过，既有配送规则9项通过。TypeScript、依赖边界、三目标实际纯编译及产物检查、3份测试MJS语法检查、git diff --check通过。Combined 127模块、Customer 73模块、Merchant 86模块；新增配送编辑状态机仅进入商家相关目标。不是微信真机编译或真实数据库集成测试。

## 文件及启用

修改：

- miniprogram/pages/cart/cart.ts、cart.wxml；miniprogram/utils/cloudCart.ts
- miniprogram/pages/index/index.ts；miniprogram/utils/storeEntry.ts
- miniprogram/modules/shared/api/catalog.ts、business.ts（保留HTTP错误类型）
- miniprogram/pages/delivery/delivery.ts、delivery.wxml；miniprogram/modules/merchant/api/delivery.ts
- miniprogram/modules/merchant/controllers/deliveryEditor.ts（新增）
- miniprogram/pages/addresses/addresses.ts、addresses.wxml；miniprogram/modules/customer/api/addresses.ts
- backend/tests/frontend-interaction-state.test.mjs（新增）；frontend-navigation-guards.test.mjs；delivery-rules.test.mjs
- 本文及TEST_STATUS.md、TEST_HISTORY.md

本轮不需要修改Node后端、数据库或接口路径，不需要迁移。没有调整正式AppID、Render/Neon、.local/phone-staging.json。

已尝试正常重建：

```powershell
npm run preview:phone -- --prepare ".local\phone-staging.json"
```

仍在替换dist/phone-preview目录时报Windows EPERM；没有强删、重命名、改ACL或手动编辑产物。不能证明具体哪个进程占用。请先关闭开发者工具中的该项目及占用该目录的终端，解除占用后再执行原构建命令，成功后重新编译、扫码。此前旧包不代表本轮代码。

真机人工验收：十连点加号及快速加减并观察其他商品；切回首页及断网返回；新增时段用picker、非法时间不写入、快改后离开/返回；两个设备制造409；真实身份保存地址观察“保存中→服务器确认→列表同步”，断网重试同内容；切换账号/店铺确认旧展示清除。实际手机帧率、Staging RTT、Render冷启动、跨设备冲突和Neon时延均未由本轮离线测试验收。
