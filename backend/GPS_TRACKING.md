# GPS 配送追踪（Phase31，源码交付）

GPS 已由原需求 11.01 的可选功能转入 Phase31 的明确开发范围。本阶段实现前台、单人单个共享任务；没有开发独立配送员小程序、后台定位、多单行程、轨迹下载、路线规划或自动 ETA。所有“完成”只指源码；未运行服务器、数据库迁移、设备定位或功能/集成测试。

## 1. 使用入口与权限

- 商家订单管理的配送中订单增加“配送指派 / 位置共享”，进入 Merchant 专属 merchant-tracking 页面。
- owner/manager 从本店已有成员中明确指派配送人员，可选本人；只有指派本身赋予这一订单的定位权限，普通商家成员没有默认上传权。
- 成员列表使用服务器根据店铺与既有身份计算的稳定编号，不返回微信 OpenID。staff 仅能读取自己的编号，可告知管理员；owner/manager 可查看本店成员编号及角色。当前成员表无姓名资料，因此没有伪造姓名或新增人事系统。
- 指派带 expectedVersion，旧版本返回409；重复指派同一人不重置共享。更换配送人员结束旧会话、清除坐标。所有任务绑定店铺、订单和认证 subject。
- 被指派者须在自己的设备点击开始、确认用途并主动授予 scope.userLocation，随后才启动 GPS。登录、工作台、接单和进入页面都不会自动采集定位。
- 暂停/恢复/上传要求同一 subject 和会话设备控制键。控制键仅存在 Merchant 内存，不是商家授权凭证；后端仍验证身份/店铺/指派。新的设备必须由同一身份显式结束旧会话才能重新开始，不静默抢占。
- 同一被指派身份可主动结束自己的旧设备会话，但不能控制其他成员的会话。owner/manager 若未被指派，只管理指派，不取得配送员精确坐标。
- 顾客订单详情在配送中显示“查看配送位置”，进入 Customer 专属 customer-tracking。后端按本人的 customer_subject 校验，不能凭订单 UUID 读取其他顾客位置。

## 2. 最小数据模型与迁移

新增 backend/sql/019_delivery_tracking.sql，顺序为001—018后再019；009提供 orders(store_id,id) 唯一键。没有修改既有迁移，没有执行迁移。

- delivery_tracking_tasks：order_id、store_id、courier_subject、assigned_by、assigned_at、version。每单一份明确指派，更新带版本保护。
- delivery_tracking_sessions：随机 UUID、订单/店铺/配送身份、control_hash、active/paused/ended、started_at/paused_at/ended_at/last_location_at，最后一个经纬度、GCJ-02、精度、sampled_at及递增seq。
- 不建立位置历史表；每次覆盖最后一个点。部分唯一索引分别保证每个订单、每个配送 subject 同时最多一个未结束会话，适用于多个设备并发请求。
- 所有状态写入先锁订单，再读写会话。订单状态改变的数据库触发器在同一事务内结束会话并清空坐标，覆盖现有送达、取消、异常等入口。定位不能改变履约、收款或送达证明。
- 服务端UTC timestamptz存储；客户端按北京时间显示。过期与校验使用数据库时钟，不信任设备声称的当前时间。

migrate-dev.mjs 与 preflight.mjs 的顺序提示/数量限制已从018更新至019，仅修改源码，未执行这两个脚本。原迁移账本与SQL执行的中断风险没有在本阶段改造。

## 3. API

| 方法 | 路径 | 权限/用途 |
| --- | --- | --- |
| GET | /v1/merchant/stores/:slug/tracking/couriers | 管理人员查本店可指派成员；staff只查本人编号 |
| GET | /v1/merchant/stores/:slug/orders/:id/tracking | 被指派者查本人会话；管理人员查指派/状态，不返回他人精确位置 |
| POST | 同上 /assign | owner/manager，本店成员，courierId + expectedVersion |
| POST | 同上 /start | 被指派本人，controlKey；同键重复请求复用会话 |
| POST | 同上 /location | 被指派本人，sessionId/controlKey/seq/GCJ-02点/accuracy/sampledAt |
| POST | 同上 /pause | 本人及当前设备控制键，清空最后坐标 |
| POST | 同上 /resume | 本人及当前设备控制键；不在服务端启动任何设备 GPS |
| POST | 同上 /stop | 本人和明确sessionId，幂等结束，清空坐标 |
| GET | /v1/stores/:slug/orders/:id/tracking | 仅订单所属顾客，返回本单有效位置/目的地/ETA；无其他订单或配送员标识列表 |

server.mjs 已注册 deliveryTrackingRoute。写入体最大2048字节，未知字段和查询参数拒绝，所有SQL参数化。401未登录，403无权限/设备控制键错误，404订单不存在或不属于顾客，409状态/指派版本/会话/序号冲突，429频率限制；基础设施不可用由既有503处理。普通日志不输出消息体、坐标或控制键。

## 4. 定位、节流与断网

Merchant 的 trackingDevice.ts 为整个应用维护单个 GPS 监听器，使用 startLocationUpdate(type=gcj02)、onLocationChange、offLocationChange、stopLocationUpdate。设备位置/控制键不写Storage。前台页面隐藏、卸载、账号失效或任务结束时解除监听并停止设备定位，同时尝试通知服务端暂停。

- 客户端事件间至少7秒；移动至少20米才上传，或距离上次成功同步达30秒且有新的定位事件时上传。定时读取授权时可重试内存里仍新鲜的事件，没有新事件时不伪造采样点。
- 同时最多一个上传请求。短暂断网保留内存里的最近事件，超过60秒的事件不重发；恢复后新事件/尚新鲜事件可继续提交。服务端序号冲突后读取水位；不把未知网络结果当作成功。
- 服务端每会话上传至少间隔5秒；精度须为(0,200]米，坐标须有限且在合法范围内，拒绝(0,0)哨兵。设备事件时间允许最多过去60秒、未来15秒，seq必须递增且不超过2147483647，采样时间也必须递增。重复/乱序返回409。
- 新会话最短间隔10秒，每个配送身份滚动24小时内最多200次新会话；重新指派最短2秒。活动会话最多8小时，到期不能继续上传或读取位置，须显式结束后新建。
- Merchant每7秒读取任务权限；设备运行期间超过45秒不能确认服务端授权则停止GPS，恢复网络后必须主动再开始。不能在断网时保证即时得知远端订单终止，已采用此失效关闭窗口。
- Customer每7秒读取一次；隐藏/卸载停止轮询。请求不重叠，序号/身份保护旧响应；网络失败保留已显示点及最后时间并显示错误，达到服务端120秒有效期时移除点。客户端以请求起始时刻保守计算剩余有效期，避免网络传输把旧点续期。

sampled_at 是设备收到微信定位事件的时间。微信回调不提供可核验的原始卫星采样时间，设备时钟可能不准确；后端的 receivedAt 才是有效期基准。认证只确认谁有权上传，不能证明未伪造GPS。

## 5. 地图与数据最小化

原生 map 展示获授权的配送位置和本单合法目的地。目的地只来自本单 contact_snapshot 的坐标；现有 chooseLocation 选点约定为GCJ-02，不从当前地址簿覆盖订单快照，不推测没有坐标的旧地址。两个标记复用已有共享图标，支持缩放到当前区域。

Customer没有 startLocationUpdate/onLocationChange 或商家上传API。地图 show-location=false，查看不要求配送员持续定位权限。ETA沿用订单 estimated_arrival 原文，不按直线距离估算。无位置显示不可用/等待/暂停/失联/已结束；没有虚构路线。

## 6. 隐私、期限与清理

- 暂停、结束、重新指派和订单离开配送中均清空坐标；顾客不因数据库留有元数据继续获得位置。
- 仅共享最近120秒内的点，过期位置不返回；顾客不能下载配送员轨迹。普通客服、公开店铺API和经营归档不包含定位数据。
- 最后坐标的物理保留上限策略为24小时；结束会话元数据7天。终态订单的指派绑定也在7天后清理；仍在配送中的指派是业务授权记录，不等同位置历史。
- 服务端 startTrackingRetention 每60秒执行保留清理、结束过期/失去成员权限的会话；每次删除最多1000行元数据。它仅在后端实际启动后工作。本阶段未启动后端，因此没有实际清理数据。
- 物理清除依赖清理任务及数据库可用，不能承诺停机或大批积压时精确到秒擦除；API读取会独立拒绝超期点。系统级数据库备份的保留应另由管理员落实，不把商家JSON归档当作位置恢复或脱敏策略。

当前 customer-settings 和 Merchant 共享页面已增加定位用途/期限说明；运营方仍须将真实主体、联系方式、定位用途及保留规则填入微信隐私保护指引，页面说明不能代替平台备案。

## 7. 微信平台依赖与参考

已查阅腾讯位置服务官方维护的接口说明：[前台持续定位](https://github.com/TencentLBS/tencentmap-miniprogram-skill/blob/main/references/wx_location_api/wx.startLocationUpdate.md)、[位置事件](https://github.com/TencentLBS/tencentmap-miniprogram-skill/blob/main/references/wx_location_api/wx.onLocationChange.md)、[后台定位](https://github.com/TencentLBS/tencentmap-miniprogram-skill/blob/main/references/wx_location_api/wx.startLocationUpdateBackground.md)。微信开发文档域名在本次读取环境无法打开，未据此声称平台已经批准接口。

Combined/Merchant 声明 startLocationUpdate、onLocationChange 与 scope.userLocation 用途。Customer构建移除持续定位声明，仅保留已有地址选点声明与用途。三个目标均不声明 requiredBackgroundModes:location 或后台定位接口，不调用 startLocationUpdateBackground。

正式启用前需要在对应AppID的小程序后台确认主体类目、定位接口准入及隐私指引，并获得实际设备使用者授权；前台持续定位要求支持该接口的微信/基础库。实际类目和权限以微信后台审核为准，不承诺某个商店自动获准。当前只实现前台模式，后台模式并未实现；今后如单独适配还须平台开通、明确 scope.userLocationBackground 授权、独立目标配置和说明，不能只把函数名换成Background。

## 8. 三目标与源码检查结果

Combined仍是默认入口，本阶段追加两页，未更换根project.config.json。Customer新增只读tracking控制器/API；Merchant新增定位控制器/API/设备单例；Shared只含类型/状态/纯校验与距离函数。依赖检查和产物检查继续强制角色边界，并额外拒绝Customer产物含GPS采集调用及任何默认后台定位声明。

三个目标均已实际完成TypeScript→CommonJS编译及产物静态检查：Combined34页、Customer12页、Merchant18页。未执行微信平台WXML/WXSS编译、真机定位、数据库SQL验证、权限业务验证或网络恢复验证，不等同功能验收通过。支付、库存、订单原状态机未改动。

Phase30尚未启用的多AppID后端认证及历史身份关联仍是独立发布依赖；本次没有自动关联两个AppID的用户。

## 9. 文件清单

新增：

- backend/sql/019_delivery_tracking.sql
- backend/src/deliveryTracking.mjs
- miniprogram/modules/shared/domain/tracking.ts
- miniprogram/modules/customer/api/tracking.ts
- miniprogram/modules/customer/controllers/tracking.ts
- miniprogram/modules/merchant/api/tracking.ts
- miniprogram/modules/merchant/controllers/tracking.ts
- miniprogram/modules/merchant/controllers/trackingDevice.ts
- miniprogram/pages/customer-tracking/customer-tracking.ts、.json、.wxml、.wxss
- miniprogram/pages/merchant-tracking/merchant-tracking.ts、.json、.wxml、.wxss
- backend/GPS_TRACKING.md

修改：

- backend/src/server.mjs：路由及保留任务生命周期。
- backend/scripts/migrate-dev.mjs、preflight.mjs：019数量提示，未运行。
- miniprogram/app.json：新增页面和定位用途声明。
- miniprogram/pages/admin-orders/admin-orders.wxml、order-detail/order-detail.wxml：各端入口。
- miniprogram/pages/customer-settings/customer-settings.wxml：用途与期限说明。
- apps/build-targets.json、apps/customer/app.plan.json、apps/merchant/app.plan.json：归属与目标页清单。
- scripts/build-miniapp.mjs、miniapp-output.mjs：分目标权限声明与GPS边界检查。
- backend/APP_SEPARATION_READINESS.md、FEATURE_INTEGRATION_STATUS.md、REQUIREMENTS_AUDIT.md：阶段架构与功能审计。
- apps/BUILDING.md：新增定位相关的目标配置说明。

## 10. 后续实际验证步骤（本阶段未执行）

在另行授权的非生产集成阶段：核验001—018结构与账本，应用019 → 配置允许的AppID/HTTPS域名/微信定位接口及隐私规则 → 启动后端（会启动既有库存任务及新增保留清理） → owner/manager在配送中订单指派已登录成员 → 成员核对编号并主动授权开始 → 本订单顾客看地图/ETA → 验证暂停、退出页面、断网、重新指派、订单终止与保留清理。不得用假支付状态或模拟坐标声称真实追踪已验收。

下一步需要的是上述平台、数据库和设备验证；多单行程仍须独立的行程/任务集合授权设计，本阶段没有自动进入Phase32。
