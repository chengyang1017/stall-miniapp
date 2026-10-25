# Phase32 当前增量：商品评价与评分

商品评价已从原可选项进入Phase32。新增Shared评价类型/展示组件、Customer公开展示与本人管理、Merchant管理与回复。平台审核仅在后端独立namespace，不打包到商家应用。Combined仍默认，当前页面数36/13/19；三目标TypeScript编译和边界检查已执行，微信平台编译及真实运行尚未验证。

可信支付核验适配器默认拒绝，因此当前真实发表/新图片上传尚不能启用；不以paid标签冒充收款。内容安全自动检测预留接口，默认pending；独立人工审核角色初始为空，没有自动公开。新增020未执行，Phase31 GPS及权限差异保留，未修改支付或原履约状态机。

完整文件、API、图片安全、启用依赖与限制见 [PRODUCT_REVIEWS.md](PRODUCT_REVIEWS.md)。以下Phase31/30/29记录保留历史；旧页面数及“评价未实现”的结论以本节为准。

---

# Phase31 当前增量：GPS 配送追踪

GPS 已从原可选项转入本阶段明确开发范围。已新增 Merchant 前台主动定位、订单配送指派、Customer 本单地图读取和019迁移源码。Combined 仍默认；当前页面数 Combined34 / Customer12 / Merchant18，三目标 TypeScript 编译和静态边界检查已完成，微信平台及真实设备尚未验证。Customer 产物不包含持续定位/上传代码或相应权限声明；没有默认后台定位。

共享类型与纯校验在 Shared，定位设备单例只在 Merchant，读取控制器只在 Customer；未改变 Phase30 隔离规则、支付或既有订单状态机。只支持单身份单个活动共享任务，多单行程尚未实现。原有双 AppID 后端登录依赖仍存在。新增服务器保留任务只会在未来实际启动后端时运行，本阶段没有启动。

详细 API、权限、保留策略、文件清单、平台依赖及验证边界见 [GPS_TRACKING.md](GPS_TRACKING.md)。以下 Phase30/29 审计保留为历史时点，其中旧页面数和“GPS未实现”结论由本节取代。

---

# 跨端隔离与独立构建准备（Phase 30，当前结论）

日期：2026-10-25。以下是 Phase30 的实际源码及静态构建结论；下方 Phase29 原审计作为历史记录保留，旧阶段的“尚无构建器”等结论已由本节取代。

## 当前交付状态

| 目标 | 默认入口 | 页面数 | TypeScript 实际编译 | 角色隔离与产物检查 | 微信平台编译/真机/发布 |
| --- | --- | --- | --- | --- | --- |
| Combined | pages/index/index，原四个 Tab | 32 | 已完成，108 个源码模块 | 已完成 | 未执行 |
| Customer | pages/index/index，顾客四个 Tab | 11 | 已完成，62 个源码模块 | 已完成，不包含商家专属页面/控制器/工具 | 未执行 |
| Merchant | pages/admin/admin，无顾客 Tab | 17 | 已完成，73 个源码模块 | 已完成，不包含购物车/结算/地址/顾客本人订单页及其专属模块 | 未执行 |

根 project.config.json 未修改，仍导向 miniprogram/；根 app.json 只追加四个角色页面，原入口、页面和 TabBar 保留。npm run build 默认 Combined。没有创建新 AppID、认证系统、后端 API 或数据库迁移；后端和支付规则没有修改。

## 构建与检查

详细命令、AppID 参数、微信工具导入方式见 [apps/BUILDING.md](../apps/BUILDING.md)。真实命令为 npm run build:combined、build:customer、build:merchant，输出 dist/combined、dist/customer、dist/merchant。已有 dist/ 忽略规则继续生效。构建按 TypeScript 依赖闭包选择源码与资源，不拷贝整棵源码树。

apps/build-targets.json 统一声明页面、工具模块归属和三个入口。新增页面若缺归属会失败；Combined 页面表与根 app.json 必须相同。源码图同时检查类型导入、运行导入及组件依赖；Customer/Merchant 禁止导入另一角色或 Combined，Shared 禁止导入角色和页面，共用 features 只能访问 Shared/features。所有依赖循环会失败。仅 Combined 允许声明的单应用导航适配器，Customer 构建会将该入口实际改写为 Customer 导航实现，不通过关闭检查来放行。

npm run check:boundaries 可重复检查源码图；加 --list 的脚本调用列出逐文件依赖闭包。npm run check:build-output 可重复检查所有已生成产物的注册页面、角色目录、逐文件清单与 JS require 依赖。图与完整页面/资源列表保存在每个输出 build-manifest.json；这些清单不包含会话或后端密钥。

静态检查和三个 TypeScript→CommonJS 编译已执行成功。未使用微信开发者工具/CI执行平台 WXML/WXSS 编译，未验证包体积、基础库及真实登录；不能声称三个目标已经通过微信运行验收。静态检查不执行页面、订单、数据库、图片或消息请求，也不是功能测试。

## 客服、凭证与导航拆分

- 客服：customer-support-chat 和 merchant-support-chat 各有固定角色控制器，调用既有对应 API；不从 URL 接受任意角色。每个页面实例独立创建端口和会话绑定，避免同一控制器工厂闭包把两个顾客会话混用。唯一 features/chat/controller.ts 保留分页、服务端序号排序、去重、已读水位、12 秒前台轮询、隐藏停止、请求失效和失败同幂等键重试。两端使用同一 WXML 模板与样式，不复制两套聊天业务。
- 凭证：customer-delivery-proof 只读本人订单与短时签名图片；merchant-delivery-proof 使用商家订单读取及既有上传/完成送达接口。共享 features/proof/viewer.ts、Shared proof 类型/读取协议、proof-image 组件。Customer 不引入 merchantProofCloud；Merchant 不依赖 order-detail 页面。原后端图片归属、权限、支付/送达校验仍是最终边界。
- Combined 的原 support-chat、delivery-proof URL 保留为兼容重定向；实际新入口指向固定角色页面。独立应用不带这两个混合兼容页、旧 cloud-shop/cloud-catalog 预览页。
- Combined 宿主导航继续显示管理入口；Customer 构建绑定 customer/navigation.ts，隐藏商家入口且不包含管理跳转。Merchant 页面表从工作台开始，保留原商家导航，没有顾客 TabBar。具体页面和资源以清单为准，不凭目录名字断言隔离。

## 演示数据和公共层

Shared/domain/demo.ts、demoRules.ts、money/time/catalog/orders 等负责共用类型与纯函数，不依赖任一角色。Shared/demo/repository.ts 提供中性演示店铺与订单存储接口，继续使用 stall_demo_v1、stall_demo_orders_v1；现有库存预留/释放与订单快照保持同一来源。营业/配送/起送、客服也沿用原演示 key。

Merchant/demo/store.ts、orders.ts、settings.ts 提供经营修改、履约及配置写入；Customer/demo/catalog.ts、orders.ts、settings.ts 提供商品读取、顾客建单/读取与营业配送读取。两端不导入对方内部实现；需要联动时通过明确 Shared 仓储接口交换数据。旧 utils/store/orders/orderWorkflow/storeHours/delivery/minimumOrder 仅作 Combined 兼容门面，不进入独立依赖闭包。

Combined 仍在一个微信存储沙箱内读写同一组数据，因此商品修改、顾客购物和商家履约继续同步。两个不同 AppID 的微信存储天然不共享；独立应用的本机演示不会跨设备或跨 AppID 自动同步，真实跨端同步来自现有后端。没有上传/迁移本机演示资料，也没有新建云端数据库。

## 身份、权限及独立发布依赖

现有服务器商家会话、角色/店铺权限、顾客本人订单/地址/消息权限没有修改。固定前端角色仅减少误调用，不能授予权限。没有发现需要放宽服务端校验才能构建的情形；没有以客户端配置替代后端授权。未进行动态安全验证。

构建允许 STALL_CUSTOMER_APPID、STALL_MERCHANT_APPID，仅含公开 AppID。Customer 缺省沿用根 AppID；Merchant 缺省 touristappid，不能正式登录。不同 AppID 的 OpenID 不共享，不能将相同 OpenID 文本视为同一个人，不能自动合并历史用户。

正式双 AppID 启用步骤（本阶段未执行）：

1. 由项目所有者分别提供已授权的 Customer/Merchant AppID、后台域名/隐私配置；AppSecret 只进服务端受控环境，不提交、不打包。
2. 后端将当前 legacyWechatApplication 单凭证换为受控白名单应用注册。已有 parseTrustedWechatApplications 仅是配置解析准备，HTTP 登录尚未启用它；客户端未来传应用别名时，服务器只能使用白名单凭证交换 code，不能接受任意 secret 或角色。
3. 另行设计及审计身份迁移：微信主体唯一键按 (AppID, OpenID)，会话绑定应用与用户；保持现有 Combined 会话兼容策略，商家权限仍来自数据库 membership。历史账号关联须明确授权，可核验 UnionID/人工绑定，不因客户端声明自动合并。此步骤可能需要新迁移，不在本阶段执行。
4. 客服 customer_id、订单/地址身份应在上述主体映射确定后继续关联原记录，先确定历史顾客如何迁移，不能仅换 AppID 丢失历史。
5. 店铺码由商家发起，但目标必须为 Customer AppID；当前后端仍按 legacy AppID 生成与校验，独立 Merchant 不能假定现有码接口已跨 AppID 兼容。需服务器受控选择 Customer 凭证/页面并保留现有店铺归属验证，再做正式码与分享验证。
6. 分别构建、导入对应 dist 目录；随后在另行授权阶段完成微信平台编译、包体积/基础库/资源/域名/隐私检查与业务验证，最后才考虑发布。支付仍由客户负责。

剩余依赖主要是正式身份和发布环境，不是尚未解除的 Customer→Merchant 或 Merchant→Customer 源码导入。Shared 的中性协议与演示仓储是刻意共享的接口；旧 Combined 兼容门面仍保留，不进入独立产物。本阶段未运行功能测试、后端、迁移、部署、Git 操作、备份或 R2 操作。

## 本阶段文件索引

- 构建：package.json、tsconfig.json；apps/build-targets.json；scripts/miniapp-graph.mjs、check-boundaries.mjs、build-miniapp.mjs、miniapp-output.mjs、check-build-output.mjs。
- 应用：apps/customer/app.ts、apps/merchant/app.ts；两端 README.md/app.plan.json；apps/BUILDING.md；packages/shared/README.md。
- 角色：miniprogram/modules/{customer,merchant}/controllers/{chat,proof}.ts、api/proof.ts、demo/*、navigation.ts；modules/integration/singleAppHost.ts。
- 共用：modules/shared/domain/{demo,demoRules,orderLabels,deliveryRules,chat,proof}.ts；shared/demo/*；shared/api/proofRead.ts；shared/components/proof-image/*；modules/features/{chat,proof}/*。
- 新角色页面：pages/{customer,merchant}-{support-chat,delivery-proof}/ 各 TS/JSON/WXML/WXSS；miniprogram/app.json 注册四页。
- 兼容门面：utils/{store,orders,orderWorkflow,storeHours,delivery,minimumOrder,support,cloudProofRead}.ts。已有商家归档、订单等工具仅调整角色/共享导入，不改协议。
- 页面整合：现有顾客/商家页面 TS 的演示、配置及 API 导入改为所属端口；index TS/WXML 管理入口；profile/order-detail 客服与凭证导航；support-inbox TS、admin-orders WXML 固定角色导航；旧 support-chat、delivery-proof TS/WXML 改为 Combined 兼容跳转。完整参与构建的源码与资源逐文件列表位于三个 build-manifest.json。
- 文档：本文件及上述应用/Shared 构建说明。数据库迁移、后端业务源码、根 project.config.json、需求.md 未因 Phase30 改写。

---

# 以下为 Phase29 历史审计（不代表 Phase30 当前状态）

# 商家端与顾客端模块化分离就绪审计（Phase29）

日期：2026-10-25。当前唯一正式小程序入口仍为根project.config.json（miniprogramRoot=miniprogram/）及miniprogram/app.json。**这次是渐进式模块分离，不是两个独立可运行小程序交付。** 最新数据库迁移为018_store_code_merchant_note.sql，本阶段没有新增019，也没有执行001—018。

## 1. 审查基准及实际完成级别

已读取本地app、页面注册和导航/导入、utils依赖、config、assets、微信登录/权限、服务器路由、001/002与018结构，以及Phase28需求审计和集成准备文档。GitHub连接器仅只读查看chengyang1017/stall-miniapp默认main的app.json、auth.mjs与server.mjs部分正文，作为远端入口参考；远端包含store-code和storeEntry，仍是单AppID登录。参考blob SHA分别为8f2a0dab1ac86de283c4524cd7820ad0c6fef7ab、e8ef695229a4d6a747eebb5ae113deac0bf224c7、240d71c522cbb0f2c0b68df5777bf88009de6b8d。没有声称全仓与main完全一致，没有拉取、覆盖本地或执行Git命令。

| 级别 | 当前结论 |
| --- | --- |
| 逻辑模块已分离 | 顾客私有API、商家管理API、共用领域及会话基础已分层；混合角色页面/宿主组合仍未彻底分离 |
| 源码文件已分离 | 部分：实际API和领域源码已抽取，旧utils留兼容再导出；页面目录未搬迁，业务控制器不复制 |
| 构建配置已独立 | 否：apps/*/app.plan.json只是标注runnable=false的组织/配置原型，不是微信app.json或构建器 |
| 可以独立发布 | 否：依赖闭包、混合页面角色绑定、资源/样式、双AppID授权及实际微信构建验证尚未完成 |

本阶段只做源码、配置原型、文档和静态检查；没有运行自动化测试、后端、迁移、部署、微信登录或第二AppID申请，也没有操作生产数据库/R2、备份、恢复或图片清理。

## 2. 当前依赖方向

```text
Customer API ──> Shared domain/runtime/protocol ──> Backend
Merchant API ──> Shared domain/runtime/protocol ──> Backend
单应用 integration/legacy 页面 ──> 按既有角色组合两端能力
Backend ──> PostgreSQL / R2（仍是同一业务数据源）
```

新Shared源码不导入Customer、Merchant、pages或utils，不含页面导航、商家默认权限、角色专属登录UI或页面业务状态。domain层不依赖wx；runtime/API层使用微信平台请求和设备会话适配，两端均可使用，不等于纯Node包。

当前角色API模块的运行导入方向为role→Shared，Customer和Merchant模块之间无直接运行导入；顾客地址类型也抽至Customer/domain，消除地址缓存API与旧地址工具之间的反向类型引用。**这不表示全工程所有跨端联系都已消失**，见第6节。

## 3. Customer页面与依赖

现有顾客专属页面：

- [miniprogram/pages/index/index.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts)
- [miniprogram/pages/product-detail/product-detail.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/product-detail/product-detail.ts)
- [miniprogram/pages/cart/cart.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts)
- [miniprogram/pages/checkout/checkout.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts)
- [miniprogram/pages/addresses/addresses.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts)
- [miniprogram/pages/orders/orders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/orders/orders.ts)
- [miniprogram/pages/order-detail/order-detail.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/order-detail/order-detail.ts)
- [miniprogram/pages/profile/profile.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/profile/profile.ts)
- [miniprogram/pages/customer-settings/customer-settings.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/customer-settings/customer-settings.ts)

顾客使用的角色API在modules/customer/api：本人订单列表/详情、本人地址缓存与CRUD、地址配送可用性选择器、固定顾客角色的客服封装。页面使用中性getCloudContext/getSessionToken/cloudIdentity，不再调用商家命名的配置函数或经混合营业/配送门面加载管理写入模块。

仍位于utils的顾客功能包括cloudCart/cloudCheckout/cart/addresses/directPurchase/storeEntry等，保留原存储键、待确认下单幂等编号、分页/折扣/库存和分享行为；这部分文件并非全部物理迁移。它们可通过当前兼容入口继续工作，不把没有搬目录称为业务尚未实现。

顾客TabBar仍是首页、购物车、订单、我的，当前公共图片和TabBar共用资源不变。旧cloud-shop为有限预览，不纳入未来正式顾客入口的默认业务清单。

## 4. Merchant页面与依赖

现有商家专属页面：

- [miniprogram/pages/admin/admin.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.ts)
- [miniprogram/pages/merchant-login/merchant-login.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/merchant-login/merchant-login.ts)
- [miniprogram/pages/admin-products/admin-products.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-products/admin-products.ts)
- [miniprogram/pages/admin-product-form/admin-product-form.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts)
- [miniprogram/pages/admin-categories/admin-categories.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-categories/admin-categories.ts)
- [miniprogram/pages/admin-orders/admin-orders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts)
- [miniprogram/pages/delivery/delivery.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts)
- [miniprogram/pages/store-hours/store-hours.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-hours/store-hours.ts)
- [miniprogram/pages/admin-note-tags/admin-note-tags.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-note-tags/admin-note-tags.ts)
- [miniprogram/pages/admin-placeholders/admin-placeholders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-placeholders/admin-placeholders.ts)
- [miniprogram/pages/admin-billing/admin-billing.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-billing/admin-billing.ts)
- [miniprogram/pages/admin-analytics/admin-analytics.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-analytics/admin-analytics.ts)
- [miniprogram/pages/support-inbox/support-inbox.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/support-inbox/support-inbox.ts)
- [miniprogram/pages/store-code/store-code.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-code/store-code.ts)
- [miniprogram/pages/admin-backup/admin-backup.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-backup/admin-backup.ts)

商家API在modules/merchant/api：营业配置管理、配送配置管理、商品/分类/草稿/图片授权Mutation、订单分页/汇总/状态/内部备注、固定商家角色的客服封装。服务端仍认证会话、数据库商户成员关系及角色；前端配置和manifest不授予权限。

原cloudMerchantProducts/cloudMerchantImage/merchantCategoriesCloud/merchantProofCloud/merchantArchivesCloud/merchantEtaCloud/productCreateRetry/merchantProductQuery/salesAnalytics等工具保留在utils，已改为依赖中性Shared会话/请求或Merchant API；其业务逻辑、接口路径、幂等/版本规则没有重写。cloud-catalog仍是维护诊断页，不能视为第二套正式商家后台。

商家退出登录原来直接导入顾客地址缓存函数；现在调用Shared通用缓存失效通知。已加载的Customer地址缓存注册清理回调，身份读取时原有sync检查也继续保留；Merchant不导入Customer缓存模块，不因退出登录而静默上传/改写顾客数据。

## 5. Shared与角色模块实际清单

### customer

- [miniprogram/modules/customer/api/addresses.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/customer/api/addresses.ts)
- [miniprogram/modules/customer/api/delivery.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/customer/api/delivery.ts)
- [miniprogram/modules/customer/api/orders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/customer/api/orders.ts)
- [miniprogram/modules/customer/api/support.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/customer/api/support.ts)
- [miniprogram/modules/customer/domain/address.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/customer/domain/address.ts)

### merchant

- [miniprogram/modules/merchant/api/business.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/merchant/api/business.ts)
- [miniprogram/modules/merchant/api/delivery.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/merchant/api/delivery.ts)
- [miniprogram/modules/merchant/api/mutation.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/merchant/api/mutation.ts)
- [miniprogram/modules/merchant/api/orders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/merchant/api/orders.ts)
- [miniprogram/modules/merchant/api/support.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/merchant/api/support.ts)

### shared

- [miniprogram/modules/shared/api/business.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/api/business.ts)
- [miniprogram/modules/shared/api/catalog.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/api/catalog.ts)
- [miniprogram/modules/shared/api/supportTransport.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/api/supportTransport.ts)
- [miniprogram/modules/shared/domain/business.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/domain/business.ts)
- [miniprogram/modules/shared/domain/catalog.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/domain/catalog.ts)
- [miniprogram/modules/shared/domain/delivery.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/domain/delivery.ts)
- [miniprogram/modules/shared/domain/money.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/domain/money.ts)
- [miniprogram/modules/shared/domain/orders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/domain/orders.ts)
- [miniprogram/modules/shared/domain/publishing.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/domain/publishing.ts)
- [miniprogram/modules/shared/domain/support.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/domain/support.ts)
- [miniprogram/modules/shared/domain/time.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/domain/time.ts)
- [miniprogram/modules/shared/runtime/auth.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/runtime/auth.ts)
- [miniprogram/modules/shared/runtime/context.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/runtime/context.ts)
- [miniprogram/modules/shared/runtime/sessionLifecycle.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/runtime/sessionLifecycle.ts)
- [miniprogram/modules/shared/runtime/sessionScope.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/shared/runtime/sessionScope.ts)

### integration

- [miniprogram/modules/integration/singleAppHost.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/modules/integration/singleAppHost.ts)


提取的纯领域包括Category/RemoteProduct/StockMode、stockAllows、统一前端FulfillmentStatus/ORDER_STEPS/PaymentStatus/OrderIdentity、营业与配送公共协议、金额/起送差额、北京时间和上架时间转换、客服序号/时间/错误格式。store.ts继续维护演示产品和库存，不把演示持久化塞进Shared；orders.ts的演示模型只复用公共ID形状，演示订单仍明确为演示模型。

订单状态只有一个前端FulfillmentStatus定义；商家数量结构使用Record<FulfillmentStatus,number>，本机工作流也使用同一ORDER_STEPS。后端和PostgreSQL仍是权威状态机，未因为提取前端常量而放宽任何转换。前端展示标签/队列和兼容旧状态别名不是第二套业务状态机；跨语言契约仍需以后通过受控生成/静态比对维护，本次不引入构建依赖。

Shared的公开商品/营业GET用于两端，故不强行归为顾客专属。supportTransport是双方共用API路径和传输协议，role facade固定各自请求角色；它不会信任role布尔值授予权限，后端仍重新认证。Shared中的微信登录只交换code与服务器会话，不包含跳转商家工作台或自动加成员的逻辑。

### 原工具兼容入口

- merchantContext→Shared中性连接/会话；旧getMerchantContext等名称仅保留再导出，实际顾客调用点已改名。
- authApi→Shared通用登录/GET与Merchant Mutation的旧门面，新调用点绕过混合门面。
- sessionScope、remoteApi、productPublishing→Shared实际实现。
- businessCloud→Shared公开营业读取/金额展示与Merchant营业写入的兼容再导出。
- cloudDelivery→Customer地址选择器与Merchant配送管理的兼容再导出。
- supportCloud→共享协议的旧混合角色适配器；顾客profile、商家工作台/inbox已用固定角色入口。
- customerOrdersApi、cloudAddresses、merchantOrdersCloud→对应角色API实现的兼容再导出。

保留这些旧路径是为了兼容已有调用和未提交代码，未删除接口或强迫一次性迁移；新代码不应导入混合门面。独立包构建前还必须从各自依赖闭包排除它们，不能认为“只用了其中一个export”就一定不会打包其他角色模块。

## 6. 已解除及仍存在的跨端依赖

| 原耦合 | 本阶段处理 | 结果 |
| --- | --- | --- |
| 顾客功能使用merchantContext命名及商家混合工具 | 中性context/session抽取，调用点改为getCloudContext/getSessionToken | 已解除这一管理配置依赖，不建立第二份设备配置 |
| 通用authApi同时导出商家写入 | Shared保留登录/GET，Merchant单独持有原Mutation白名单 | 新顾客调用不再加载商家Mutation门面；服务端权限不变 |
| 营业/配送读取与商家写入同文件 | 公开营业到Shared，地址选择到Customer，管理写入到Merchant | 原expectedRevision和冲突保护不变 |
| 商家登录直接清除Customer缓存 | 通用sessionLifecycle订阅失效通知 | 无Merchant→Customer缓存导入 |
| 客服读取由各专属页面传true/false角色 | profile/workbench/inbox使用固定角色API封装 | 专属入口不自己切换另一端路径 |
| 通用类型/金额/时间混在本机数据工具 | 抽取pure domain，旧工具再导出 | Shared不加载本机演示持久化 |
| 顾客首页直接写商家工作台导航路径 | 交给modules/integration/singleAppHost组合绑定 | 路径不在Shared；单应用入口仍保留，但宿主耦合尚存 |
| 顾客地址API引用旧地址工具类型 | SavedAddress到Customer/domain | 消除反向类型引用，无两套地址模型 |

尚未安全解除的部分：

1. **support-chat**是顾客与商家共用的混合页面，控制器读取merchant/conversation参数并调用相应服务器会话；**delivery-proof**也是顾客读取与商家上传/完成的混合页面。它们属于当前单应用集成桥，不属于Shared，不伪装成顾客专属页面。将来应复用展示组件并注入固定角色控制器，避免复制两套完整聊天/凭证业务；服务器权限不能被参数绕过。
2. 原首页管理按钮仍通过单应用宿主进入商家工作台；这是明确保留的跨角色导航，不是独立顾客应用能力。未来Customer构建需去掉或替换此宿主绑定，不能把Merchant路径搬进Shared。
3. utils/store、orders、orderWorkflow、support、delivery、storeHours、minimumOrder等演示数据/工具仍在单设备两端使用。Merchant读取演示订单，而orders的创建输入还引用顾客购物车的类型（已标type-only，不产生运行导入）。独立构建前需把真正共用的快照输入进一步与Customer展示类型拆开，不能把演示全库直接当共享生产数据。
4. cloud-catalog同时预览公开目录和维护管理数据，cloud-shop仍是旧只读预览；不纳入两个正式App的核心构建，是否保留诊断包需运营决定。logs页未注册，不当作已运行入口。
5. app.wxss包含当前单应用双方样式，assets/TabBar和占位图显示配置也依赖当前宿主；没有复制资源或生成两个全局样式包。
6. 当前仍有一个全局设备session/config兼容键，聊天/凭证等遗留API采用原单应用上下文；不能在同一设备Storage里同时模拟两个App的独立身份。未来两App各有微信设备沙箱，跨端通信必须经后端。

因此“全部直接跨端依赖已解除”的答案是**否**。新增角色API运行依赖已经单向，但宿主桥接、遗留门面和演示类型仍需后续工作。

## 7. 配置原型、构建和发布边界

apps/customer/app.plan.json、apps/merchant/app.plan.json记录首页、页面归属、TabBar/导航责任、公开配置、角色授权及隐私/小程序码边界。它们显式标记kind=source-organization-prototype、runnable=false、independentlyPublishable=false、appId=null，不会覆盖当前微信配置，也没有创建第二个应用项目。

当前Shared真实源码放在miniprogram/modules/shared，确保仍在现有miniprogramRoot内；packages/shared/README仅说明未来包边界，不复制代码、不谎称已建立npm包或构建产物。当前没有workspace、打包器、产物目录或配置生成器。

当前配置保持不变的SHA-256（改造前后相同）：

- miniprogram/app.json：60b69d252d91274ad9b4f9f187ff6b72d8264b29871f282ff9255b73d441277e
- project.config.json：67cb8866d98ee9bd07a80999c0a9d272cbaf54e5427dd227993af20d28e45f02

仍是28个已注册页面、原四项顾客TabBar、原AppID、原资源路径。app.ts只将中性会话/配置依赖改为Shared，没有改小程序根目录或启动第二应用。它仍承担当前宿主的顾客购物车徽标与扫码入口初始化；未来Merchant需要自己的bootstrap，不能直接照搬当前app.ts。tsconfig.json和现有根package.json未修改，类型检查仍覆盖当前项目。

## 8. 双AppID认证准备

### 当前已实现/保持的部分

- 当前HTTP登录仍是POST /v1/auth/wechat + {code}，只使用WX_APPID/WX_APPSECRET对应的一个可信应用验证微信返回openid；客户端传来的appId、role或subject不能决定身份。
- backend/src/wechatApplications.mjs新增服务端凭证边界，legacyWechatApplication被原auth使用；生产行为仍读取原变量并生成相同的wx:AppID:OpenID，现有会话、cacheScope、成员关系、顾客历史都不重命名。
- parseTrustedWechatApplications是**未接入HTTP路由的配置准备函数**：解析操作者提供的alias→{appId,secret}可信注册表，限制条数、别名/字段格式和重复AppID，返回Map。它不从前端读取密钥，没有新增自动启用的环境变量或第二AppID登录接口，也不自动注册成员。
- 001/002的subject本身是text，可以容纳多个AppID的明确身份；这不代表历史身份已映射或双AppID功能已经启用。

### 未来接口和迁移方案（尚未启用）

1. 后端由受控配置注册两个可信应用别名，例如customer/merchant，密钥仅在后端。现有无selector请求继续默认legacy，以保留旧客户端。
2. 将来若增加application别名参数，必须先做明确的服务端白名单选择，再用该应用凭证向微信验证code；不能接收客户端自报openid/subject/role。任意AppID字符串不能访问未注册凭证。当前路由不消费该selector，不能现在调用它模拟第二身份。
3. 不同AppID产生的openid必须保持不同subject；即便字符串看起来相似也不能合并。商家新AppID登录后仍需要管理员明确建立merchant_members授权；选择merchant别名不授予管理权限。
4. 顾客旧订单/地址/客服属于旧AppID subject。优先保留旧AppID作为Customer以保持历史可达；如果必须换顾客AppID，需要客户确认身份关联和历史访问迁移方案，另行设计后端映射/审计/必要迁移。不能复制token、根据手机号/昵称猜测、或默认UnionID关联。UnionID也只有在后端真实验证且双方授权后才能纳入方案。
5. 商家与顾客数据仍按同一store_id读取统一商品、库存、订单和配置。Merchant成员身份可不同于订单顾客subject，不需要把两者合并。客服商家在同一会话回复，但不能据新顾客AppID猜旧顾客会话归属。
6. 以后每个前端应有独立会话/配置/缓存沙箱，显式选择自己的可信应用，服务端校验应用与code。当前保留旧缓存键是为了不破坏Phase27未确认创建请求和历史购物车；本阶段不批量清缓存、不迁移真实账号。
7. 店铺码必须由**Customer应用**的凭证生成，分享路径也属于Customer页面。现有storeEntry码模块仍使用当前单AppID并核对调用小程序AppID；未来Merchant AppID不同后需要专门的受权目标应用契约和UI调整，不能直接改WX_APPID后就认为原扫码链路兼容。
8. 支付由客户负责；微信支付AppID/商户绑定及顾客身份改变需要单独协调。本阶段没有修改支付契约或实现支付。

本阶段没有启用第二AppID、执行账号映射、申请应用、迁移数据库或迁移真实微信账号。该方案需后续独立授权及实际微信环境验证。

## 9. 未来独立构建的具体工作

### Customer

- 从ownedPages开始计算完整依赖闭包，移除单应用管理入口和混合门面的Merchant export；为聊天和凭证绑定固定顾客控制器。
- 将剩余顾客购物车/结算/店铺入口工具归入Customer；从演示订单中拆出真正通用输入类型，不带商家编辑状态。
- 生成独立app.json/project.config.json、顾客TabBar与必要资源/全局样式，把Shared编译到该应用miniprogramRoot。原型JSON不能直接作为发布配置。
- 配置可信公开API、Customer AppID、扫码/分享及隐私声明；确认历史顾客subject保持或正式迁移方案。

### Merchant

- 从商家ownedPages计算闭包，聊天/凭证固定管理角色；不携带顾客购物车/结算界面状态或顾客TabBar。
- 完成遗留管理工具物理归属和菜单/样式/资源整理，保持同一版本/幂等接口，不复制订单或图片业务。
- 生成独立项目配置和工作台首页；配置新的可信登录应用，管理员明确授权其subject。
- 单独解决跨应用Customer店铺码和分享，不把商家AppID码发给顾客当商城码；统一后端与store_id。

### Shared与Backend

- 选择可维护的编译/产物引入方式，消除外部源码越过微信项目root的假定；Shared只有一份源代码。
- 接入已确认的可信App注册表/selector和身份迁移约束，保持现有legacy请求兼容，不改变商家数据库授权。
- 新建身份映射表或协议迁移如确有必要，另行编号SQL并审批，不能因准备双AppID就改写现有顾客subject。
- 单独授权进行两个微信项目的静态构建、开发者工具/真机、权限/幂等/分页及跨AppID验证。本阶段未做这些验证。

## 10. 现有功能影响与验证边界

迁移仅为代码提取、类型统一、导入和兼容适配。商品/分类/库存/折扣/计划、图片历史保护、顾客分页、购物车/地址/结算、订单搜索/筛选/批量/内部备注、营业配送、凭证权限、账单/分析、客服、归档、店铺码/分享的业务API路径、数据库结构和存储键保持原规则。没有放宽expectedRevision、clientKey、后端角色或支付限制。

本机演示继续使用原键。通用失效通知不保存任何地址/订单，只通知已加载缓存清理；identity和请求序号仍负责拒绝旧响应。未将本机消息/订单上传云端，也没有新增跨App共享Storage的机制。

最终TypeScript --noEmit退出0，auth.mjs和wechatApplications.mjs的Node --check均退出0；另有只读导入、文件/历史副本和摘要盘点。新增Customer/Merchant模块没有互相导入，Shared无向外模块导入、无页面路径，domain无wx引用。这些不是自动化功能测试，也不证明微信包能独立运行或发布。未启动服务，尤其避免启动自动库存任务；未执行迁移、备份/恢复、图片清理或R2操作。

## 11. 历史副本清理建议（没有删除）

以下文件没有被app.json注册为页面，也不是当前.ts/.wxml/.wxss标准入口或相对import目标，仅列为人工清理建议。它们可能仍被微信工具当作未引用资源打包，不能从“不是源码入口”推断已经从发布包排除；后续需人工审查内容及打包详情，取得授权后决定清理或排除。本阶段没有移动、删除或新建任何备份。

- [backend/src/catalog.mjs.bak-2026-10-24T06-17-47-975Z](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs.bak-2026-10-24T06-17-47-975Z)
- [backend/src/checkout.mjs.bak-2026-10-24T06-17-47-975Z](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs.bak-2026-10-24T06-17-47-975Z)
- [backend/src/checkout.mjs.phase34-backup-2026-10-24T09-55-42-882Z](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs.phase34-backup-2026-10-24T09-55-42-882Z)
- [backend/src/deliveryRules.mjs.phase34-backup-2026-10-24T09-55-42-882Z](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs.phase34-backup-2026-10-24T09-55-42-882Z)
- [backend/src/server.mjs.bak-2026-10-24T06-17-47-975Z](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs.bak-2026-10-24T06-17-47-975Z)
- [miniprogram/pages/admin/admin.wxml.bak-20261024-122257](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxml.bak-20261024-122257)
- [miniprogram/pages/admin/admin.wxml.before_hours_nav_20261023_144415.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxml.before_hours_nav_20261023_144415.bak)
- [miniprogram/pages/admin/admin.wxml.before_icon_restore_20261024_130207.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxml.before_icon_restore_20261024_130207.bak)
- [miniprogram/pages/admin/admin.wxml.before_redesign_20261024_125941.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxml.before_redesign_20261024_125941.bak)
- [miniprogram/pages/admin/admin.wxss.before_icon_fill_20261024_131941.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxss.before_icon_fill_20261024_131941.bak)
- [miniprogram/pages/admin/admin.wxss.before_redesign_20261024_125941.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxss.before_redesign_20261024_125941.bak)
- [miniprogram/pages/admin-placeholders/admin-placeholders.wxml.before_chinese_fix_20261023_142122.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-placeholders/admin-placeholders.wxml.before_chinese_fix_20261023_142122.bak)
- [miniprogram/pages/admin-product-form/admin-product-form.ts.bak-20261024-122856](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts.bak-20261024-122856)
- [miniprogram/pages/admin-product-form/admin-product-form.ts.bak-20261024-125119](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts.bak-20261024-125119)
- [miniprogram/pages/admin-product-form/admin-product-form.ts.bak-20261024-125734](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts.bak-20261024-125734)
- [miniprogram/pages/admin-product-form/admin-product-form.ts.phase31-2026-10-24T06-25-23-293Z.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts.phase31-2026-10-24T06-25-23-293Z.bak)
- [miniprogram/pages/admin-product-form/admin-product-form.wxml.bak-20261024-122856](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.wxml.bak-20261024-122856)
- [miniprogram/pages/admin-product-form/admin-product-form.wxml.before_blank_fix_20261023_135533.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.wxml.before_blank_fix_20261023_135533.bak)
- [miniprogram/pages/admin-products/admin-products.ts.bak-20261024-122856](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-products/admin-products.ts.bak-20261024-122856)
- [miniprogram/pages/admin-products/admin-products.wxml.bak-20261024-122856](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-products/admin-products.wxml.bak-20261024-122856)
- [miniprogram/pages/cart/cart.ts.phase33-backup-2026-10-24T09-45-47-486Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts.phase33-backup-2026-10-24T09-45-47-486Z)
- [miniprogram/pages/cart/cart.ts.phase34-backup-2026-10-24T09-55-42-882Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts.phase34-backup-2026-10-24T09-55-42-882Z)
- [miniprogram/pages/checkout/checkout.ts.before_repair_20261023_110354.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts.before_repair_20261023_110354.bak)
- [miniprogram/pages/checkout/checkout.ts.phase34-backup-2026-10-24T09-55-42-882Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts.phase34-backup-2026-10-24T09-55-42-882Z)
- [miniprogram/pages/checkout/checkout.wxml.phase34-backup-2026-10-24T09-55-42-882Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.wxml.phase34-backup-2026-10-24T09-55-42-882Z)
- [miniprogram/pages/delivery/delivery.wxml.before_condition_fix_20261023_121007.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.wxml.before_condition_fix_20261023_121007.bak)
- [miniprogram/pages/index/index.ts.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts.bak)
- [miniprogram/pages/index/index.ts.phase32-backup-2026-10-24T09-26-22-359Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts.phase32-backup-2026-10-24T09-26-22-359Z)
- [miniprogram/pages/index/index.ts.phase33-backup-2026-10-24T09-45-47-486Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts.phase33-backup-2026-10-24T09-45-47-486Z)
- [miniprogram/pages/product-detail/product-detail.ts.phase32-backup-2026-10-24T09-26-22-359Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/product-detail/product-detail.ts.phase32-backup-2026-10-24T09-26-22-359Z)
- [miniprogram/pages/product-detail/product-detail.ts.phase33-backup-2026-10-24T09-45-47-486Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/product-detail/product-detail.ts.phase33-backup-2026-10-24T09-45-47-486Z)
- [miniprogram/pages/product-detail/product-detail.wxss.before_style_fix_20261023_114848.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/product-detail/product-detail.wxss.before_style_fix_20261023_114848.bak)
- [miniprogram/utils/cloudCart.ts.phase34-backup-2026-10-24T09-55-42-882Z](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts.phase34-backup-2026-10-24T09-55-42-882Z)
- [miniprogram/utils/cloudMerchantProducts.ts.phase31-2026-10-24T06-25-23-293Z.bak](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudMerchantProducts.ts.phase31-2026-10-24T06-25-23-293Z.bak)

## 12. 本阶段文件范围

新增实际模块：上方第5节全部modules文件（每个实现只保留一份）；新增backend/src/wechatApplications.mjs、apps/customer与apps/merchant的README/app.plan.json、packages/shared/README及本文档。

后端修改仅auth.mjs读取凭证的两行抽象；没有改server.mjs路由或SQL。前端旧入口/调用点涉及如下文件，主要为import和兼容再导出、公共类型及原本机状态常量复用，未移动页面/复制业务控制器：

- [miniprogram/utils/addresses.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/addresses.ts)
- [miniprogram/utils/authApi.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/authApi.ts)
- [miniprogram/utils/businessCloud.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/businessCloud.ts)
- [miniprogram/utils/cart.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cart.ts)
- [miniprogram/utils/cloudAddresses.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudAddresses.ts)
- [miniprogram/utils/cloudCart.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts)
- [miniprogram/utils/cloudCheckout.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCheckout.ts)
- [miniprogram/utils/cloudDelivery.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudDelivery.ts)
- [miniprogram/utils/cloudMerchantImage.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudMerchantImage.ts)
- [miniprogram/utils/cloudMerchantProducts.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudMerchantProducts.ts)
- [miniprogram/utils/cloudProofRead.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudProofRead.ts)
- [miniprogram/utils/customerOrdersApi.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/customerOrdersApi.ts)
- [miniprogram/utils/delivery.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/delivery.ts)
- [miniprogram/utils/directPurchase.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/directPurchase.ts)
- [miniprogram/utils/inventory.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/inventory.ts)
- [miniprogram/utils/merchantArchivesCloud.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantArchivesCloud.ts)
- [miniprogram/utils/merchantCategoriesCloud.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantCategoriesCloud.ts)
- [miniprogram/utils/merchantContext.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantContext.ts)
- [miniprogram/utils/merchantEtaCloud.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantEtaCloud.ts)
- [miniprogram/utils/merchantOrdersCloud.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantOrdersCloud.ts)
- [miniprogram/utils/merchantProductQuery.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantProductQuery.ts)
- [miniprogram/utils/merchantProofCloud.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantProofCloud.ts)
- [miniprogram/utils/minimumOrder.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/minimumOrder.ts)
- [miniprogram/utils/orders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/orders.ts)
- [miniprogram/utils/orderWorkflow.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/orderWorkflow.ts)
- [miniprogram/utils/productCreateRetry.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/productCreateRetry.ts)
- [miniprogram/utils/productPublishing.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/productPublishing.ts)
- [miniprogram/utils/remoteApi.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/remoteApi.ts)
- [miniprogram/utils/salesAnalytics.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/salesAnalytics.ts)
- [miniprogram/utils/sessionScope.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/sessionScope.ts)
- [miniprogram/utils/shareCsvFile.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/shareCsvFile.ts)
- [miniprogram/utils/store.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/store.ts)
- [miniprogram/utils/storeEntry.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storeEntry.ts)
- [miniprogram/utils/storeHours.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storeHours.ts)
- [miniprogram/utils/storePresentation.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storePresentation.ts)
- [miniprogram/utils/support.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/support.ts)
- [miniprogram/utils/supportCloud.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/supportCloud.ts)
- [miniprogram/utils/util.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/util.ts)
- [miniprogram/pages/addresses/addresses.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts)
- [miniprogram/pages/admin/admin.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.ts)
- [miniprogram/pages/admin-analytics/admin-analytics.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-analytics/admin-analytics.ts)
- [miniprogram/pages/admin-backup/admin-backup.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-backup/admin-backup.ts)
- [miniprogram/pages/admin-billing/admin-billing.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-billing/admin-billing.ts)
- [miniprogram/pages/admin-categories/admin-categories.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-categories/admin-categories.ts)
- [miniprogram/pages/admin-note-tags/admin-note-tags.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-note-tags/admin-note-tags.ts)
- [miniprogram/pages/admin-orders/admin-orders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts)
- [miniprogram/pages/admin-placeholders/admin-placeholders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-placeholders/admin-placeholders.ts)
- [miniprogram/pages/admin-product-form/admin-product-form.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts)
- [miniprogram/pages/admin-products/admin-products.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-products/admin-products.ts)
- [miniprogram/pages/cart/cart.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts)
- [miniprogram/pages/checkout/checkout.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts)
- [miniprogram/pages/cloud-catalog/cloud-catalog.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cloud-catalog/cloud-catalog.ts)
- [miniprogram/pages/cloud-shop/cloud-shop.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cloud-shop/cloud-shop.ts)
- [miniprogram/pages/customer-settings/customer-settings.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/customer-settings/customer-settings.ts)
- [miniprogram/pages/delivery/delivery.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts)
- [miniprogram/pages/delivery-proof/delivery-proof.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery-proof/delivery-proof.ts)
- [miniprogram/pages/index/index.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts)
- [miniprogram/pages/logs/logs.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/logs/logs.ts)
- [miniprogram/pages/merchant-login/merchant-login.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/merchant-login/merchant-login.ts)
- [miniprogram/pages/order-detail/order-detail.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/order-detail/order-detail.ts)
- [miniprogram/pages/orders/orders.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/orders/orders.ts)
- [miniprogram/pages/product-detail/product-detail.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/product-detail/product-detail.ts)
- [miniprogram/pages/profile/profile.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/profile/profile.ts)
- [miniprogram/pages/store-code/store-code.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-code/store-code.ts)
- [miniprogram/pages/store-hours/store-hours.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-hours/store-hours.ts)
- [miniprogram/pages/support-chat/support-chat.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/support-chat/support-chat.ts)
- [miniprogram/pages/support-inbox/support-inbox.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/support-inbox/support-inbox.ts)
- [miniprogram/app.ts](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/app.ts)

历史文档只增加版本提示，原审计正文保留：backend/INTEGRATION_READINESS.md、FEATURE_INTEGRATION_STATUS.md、REQUIREMENTS_AUDIT.md和README.md。本阶段不重写需求.md或旧迁移，也不更新原需求完成数来虚增架构完成率。

建议下一阶段先在不发布的前提下完成聊天/凭证固定角色控制器、演示类型解耦及独立构建器，然后另行确定双AppID注册/授权/历史身份方案。当前停止在Phase29，不自动开始Phase30。
