> 历史阶段文档：正文保留原审查时点。Phase29当前最新迁移为018；模块路径/独立构建与双AppID边界以 [APP_SEPARATION_READINESS.md](C:/Users/USER/WeChatProjects/miniprogram-1/backend/APP_SEPARATION_READINESS.md) 为准。未执行迁移或环境验证。

# Stall Miniapp 集成准备审查

审查日期：2026-10-25。项目根目录：`C:\Users\USER\WeChatProjects\miniprogram-1`。

## 1. 结论与审查边界

当前源码已形成顾客目录、待支付订单、商家商品/订单管理、营业配送、账单分析、客服、地址及归档的主要云端调用链。未发现主要业务模块漏注册到服务器，27个已注册页面的TS、WXML、WXSS、JSON文件均存在，源码中的字面量页面导航目标均在页面注册表内。

**这不是“可以直接上线”的结论。** 需要先确认数据库实际结构和迁移记录，解决环境配置与身份授权，协调新版前后端协议，再在单独授权的隔离环境中进行实际验证。支付仍是客户负责的外部依赖。

本阶段只读取当前本地源码、解析文件清单并新增本文档。没有修改任何已有业务源码、旧迁移、配置或状态文档；没有运行测试、类型/语法检查、迁移、服务、容器、部署、Git命令、备份、恢复、清理，也没有访问数据库或R2。此前Phase27的静态检查结果不等于本阶段运行验证。

没有读取真实密钥或检查外部控制台。本地源码无法证明某项环境配置已完成，也无法证明某个数据库已经执行迁移。下面的命令和操作清单仅供后续获得授权后使用，**本次均未执行**。

### 四种状态必须分别记录

| 状态 | 本文含义 | 不能据此推断的结论 |
| --- | --- | --- |
| 源码已实现 | 路由、请求、权限及相关数据处理在当前源码存在；有局部边界则单列 | 接口已在真实服务可用 |
| 配置待完成/核实 | 需要操作者提供或确认数据库、微信、存储、域名和店铺授权 | 仅凭环境变量名或示例文件就算已配置 |
| 迁移未执行/待核实 | 本阶段未执行任何迁移；目标实例实际执行到哪一步未知 | 001—017文件存在就代表数据库已更新 |
| 实际验证未完成 | 尚未连接隔离数据库、微信或R2验证 | 源码阅读或既往静态检查就是功能通过 |

## 2. 阻塞项与优先级

| 编号 | 发现与依据 | 影响和后续处理 |
| --- | --- | --- |
| B01 数据库基线 | 最新服务直接使用008—017的字段、表及触发器。`server.mjs`没有启动时迁移版本闸门；`/health`只执行`SELECT 1` | 启动前由DBA核对实际迁移账本、校验摘要和结构。缺少017会使普通商品创建失败；缺少009会影响启动库存任务。不能以health为全结构验收 |
| B02 新旧协议 | Phase21配送写入要求`expectedRevision`且只接受配送字段；Phase27商品POST强制`clientKey` | 旧客户端可能收到400、409或428。先完成数据库，再启用对应后端和新版客户端；升级窗口内需要运营/网关层的维护安排，不能假设微信缓存客户端已同步升级 |
| B03 云端店铺引导 | `app.ts`不自动写入云端API或店铺；`merchantContext.ts`依赖设备`stall_cloud_catalog_config_v1` | 新设备未配置时进入演示模式。隔离联调可通过“账号与权限”页面保存可信API和slug；面向普通顾客发布前，仍需单独确定可信店铺配置/首次进入机制，不能要求顾客掌握商家配置流程 |
| B04 商家初始授权 | 微信登录只创建会话；001只建表，不创建商户、店铺或`merchant_members` | 操作者需独立授权建立商户、店铺和准确微信subject的角色关联。无成员记录时登录成功仍会403；无启用店铺时公开接口不可用 |
| B05 微信和网络 | 真正的`wx.login`依赖项目AppID、后端`WX_APPID`、`WX_APPSECRET`及服务端微信出站网络；真机还依赖HTTPS和合法域名 | 必须核对同一小程序AppID及实际账号控制台。开发者工具能跳过部分域名限制不代表真机可用 |
| B06 私有凭证 | `privateProofBucket()`要求`PROOF_STORAGE_PRIVATE_CONFIRMED=true`，可使用`S3_PROOF_BUCKET`；这两项不在`.env.example`中 | 未确认时凭证上传/读取返回503。商品图片使用公共域名时，应配置独立私有凭证桶，并验证无公开访问通道；不能只改布尔值就宣称私有 |
| B07 支付外部依赖 | 无可信微信支付创建/回调核验链；报表实收固定为0；履约和库存代码保留支付限制 | 可以联调待支付订单，不能宣称完整收款履约闭环已具备。有限库存待支付订单在held期间不能绕过支付限制接单；送达也需paid。客户负责支付接入，不改状态、不造支付事件进行“验证” |
| B08 营业配送初始化 | 004不填默认店铺业务配置；公开规则缺失时明确不可下单；店铺启用、接单、营业时间、区域、时段分别校验 | 完成商家身份后按第9节设置。只开启`stores.is_active`不足以允许下单；没有区域/时段时不能用前端默认值补齐 |
| B09 迁移工具恢复边界 | `migrate-dev.mjs`在SQL执行完成后另行插入账本记录；没有迁移全局互斥锁 | 若SQL已提交而写账本失败，重跑可能碰到重复结构。只允许运行一个迁移进程；中断后停止，由DBA核对结构和记录，不要重置、重跑全部文件或伪造账本 |

B01—B06、B08是相应云端功能的启用条件，实际环境完成程度尚未核实；B07是完整交易业务的外部阻塞；B09是迁移执行前必须明确的操作风险。本次没有绕过这些条件。

## 3. 001—017迁移顺序和依赖

文件编号连续、没有发现重复编号。正确顺序是**001 → 002 → … → 017**，不是按历史Phase编号执行。下表来自SQL正文，不以文件名或旧README概述代替检查。

| 文件 | 主要结构 | 依赖与注意事项 |
| --- | --- | --- |
| 001_init.sql | merchants、stores、merchant_members、categories、products、orders、order_items、payment_events | 基础外键；商品有`UNIQUE(store_id,id)`供后续复合外键使用。店铺默认未启用；订单币种CNY，初始未支付 |
| 002_auth.sql | auth_sessions及subject/有效期索引 | 基于哈希令牌的统一认证；不提供商家自动授权 |
| 003_checkout.sql | orders幂等键/摘要、联系及配送快照、部分唯一索引 | 依赖001订单；保留当前订单创建重放协议 |
| 004_delivery_rules.sql | store_delivery_rules.configuration JSONB | 依赖stores；Phase20—26共用这一行，不存在第二套营业/配送表 |
| 005_order_workflow.sql | 送达时间、凭证Key、异常原因、order_status_events | 后续库存超时取消会写状态事件；须先于009 |
| 006_product_description_discount.sql | 描述、折扣价格及时间窗、价格/时间CHECK | 旧数据如已有不合法折扣，约束可能拒绝；不能通过删除约束处理 |
| 007_order_estimated_arrival.sql | 预计送达文本及长度CHECK | 依赖orders；与其他多数文件不同，没有显式BEGIN/COMMIT，执行器需明确事务与账本边界 |
| 008_product_drafts_scheduling.sql | stores.time_zone默认Asia/Shanghai、products.publish_at/version、草稿表 | 草稿发布关联使用001的商品复合唯一约束；计划商品必须`active=false`。不能把已到期计划通过直接设active=true代替原服务端可售性规则 |
| 009_product_inventory.sql | 库存字段、预留、追加流水、订单库存状态及到期时间 | 依赖001、005等基础表；为orders补`UNIQUE(store_id,id)`。旧商品默认unlimited。流水UPDATE/DELETE触发器禁止改历史 |
| 010_merchant_product_search_indexes.sql | 商品创建/修改/分类及草稿分页索引 | 依赖008草稿和时间字段；索引构建应评估目标数据量和锁窗口 |
| 011_sales_analytics.sql | 分类历史快照、订单商品分类快照触发器 | 依赖orders/products/categories；只在新订单商品插入时捕获，不回填旧历史分类 |
| 012_merchant_order_query_indexes.sql | 店铺订单状态/创建时间/ID游标索引 | 与001的时间索引有前缀重叠，但不是同名冲突；勿在本阶段擅自删索引 |
| 013_support_messages.sql | 独立顾客会话、消息、序号、幂等与未读索引 | 依赖stores；每店每顾客唯一会话，服务端生成时间；无图片聊天 |
| 014_merchant_archives.sql | 商家归档内容、历史状态及操作限流记录 | 依赖stores；同步有界归档，最大4MiB；不是恢复数据库入口 |
| 015_image_lifecycle.sql | 图片登记、永久历史引用、清理计划/审计、图片快照与触发器 | 依赖008草稿、014归档、005凭证及基础商品订单。会扫描现有业务Key和归档文字并追加登记；不会访问或删除R2，但涉及数据库写入和数据校验 |
| 016_customer_addresses_store_presentation.sql | 身份/店铺地址簿、唯一默认地址、缺图引用类型与触发器 | 必须在015之后：直接修改015生成的`image_reference_history_reference_kind_check`，调用`pin_image_reference`并读取004配置 |
| 017_customer_paging_product_create.sql | 商品创建幂等回执、顾客商品/本人订单游标索引 | 依赖001商品复合外键；按既定顺序在016之后启用，当前商品POST必需该表 |

### 潜在结构与历史数据冲突

1. **不是所有迁移可重放。** 008及以后的大量CREATE/ALTER没有IF NOT EXISTS；009/011/015/016的函数和触发器也不能当作无害初始化重复运行。001的IF NOT EXISTS同样不能证明已有表结构符合预期。
2. **015/016可能因已有图片资料被阻止。** 商品/草稿Key应属于`stores/<所属店铺UUID>/products/<UUID>.<jpg|png|webp>`；凭证属于`delivery-proofs/<店铺UUID>/<订单UUID>/<UUID>.<ext>`。015回填至少校验店铺前缀和图片类型；未来凭证写入及读取还校验订单前缀。历史跨店铺共享Key、任意URL、错误类型，或全局唯一object_key被另一店铺占用，会使登记或pin失败。016对已有缺图Key也会追加登记和pin。须在获授权的目标环境只读核对，不能猜测修复、删引用或放宽触发器。
3. **存在数据扫描和锁成本。** 015扫描products、product_drafts、orders及仍有content的merchant_archives；016扫描缺图配置；010/012/017使用普通CREATE INDEX。数据量大的实例需DBA评估执行时长、DDL锁和维护窗口。
4. **历史快照不可补造。** 011以前缺少可靠分类快照的订单归为未知历史分类；015以前不能从当前图片推断全部历史订单图片。不得把当前商品价格/名称/分类重新写进旧订单当作修复。
5. **追加历史会限制维护行为。** inventory_movements、image_reference_history、image_cleanup_audit不能普通UPDATE/DELETE。后续恢复或保留策略必须单独设计，不能用普通页面覆盖历史。
6. **未发现按序应用于规范空库时显然缺失的父表、复合外键唯一约束或同名新对象冲突。** 这是静态依赖结论，不是已在PostgreSQL执行成功。016依赖自动生成约束名；人工改过结构的实例应特别核对。
7. 010的商品创建时间索引使用`created_at DESC,id ASC`，017使用`created_at DESC,id DESC`；用途/排序不同，不是重复名称错误，但会增加写入与存储成本。是否合并需另行实测，不在本次修改。

### 迁移执行器与版本说明

- 当前开发执行器只接受localhost/127.0.0.1/::1上的`stall_dev`，要求`CONFIRM_DEV_MIGRATIONS=YES`，按001—017检查文件前缀及已应用文件SHA-256。没有账本但已有public表时拒绝操作。
- 它不是生产迁移工具。已有未登记数据库需先做受控基线核对；不能靠重命名库、删表、编辑旧SQL或盲目补记录绕过。
- 单个SQL完成与`stall_schema_migrations`记账分开提交，有中断窗口；账本存在也应核对摘要与结构。后续应另行授权改进迁移锁和原子记账，本次只记录。
- `preflight.mjs`仍将“5个迁移、最后005”作为旧预期，仅给出warning；不能用它确认017已就绪。README和早期Phase文档也保留旧请求样例/旧迁移上限，以当前源码及本文为准。
- 商家归档`manifest.version=1/schemaVersion=14`是现有逻辑导出格式的校验值，预检查同样严格匹配14；它不是数据库迁移账本。不要为了“对齐017”直接改归档JSON，否则预检查会拒绝。系统备份元数据的`expectedApplicationSchemaVersion=17`同样不证明真实数据库已升级。

## 4. 后端路由注册和前端路径核对

下表用`P=/v1/stores/:slug`、`M=/v1/merchant/stores/:slug`缩写。id为稳定UUID；动态路径的权限仍在服务端判断。清理相关路径仅列清单，本阶段及后续基础集成步骤都不执行。

`server.mjs`依次调用support、merchantArchives、imageManagement、customerAddresses、inventory、catalog、checkout、orderWorkflow、billing、salesAnalytics、delivery-rules、business-settings，再处理auth、health和公开products。精确匹配和未命中返回false保留分发关系。checkout明确将GET orders让给orderWorkflow，避免拦截顾客历史列表。

| 方法及路径 | 服务端处理 | 小程序调用方/入口 | 静态结论 |
| --- | --- | --- | --- |
| POST /v1/auth/wechat；GET /v1/auth/me；POST /v1/auth/logout | server + auth | authApi、merchant-login；地址/客服登录 | 已注册；me无独立主界面入口，但不是遗漏 |
| GET /health | server | 维护用 | 已注册；只有数据库连通性，不是完整就绪状态 |
| GET P/products | server | remoteApi；首页、详情、购物车；旧预览页 | 已注册；Phase27分页及ids协议见第7节 |
| POST P/orders | checkout | cloudCheckout、checkout | 已注册；认证、Idempotency-Key、快照、库存和最新配送校验 |
| GET P/orders；GET P/orders/:id | orderWorkflow | customerOrdersApi、orders、order-detail | 已注册；当前顾客及店铺范围，列表默认20笔 |
| GET P/orders/:id/proof | orderWorkflow | cloudProofRead、delivery-proof | 已注册；本人订单、已送达、私有对象核对后短链接 |
| GET/POST M/categories；PATCH/DELETE M/categories/:id；PATCH M/categories/order | catalog + categoryManagement | merchantCategoriesCloud、admin-categories；旧诊断 | 已注册；排序强制revision，旧普通写可选revision有兼容边界 |
| GET M/products[/:id]；POST M/products；PATCH/DELETE M/products/:id | catalog | cloudMerchantProducts、商品表单、批量；旧诊断 | 已注册；POST强制创建键；DELETE是软下架，保留历史 |
| GET M/product-search | catalog + merchantProductSearch | cloudMerchantProducts、admin-products | 已注册；正式管理页服务端筛选分页，不使用旧首500条列表代替 |
| GET/POST M/drafts；GET/PATCH/DELETE M/drafts/:id | catalog + productDrafts | 商品表单/列表 | 已注册；正式发布仍使用POST products并携带来源草稿版本 |
| GET/POST M/products/:id/inventory | inventoryRoute | 商品表单库存与流水 | 已注册；独立库存版本、操作键；流水读取最近100条 |
| POST M/image-uploads；POST M/image-uploads/:id/complete | catalog + imageLifecycle | cloudMerchantImage；正式表单/缺图设置 | 已注册；签名PUT至R2，然后完成验证；不是multipart uploadFile |
| GET M/orders；GET M/orders/summary；GET M/orders/:id | orderWorkflow + merchantOrderQuery | merchantOrdersCloud、admin-orders、工作台、送达页 | 已注册；服务端列表分页与全店汇总 |
| POST M/orders/:id/status；PUT M/orders/:id/eta | orderWorkflow | merchantOrdersCloud、merchantEtaCloud、admin-orders | 已注册；批量复用逐单API，没有批量删除或越过状态机 |
| POST M/orders/:id/proof-upload；POST M/orders/:id/complete；GET M/orders/:id/proof | orderWorkflow | merchantProofCloud、cloudProofRead | 已注册；凭证上传、送达确认和短时读取分别处理 |
| GET M/billing；GET M/billing/export | billing | admin-billing、admin-backup、诊断页 | 已注册；正式页面export使用format=json后安全保存分享CSV；旧诊断可走下载接口 |
| GET M/analytics；GET M/analytics/export | salesAnalytics | salesAnalytics工具、admin-analytics | 已注册；page/snapshot、日期、分类与导出协议一致 |
| GET P/business-settings；GET/PATCH M/business-settings | deliveryRules | businessCloud；工作台、营业、标签、缺图和公开展示 | 已注册；管理写入是局部PATCH，不覆盖配送字段 |
| GET P/delivery-rules；GET/PUT M/delivery-rules | deliveryRules | cloudCheckout、cloudDelivery；配送/地址/结算/购物车 | 已注册；商家PUT仅配送字段，需expectedRevision |
| GET/POST P/addresses；PATCH/DELETE P/addresses/:id | customerAddresses | cloudAddresses、addresses、checkout选择 | 已注册；顾客身份+店铺隔离，更新/删除需版本；没有GET单地址需求 |
| GET P/support/conversation、messages、unread；POST P/support/messages、read | support | supportCloud、support-chat、profile | 已注册；本人会话、消息序号分页、发送幂等、已读水位 |
| GET M/support/conversations、unread；GET/POST M/support/conversations/:id/messages；POST M/support/conversations/:id/read | support | supportCloud、support-inbox、商家聊天/工作台 | 已注册；授权店铺指定会话，不以顾客名字路由 |
| GET/POST M/archives；GET M/archives/:id/download；POST M/archives/preflight | merchantArchives | merchantArchivesCloud、admin-backup | 已注册；仅owner；下载返回受认证保护的JSON文件内容，不是公开静态URL；没有生产恢复API |
| GET M/images、M/images/:id/references；POST M/images/scan、M/images/check | imageManagement | cloudMerchantImage、商品管理中的图片管理 | 已注册；权限/数量限制，扫描和check本身可写登记/审计，不属于纯只读环境操作 |
| GET/POST M/image-cleanup/plans；GET M/image-cleanup/plans/:id；POST :id/approve、:id/execute | imageManagement | 工具封装/运维授权；普通商家不提供执行入口 | 已注册；执行有独立审批和默认关闭闸门，禁止为联调打开 |

本次没有发现正式业务工具构造了不存在的主API路径。路径一致不证明HTTP状态、SQL、网络与微信环境都已验证。功能API没有统一`/v2`版本或全局schema就绪检查，因此新旧协议协同尤其重要。

## 5. 身份、权限与店铺隔离

### 统一身份链

1. 小程序`wx.login`获取code，`POST /v1/auth/wechat`由后端使用自身AppID/Secret调用微信jscode2session。
2. 服务端subject为`wx:<AppID>:<openid>`，不是顾客传来的姓名/手机号；不信任前端角色、customerId或storeId。
3. 随机会话token以SHA-256存库，默认7天；每次私有API检查未撤销和未过期。微信session_key不返回小程序。
4. 顾客与商家共用`stall_server_session_v1`和同一认证体系。商家权限额外来自`merchant_members`；顾客地址、订单、会话按认证subject与店铺条件查询。
5. `cacheScope`是服务端基于subject生成的稳定非凭证缓存命名空间；购物车/待确认创建等按API、slug、scope隔离，不将token放入业务缓存键。

### 角色矩阵与边界

| 能力 | 当前服务端权限 |
| --- | --- |
| 公开商品、营业和必要配送信息 | 无需登录，只读，店铺需启用；不返回内部配送中心坐标 |
| 地址、顾客订单、客服 | 当前认证顾客；订单详情/凭证必须属于本人，店铺范围固定 |
| 商品、分类、草稿、库存、营业/配送、账单/分析 | owner或manager |
| 商家订单列表/汇总/详情、凭证读取、客服 | 有该商户成员关系；staff可读取订单/凭证并处理客服，订单状态/ETA/送达写入需owner或manager |
| 归档生成/历史/下载/预检查 | owner |
| 图片登记读取/引用查询 | owner或manager；扫描、检查和清理计划管理进一步限制owner |
| 清理批准/执行 | 还需平台操作者subject白名单、非计划创建人、独立审批及执行闸门；本次不使用 |

**成员关系实际是商户级授权。** `permittedStore`经`stores.merchant_id`关联`merchant_members`，同一商户下多店铺会向同一成员开放；不是“一成员仅授权其中一家店”的独立ACL。请求仍按选定store.id查询，不是任意跨店查询。若运营需要同商户内逐店授权，这是尚未实现的额外权限需求，不能靠前端隐藏店铺实现。

`merchant-login`用categories读取验证管理权限，故staff可能显示登录未通过，尽管其服务端会话可用于订单只读/客服。应先确定人员角色，不能为了解决界面问题自动升为owner。

### 配置与缓存的操作注意

- token当前只有一个设备存储键，不按API服务器拆分。**切换到另一API服务器前应在旧API配置下退出登录，再保存可信的新API地址并重新登录**；否则可能把旧token发往新地址，且不能确认旧服务端撤销。
- 切换同一API的店铺不等于切换顾客身份。服务端仍重新授权；页面普遍以API/slug/token和请求序号丢弃旧响应，但仍需实际验证逐页切换。
- 普通顾客无需商家成员记录，能在地址页或客服页微信登录。历史订单页目前只有读取失败提示/重试，没有直接登录按钮；可先到“我的→收货地址”登录，再返回订单。
- 无效云端配置会被`getMerchantContext()`视为未配置而进入演示；有效配置下网络失败不会自动改读演示业务。集成时须确认页面实际显示的是云端来源，不能把无效配置导致的演示模式误判为云端成功。
- store启用检查有意不完全相同：公开目录/下单/顾客客服要求启用，商家管理允许维护未启用店；顾客历史订单和地址读取不以商店启用作为丢失本人历史的理由。这不是跨店权限放宽。

## 6. 配置依赖清单

当前只核对配置消费代码和示例，不确认任何真实值。服务器使用`process.env`，没有dotenv或自动加载`.env`的代码；`npm start`本身也没有`--env-file`。仅创建`.env`文件不会自动生效，需由运行环境明确注入。

| 配置/基础设施 | 用途与前置条件 | 未完成时影响 |
| --- | --- | --- |
| Node.js及npm依赖 | package声明Node >=20，依赖pg、AWS S3客户端和签名库；backend/package-lock固定依赖树 | 缺依赖无法导入/启动。根目录TypeScript依赖不替代后端依赖 |
| PostgreSQL | compose开发基线postgres:16-alpine；支持原生gen_random_uuid、JSONB、生成列、identity、触发器、事务锁 | 旧版本或受限权限可能无法建结构；本次未验证版本/权限 |
| DATABASE_URL | 目标环境单独数据库；数据库账号具备相应运行权限，迁移由受控账号操作 | server启动即要求此变量；URL不能误指生产或其他业务库 |
| PG_SSL | `true`时pg使用rejectUnauthorized验证数据库TLS | 与HTTP反向代理HTTPS是两条连接；不能因为API用了HTTPS就认为数据库TLS已配置 |
| HOST / PORT | 默认127.0.0.1:8787，前置HTTPS反向代理或适合隔离环境的监听配置 | 容器/远端绑定127.0.0.1可能无法从外部访问；不要直接暴露数据库端口 |
| WX_APPID / WX_APPSECRET | 必须对应当前project.config.json的小程序AppID；Secret仅放后端 | 微信code无法换取正确subject，商家成员和顾客历史身份无法匹配。更换AppID会改变subject，不能直接沿用旧成员授权 |
| S3_ENDPOINT / S3_REGION | R2 S3 API endpoint；region默认auto | 签名及HEAD读取失败；endpoint不是商品公开图片域名 |
| S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY | 商品图片桶；限定目标桶范围的凭证；运行链需PUT/HEAD/GET对应权限 | 商品图片和自定义缺图上传/保存失败。常规业务不需要为联调赋予删除对象权限 |
| IMAGE_PUBLIC_BASE_URL | 公开商品/缺图图片HTTPS域名，指向商品桶内容 | 无图片URL或无法读取；自定义缺图模式保存会被拒绝。不能接入私有订单凭证桶 |
| S3_PROOF_BUCKET | 建议独立私有凭证桶，代码可回退S3_BUCKET，但公共商品桶场景不应使用该回退 | 凭证若公共可读会破坏授权边界；须核对registry中已有对象的storage_bucket，改变量不会自动迁移旧对象 |
| PROOF_STORAGE_PRIVATE_CONFIRMED | 只能在实际核对凭证桶和所有公开网关策略后设true | 不设时凭证相关接口安全拒绝503；该变量只是操作者确认，不会自动关闭公开URL |
| 微信request合法域名 | API HTTPS域名；图片/凭证PUT使用`wx.request`，还涉及R2签名endpoint | 真机请求失败；不能只登记API域名或误按wx.uploadFile的multipart流程配置 |
| 微信download/图片读取域名 | 商品公共图片域名、凭证签名GET域名、旧诊断CSV下载涉及API域名 | 图片/凭证/下载失败；应按实际调用和账号控制台能力核实 |
| 微信地图/隐私权限 | app.json声明chooseLocation；地址页使用位置选择，需账号隐私说明、基础库和设备能力匹配 | 有地图范围的地址无法完成位置选择。服务端几何校验仍只验证提交坐标，不证明真实地理位置 |
| R2 CORS/网络 | 允许所需客户端来源、PUT与Content-Type等实际签名请求；后端可访问R2和微信 | CORS或签名头不符会失败；开发者工具成功不证明真机请求域名可登记 |

域名备案、证书、微信账号可登记范围和R2原生endpoint能否被目标账号接受均**未核实**。若实际账号不允许当前签名上传/读取域名，需要另行授权设计受控网关或上传路径；本次没有部署代理，也不假称“配置CORS即可解决所有域名限制”。

`.env.example`中的URL示例是本地5432的`stall`，而compose使用本地55432的`stall_dev`，迁移工具只接受`stall_dev`。必须明确选同一目标，不能照抄不同示例混用。`S3_PROOF_BUCKET`、`PROOF_STORAGE_PRIVATE_CONFIRMED`等运行变量未列入示例；这是文档/配置模板缺口，本阶段不修改示例。

### 必须保持关闭或单独管理的配置

`IMAGE_CLEANUP_EXECUTION_ENABLED`、`IMAGE_CONDITIONAL_DELETE_VERIFIED`、`IMAGE_BACKUP_INVENTORY_CONFIRMED`保持未设置/false；`IMAGE_CLEANUP_OPERATOR_SUBJECTS`不为普通集成账号配置。不能为消除423错误而打开闸门。

备份脚本另用`R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET`、`BACKUP_SET_ID`等，与业务`S3_*`不是自动同步配置；将来还要分别覆盖公共商品桶和私有凭证桶。`backup-r2.mjs`会写数据库引用保护，绝不是只读连通性检查；所有backup/verify/restore/cleanup脚本本阶段都未运行，也不属于下面的启用操作。

## 7. 新版前后端协议与升级顺序

### Phase21：营业与配送共享版本

- 两个端点读的是同一`store_delivery_rules.configuration`；revision是数据库JSONB文本的MD5，**不是updatedAt，也不是按页面分开的版本号**。
- `GET M/delivery-rules`返回configured/rules/revision；`PUT`必须包含expectedRevision以及areas、slots、specialDates、deliveryPaused中的配送字段。旧`{rules:{...}}`或直接提交整套含accepting/days的对象会400。
- `GET M/business-settings`返回营业字段和revision；`PATCH`只接受expectedRevision以及营业、公告、起送、备注标签、缺图字段。
- 初次创建传expectedRevision=null；两种写入都锁stores行及已有配置行，核对版本后局部合并，避免初始插入和多设备更新丢数据。
- 另一设备甚至另一设置页面修改任一配置字段都会使旧revision过期，这是预期的保守冲突。409后重新GET、让商家核对输入再保存，不能悄悄换成最新revision强行覆盖。
- 区域/时段ID稳定，星期按星期日=0到星期六=6；数组顺序承担区域显示排序。最多30区域、30时段、366特殊日期；不支持跨日时段，结束须晚于开始。
- 暂停接单、暂停全部配送、区域暂停、时段暂停、指定日期暂停分别保存；下单服务端仍按最新配置校验。

### Phase27：顾客分页及商品创建

- `GET P/products`：limit默认30、最大50，q最长100、category稳定UUID、cursor；响应保留products并新增categories/hasMore/nextCursor。ids最多40个，与目录查询参数互斥，保留购物车/详情按ID读取。已下架及未来计划仍由服务端公开规则排除。
- `GET P/orders`：认证必需，limit默认20、最大50；tab为all/unpaid/active/completed/other。响应orders/hasMore/nextCursor/counts，counts覆盖本人该店完整历史，不是当前页。
- 游标排序为created_at DESC,id DESC，数据库时间保留六位微秒，绑定店铺/查询及订单身份摘要；不用offset模拟前200件。游标不是连续请求期间的数据库快照；数据变化后刷新。
- 新前端remoteApi会检查categories、hasMore等新字段；新前端连旧服务器可能直接拒绝响应。旧前端连新服务器即使能显示products，也只会读默认第一页，不代表完整分页兼容。
- `POST M/products`必须携带body.clientKey，16—100字符且限字母、数字、下划线、短横线；不能误用订单的Idempotency-Key请求头替代。缺失/非法键返回428，不静默接受无保护创建。
- 回执由(store_id,actor_subject,client_key)唯一约束保护，与商品创建、初始库存、来源草稿发布在同一事务提交。同键同JSONB请求返回原商品ID；不同请求409。重放先于动态图片/未来时间校验，避免超时后时间已经到达而重复创建。
- 新建、复制、草稿发布继续共用原POST；修改仍PATCH，保留商品版本/库存版本，不改变图片关联或历史订单。
- 前端在发请求前按API/店铺/cacheScope/创建意图保存原内容和键；网络未确认时可重试原内容，成功后清理。未确认内容变更先阻止，商家需重试原内容或核对列表后明确放弃键。清除设备存储、主动放弃、跨新意图不是同一请求，不能承诺跨这些行为去重。
- cacheScope依赖服务器同一AppID身份；旧/开发登录的非稳定缓存范围不等于真实微信跨登录重试保证。

**升级顺序：数据库兼容结构完成 → 新后端准备完成 → 同协议小程序连接 → 隔离环境人工验收 → 再单独决定真实环境发布。** 没有实现自动回滚、不兼容协议协商或生产恢复。迁移回退不能靠旧前端触发，也不能通过删除数据强行适配。

## 8. 页面与遗留入口核对

| 范围 | 当前源码状态 | 集成时的边界 |
| --- | --- | --- |
| 顾客首页/分类/搜索、详情、购物车、结算 | 正式云端目录和待支付创建链已接通；Phase27首页可续页 | 需先配置可信API和slug；配送、库存、门槛最终由服务器判断 |
| 我的地址 | 云端CRUD、默认、版本和登录按钮具备 | 当前店铺分簿；需有效配送规则才能正常选择区域，不自动上传本地地址 |
| 我的订单/详情/凭证 | 本人列表分页与详情/短链读取具备 | 列表没有直接登录按钮；先从地址/客服页登录。凭证受私有桶和支付履约依赖限制 |
| 商家工作台 | 商品、订单、分类、营业、配送、标签、缺图、账单、分析、客服和归档入口存在 | 不会自动授予角色；待处理数是真实summary，不等于待支付可以立即接单 |
| 商品新增/复制/草稿/计划/库存/批量 | 主表单及列表请求具备 | 批量复用原单品接口；草稿独立，不复制库存余额/定时计划；017前不能启用普通创建 |
| 客服 | 顾客与商家独立会话、分页、未读和前台轮询已接通 | 无推送、WebSocket、图片聊天；隐藏页停止轮询。不能把离线无推送描述成消息丢失 |
| 云端归档 | 导出、历史、受权下载、预检查具备 | 工作台“备份与恢复”的旧入口名称容易误解；云端分支明确没有覆盖恢复，演示恢复有getMerchantContext拦截 |
| cloud-shop、cloud-catalog | 早期预览/维护诊断页仍注册 | 公开预览只读第一页30件，旧商家products最多500，诊断订单默认第一页；完整功能用正式首页/管理页。诊断新增已转正式表单 |
| 旧诊断图片上传 | 签名PUT后显示本地预览，但没有像正式工具那样显式调用image-uploads/:id/complete，也未传上传clientKey | 后续保存商品仍由服务端imageExists/HEAD验证，不能当作绕过安全检查；诊断上传重试与反馈不等于正式流程能力。日常经营使用正式表单 |
| customer-settings | 只保存设备通知偏好，说明不会自动发送微信通知 | 合理本机状态，不是已实现订阅消息。购物车、临时结算和创建重试键也允许保留在隔离设备缓存 |
| 本机演示结算 | 独立本机数据，保留原流程 | 本机完成路径仍有redirectTo指向orders这个tabBar页的潜在导航问题；未运行验证，须另行授权处理，不属于本次云端路由修复 |

没有发现字面量导航目标漏注册；动态参数、路由调用方式、按钮状态和微信平台行为仍需实际验证。商品表单存在旧“图片尚未接通”防御分支文案，但正式上传方法已调用现有云端工具并同步图片Key/预览，不能仅凭这条旧文案认定整个图片功能未实现。

## 9. 后续正确启用顺序（必须另行授权）

下面各步都有明确前提和交付物；遇到未满足项停止该依赖分支，不使用演示数据掩盖失败。当前阶段仅形成步骤，没有执行任何一步环境操作。

### 步骤1：选定隔离环境与责任人

- 明确开发数据库、开发R2商品桶/私有凭证桶、微信AppID、API域名、商家owner身份、店铺slug和操作负责人。
- 确认不会复用生产数据库连接、存储密钥或真实顾客资料；所有服务进程尚未启动。
- 记录现有实例是否为空、是否有stall_schema_migrations及历史应用来源。既有实例先获授权只读盘点，不允许拿本地迁移工具试跑来探测。
- 交付：环境配置表、授权边界、迁移及中断处置负责人，不含明文密钥。

### 步骤2：初始化数据库并核对001—017

仅适用于**另行授权的新建、可丢弃本地开发库**的命令模板：

```powershell
Set-Location 'C:\Users\USER\WeChatProjects\miniprogram-1\backend'
# 只有明确授权后才启动开发数据库；此命令会创建/写入容器卷。
docker compose -f compose.dev.yml up -d postgres

# 通过受控运行环境提供真实开发密码；不要把占位符原样使用。
# 密码中的URL保留字符需要百分号编码。这里的库名/端口须与compose一致。
$env:DATABASE_URL = 'postgresql://stall_dev:REPLACE_WITH_DEV_PASSWORD@127.0.0.1:55432/stall_dev'
$env:PG_SSL = 'false'
$env:CONFIRM_DEV_MIGRATIONS = 'YES'
npm run migrate:dev
```

执行前还需在同一backend目录安装已审核的锁文件依赖，例如由操作者另行授权执行`npm ci --ignore-scripts`；没有依赖时迁移脚本也无法导入pg。这不是要求本阶段安装依赖。

迁移工具不是生产初始化方案。如果已有未登记表、摘要不匹配、迁移中断或015/016引用失败，停止并由DBA核对，不要reset、删库、删约束或重新执行全部SQL。目标是账本按001—017连续、摘要匹配，且新表/字段/触发器真实存在；不能只记录命令退出成功。

迁移后撤销当前shell的`CONFIRM_DEV_MIGRATIONS`等一次性授权环境变量，避免后续误用。远程或既有数据库的迁移方式由DBA另行审批；本模板不适用。

### 步骤3：准备业务身份与店铺，不伪造支付

- 由授权操作者建立merchant和store，明确slug、名称、Asia/Shanghai；`is_active`初期可保持false。
- 配置真实微信凭证，取得同AppID下操作者的可靠openid/subject后，再由管理员将其绑定merchant_members的owner或manager。普通页面无自助商家注册接口，登录成功不代表可以自动开户。
- 开发会话脚本`issue-ui-session-dev.mjs`会写成员和会话，要求本地stall_dev、启用的stall-demo及明确开关；它不能证明真实微信登录成功，也不能用于生产授权。本阶段不运行它。
- 不插入虚假paid订单、payment_events或手工修改库存状态来凑通履约。
- 交付：真实身份来源和角色映射已被管理员确认，仍不记录token/Secret到本文。

### 步骤4：准备R2、HTTPS与微信域名

- 商品桶用于公开展示；凭证桶必须私有。对照第6节核对S3_*、公开图片域名和私有存储确认变量。
- 为API配置HTTPS终结、可信证书和正确监听/反向代理规则；代理保留Authorization、Idempotency-Key、Content-Type，不把带身份的JSON/凭证接口公共缓存。
- 按实际微信账号要求登记request/download/图片域名；签名URL不应被代理重写、删除查询参数或输出到访问日志。核对私有凭证不经商品公开域名暴露。
- 不打开清理执行闸门，不安排定时备份，不为基础集成调用任何扫描/备份/清理API。
- 交付：配置依赖逐项有负责人确认；“已填变量”和“真机已验证”分别记录。

### 步骤5：启动隔离后端

确认001—017、目标连接和权限全部就绪后，再由操作者明确注入环境变量。在backend目录使用当前入口：

```powershell
# 仅是后续授权启动模板；当前审查没有执行。
Set-Location 'C:\Users\USER\WeChatProjects\miniprogram-1\backend'
# 前提：DATABASE_URL、微信和S3等已通过受控进程环境注入。
npm start
```

**启动不是只读动作。** `server.listen`回调立即调用startInventoryWorker，随后约每30秒处理到期预留；它可能释放库存、取消符合规则的未支付订单、写库存流水及状态事件。不能把启动当成安全的生产连通性探测。当前没有启动前自动迁移或只读启动模式。

由操作者随后读取`GET /health`仅确认网络/数据库连通，再读取具体业务接口确认结构和协议。health正常不足以解除B01。服务端错误日志仅可查看错误类型/码，不能转存顾客信息、消息正文、token或签名URL。

### 步骤6：连接对应版本小程序

- 微信开发者工具打开原项目，保留当前AppID和已有页面设计，确认与后端WX_APPID一致；不要新建第二个小程序。
- 通过现有商家工作台“账号与权限”保存可信apiBase和storeSlug。开发者工具的loopback例外只允许localhost/127.0.0.1:8787；它不是手机真机可访问地址。后端改PORT后也不能假设客户端HTTP例外随之改变。
- 微信登录后核对权限。普通顾客可在“我的→收货地址”或客服页登录；商家还需管理员成员映射。
- 未配置云端时继续显示演示，这不是失败回退；有效云端配置遇到401/403/503必须显示真实错误。切换API前先在旧地址退出会话。
- 新前端和新后端同协议连接；不得临时移除revision、clientKey或失败检查来兼容旧接口。

### 步骤7：按依赖配置商家业务

1. 先读取营业配置和revision，保存营业时间、公告、起送金额、备注标签等，接单可先保持关闭。
2. 进入配送页重新GET最新revision，配置稳定区域ID、启用时段、星期/区域关联、特殊日期。保存时只写配送字段，遇409重新读取核对。
3. 建分类，再用正式商品表单建立商品/草稿、库存及图片；普通创建必须有clientKey及017。图片走上传签名→PUT→完成验证→商品保存，失败不清理原图。
4. 必要时设置云端缺图样式；自定义图依赖已登记对象与公开图片域名。
5. 管理员按授权启用store，再由商家在正确营业时间恢复接单与配送。它们是不同开关，不互相替代。
6. 顾客刷新目录和配送/营业信息，登录、保存自己的地址、选择有效区域/时段，再创建**待支付**订单。无规则或库存不足应被拒绝。

交付：同店铺数据源一致，营业/配送互不覆盖，已有订单快照不会因设置更新变化。没有授权支付接入时，只验收到待支付/到期释放边界。

### 步骤8：单独授权后进行人工集成验收

本次不执行验收，也不编写自动化测试。后续操作者可按下面顺序在隔离环境人工核对并记录结果：

| 人工核对范围 | 预期结果/停止条件 |
| --- | --- |
| 真实微信登录、过期/退出、普通顾客与商家身份 | 顾客不能读管理接口；owner/manager/staff符合角色矩阵；退出后私有数据不可继续读取 |
| 不同顾客、不同店铺、不同API切换 | 无旧账号订单/地址/消息串入；无授权请求不返回他人资料；不能仅凭修改slug获得权限 |
| 两设备分别编辑营业和配送 | 旧revision收到409；重新读取核对后保存，不自动覆盖其他字段 |
| 商品新增/复制/草稿发布重复点击或结果不明重试 | 同一请求返回同一商品ID；内容不同不会悄悄换键新增；成功后清理对应设备重试状态 |
| 商品/订单超过一页 | 续页追加、排序稳定、无重复；筛选/搜索重置；旧响应不覆盖新查询；分类数量为完整本人订单统计 |
| 草稿、未来计划、售罄、有限零库存 | 公开展示与购买限制符合原规则；下单服务端拒绝不可售商品，不因计划到期解除手动售罄 |
| 未支付预留到期/取消 | 按现有规则单次释放，不重复加回，不将预留流水当收入 |
| 图片替换/共享、凭证读取 | 原图不因保存失败失效；凭证仅本人/授权商家短链读取；无公共桶泄露，不运行清理 |
| 账单/分析/客服 | 中文、CNY、北京时间；实收不冒充收入；独立会话、分页和未读符合身份；失败不读取演示记录 |

导出、归档、恢复预检查、图片扫描等会写记录或访问对象；本阶段不执行。若后续要验收这些能力，需另行明确授权、隔离数据和操作范围；商家JSON归档不能当作数据库+图片灾难恢复证明。

## 10. 支付模块的责任边界

支付由客户负责，属于外部依赖。当前仓库没有可信支付成功核验链；顾客订单创建只返回unpaid，有限库存预留15分钟，后台任务按现有规则释放。payment_status字段存在、订单被接单/配送、库存减少都不是收款证据。

账单、经营分析和归档摘要目前将可信实收/已确认收款统计保持0。即使外部将数据库标签写为paid，也不能假定现有报表会自动成为可信收入报表。支付接入方将来需独立协调订单金额、幂等事件、库存预留和收款统计口径；本阶段不设计或实现支付/退款，不提供伪造成功办法。

## 11. 功能就绪矩阵

表中“迁移未执行”只表示本阶段没有执行，真实实例进度均需核实。

| 功能 | 源码实现 | 配置待完成/核实 | 迁移依赖（本阶段未执行） | 实际验证 |
| --- | --- | --- | --- | --- |
| 统一登录与商家授权 | 已实现；商家初始授权不是自助开户 | 微信AppID/Secret、成员映射 | 001、002 | 未完成 |
| 商品/草稿/计划/库存/创建幂等 | 已实现主链及分页/批量/复制保护 | 店铺角色、图片存储、同版客户端 | 001、006、008—010、015—017 | 未完成 |
| 顾客目录与本人订单分页 | 已实现；旧诊断仍有限预览 | 可信API和slug、顾客登录 | 001—009、017索引 | 未完成 |
| 待支付下单、预留及释放 | 已实现；不含真实支付 | 营业/配送/库存、可写隔离DB | 001—009、011、015 | 未完成；启动有写入 |
| 营业/配送/起送/备注标签 | 已实现共同配置版本与服务端校验 | 同版前端、首次配置 | 004；完整当前服务使用001—017 | 未完成 |
| 云端顾客地址/缺图设置 | 已实现 | 身份、区域、地图和图片域名 | 004、015、016 | 未完成 |
| 商家订单/账单/经营分析 | 已实现；可信收款保持0 | 授权、日期范围、数据规模 | 001—012及图片相关后续结构 | 未完成 |
| 云端文字客服 | 已实现；无推送/附件 | 会话登录、页面前台轮询 | 013及基础身份店铺 | 未完成 |
| 导出/归档/恢复预检查 | 已实现有界导出；没有生产恢复 | owner权限、大小限制、对象状态 | 014—016及业务表 | 未完成；本阶段禁止实际生成/预检查 |
| 商品图片/私有送达凭证 | 已实现登记与授权读取；清理执行受控关闭 | 公共/私有桶、域名、确认变量 | 005、015、016 | 未完成；不运行清理 |
| 系统备份和灾难恢复 | 只有脚本与元数据/校验基础，恢复能力未演练 | 独立运维授权、DB及全部桶覆盖 | 015引用保护；应用预期版本017 | 未完成；不运行脚本 |
| 支付/退款/可信收款闭环 | 本阶段不实现，客户负责 | 客户提供可信支付接入 | 不应从payment_events表存在推断已接入 | 未完成，外部依赖 |

## 12. 后续操作的完成记录模板

后续负责人分别填写，不用一句“联调通过”替代：

| 记录项 | 需记录的证据 | 当前状态 |
| --- | --- | --- |
| 环境目标 | 隔离环境标识、库/桶名称、AppID与slug对应关系；不含密钥 | 待配置/核实 |
| 迁移 | 001—017账本、摘要、关键结构及中断处置结论 | 本阶段未执行，实际进度未知 |
| 服务 | 源码版本基线、依赖安装、进程环境、启动副作用授权、业务接口结果 | 未启动/未验证 |
| 微信 | 合法域名、真实登录、页面数据来源、真机图片/位置能力 | 未验证 |
| 安全与并发 | 顾客隔离、商户多店授权边界、版本冲突、创建重放、库存规则 | 仅源码具备，未实际验证 |
| 外部支付 | 客户责任人及另行交付范围 | 外部依赖，未由本阶段处理 |

准备工作到本文档交付为止。下一步应先确定获授权的隔离环境及B01—B08依赖，再申请实际迁移/启动/人工验收范围；不会自动进入环境操作或下一开发阶段。

## 13. 主要源码依据

以下均为本地当前文件，不使用远程main覆盖或推断工作区状态：

- [服务器注册与启动](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs)、[统一认证](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs)、[店铺上下文](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantContext.ts)。
- [营业配送](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs)、[前端配送协议](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudDelivery.ts)、[营业配置协议](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/businessCloud.ts)。
- [商品创建与权限](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs)、[创建重试状态](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/productCreateRetry.ts)、[017迁移](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/017_customer_paging_product_create.sql)。
- [订单工作流](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs)、[下单](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs)、[库存任务](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/inventory.mjs)、[顾客地址](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/customerAddresses.mjs)。
- [客服](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/support.mjs)、[账单](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/billing.mjs)、[分析](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/salesAnalytics.mjs)。
- [图片生命周期](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/imageLifecycle.mjs)、[清理闸门](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/imageManagement.mjs)、[归档](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantArchives.mjs)、[归档格式](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantArchiveFormat.mjs)。
- [开发迁移工具](C:/Users/USER/WeChatProjects/miniprogram-1/backend/scripts/migrate-dev.mjs)、[旧预检脚本](C:/Users/USER/WeChatProjects/miniprogram-1/backend/scripts/preflight.mjs)、[环境示例](C:/Users/USER/WeChatProjects/miniprogram-1/backend/.env.example)、[开发数据库配置](C:/Users/USER/WeChatProjects/miniprogram-1/backend/compose.dev.yml)。
- [页面注册](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/app.json)、[小程序启动](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/app.ts)、[项目配置](C:/Users/USER/WeChatProjects/miniprogram-1/project.config.json)、[Phase26/27功能盘点](C:/Users/USER/WeChatProjects/miniprogram-1/backend/FEATURE_INTEGRATION_STATUS.md)。
