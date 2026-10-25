# Phase 25 商品图片与送达凭证管理

本阶段仅完成源码开发和静态检查。没有运行测试、数据库迁移、部署、图片扫描/清理接口、R2删除、备份或校验脚本，没有连接生产存储，也未执行 Git 操作。下述能力须在启用依赖后联调，不能视为真实环境已验证。

## 数据结构与迁移

新增 **015_image_lifecycle.sql**，顺序为已有001—014之后应用015，本阶段未执行，也没有修改旧迁移。新增：

- `stored_images`：店铺、稳定UUID、对象Key、product/proof类型、upload/legacy/discovered来源、上传/校验/删除状态、实际桶、预期大小/MIME、ETag、实际大小及修改时间、登记/检查时间、保护截止时间、候选原因/识别时间、历史引用和保留标记。上传请求UUID在店铺及类型内唯一。
- `image_reference_history`：商品、草稿、订单、订单明细、归档和系统备份的稳定引用，追加记录，不允许应用直接修改或删除历史。
- `image_cleanup_plans`、`image_cleanup_items`、`image_cleanup_audit`：计划、幂等请求、独立审批人、24小时有效期、预期ETag、逐对象结果和追加式审计。
- `order_items.image_object_key_snapshot`：仅新订单从同店商品取当时图片Key；旧订单保持NULL，不拿当前图片冒充旧快照。

迁移登记现有商品、所有状态草稿、订单凭证及仍保有正文的Phase24归档图片引用；这些对象永久保留。新增数据库触发器在业务数据和引用历史同一事务中登记引用，锁定图片行，拒绝引用正在删除/已删除的对象。以后替换图片、移除图片、物理删除商品或草稿不会抹掉历史保护。当前商品“删除”依旧是原有下架语义，图片字段保持原样，没有改动商品状态机。

已清空正文的旧归档、迁移前已丢失的引用无法反推。扫描发现而未登记的旧对象按历史不明保护，不猜测可删。遗留跨店铺/非法Key会让引用校验失败，需要操作者先审计，不能静默忽略。

## 上传、替换和移除

复用商品 `/image-uploads` 签名PUT流程。签名前持久化登记；可传clientKey，同参数/同范围重试复用未引用对象，冲突返回409，已关联或删除锁定对象不会重新签发写链接。重新签名延长至少7天保护期。旧客户端未传clientKey仍可使用，但只有新客户端具备此请求级幂等编号。

新增 `POST /v1/merchant/stores/:slug/image-uploads/:imageId/complete`，只接受空JSON正文，按登记ID定位同店商品图片，HEAD校验真实对象大小/MIME及登记信息；小程序校验成功后才替换表单预览与待保存Key。保存商品/草稿时仍重新校验登记、店铺和实际对象；不能只凭客户端提交一个符合路径的Key关联未登记对象。历史登记的现有图片可以继续编辑与复制。

上传失败保留原图片；移除只影响当前表单，主动保存成功后才更新数据库。商品保存失败不会清理原图。选择、上传、校验和保存过程有锁与状态提示，移除了上传失败时打印完整网络错误/签名URL的日志。切换店铺或身份时丢弃旧响应。本地演示仍是原本地图片路径与保存方式，不自动上传R2。

## 图片查询、扫描与计划 API

所有路径前缀 `/v1/merchant/stores/:slug`，使用现有微信会话与 `permittedStore`。

- `GET /images?before=UUID`：20条登记分页，按UUID稳定排序；不宣称是时间排序。owner/manager可读。
- `GET /images/:id/references`：同店商品图当前商品/草稿/订单明细/凭证数量及历史引用数量。owner/manager可读，不返回客户个人资料。
- `POST /images/scan`：owner，正文 `{cursor?}`；每次最多列举20个当前店铺 `stores/:storeId/products/` 前缀对象，服务端UPSERT登记和HEAD核对，返回续页游标。不接受客户端对象Key，不扫描凭证前缀。
- `POST /images/check`：owner，正文 `{ids:[登记UUID...]}`，最多20个；可以识别已签名但没有上传成功的登记。HEAD失败显示unknown，404显示missing，不将未知当作无引用可删。扫描/检查最多4个HEAD并发，每次HEAD有6秒超时，LIST有10秒超时。
- `POST /image-cleanup/plans`：owner，正文 `{ids:[最多5个],clientKey:UUID}`；锁定图片、重新读取引用及实际对象，只有当前安全项纳入计划，返回逐项结果。不符合的项不纳入；全部不符合则409。相同请求重试返回原计划，改变ID集合则409。
- `GET /image-cleanup/plans`：owner，最近20个计划。
- `GET /image-cleanup/plans/:id`：owner，指定计划和逐对象状态。
- `POST /image-cleanup/plans/:id/approve`：须同店owner且在运维端 `IMAGE_CLEANUP_OPERATOR_SUBJECTS` 允许名单中，正文 `{confirmation:计划UUID}`。审批人不能是计划创建人；重复相同审批安全，不允许替换另一审批人。
- `POST /image-cleanup/plans/:id/execute`：同样须owner和平台运维允许名单、独立审批、未过期计划及明确确认。只按计划中的登记ID/服务端Key处理，不接受任意Key。

正文最多4096字节；扫描、检查、计划、审批和执行各每店每小时最多30个请求，数据库事务锁计数，跨进程一致。所有SQL参数化。401未登录，403权限不足，404不存在，409冲突/过期/无安全候选，413过大，423执行未启用，429限流，503状态无法确认或服务不可用。不会打印管理密钥、访问签名URL或令牌。

## 保留与清理安全规则

本阶段采用保守的**永久历史保留**：曾用于任何商品（包括下架）、草稿（包括放弃/发布）、订单快照、归档或系统备份的对象都不能清理。被多个商品共享时每个引用都保留，引用数量不是前端布尔值。商品替换后的旧图即使当前引用为零，只要历史存在也保留。

只有本系统登记的新上传、从未引用、无保留标记、数据库和HEAD均确认安全、登记保护期已过且对象实际修改时间也超过7天，才可能成为可删候选。中断上传而不存在的对象会被识别为missing，但没有文件可删除；历史来源不明的已存在对象保留。这个阶段不会自动解决所有旧垃圾图片，存储节省不是优先于历史恢复能力的目标。

扫描、核对和创建计划均不删除。小程序商品列表提供折叠的图片管理区，可分页看登记、查引用、扫描/核对、查看原因和生成计划；批量商品模式隐藏该面板。小程序**没有执行删除按钮**。

删除源代码默认关闭，只有运维完成独立授权和能力审计后显式配置以下三个开关才有可能执行：

- `IMAGE_CLEANUP_EXECUTION_ENABLED=true`
- `IMAGE_CONDITIONAL_DELETE_VERIFIED=true`
- `IMAGE_BACKUP_INVENTORY_CONFIRMED=true`

这些开关本阶段没有设置。第二项必须基于实际存储端确实支持并强制执行DeleteObject If-Match的验证，不能因为SDK存在该字段就假定R2会执行。第三项须确认既有备份和外部流程的引用覆盖；无法确认时保持关闭。

执行时逐项锁定登记，再查全部引用、保护期、计划有效性和HEAD ETag；只允许product类型、同店规范路径、同一个登记桶、从未引用对象。随后先提交deleting隔离状态，数据库触发器拒绝新引用及新签名，再发送带计划ETag的条件删除。只有删除响应确认且再次HEAD为missing才计为deleted。任何超时/不确定保留锁定并记录需运维复核，不能自动解锁或把失败当成功；running进程中断也不会自动重执行。部分成功逐项返回并统计。没有自动定时删除或解锁任务。

**未实际执行删除，也未验证存储端条件删除能力。启用前必须在获授权的隔离环境确认这些依赖。**

## 送达凭证

沿用现有 `/orders/:id/proof-upload`、`/complete` 和顾客/商家 `/proof` 接口，权限仍基于原订单顾客身份与店铺成员。Key继续为 `delivery-proofs/:storeId/:orderId/:UUID.ext`，写入登记表且与订单稳定绑定。proof类型始终排除在商品清理之外，包括失败或未关联的凭证上传。

完成送达重新校验登记、同店同订单Key、真实HEAD大小/MIME及原付款/配送状态，再在事务中关联凭证；完成重试相同Key可返回已确认结果。客户端缓存当前页面已上传Key以重试提交，不因一次完成请求失败就重复上传。通用状态接口的delivered分支统一要求使用已经进行对象验证的complete接口，避免绕过照片验证；没有新支付逻辑、虚假支付确认或放宽未付款限制。

读取先按订单和身份取Key，再核对Key内店铺/订单、登记及HEAD；新登记凭证若ETag改变则拒绝读取并要求复核。返回180秒GET签名链接，不把链接存入业务表或日志。订单详情与送达页支持重新获取、读取失败提示和页面隐藏清除链接；请求序号和身份检查拒绝旧响应，云端失败不读本机凭证。链接和本地已读取内容的缓存过期不是对象删除或长期保留策略。

### 必需的私有存储配置

服务端只有在 `PROOF_STORAGE_PRIVATE_CONFIRMED=true` 时才签发凭证上传/读取链接。可用 `S3_PROOF_BUCKET` 指向同端点可访问的独立私有桶，推荐与公开商品图分离；未配置时沿用 `S3_BUCKET`，但必须证明凭证前缀不会被商品图片公开域名直接访问。**这个配置断言须覆盖历史凭证桶，不能只验证新桶。**

新凭证登记保存实际桶；旧凭证沿用原S3_BUCKET，不自动移动。源码不能检查或撤销已经部署的公开桶/域名策略，也不能让已经公开的旧URL失效；本阶段没有迁移对象。未确认私有性时返回503并提示配置依赖，不能假装“仅凭签名API就已保证私有”。运维须审计所有历史凭证的公开可达性后再设置确认标记。

长期保留目前是应用层永久保留，不是对象存储WORM或法律保全承诺。运维还须确认桶生命周期、外部脚本及人工操作不会清除凭证前缀，代码无法阻止绕过应用直接操作存储的管理员。

## Phase 24 与备份兼容

原归档format/version、schemaVersion=14的逻辑格式及每文件SHA-256机制保持不变；新归档订单明细增加可选 image_object_key_snapshot，旧文件没有该字段也可预检查。归档写入时的数据库触发器永久登记图片引用，即使下载有效期到期、正文清空也不释放历史保护。不会修改已有归档正文或摘要。

预检查继续校验原文件摘要和关联，额外最多并发HEAD检查10个已登记同店商品Key，返回exists/missing/unknown及未检查数量；这部分状态在API响应和界面显示，不写回归档，不宣称未检查对象存在。所有导出仍只有对象引用，没有图片实体或临时签名链接，JSON不能单独恢复全部图片。

backup-r2脚本增加015依赖和DATABASE_URL，用现有pg依赖，在读取对象前锁定登记并按备份批次ID追加backup引用；失败的备份也不自动解除保留。读取/摘要/文件清单仍复用原脚本，元数据记录每个对象的店铺/类型和登记保护状态，verify-r2脚本检查字段及计数、保持旧清单兼容。找不到对应店铺的历史对象会标为未登记，不伪造保护状态；它们也不会成为商家可删对象。数据库和R2备份仍不是事务一致快照，没有执行实际备份或验证。

## 源码文件清单

新增4个文件：

```
backend/sql/015_image_lifecycle.sql
backend/src/imageLifecycle.mjs
backend/src/imageManagement.mjs
backend/IMAGE_LIFECYCLE.md
```

修改24个文件：

```
backend/src/catalog.mjs
backend/src/orderWorkflow.mjs
backend/src/merchantArchives.mjs
backend/src/merchantArchiveFormat.mjs
backend/src/server.mjs
backend/scripts/migrate-dev.mjs
backend/scripts/backup-r2.mjs
backend/scripts/verify-r2-backup.mjs
backend/scripts/backup-metadata.mjs
miniprogram/utils/authApi.ts
miniprogram/utils/cloudMerchantImage.ts
miniprogram/utils/merchantProofCloud.ts
miniprogram/utils/cloudProofRead.ts
miniprogram/utils/merchantArchivesCloud.ts
miniprogram/pages/admin-product-form/admin-product-form.ts
miniprogram/pages/admin-product-form/admin-product-form.wxml
miniprogram/pages/admin-products/admin-products.ts
miniprogram/pages/admin-products/admin-products.wxml
miniprogram/pages/admin-products/admin-products.wxss
miniprogram/pages/delivery-proof/delivery-proof.ts
miniprogram/pages/delivery-proof/delivery-proof.wxml
miniprogram/pages/order-detail/order-detail.ts
miniprogram/pages/order-detail/order-detail.wxml
miniprogram/pages/admin-backup/admin-backup.ts
```

## 尚待运行验证与手动体验

需操作者另行准备已按顺序应用至015的隔离数据库、微信HTTPS上传域名与对象存储配置。商品表单替换/移除图片，检查失败仍保留原图、未保存不改原商品、复制共享图不受影响。在商品列表展开云端图片区，核对共享、下架、旧图、草稿及备份保护状态；扫描仅生成候选，不会删除。没有满足双7天保护期的未引用上传时，没有可计划对象属于正常结果，不生成假候选。

送达流程仍需符合原后端付款和配送限制，不应为了体验伪造付款。已送达订单可由所属顾客和同店商家重新获取短链接，跨身份/店铺应拒绝。归档预检查显示存在/缺失/未知及未检查数量，不宣称图片已备份。

以上均未实际运行。后续优先审计私有凭证存储策略、迁移兼容性、触发器并发、R2条件删除真实支持，以及在独立授权后安排隔离环境联调；不能在尚未确认这些依赖时打开删除开关。本阶段结束后不自动开始Phase26。
