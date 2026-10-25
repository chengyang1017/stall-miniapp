# Phase32 当前增量

| 功能 | 本机模式 | 云端源码 | 依赖/实际验证 |
| --- | --- | --- | --- |
| 已购评价与幂等 | 不伪造交易/评论 | 明细绑定、唯一约束、请求指纹、1—5星、正文、修订撤回 | 020；客户可信支付核验尚未接入，实际发表不可用 |
| 商品公开评分/分页 | 无虚构评分 | 公开修订平均分/分布、评分筛选、游标分页 | 020；微信及数据库未验证 |
| 私有评价图 | 不自动上传 | 独立私有桶、签名长度/类型、文件头、封存、授权读取、孤立候选/受控清理 | 私有桶/域名待配置；未操作R2 |
| 商家回复与举报 | 无模拟回复 | 店铺owner/manager管理，回复待审，举报不改变评分 | 020；未运行验证 |
| 平台审核 | 不向普通商家开放 | 独立角色、人审、修订历史、举报处理、追加审计 | 审核角色待配置；微信自动扫描仅预留接口 |
| 三目标与GPS | 保留现有演示 | Combined36 / Customer13 / Merchant19，隔离和GPS声明规则保留 | TypeScript纯编译成功；平台/真机未执行 |

详情与源文件见 [PRODUCT_REVIEWS.md](PRODUCT_REVIEWS.md)。以下历史阶段结论保留，不将旧可选评价状态当作当前源码状态。

---

# Phase31 增量状态（当前）

GPS 配送追踪由原可选功能转入 Phase31 范围，源码已实现，未实际运行验证。

| 功能 | 本机模式 | 云端源码/API | 迁移依赖 | 剩余限制 |
| --- | --- | --- | --- | --- |
| 明确配送指派 | 不伪造任务/身份 | 本店 owner/manager 指派成员，expectedVersion；成员自查编号 | 001—019 | 无人员姓名资料管理或独立骑手应用 |
| Merchant 前台 GPS | 不采集真实定位、不模拟上传 | 本人主动授权，单GPS监听、节流、暂停/恢复/停止、会话/身份验证 | 019 | 平台准入/隐私配置与真机待验证；后台未实现 |
| Customer 配送地图 | 明确没有真实配送位置 | 认证顾客仅查本单最新有效点/目的地/ETA；7秒读取 | 019 | 无路线、自动ETA或历史轨迹 |
| 隐私生命周期 | 不迁移演示数据 | 120秒读取期限；终态触发器撤权清点；保留清理源码 | 019 | 清理任务需运行后端；物理清除依赖数据库可用 |
| 三目标隔离 | 保留既有演示体验 | Shared纯类型/规则、Merchant采集、Customer只读；三目标编译成功 | 无构建迁移依赖 | 微信平台编译及多AppID认证仍待后续 |

详见 [GPS_TRACKING.md](GPS_TRACKING.md) 的接口和源码证据。本阶段未执行迁移、后端、设备定位、测试或部署，未更改支付模块。以下原阶段盘点保留为历史，不将旧文的GPS空缺当作当前源码结论。

---

> 历史阶段文档：正文保留原审查时点。Phase29当前最新迁移为018；模块路径/独立构建与双AppID边界以 [APP_SEPARATION_READINESS.md](C:/Users/USER/WeChatProjects/miniprogram-1/backend/APP_SEPARATION_READINESS.md) 为准。未执行迁移或环境验证。

# 全项目功能整合状态（Phase 26 盘点 / Phase 27 更新）

## 核对范围与状态口径

依据当前本地源码盘点：app.json全部已注册页面、额外未注册logs页、各页面实际事件/数据来源、utils全部TS模块、backend/src路由及服务模块、SQL001—015、Phase26新增016及Phase27新增017。不读取远程main覆盖本地。项目中原已存在的bak/旧副本不作为运行源码，也没有删除或生成备份。

**全文“已实现”均仅指源码已实现。** 本阶段只运行TypeScript无输出类型检查和Node.js语法检查；未运行测试、服务器、微信模拟器/真机、数据库查询/迁移、R2操作、清理、备份、恢复或部署。实际数据库迁移状态未查询，不能从SQL文件存在推断已生效。

状态分类：**源码已实现**＝前后端链路具备；**仅部分实现**＝可运行的源码范围有明确上限/依赖/缺口；**仍为本机演示**＝没有云端业务实现；**尚未开发**＝不存在对应业务；以上全部仍为**尚未运行验证**。

## Phase26实际补齐的链路

1. 顾客地址簿：从设备共享地址改为服务器按认证subject与店铺隔离，增/改/删/设默认、版本保护、创建幂等、上限50条；结算重新读取自己的地址，设备只保留当前会话内临时选择。
2. 备注快捷标签：复用business-settings的noteTags字段，添加、编辑、删除、数组顺序调整、跨设备读取；与营业、配送、公告、起送金额共用MD5配置版本，PATCH只修改指定字段。结算使用云端返回标签，备注仍自由填写并进入原订单快照。
3. 商品缺图设置：同一JSONB保存placeholderStyle、placeholderImageKey，公开接口返回服务器构造的图片URL。自定义图片复用Phase25签名上传和完成校验，由016触发器追加永久引用；不改变商品真实图片字段，不上传旧本机路径。
4. 独立分类页接入已有分类API，并扩展版本控制和排序。所有分类写入通过相同店铺锁序列化；当前分类页使用revision防止过期操作。保留原拖动界面、本地演示分支及旧客户端可不传revision的兼容能力。
5. 修复真实路由冲突：checkoutRoute原先把GET `/v1/stores/:slug/orders` 提前返回405，导致后面的顾客订单读取路由不可达；现在只接管POST，GET交由原orderWorkflowRoute。
6. 首页、详情、购物车统一使用服务端effectivePriceCents和分类信息；按ID读取详情/购物车商品不会受首页前200件窗口影响。云端详情原“结算开发中”入口改为明确的“加入并去结算”，包含当前购物车商品，不假称是单商品独立结算。
7. 云端购物车、结算草稿和待确认下单缓存按API、店铺及服务器登录返回的稳定非凭证cacheScope隔离；同一身份重新登录可继续使用原幂等编号，正常切换身份不会读取别人的草稿/待确认请求。没有把本机购物车或旧未归属地址自动导入云端。
8. authorizedGet/Mutation丢弃身份或店铺切换后的旧响应；营业/配送/账单/分析上下文包括会话，商品表单换身份后清空并要求重新进入；顾客订单增加请求序号、隐藏清理和明确错误状态。诊断页面返回时清空旧经营数据。退出复用已有服务端logout，撤销失败时仅声称本机退出。
9. 清理明确无用的admin-placeholders旧商品/分类CRUD副本（WXML并未绑定这些方法），保留并改造实际样式事件。复用缺图图案样式到详情页，移除app.ts仅打印微信code的模板登录；真正认证仍只走原authApi。启动购物车角标按当前模式计算。

## 页面与功能状态清单

表中迁移号指累计依赖中的关键部分，均需操作者核实是否已应用；没有声称真实环境可用。

| 页面/功能 | 面向 | 本机实现 | 云端源码/接口 | 迁移依赖 | 状态及真实缺口 |
|---|---|---|---|---|---|
| index 首页商品与分类/折扣 | 顾客 | stall_demo_v1分类、商品、优惠及设备购物车 | 公开products＋business-settings＋delivery-rules，使用有效折扣价与分类顺序 | 001、004、006、008、009、016新配置保护 | 源码已实现（Phase27）：每页30件游标、服务端分类/搜索、加载更多/下拉刷新；折扣专区为当前已加载有效优惠，网络失败不读演示商品；索引依赖017 |
| product-detail 详情与购买入口 | 顾客 | 本机详情、加购、单商品立即购买 | products?ids=单ID、库存核对、有效折扣；加入统一购物车后进入checkout | 001、006、008、009，缺图依赖016 | 源码已实现；云端按钮明确为加入并去结算，未增加独立单品下单体系 |
| cart 购物车 | 顾客 | 原设备购物车 | 临时数量在设备，价格/状态/库存/门槛/配送来自服务器；最多40种，与订单上限一致 | 001、004、006、008、009；缺图016 | 源码已实现；不是跨设备购物车同步；无效商品保留设备行，未另做完整失效商品管理UI |
| checkout 结算与订单创建 | 顾客 | 演示订单、设备地址、演示配送、备注 | POST orders，原事务锁库存及幂等、起送/营业/配送最终校验；读取自己的云端地址与店铺标签 | 001—009、011、015、016 | 源码已实现待支付下单；无真实支付。备注草稿/重试凭据属于隔离的设备临时状态 |
| addresses 常用地址 | 顾客 | 原设备地址增改删及默认 | GET/POST/PATCH/DELETE /stores/:slug/addresses；仅本人当前店铺，上限50，跨设备默认与版本校验 | 016（区域来自004） | 源码已实现；地址按顾客身份+店铺分簿，不自动复用其他店铺区域；旧设备地址不自动上传 |
| orders 我的订单 | 顾客 | 演示订单与本机筛选 | 原GET orders已修复可达性，授权subject筛选；切换身份清空结果 | 001—009 | 源码已实现（Phase27）：每页20笔本人游标分页、服务端状态标签筛选、完整本人分类数量、续页/下拉刷新；索引依赖017 |
| order-detail 订单详情/配送进度 | 顾客 | 原本机快照 | GET orders/:id，只允许所属顾客；独立短时凭证读取 | 001—009、015 | 源码已实现；价/姓名/地址/备注是历史快照；凭证依赖私有存储确认 |
| profile 个人中心 | 顾客 | 本机导航 | 地址、订单、客服入口；当前身份客服未读 | 013、016 | 源码已实现导航与未读，无额外用户画像系统 |
| customer-settings 通知偏好 | 顾客 | 设备开关 | 无云端订阅或推送API；已纠正“全系统仅本地”的旧文案 | 无 | 仍为本机偏好；微信订阅通知尚未开发，不把开关当通知已启用 |
| admin 工作台 | 商家 | 演示待接单、起送金额 | orders/summary真实店铺统计、business-settings、support/unread，显示时刷新 | 001—009、013 | 源码已实现；失败显示未知/错误，不拿演示订单填充 |
| merchant-login 账号权限 | 商家 | 可配置已有开发会话（仅模拟器/loopback） | 原微信登录、会话验证；补接原auth/logout | 001、002 | 源码已实现；本机退出与远端撤销未确认有不同提示，真实微信配置未联调 |
| admin-products 商品搜索/筛选/分页/批量 | 商家 | 演示查询与批量 | product-search游标、分类读取、单品窄PATCH批量复用；草稿独立 | 001、006、008—010 | 源码已实现；保留已加载项勾选和逐项结果，未改批量规则 |
| admin-product-form 新增/编辑/复制/草稿/计划 | 商家 | 原演示表单与图片 | products/drafts、云端上传完成校验、库存API、时区与版本检查 | 001、006、008、009、015、017 | 源码已实现；复制不继承原库存/计划；Phase27补齐新增/复制/草稿发布创建幂等，依赖017；普通编辑仍走原版本保护 |
| 商品库存与流水 | 商家/顾客 | 演示余额、流水、到期处理 | inventoryRoute、库存预留/释放/worker；订单事务行锁 | 009 | 源码已实现；本机到期检查不等同可靠后台调度；支付成功回调未接入 |
| admin-categories 分类维护 | 商家 | 保留原新增/改名/删除/拖动 | 已有categories CRUD＋PATCH categories/order、revision及共同写锁 | 001 | 源码已实现，最多1000分类；旧客户端不传revision兼容仍保留，新页面始终传版本 |
| admin-note-tags 备注标签 | 商家/顾客 | 原设备标签及排序 | business-settings.noteTags，公开读取、授权部分更新 | 004（统一结构）；016配套版本 | 源码已实现；最多30条、每条20字，不追溯历史备注 |
| admin-placeholders 缺图设置 | 商家/顾客 | 原设备样式和自定义本机图 | business-settings中的样式/Key及服务器URL；共享读取工具 | 004、015、016 | 源码已实现；自定义图须IMAGE_PUBLIC_BASE_URL与对象上传配置，失败不把本机路径当云端URL |
| store-hours 营业/接单/公告 | 商家 | 原设备营业配置 | business-settings部分PATCH，完整配置revision | 004 | 源码已实现；与配送/标签/缺图更新互相保留字段 |
| delivery 配送区域/时段/特殊日期 | 商家 | 原设备规则 | 原delivery-rules授权GET/PUT、部分字段、版本冲突保护；顾客公开安全投影 | 004 | 源码已实现；没有地图骑手系统或新增配送收费规则 |
| admin-orders 搜索/筛选/统计/批量 | 商家 | 原演示工作流 | orders游标分页、summary全店、原逐单状态/ETA API | 001—009、012 | 源码已实现；保留原支付/状态限制和每单结果，不一次加载全史 |
| delivery-proof 送达照片 | 商家/所属顾客 | 原本地照片 | 原proof-upload/complete/proof及登记校验；短链接续取 | 005、007、015 | 源码已实现，但依赖PROOF_STORAGE_PRIVATE_CONFIRMED及桶策略审计；普通图片清理不能删除凭证 |
| admin-billing 营业账单/CSV | 商家 | 演示订单聚合 | 原billing分页及export；取消金额与成交快照，不导出顾客联系方式 | 001—009 | 源码已实现；实际确认收款为0，未验证paid标签不能成为收入 |
| admin-analytics 经营分析 | 商家 | 真实演示订单聚合、明确本机来源 | analytics/analytics/export，历史明细、分类快照、每日/小时统计 | 001—009、011 | 源码已实现；缺乏历史分类快照时归未知，不套用当前分类；确认收款0 |
| support-chat 客服会话 | 顾客/商家 | 同设备演示会话 | 授权独立会话、文字消息、序号分页、幂等、已读/未读、前台轮询 | 013 | 源码已实现；无附件、推送、WebSocket、AI客服；页面销毁后草稿不保证保留 |
| support-inbox 收件箱 | 商家 | 单条同设备演示入口 | 授权店铺多顾客分页与未读；选择固定会话回复 | 013 | 源码已实现；排序集合变化时需刷新；店铺成员共享已读水位 |
| admin-backup 导出/归档/预检查 | 商家 | 保留原选定键值JSON导出/恢复 | archives历史/下载/预检查，复用billing/analytics导出；仅owner管理归档 | 014、015；新配置引用016 | 源码已实现有界归档；无生产覆盖恢复，JSON不含图片实体/客服/顾客地址簿 |
| 商品图片引用与清理计划 | 商家/运维 | 本地图片，明确不走云端清理 | images、image-cleanup/plans，永久历史保护、独立审批及默认关闭的执行代码 | 015、016新增placeholder引用 | 仅部分实现：条件删除能力与备份覆盖尚需核实，未执行清理；不提供普通商家删除入口 |
| 系统数据库/R2备份 | 运维 | 服务器脚本，不是手机演示业务 | 既有backup/verify脚本及元数据，数据库引用保护 | 015；当前应用预期017 | 仅源码完善，未实际备份或恢复演练，不是已验证灾难恢复能力 |
| cloud-shop 早期只读预览 | 顾客/维护 | 无经营写入；页面内临时数量 | 公开products，只读预览已改用有效价格与真实“回首页结算”说明 | 001、006、008、009 | 仅部分实现/保留诊断用途，不另造购物车/下单体系；诊断预览仅第一页30件，完整目录从首页续页 |
| cloud-catalog 云端连接诊断 | 维护/商家 | 本机只存连接参数 | 原授权产品/分类/订单/账单诊断入口；返回清空旧经营数据，响应有会话守卫 | 001—009 | 仅部分实现：旧简单编辑器、商品首500、订单首30，不替代正式管理页；已纠正“最近100笔”文案 |
| logs 模板页面 | 开发 | 仅设备启动时间 | 无业务API；未注册app.json | 无 | 仍为本机开发辅助；保留，不臆测为经营日志 |

## utils全部模块的数据责任

| 模块 | 实际职责与存储边界 |
|---|---|
| addresses.ts | 演示模式用stall_addresses_v1；云端转到仅当前身份的内存地址集合，阻止saveAddresses直接写云端数据 |
| cloudAddresses.ts | 云端地址授权API、身份/店铺隔离缓存和临时选中ID；无地址个人资料Storage副本 |
| authApi.ts | 现有微信登录与Bearer请求；新cacheScope仅做命名空间，旧响应会话守卫；不会把前端角色当权限 |
| sessionScope.ts | 稳定且非凭证的缓存命名空间；新服务器登录返回同subject稳定摘要，旧/开发会话无证明时隔离，不作为认证依据 |
| merchantContext.ts | 同一份有效HTTPS/模拟器loopback店铺连接与会话读取，不另建身份系统 |
| customerOrdersApi.ts | 已改为复用同一getMerchantContext；私人订单请求有身份变化守卫 |
| remoteApi.ts | 公开商品读取及最多40个指定ID查询；不是演示商品合并器 |
| cloudCart.ts | 设备临时数量，按服务器/店铺/身份命名；价格、可售性、库存均重新查云端；最多40种 |
| cloudCheckout.ts | 公开配送/营业、后端订单创建、保留幂等凭据；不再写无用recent-orders设备订单副本 |
| cart.ts | 仅演示购物车、价格计算和演示角标；app在云端不再调用演示角标 |
| directPurchase.ts | 仅本地立即购买选择；云端不用该演示商品查找路径 |
| store.ts | stall_demo_v1及向后兼容扩展，演示库存/草稿/计划数据，不替代云端表 |
| inventory.ts | 演示库存修改/流水及有限整数验证，云端走独立授权库存API |
| orders.ts | 仅演示订单与演示预留；不向云端上传、不伪造支付成功 |
| orderWorkflow.ts | 演示履约规则与北京时间显示；云端状态由后端决定 |
| productPublishing.ts | IANA时区转换及格式化；本地即时生效与服务端SQL发布规则明确区分 |
| merchantProductQuery.ts | 商家查询类型、云端记录适配、本机查询；云端全店搜索由后端分页 |
| cloudMerchantProducts.ts | 原商家商品/草稿/分类/库存API封装；Phase27的POST创建统一复用持久重试编号，编辑不经过创建幂等 |
| merchantCategoriesCloud.ts | 新分类页授权读取、CAS修改与排序；复用catalog路由 |
| cloudMerchantImage.ts | 原上传与完成校验、图片管理API；云端不接收本机路径作为对象Key |
| productCreateRetry.ts | Phase27创建原请求与编号的隔离设备缓存，成功确认后删除；服务端017才是最终去重权威 |
| merchantOrdersCloud.ts | 原商家订单分页/summary/状态变更；不是设备订单统计 |
| merchantEtaCloud.ts | 原受权ETA更新，成功确认后才更新卡片 |
| merchantProofCloud.ts | 原凭证上传、订单读取及完成；服务器付款/照片校验不能绕过 |
| cloudProofRead.ts | 原180秒授权读取链接；无存储密钥，不把签名URL当长期对象引用 |
| businessCloud.ts | 统一营业/公告/门槛/标签/缺图部分配置API；上下文现包含会话；不把本地值静默写云端 |
| storePresentation.ts | 统一缺图读取；云端只用已读取的同店服务器设置/明确错误，演示才用设备样式 |
| cloudDelivery.ts | 原配送授权读写、区域稳定ID适配与可配送说明；保留内部坐标只在管理侧 |
| delivery.ts | 原演示规则与共用验证类型，不是云端配置数据源 |
| storeHours.ts | 原演示营业配置与状态；云端页面使用businessCloud |
| minimumOrder.ts | 演示门槛与共用整数分差额计算；真实门槛仍由服务器权威保存和校验 |
| salesAnalytics.ts | 演示聚合与云端报表封装，来源明确；上下文现包含会话 |
| shareCsvFile.ts | 已有安全文件名/大小限制及本地文件分享，不负责伪造经营记录 |
| merchantArchivesCloud.ts | 授权归档接口、分享和校验预览，不执行云端恢复 |
| support.ts | 仅设备客服演示；不是商家备注标签存储模块，未因名称相近重复放入标签业务 |
| supportCloud.ts | 既有客服API、北京时间与共享身份上下文辅助；不另创认证 |
| util.ts | 开发时间格式化，供未注册logs页面使用；无真实业务数据 |

## 后端模块与数据关系核对

| 模块 | 权威数据和边界 |
|---|---|
| server.mjs / auth.mjs | 路由分派、现有微信code交换、过期/撤销会话、merchant_members授权；cacheScope是subject摘要非令牌；没有新支付端点 |
| catalog.mjs / categoryManagement.mjs | 授权商家商品/分类；同店类别FK、固定字段参数SQL；新分类CAS与共同写锁不影响原产品PATCH |
| customerPagination.mjs | Phase27公共/本人订单分页参数、微秒游标和查询作用域校验，不承担认证替代职责 |
| merchantProductSearch.mjs | 商品与独立草稿union、查询白名单和稳定分页，不是首500件前端筛选 |
| productDrafts.mjs / productPublishing.mjs | 原草稿payload、状态/版本和发布转换；正式商品SQL统一计算计划到期生效 |
| inventory.mjs / inventoryRoute.mjs | 原有限库存、追加流水、事务预留/释放和15分钟到期worker；未改规则或启动worker |
| checkout.mjs | 原认证顾客创建订单、快照、幂等、配置与库存事务；GET让给原读取模块；手机号与当前大陆地址规则统一 |
| customerAddresses.mjs | 新顾客地址库，WHERE同时绑定store_id与认证subject；默认/删除/编辑共同事务锁，不能传subject读取别人地址 |
| orderWorkflow.mjs / merchantOrderQuery.mjs | 原顾客订单所属校验、商家状态机、ETA/照片、商家分页/summary；未放宽支付边界 |
| deliveryRules.mjs | 一份store_delivery_rules.configuration，营业与配送、标签与缺图字段分开部分写入但共用版本；公开信息不带配送中心坐标 |
| billing.mjs / salesAnalytics.mjs | 原真实订单/明细快照聚合与有界CSV；paid标签未经核验不作为实收 |
| reportExportLimits.mjs | 原报表导出单进程基础限流；不是跨节点完整任务系统 |
| support.mjs | 原每店每顾客唯一会话、认证读取、发送幂等、未读水位及限流 |
| merchantArchives.mjs / merchantArchiveFormat.mjs | 原owner归档、校验摘要与预检查；新缺图Key进入配置导出与预检查，不改变既有格式版本/旧摘要；默认不导出常用地址 |
| imageLifecycle.mjs / imageManagement.mjs | 原登记、历史保护、HEAD识别和两阶段计划，执行默认关闭；016的placeholder引用也属于历史保护，不另造上传系统 |

核心关系：`merchant_members → merchants → stores` 决定商家权限；顾客通过同一认证subject关联orders、support_conversations和customer_addresses。products、categories、drafts、库存和配置均有store_id。订单金额/商品/分类/图片/地址/备注使用当时快照，不随当前商品、分类、地址或标签修改回写。缺图图是店铺配置引用，不是商品image_object_key；其历史受image_reference_history保护。

## SQL001—017结构与依赖

| 编号 | 结构作用 | 当前判断 |
|---|---|---|
| 001 | 商家、成员、店铺、分类、商品、订单、明细、payment_events | 基础模型；支付事件表存在不等于已接支付 |
| 002 | auth_sessions | 现有会话认证 |
| 003 | 下单幂等键、联系/配送快照 | 原下单安全基础 |
| 004 | store_delivery_rules.configuration | 本阶段复用标签/缺图，不新建平行店铺设置表 |
| 005 | 凭证、异常原因、履约事件 | 原履约历史 |
| 006 | 商品描述、折扣及窗口 | 统一有效售价来源 |
| 007 | 预计送达字段 | 原ETA接口 |
| 008 | 店铺时区、计划、商品版本与独立product_drafts | 草稿不是改名推断的商品 |
| 009 | 库存模式/余额、预留、追加流水 | 原事务保护和到期机制 |
| 010 | 商品查询索引 | 原商家搜索分页 |
| 011 | 明细历史分类快照及触发器 | 不用当前分类猜旧销售 |
| 012 | 订单状态/游标索引 | 原商家订单分页 |
| 013 | 客服会话/消息及索引 | 多顾客独立会话 |
| 014 | 商家归档、请求记录和私有文件正文 | 有界导出，不是完整灾难恢复 |
| 015 | 图片登记、历史引用、计划/审计、订单图片快照 | 不执行任何R2删除 |
| **016（Phase26新增，未执行）** | customer_addresses、唯一默认地址索引；扩展placeholder引用类型与配置触发器 | 依次应用001—015之后才启用；无演示数据自动迁移 |
| **017（Phase27新增，未执行）** | product_create_requests店铺/身份/请求键回执；顾客目录及订单游标索引 | 依次应用001—016之后启用；创建回执与商品事务原子提交 |

016中地址有稳定UUID、服务器时间、创建请求UUID、原创建请求、版本、默认标记和删除时间。删除是地址簿逻辑删除，活动列表不再返回，保留幂等墓碑；未增加自动个人资料清除周期。它不修改历史订单快照。真实数据保留/清除策略尚需后续明确，不能宣称已经物理擦除。

## 本阶段接口变化

- 新增 `GET/POST /v1/stores/:slug/addresses`，`PATCH/DELETE /v1/stores/:slug/addresses/:id`。写入需认证；不接收customer_subject参数。POST带clientKey，编辑/删除带expectedVersion，设默认使用`{isDefault:true,expectedVersion}`。每身份每店最多50条，正文4096字节，SQL超时5秒。删除不存在/他人ID不暴露地址。
- 扩展原merchant/public business-settings：noteTags、placeholderStyle、placeholderImageKey、customPlaceholderUrl（只由服务器生成，不可通过PATCH传URL）。营业/配送写入不会覆盖这些字段，复用expectedRevision。
- 扩展原categories GET返回revision，新增 `PATCH /v1/merchant/stores/:slug/categories/order`；分类CRUD均通过同一店铺锁，接受可选expectedRevision以保留旧调用兼容。新页面总带版本；分类读取/写入上限1000，排序请求最多65536字节，其余商品请求保持原限制。
- 扩展原公开products支持`?ids=最多40个UUID`，只返回当前店铺公开且有效发布商品，参数化SQL；补充categoryName/categorySortOrder，不公开草稿或商家库存管理接口。
- 修正GET顾客orders路由到原身份受限读取逻辑；没有新增另一套订单读接口。
- 原微信登录响应补充不可用于认证的稳定cacheScope；原logout现在由商家账号页调用。未新增认证体系。

## 保留的设备存储与旧功能

- 演示商品、订单、库存/流水、营业、配送、地址、标签、缺图和客服：只有无有效云端配置的明确演示分支读写，保留原数据结构。
- 云端购物车数量、当前选择、结算备注草稿、待确认订单重试凭据：合法临时状态，按来源/身份隔离；服务器仍决定订单可售性、金额和库存。常用地址个人资料不再写设备地址表。
- 会话令牌、API连接参数、非凭证cacheScope：登录和连接所必需，不能拿缓存scope当授权。
- 通知偏好、启动时间日志、用户主动保存/分享的CSV/JSON：设备偏好/开发辅助/用户导出文件，不冒充服务器业务。
- 原无归属购物车、结算草稿、recent-orders和本机地址没有自动迁移或删除。旧recent-orders已无读取方，本阶段停止再写。云端不读旧共享结算草稿，演示草稿改用明确demo命名空间。
- 若存在旧版 `stall_cloud_order_pending_v1:<slug>` 未确认下单缓存，不知道其所属身份，不自动复用也不自动换新编号重发；下单会明确要求先核对自己的云端订单并由维护者处理旧缓存。**这是防止重复创建和跨身份暴露的兼容边界，不是假装请求成功。**
- 旧本机地址若曾填过真实资料，无法从现有结构推断所有人；仍只留在明确演示分支，不自动上传。维护者应核对其用途后处理，而不是擅自删除或认领。
- admin-products/admin-product-form尚有未绑定当前WXML的早期辅助方法；未为整洁大面积删改，真实主入口已使用当前云端链路。cloud-catalog保留维护用途，不是第二套正式后台。原有bak文件未触碰。

## 已知缺口与下一步

1. 本阶段全部仅静态检查，没有真实数据库、微信或对象存储运行验证；SQL触发器、地址并发/CAS、跨设备身份及文件分享必须在获授权环境核对。
2. Phase27已补齐正式顾客目录/历史订单分页；维护诊断页仍是有限预览，不能代替正式经营页。游标不是跨多次请求的数据库快照，状态或分类变化后应刷新。
3. Phase27新增商品创建幂等（017）；超时保留编号和原内容。修改未确认请求需重试原内容，或核对列表后明确放弃编号；主动放弃不能撤销已到达服务器的请求。
4. 微信支付、可信支付回调、退款、订阅消息、自动推送尚未开发/不属本阶段；收款统计继续为0或原已明确的未核验标签，不伪造成功。
5. 凭证私有桶策略、R2条件删除和备份引用完整性尚需运维核实；清理默认关闭，系统备份和恢复未执行。JSON归档不能单独恢复图片。
6. 地图选择权限与配送半径、真机域名白名单和IMAGE_PUBLIC_BASE_URL均是启用依赖；默认Asia/Shanghai、CNY，前后端地址手机号为中国大陆规则。
7. 客户常用地址的删除墓碑仍保存在数据库，尚未实现个人资料保留期清除；本机旧无归属缓存需要核对，未自动猜测数据所有人。

Phase27已补齐顾客目录、历史订单分页和商品创建幂等。下一阶段应优先进行获授权的隔离环境整合联调、迁移核对和身份/并发安全验证；未自动开始Phase28。

## 本阶段新增及修改文件

新增：

```
backend/FEATURE_INTEGRATION_STATUS.md
backend/sql/016_customer_addresses_store_presentation.sql
backend/src/customerAddresses.mjs
backend/src/categoryManagement.mjs
miniprogram/utils/cloudAddresses.ts
miniprogram/utils/merchantCategoriesCloud.ts
miniprogram/utils/sessionScope.ts
miniprogram/utils/storePresentation.ts
miniprogram/templates/product-placeholder.wxml
miniprogram/styles/product-placeholder.wxss
```

修改：

```
backend/src/auth.mjs
backend/src/server.mjs
backend/src/checkout.mjs
backend/src/catalog.mjs
backend/src/deliveryRules.mjs
backend/src/merchantArchiveFormat.mjs
backend/scripts/migrate-dev.mjs
backend/scripts/backup-metadata.mjs
miniprogram/app.ts
miniprogram/utils/addresses.ts
miniprogram/utils/authApi.ts
miniprogram/utils/businessCloud.ts
miniprogram/utils/cloudCart.ts
miniprogram/utils/cloudCheckout.ts
miniprogram/utils/customerOrdersApi.ts
miniprogram/utils/remoteApi.ts
miniprogram/utils/salesAnalytics.ts
miniprogram/pages/addresses/addresses.ts
miniprogram/pages/addresses/addresses.wxml
miniprogram/pages/checkout/checkout.ts
miniprogram/pages/checkout/checkout.wxml
miniprogram/pages/admin-note-tags/admin-note-tags.ts
miniprogram/pages/admin-note-tags/admin-note-tags.wxml
miniprogram/pages/admin-placeholders/admin-placeholders.ts
miniprogram/pages/admin-placeholders/admin-placeholders.wxml
miniprogram/pages/admin-categories/admin-categories.ts
miniprogram/pages/admin-categories/admin-categories.wxml
miniprogram/pages/index/index.ts
miniprogram/pages/index/index.wxml
miniprogram/pages/cart/cart.ts
miniprogram/pages/cart/cart.wxml
miniprogram/pages/cart/cart.wxss
miniprogram/pages/product-detail/product-detail.ts
miniprogram/pages/product-detail/product-detail.wxml
miniprogram/pages/product-detail/product-detail.wxss
miniprogram/pages/admin-products/admin-products.ts
miniprogram/pages/admin-products/admin-products.wxml
miniprogram/pages/admin-product-form/admin-product-form.ts
miniprogram/pages/admin-product-form/admin-product-form.wxml
miniprogram/pages/cloud-shop/cloud-shop.ts
miniprogram/pages/cloud-catalog/cloud-catalog.ts
miniprogram/pages/orders/orders.ts
miniprogram/pages/orders/orders.wxml
miniprogram/pages/merchant-login/merchant-login.ts
miniprogram/pages/customer-settings/customer-settings.wxml
```


## Phase27：顾客分页与商品创建幂等（2026-10-25，源码完成）

本节以当前本地源码为准；保留Phase20—26未提交修改。仅运行TypeScript无输出类型检查和Node语法检查；没有运行或编写测试，没有执行Git操作、迁移、部署、备份或R2操作。真实数据库与微信环境均未运行验证。

### 接口及兼容性

- 扩展原 `GET /v1/stores/:slug/products`：`limit` 默认30、最大50，`cursor`，`q`（名称字面部分匹配、最长100字符），`category`（稳定UUID）。仍返回 `products` 数组，增加 `categories`、`hasMore`、`nextCursor`。所有分类来自该启用店铺的服务端分类集合，最多1000个。原 `ids` 精确读取最多40个商品保持可用，不能与列表筛选或游标混用；购物车和详情不会依赖首页已加载商品。下架/未到时商品仍由原publishedSql排除，草稿仍是独立表。售罄/缺货可展示，不能加购/下单。
- 扩展原认证 `GET /v1/stores/:slug/orders`：`limit` 默认20、最大50，`cursor`，`tab=all|unpaid|active|completed|other`。响应保留 `orders`/`hasMore`，增加 `nextCursor`、`counts`。SQL始终按当前认证subject和店铺slug隔离；标签统计覆盖该顾客该店全部订单，不是当前页。标签沿用原页面语义，付款与履约状态分别显示；未改支付可信性规则。列表名称/数量、订单总价仍取订单和order_items快照；详情成交单价、ETA和凭证接口不变。
- 扩展原 `POST /v1/merchant/stores/:slug/products`：必须传16—100字符的 `clientKey`（字母、数字、下划线或短横线）。首次提交201，已成功相同请求重放200并返回原id；相同键不同内容409。缺失或非法键返回428 `product_create_key_required_update_client`，不会静默降级成无幂等创建；旧客户端需更新。当前维护诊断页的新增入口转到正式商品表单，原编辑仍保留。未新增平行商品创建或复制API。

### 分页、竞态及库存兼容

两个目录均使用不可变 `created_at DESC,id DESC` 键集排序，SQL取 `limit+1` 判断续页。游标保留PostgreSQL六位微秒，避免JS Date毫秒截断导致跳单；绑定店铺、筛选及（订单）认证身份摘要，不含认证令牌。客户端只能调整分页锚点，无法改变SQL权限范围。查询字段白名单、重复参数、游标长度、分页大小均校验，参数使用占位符。

首页加载更多追加并按ID去重，分类/明确搜索/清空重置分页，下拉刷新重新读取营业及配送信息；优惠专区保留且明确仅展示当前已加载的有效优惠。订单标签由服务端对完整历史筛选，追加按ID去重；页隐藏、重显、账号/店铺改变均使旧响应失效，私有订单不存本机持久缓存。加载更多失败保留已有结果，可原游标重试；刷新从头开始。既有库存、到时可售、订单状态机、价格快照、图片引用与Phase26地址/分类/缺图逻辑均未改。

### 创建幂等、重试与限制

017新增 `product_create_requests`，主键为 `(store_id,actor_subject,client_key)`，保存JSONB原请求、商品ID、服务端时间；商品外键使用店铺与ID联合约束。唯一插入在原商品/库存/草稿发布事务内完成；并发相同键等待数据库唯一约束，成功商品与回执一并提交，失败一并回滚。重放比较JSONB内容，不依赖字段排列；已成功回执先于图片存在性、计划未来时间等动态检查读取，超时重试不会因计划已到时而另建商品。原草稿发布锁/版本及已发布关联保护继续保留。商品软删除不删除回执，不设置自动过期复用键。

前端 `productCreateRetry.ts` 在发请求前保留编号和原表单请求，按API、店铺、服务端提供的稳定非凭证身份cacheScope和新建/复制来源/草稿意图隔离；成功核实返回ID后才清除。失败保留输入和原请求；重开相同来源表单可“重试上次创建”。未确认请求内容改变时先阻止提交，商家可重试原内容，或核对列表后明确确认放弃重试，再使用新编号。放弃重试不会撤销服务端请求，界面明确重复风险。没有自动将本机演示商品上传云端。旧/开发登录没有稳定cacheScope时只能保证该缓存身份范围内的重试；清除设备存储、主动放弃编号或使用新意图不是同一幂等请求，不承诺去重。

### 017迁移与启用依赖

新增 `backend/sql/017_customer_paging_product_create.sql`，依次在001—016之后应用；仅提供源码，未执行。包含创建回执表，以及商品店铺创建时间/ID、订单店铺顾客创建时间/ID索引。未修改旧迁移。迁移工具的顺序检查和系统备份元数据的应用预期版本调整为017，不代表真实数据库版本已升级；未执行任何工具脚本或备份。启用新版商品创建接口前须完成017，否则创建不能使用新增表。

### 本阶段实际新增/修改文件

新增：
- backend/src/customerPagination.mjs
- backend/sql/017_customer_paging_product_create.sql
- miniprogram/utils/productCreateRetry.ts

修改：
- backend/src/server.mjs
- backend/src/orderWorkflow.mjs
- backend/src/catalog.mjs
- backend/scripts/migrate-dev.mjs
- backend/scripts/backup-metadata.mjs
- miniprogram/utils/remoteApi.ts
- miniprogram/utils/customerOrdersApi.ts
- miniprogram/utils/cloudMerchantProducts.ts
- miniprogram/pages/index/index.ts
- miniprogram/pages/index/index.wxml
- miniprogram/pages/index/index.json
- miniprogram/pages/orders/orders.ts
- miniprogram/pages/orders/orders.wxml
- miniprogram/pages/orders/orders.json
- miniprogram/pages/admin-product-form/admin-product-form.ts
- miniprogram/pages/admin-product-form/admin-product-form.wxml
- miniprogram/pages/cloud-catalog/cloud-catalog.ts
- backend/FEATURE_INTEGRATION_STATUS.md

### 后续手动体验（本阶段未执行）

在获授权且已另行应用001—017的隔离环境中，配置云端API和店铺后，微信开发者工具首页按分类、搜索、加载更多及下拉刷新；确认下架/未来计划隐藏，折扣价和缺货状态正确。登录顾客查看历史订单，切换标签、续页、返回详情查看ETA/凭证；切换账号和店铺确认无旧数据。商家新增、复制和发布草稿时，保存后确认只新增一件；网络结果不明时使用原内容重试，再核对列表。未接云端时仍为原本机演示。以上是待执行体验步骤，不是已通过的运行验证。
