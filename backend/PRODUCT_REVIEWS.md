# 商品评价与评分（Phase32 源码交付）

原需求11.04中的“商品评价”已由可选项转入本阶段范围；收藏仍属原可选功能，未实现。本阶段不把源码编译等同功能验收，不运行后端、迁移、测试或真实图片上传。

## 当前结果和明确依赖

已完成评价、回复、修订、撤回、公开评分、分页、举报、平台人工审核、私有图片及三端页面的源码。**当前不能发表真实评价：可信支付核验尚未接通，默认资格校验返回未满足。** 修改数据库 paid 标签或插入普通 payment_events 不会绕过这个门槛。没有假交易、假评分、演示评论或支付成功模拟。

内容安全自动检测仅提供服务端适配接口，尚未连接微信扫描服务；默认 pending。平台人工审核接口已实现，角色表初始为空；未配置独立审核人员前不会有人工批准权限，也不会自动公开。

## 1. 页面及使用流程

Customer：

- 云端商品详情加入 product-reviews 组件：平均分、总数、各星级数量、评分筛选、文字、已购标记、审核通过时间、图片查看、商家公开回复、评价/回复举报、加载更多与刷新。
- 已送达订单详情为每个稳定 orderItemId 提供“评价商品”。编辑器显示服务端资格原因，未满足不能提交或上传图片。订单详情API仅增加 orderItemId，保留现有快照、价格和GPS入口。
- 编辑器支持1—5星、0—500字、最多3张图、内容及图片预览、失败保留输入和请求编号。图片独立上传/确认；已确认图片重试不再创建对象。
- 个人中心“我的商品评价”分页查看自己的评价、审核和回复状态；默认创建后7天内可修改1次。撤回二次确认，撤回后不允许重新发表该订单商品评价。
- 修改中的候选内容与当前公开版本分别显示，不以未审核内容替换公开内容。图片在用户点击时获取短期链接并用原生图片预览，避免列表一次加载大量私有图片。

Merchant：

- 工作台新增“商品评价”，沿用现有风格。
- owner/manager按商品UUID、评分、低分1—2星、评价或回复审核状态组合筛选，查询由服务端执行；商品输入使用明确查询按钮，不逐字发请求。
- 列表显示完整内容、图片、状态、公开版本及回复状态，即评价详情；可一键只看某商品。
- 查看公开版本的平均分/评分分布，回复或修改当前回复候选、举报违规评价。回复表单明确显示目标商品与评价编号，网络未确认时锁定原请求内容供重试。
- 普通商家接口没有删评、隐藏、改顾客评分或审核动作。staff不开放包含待审私有照片的评价管理权限。

本机演示：保留既有商品/订单/GPS演示规则，新评价入口明确说明需要云端真实交易，不生成演示已购评价、不迁移本机数据、不在云端失败时回退本机评价。

## 2. 真实购买资格与支付契约

reviewPolicy.mjs 的 reviewPurchase 按授权店铺、顾客subject和 order_item_id 联查订单，锁定订单行；商品ID、名称均来自订单明细快照。必须 delivered、paid、存在历史 product_id，且 verifiedReviewPayment 返回可信证据。

当前 verifiedReviewPayment 明确返回 verified:false；它是客户支付模块的对接边界，不是支付实现。不提供客户端字段、环境开关或商家按钮将其改为成功。

客户后续接入时需要由服务端可信支付链路核实并返回：verified、orderId、storeId、customerSubject、totalCents、currency、receiptRef（1—200字）。每个字段须与锁定订单一致，receiptRef作为内部证据引用保存，不导出令牌或支付密钥。仅根据paid、配送、库存或未经验证的支付事件返回true不符合契约。暂未接入时，真实创建和新图片上传均被拒绝。

资格入口只接受orderItemId；创建不接受客户端productId。数据库对 order_item_id 永久唯一，撤回后仍占用唯一记录，避免撤回刷评。同一订单不同明细可以分别评价。

商品改名、调价、下架及当前软删除不会改变评价的原商品ID/名称与原订单明细；评价不外键级联删除商品。缺少历史product_id的旧明细不伪造关联，资格不满足。

## 3. 版本、并发和幂等

- 创建/修改/回复均有客户端UUID clientKey，服务端按店铺+操作身份+键唯一；SHA-256指纹涵盖操作、目标、正文、评分、图片IDs及expectedVersion。
- 同键同内容返回已有结果，同键不同内容409。重试识别先于额度和版本校验，因此成功后网络超时仍可确认原提交，不重建评价。
- 创建通过订单锁、事务、明细唯一约束；同一顾客写入使用事务级锁串行。回复与修改锁定评价根记录，expectedVersion防止覆盖其他设备更新。
- root指向current_revision_id和published_revision_id。每次改评/改回复插入不可改写的新修订；待审、拒绝的新版本不覆盖旧的approved公开版本。
- rating/content/image_ids等修订载荷禁止原地修改；审核/撤回/举报处理与审核事件在同一事务内记录。审核事件和清理事件只能追加。
- pending重试快照存在当前页面内存，输入/图片引用也保留在页面；关闭小程序不承诺持久化草稿。返回列表放弃未确认请求前提示先核对。唯一约束仍防止重开页面重复创建。
- 默认编辑窗口和次数集中在 reviewPolicy，服务端以数据库时间决定资格，前端从服务端读取展示。不是不可调整的分散规则。

## 4. 评分和分页口径

公开条件统一为：未撤回、根未hidden、published_revision_id指向approved修订。平均分与分布均使用该公开修订rating，不使用候选分数。

总数=这些公开有效评价数量；平均分=星级总和/数量，保留两位；无评价时average=null、count=0，不能显示虚构5星。顾客只显示后台确认为已购的评价标记，不提交平均分。

创建、待审修改、拒绝候选不会直接改变评分；人工批准新版本、隐藏或顾客撤回后，下一次读取即使用最新公开集合。原公开版本在新候选审核期间仍参与统计，符合版本保留规则。

使用既有微秒时间+UUID游标协议，按评价创建时间和ID倒序，默认10条、最多20条。游标绑定店铺/身份/模式/过滤条件。全部公开、本人、商家、平台审核、举报、修订历史和孤立图列表均服务端分页；不读前500条再筛选。前端去重、清游标、检查请求序号和身份，旧结果不覆盖新查询。审核过程中数据集合会变化，刷新读取当前状态，不承诺长时间跨页静态快照。

商家汇总显示当前商品范围的公开评分，不跟随候选评分筛选；候选列表显示的是当前内容。审核状态筛选同时匹配评价或回复候选，便于待审回复管理。汇总和管理列表同次请求采用一致的数据库快照。

## 5. 人工审核与内容安全接口

product_review_moderators为独立平台角色，初始空表。必须由受控运维在真实身份核实后授予；本次没有开通任何账号，也没有普通商家授权接口。

平台流程：读取pending列表 → 读取具体修订/私有图片 → 独立人工判断 → 用revisionId、expectedVersion、decision、reason提交审核 → 审核事件追加保存。不能审核本人发布的内容，也不能审核/处理自己所属店铺的评价举报，防止店铺角色借平台权限自审。

状态pending/approved/rejected/hidden完整保留。审核过时修订或旧版本409；批准图片前重新核对全部引用、私有桶、ETag、大小及类型。withdrawn_at不因人工批准而清除。没有普通商家“差评隐藏”开关。

inspectReviewContent为文字和图片检测适配器；当前默认说明检测未配置并保持pending。异常回滚或继续待审，不自动approved。返回的机器检测信息仅为审核依据，当前不会替代独立人工批准。

上线前仍需在实际微信公众平台账号核实UGC场景声明、文字/图片内容安全接口、回调校验和隐私要求。参考入口：[msgSecCheck](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/sec-center/sec-check/msgSecCheck.html)、[mediaCheckAsync](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/sec-center/sec-check/mediaCheckAsync.html)。本次尝试读取官方网页未能取得正文，未据此声称平台审核已通过。后续接入需把异步检测结果绑定不可变修订/图片ETag，并验证可信回调；前端不得持有微信access_token。

## 6. 举报与处理

登录顾客可举报公开评价及公开商家回复；商家owner/manager可将本店违规评价交平台处理。记录评价ID、具体修订ID、原因、举报身份、open/resolved/dismissed、处理原因和时间。

同一身份对同一修订最多一条举报；同内容重试不重复插入，变更原原因返回冲突。滚动24小时最多20条。举报本身不会隐藏评价、改变分数或删除图片，平台处理举报与审核是分开的明确操作。

平台可分页读取不同处理状态的举报，并通过resolve接口记录处理。对旧公开版本的举报保留原修订关联，不因新版本提交变换举报对象。

## 7. 私有图片与Phase25边界

复用既有imageStorageClient/headImage/签名SDK和商家身份基础，但不把顾客照片塞入公开商品图注册表。新增独立私有用途注册product_review_images；商品清理只识别stored_images的product键，不会把评价图片列入商品无引用计划。

必须配置独立S3_REVIEW_BUCKET和REVIEW_STORAGE_PRIVATE_CONFIRMED=true，且与商品/凭证桶不同；确认桶无公开域名、公开列举或公开网关。缺配置503，绝不回退公共图片域名。.env.example只增加空配置说明，无真实凭证。

- 仅已满足真实交易资格的顾客申请上传；每图1—5MB，JPG/PNG/WebP，至多3张挂接一条修订。
- 服务端生成UUID及Key，不接受客户端任意对象Key。签名PUT最长300秒，绑定类型和准确Content-Length；前端实际文件大小再检查。HEAD与文件头签名验证真实大小、类型，非图片拒绝。
- PUT只写review-staging前缀。complete用带ETag条件的服务端Copy封存至不可由顾客写入的review-images键，校验后绑定数据库；审核/读取再校验封存ETag。这样上传URL仍有效时也不能替换已审核文件。
- 读取接口每次校验：公开版本包含该图片且approved，或本人、获授权管理人员、平台审核员。匿名只能读取当前公开版本图片；非公开图片绝不签发匿名链接。所有链接60秒，Cache-Control private/no-store，不把签名URL作为长期关联保存。
- 已签发链接是短时能力凭证，隐藏或撤回不能立刻撤销已签名URL，最长残留60秒；缓存到设备的图片也不能远程擦除。新读取立即按新权限拒绝，不宣称零延迟撤销。
- 限制每身份滚动24小时或尚未处理的未绑定上传合计20个；签名/complete幂等，已封存图片重试不重复复制。上传资格24小时后失效。
- 未绑定超过7天可由平台分页查看候选，经明确confirm调用expire。先事务锁定并标为expired、记录清理意图，再执行受控私有对象删除及追加结果；未知对象/ETag保留并待人工核对，失败可重试。无自动R2删除任务。本阶段没有调用清理接口或访问生产存储。
- 绑定评价后，即使撤回或替换也保持引用以供审计，不能被孤立图清理。已绑定内容/审计的长期保留与删除申请政策尚需运营方确认；普通商家无直接物理删除接口。

私有桶域名需配置小程序请求/图片下载合法域名及对应平台隐私说明。签名Content-Length、复制、ETag、私有读取在真实R2与微信设备上尚未验证，不能只凭源码宣称存储政策已生效。

评价和私人图片未默认加入商家经营归档；仅JSON商品归档不包含这些私有实体。系统级数据库及评价桶备份、保留和恢复须由管理员另行配置，本阶段未执行备份或扩展商家恢复能力。

## 8. API清单

前缀S=/v1/stores/:slug，M=/v1/merchant/stores/:slug，P=/v1/platform/stores/:slug。

| 方法 | 路径 | 范围 |
| --- | --- | --- |
| GET | S/products/:id/reviews | 公开有效版本，rating、limit、cursor |
| GET | S/products/:id/reviews/summary | 公开平均分/总数/分布 |
| GET | S/reviews/eligibility?orderItemId=... | 本人明细资格及规则 |
| POST | S/reviews | orderItemId/rating/content/imageIds/clientKey |
| GET | S/reviews/mine | 本人分页、审核、可修改状态 |
| PATCH 或 POST | S/reviews/:id | 当前本人评价新修订，expectedVersion |
| POST | S/reviews/:id/withdraw | 本人不可逆撤回，幂等 |
| POST | S/reviews/:id/report | 登录顾客，revisionId/reason |
| POST | S/review-images | 本人申请私有上传，orderItemId/类型/大小/clientKey |
| POST | S/review-images/:id/complete | 本人确认封存上传 |
| GET | S/review-images/:id | 按公开/本人权限获取60秒读取链接 |
| GET | M/reviews | 授权管理人员分页及统计，productId/rating/status/low |
| POST/PATCH | M/reviews/:id/reply | 创建/修改当前回复候选，content/clientKey/expectedVersion |
| POST | M/reviews/:id/report | 商家举报本店评价 |
| GET | M/review-images/:id | 授权管理人员读取已绑定本店评价图 |
| GET | P/reviews | 独立平台人员查待审/其他状态 |
| GET | P/reviews/:id/revisions | 分页查询不可改写的评价/回复修订历史 |
| POST | P/reviews/:id/moderate | revisionId/expectedVersion/decision/reason |
| GET | P/reviews/reports | 分页，status=open/resolved/dismissed |
| POST | P/reviews/reports/:id/resolve | status=resolved/dismissed及reason |
| GET | P/review-images/:id | 平台审核私有图片 |
| GET | P/review-images/orphans | 7天以上未绑定候选分页 |
| POST | P/review-images/:id/expire | 平台明确confirm，受控孤立对象清理 |

小程序请求适配器将逻辑PATCH更新发送为兼容POST；服务端同时接受PATCH/POST相同资源更新，版本/幂等/权限检查一致。不通过强行类型断言声称所有微信版本支持PATCH。JSON请求体最大8192字节，列表默认10/最多20，未知参数拒绝，SQL字段与分支白名单，所有值参数化。401/403/404/409/429及基础设施503分别处理，不输出顾客消息、照片或认证令牌到普通日志。

## 9. 020迁移与结构

020_product_reviews.sql在001—019之后执行，依赖009订单店铺联合键、001明细主键以及既有身份。仅创建源码，未执行。

新增product_reviews、product_review_revisions、product_review_images、product_review_replies、product_review_reports、product_review_moderation_events、product_review_moderators和product_review_image_cleanup_events。包括明细唯一、请求键唯一、店铺联合外键、公开/本人/待审/频率/举报/孤立图索引，以及修订载荷与审计追加保护触发器。

migrate-dev/preflight数量提示更新至020；没有运行脚本，没有改写旧迁移或改造原账本中断机制。服务启动不创建评价表、不迁移数据、不启动评价图片删除。

## 10. 三端与静态构建

- Shared：评分/状态/分页类型、纯状态文案、只负责展示的review-card。
- Customer：公开评价组件、本人编辑管理及举报、私有图片上传API。
- Merchant：管理查询、回复/举报及授权图片读取；无Customer页面导入。
- 平台审核仅在后端独立namespace，不打包至普通商家应用。
- Combined默认及Phase31定位权限差异保持，GPS源码未改写。

实际执行TypeScript静态检查、Node语法检查、源码依赖边界及三目标纯编译/产物检查。页面数Combined36、Customer13、Merchant19。未执行微信平台WXML/WXSS编译、SQL解析/迁移、真实支付、审核、图片上传/删除、功能或集成测试；不声称运行验收成功。

## 11. 本阶段文件

新增：

- backend/sql/020_product_reviews.sql
- backend/src/reviewPolicy.mjs、reviewImages.mjs、productReviews.mjs
- miniprogram/modules/shared/domain/reviews.ts
- miniprogram/modules/shared/components/review-card/review-card.ts/json/wxml/wxss
- miniprogram/modules/customer/api/reviews.ts、controllers/reviews.ts
- miniprogram/modules/customer/components/product-reviews/product-reviews.ts/json/wxml/wxss
- miniprogram/modules/merchant/api/reviews.ts、controllers/reviews.ts
- miniprogram/pages/customer-reviews/customer-reviews.ts/json/wxml/wxss
- miniprogram/pages/merchant-reviews/merchant-reviews.ts/json/wxml/wxss
- backend/PRODUCT_REVIEWS.md

修改：

- backend/src/server.mjs（注册路由）、orderWorkflow.mjs（本人订单明细增加稳定ID）
- backend/src/imageLifecycle.mjs：新增可选presignedUpload配置，供私有评价PUT避免空请求体的非必需校验和；既有调用默认行为不变。
- backend/.env.example、scripts/preflight.mjs、scripts/migrate-dev.mjs（仅配置说明/020提示）
- miniprogram/app.json、apps/build-targets.json、apps/customer/app.plan.json、apps/merchant/app.plan.json
- miniprogram/pages/product-detail/product-detail.json/wxml
- miniprogram/pages/order-detail/order-detail.wxml、profile/profile.wxml、admin/admin.wxml、customer-settings/customer-settings.wxml
- backend/APP_SEPARATION_READINESS.md、REQUIREMENTS_AUDIT.md、FEATURE_INTEGRATION_STATUS.md、apps/BUILDING.md

未修改客户支付模块、GPS控制器、原订单状态机、商品清理规则、根project.config.json或旧迁移。

## 12. 后续启用依赖（本阶段未执行）

1. 在另行授权阶段核验001—019后启用020，核实真实数据结构与约束。
2. 客户完成可信支付适配契约；未完成前保持资格未满足，不以SQL伪造paid进行体验。
3. 运维配置独立私有评价桶、最小存储权限、合法域名、真实隐私指引；不得只设置确认标志而不检查桶策略。
4. 配置独立人工审核人员及值守流程，再评估微信内容安全适配；不把owner自动作为平台审核员。
5. 在授权的微信/非生产环境验证完整提交、网络重试、旧版本保留、评分、举报、图片鉴权和三目标平台编译。

本机可查看入口及“资格尚未满足”的说明；这不代表已验证真实交易评价成功。下一步是完成外部可信支付/内容审核配置并进行获授权集成，当前停止Phase32，不自动进入Phase33。
