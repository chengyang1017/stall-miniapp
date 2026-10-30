# 顾客端四主页面改版交付

导航调整为：首页 / 分类 / 购物车 / 我的。保留原生 tabBar，使用统一线性图标和紫色选中底座；购物车角标索引同步为 2。订单保留为普通页面，从「我的订单」及状态入口进入。

## 本次修改范围

- `miniprogram/app.json`、`apps/build-targets.json`、`apps/customer/app.plan.json`：页面注册、角色归属、四项导航。
- `miniprogram/pages/index/*`、新增 `miniprogram/pages/category/*`：首页、左右分栏分类页。
- 新增 `miniprogram/modules/customer/controllers/catalog.ts`：提取原首页商品控制器，供首页和分类页复用，保留上下文隔离、串行响应保护与 stableRowsPatch。
- 新增 `miniprogram/styles/customer-theme.wxss`、`customer-catalog.wxss`、`miniprogram/templates/customer-product.wxml`：公共主题、商品卡和分类样式。继续复用已有商品图片占位模板。
- `miniprogram/pages/cart/*`、新增 `miniprogram/modules/customer/domain/cartSelection.ts`：勾选、全选、单项移除、备注、费用明细、固定结算栏；选择状态按 API / 店铺 / 账号隔离。
- `miniprogram/utils/cart.ts`、`cloudCart.ts`：购物车角标；云端报价支持仅取已选商品。
- `miniprogram/utils/cloudCheckout.ts`、`directPurchase.ts`、`miniprogram/pages/checkout/checkout.ts`：结算使用已选商品，成功后保留未选商品；本地立即购买分支仍使用原来的独立商品选择。
- `miniprogram/pages/profile/*`、`miniprogram/pages/orders/orders.ts`：个人中心、普通订单页面跳转、订单状态筛选入口。商家工作台继续依照已有服务器权限显示。
- `miniprogram/assets/tabbar/{home,category,cart,mine}{,_active}.png`：导航图标。
- `backend/tests/customer-ui-redesign.test.mjs`：新增改版行为回归测试。调整 `frontend-interaction-state.test.mjs` 的控制器加载适配与 `frontend-render-stability.test.mjs` 的共享样式路径断言，保留原测试语义。

工作区原本存在的后端及其他未提交变更未回退；以上是本次工作范围。

## 动态绑定和占位范围

| 区域 | 来源及行为 |
| --- | --- |
| 首页商品、分类、优惠 | 已有公共商品分页接口及业务配置；本地模式继续使用原有 demo adapter，云端失败不回退到本地商品。 |
| 推荐轮播 | 从真实优惠商品生成；无优惠时显示店铺分类入口，不编造活动。优惠比例由原价和有效价格计算。 |
| 分类、搜索 | 真实分类 ID、关键词和分页查询。库存/优惠筛选及价格排序作用于已加载商品，菜单明确标注该范围；支持继续加载。 |
| 购物车 | 现有购物车数量和云端权威报价；保留数量队列、库存验证、上下文隔离和稳定行更新。选中商品使用分币合计，未确认时保留上次已确认报价并禁用结算。 |
| 备注 | 与现有结算草稿共用存储键，按店铺和账号隔离。 |
| 配送与总额 | 继续使用现有配送校验。配送费及最终应付金额在结算时按地址和服务器结果确认，不预填固定费用。 |
| 我的 | 根据现有登录会话显示通用身份标识，不假造头像、昵称、手机号或会员等级；客服未读沿用真实接口。 |
| 订单状态 | 待付款/已完成使用已有订单 tab；待发货/配送中对进行中分页结果继续筛选；售后/退款筛选对应退款状态。未读取的分页可继续加载，不伪造总数。 |
| 未开通服务 | 收藏、优惠券、积分、浏览记录明确显示「暂未开通」或「—」，点击说明现状。 |
| 帮助 | 联系商家和意见反馈进入已有客服页；常见问题、关于我们为静态说明。 |

现有接口没有活动截止时间，因此不显示虚假倒计时。没有独立的运营 Banner API，当前由商品数据生成推荐。没有用户资料、积分、优惠券接口，不展示参考图中的示例账户信息或数值。

## 验证

- TypeScript：`node node_modules/typescript/lib/tsc.js --noEmit --pretty false` 通过。
- 依赖边界：`node scripts/check-boundaries.mjs`，combined/customer/merchant 三个目标通过。
- 140 项页面及行为测试通过，命令：

```powershell
node --test backend/tests/customer-ui-redesign.test.mjs backend/tests/frontend-render-stability.test.mjs backend/tests/frontend-navigation-cart-cloud.test.mjs backend/tests/frontend-interaction-state.test.mjs backend/tests/frontend-navigation-orders-phase6.test.mjs
```

- 使用原有 `.local/phone-staging.json` 构建并更新 `dist/phone-preview`；134 个源模块、37 个页面、276 个输出文件。未创建新的微信预览目录。
- 已安装微信开发者工具自带 `wcc.exe` / `wcsc.exe` 编译 44 个 WXML、47 个 WXSS，退出码均为 0。
- Preview preflight：0 错误、1 提示。提示为生成项目未启用 TypeScript 插件；该输出已经预编译为 JavaScript。
- 模拟器已观察到新的导航、首页连接错误状态和「我的」页面。当前 API 域名不在微信合法 request 域名列表，真实商品/订单/配送联调受到已有配置阻挡；未关闭域名校验或修改安全设置。尚未进行真机验收，未上传或发布。

未执行 Git commit / push / reset，未修改 Render / Neon。


## 2026-10-29 本轮：商品详情、商家紫色主题、紧凑购物车底栏

本节是上一轮四主页面改版的追加交付；前文测试结果保留为历史，不与本轮数量累加。

### 商品详情与真实数据

- 修改 `miniprogram/pages/product-detail/product-detail.{ts,wxml,wxss,json}`：自定义导航、大图轮播容器、返回/图片预览、有效价/原价/计算折扣、商家描述、数量、小计、相关推荐、固定购买栏；胶囊位置取系统实际 top，底部独立购买栏处理安全区。
- 商品主图、名称、描述、分类、库存、价格来自原公共商品接口；本地模式沿用原 demo adapter，云端异常不混入演示商品。现有正式模型只有单张 imageUrl，轮播数组由该真实字段构建；不伪造额外图片。今后多图需要先扩展商家模型及 API。缺图继续使用现有 productPlaceholder。
- 现有模型没有 SKU、分规格价格、商家标签、食材/口味/人群属性：不显示无意义的规格或虚假标签，没有新增可购买选项。这些能力尚未接入。
- 数量只局部更新 quantity / totalText，不重新请求或重载页面；受真实库存、99 件现有限制及当前报价确认状态约束。加购/购买共用互斥 intent，防止连点重复添加。回包核对账号、店铺及页面可见性，失效价格不能购买。
- 云端立即购买安全复用已有「加入购物车后结算已选商品」流程，数量区明确提示该行为；成功加入后确保当前商品被勾选，再进入既有结算链路。不是仅购买单个 SKU 的新 API；本地立即购买保留已有 directPurchase。所有支付/库存/订单服务器校验保留，不展示虚假下单成功。
- 购物车图标角标读取当前作用域实际购物车数量。收藏尚无 API，使用弱化图标和「暂未开通」提示，不保存假收藏。
- 推荐使用当前店铺的真实商品分页接口，优先当前分类，过滤当前商品、停售/售罄/无库存/非法价格，最多显示 4 个；无结果隐藏，失败不回退到假数据。

### 单一评价模块

- 修改 `miniprogram/modules/customer/components/product-reviews/product-reviews.{ts,wxml,wxss}`：复用原 publicReviews / publicReviewSummary，详情页默认只显示 2 条真实评价，点击「查看全部」在同一区域展开，保留筛选、分页、图片预览和举报。
- 修改 `miniprogram/modules/shared/components/review-card/review-card.{ts,wxml,wxss}`：新增仅详情摘要启用的 customerSummary 展示；商家页及原评价列表默认仍显示原商品名称、评分、已购标识，布局保留。公共 API 没有用户昵称，详情摘要使用「匿名已购顾客」等通用匿名标识，不创建示例用户。
- 评分、数量、内容、日期、图片编号/签名图片读取均来自原评价接口。空列表显示真实空状态；失败显示重试入口。原可信购买、公开审核、举报修订版本和图片授权规则未修改。
- 相同账号/商品/评分范围刷新时保留已确认评价；更换范围才清理旧内容，晚到响应不能跨身份发布。

### 商家端实际覆盖

新增 `miniprogram/styles/brand-tokens.wxss`、`merchant-theme.wxss`，`customer-theme.wxss` 引入同一 token 文件。商家公共主题只含颜色、边框色、背景和阴影，不含尺寸、留白、布局和定位属性。调整以下全部 19 个商家页面的 `.wxss` 及原生导航 `.json`：

1. pages/admin/admin
2. pages/merchant-login/merchant-login
3. pages/admin-products/admin-products
4. pages/admin-product-form/admin-product-form
5. pages/admin-categories/admin-categories
6. pages/admin-orders/admin-orders
7. pages/delivery/delivery
8. pages/store-hours/store-hours
9. pages/admin-note-tags/admin-note-tags
10. pages/admin-placeholders/admin-placeholders
11. pages/admin-billing/admin-billing
12. pages/admin-analytics/admin-analytics
13. pages/support-inbox/support-inbox
14. pages/store-code/store-code
15. pages/admin-backup/admin-backup
16. pages/merchant-support-chat/merchant-support-chat
17. pages/merchant-delivery-proof/merchant-delivery-proof
18. pages/merchant-tracking/merchant-tracking
19. pages/merchant-reviews/merchant-reviews

同时调整 `modules/features/chat/view.wxss`、`modules/features/proof/view.wxss` 的共用外观，保留布局。错误/警告/支付/完成等语义状态仍保留原有区别，不全部改为紫色。

本轮起始 SHA-256 对照：19 个商家页面的全部 TS 控制器和 WXML 模板逐字未变；19 份页面 WXSS 的非外观布局属性与原始版本一致。没有改变菜单顺序、表单字段、拖动保存、接单、配送、权限或账单/分析逻辑。

### 购物车底栏

仅修改 `pages/cart/cart.wxml`、`cart.wxss` 的底栏及配送提示位置，未改动购物车控制器或商品卡片结构。

| 项目 | 修改前 | 修改后 |
| --- | --- | --- |
| 容器高度 | 264rpx + env(safe-area-inset-bottom) | 固定 104rpx |
| 位置 | webview 底部 bottom:0，额外安全区 | 仍为 bottom:0，紧贴现有原生 tabBar 上方；由 tabBar 负责安全区 |
| 主行 | 数量、金额、结算 | 同一主行，固定 80rpx；按钮保持 220 × 72rpx |
| 常驻说明 | 4 行同步、配送、起送、错误槽 | 删除常驻说明组；真实阻断时才显示绝对定位的 32rpx 单行错误 |
| 滚动内容留白 | 310rpx | 136rpx |

已移除底栏内「商品合计 · 以结算及下单校验为准」「请在结算时选择配送地址」「已达起送金额」等常驻文案。配送详情放回对应服务模块。待确认状态只在数量旁显示短标识，保留上次确认金额。结算按钮原 disabled 表达式及 TS 校验全部保留；不因错误文字或数量变化挂载/卸载底栏。

### 本轮验证与预览更新

- TypeScript：`node node_modules/typescript/lib/tsc.js --noEmit --pretty false`，通过。
- 依赖边界：`node scripts/check-boundaries.mjs`，Combined / Customer / Merchant 全通过。
- 三目标实际构建：`node scripts/build-miniapp.mjs combined`、`customer`、`merchant`，通过；分别 134/80/89 个源模块、37/14/19 个页面，输出 278/154/160 个文件。
- `node scripts/check-build-output.mjs` 和 `checkOutput('combined','phone-preview')`，通过输出清单检查。
- 已安装微信开发者工具原生 wcc.exe / wcsc.exe：最新原预览目录的 44 个 WXML、49 个 WXSS 编译通过。
- 本轮完整相关回归：**297 测试，297 通过，0 失败、0 跳过**。日志 `.local/detail-ui-full-regression.log`。新增 `backend/tests/detail-merchant-theme.test.mjs` 的 19 项包含详情价格/库存/连点/局部更新/图片/作用域/推荐/评价、商家主题覆盖和底栏尺寸。
- 原 `frontend-render-stability.test.mjs` 更新为 104rpx 的新外观契约，原数量确认、节点身份、失败恢复和隐私断言保留。旧导航测试适配上轮的共享 catalog 工厂、订单普通页及已选购物车状态：`build-navigation-isolation`、`frontend-navigation-flows`、`frontend-navigation-guards`、`frontend-navigation-runtime`、`frontend-navigation.test`；未降低原业务校验。
- Preview preflight：0 错误、1 提示（生成项目不启用 TypeScript 插件，因为已输出 JS）。
- 首选命令 `npm run preview:phone -- --prepare ".local\phone-staging.json"` 尝试遇到 Windows EPERM；未强制删除原目录，未杀进程，未创建任何替代预览目录。核对生成标记、清单、无符号链接、原 staging 配置/AppID/域名校验后，用已通过的 Combined 产物就地覆盖生成文件，并用原 phone-preview tsconfig 重新编译。原 cloud-only 配置与原目录保留，更新后重新通过输出及 WXML/WXSS 检查。辅助命令 `node .local/refresh-original-phone.cjs`。
- 本轮相关源码的 Git 空白检查通过；全量工作区检查另有上一轮未修改的 `profile.wxss` 文件末尾空行提示，不擅自清理既有变更。

可复现的相关测试集合：

```powershell
$detailRegressionFiles = @(rg --files backend/tests | Where-Object { $_ -match '(frontend-.*|customer-ui-redesign|detail-merchant-theme|review-purchase-boundary|staging-payments-ui|interaction-cloud-sync|build-navigation-isolation)\.test\.mjs$' })
node --test $detailRegressionFiles
```

本轮没有把离线 VM/UI trace 模型或原生模板编译当作真实微信渲染验收。仍需在开发者工具/真机中核验真实图片的裁剪与滚动、胶囊和窄屏安全区、底栏实际 top/height/width、键盘遮挡、商家分类拖动/表单焦点及真实 API 联调。上轮已知合法 request 域名问题仍需由实际配置验证；本轮未修改微信安全设置。没有进行真实支付、下单或远端商家写入。

未修改 Render / Neon / 数据库 / Phase 8 V2 资源；未执行 Git commit / push / reset，未清理既有未提交内容。
## 2026-10-29 分类图标选择器：中断后续做交付

本次先检查 Git 工作区及分类相关差异，复用已经保存的实现，没有重建分类系统，没有清理其他未提交修改。账户额度接口可读；额度信息仅用于判断继续执行风险，不代表本任务的精确 token 余额。

### 已完成的功能与文件

- `miniprogram/modules/shared/domain/categoryIcons.ts`：统一图标清单、key 校验、默认图标解析及安全资源路径映射。
- `miniprogram/assets/category-icons/`：20 个线性 SVG，各有紫色及白色选中版本，共 40 个本地资源。
- `miniprogram/pages/admin-categories/admin-categories.{ts,wxml,wxss}`：新增分类图标入口；编辑时可改图标；网格选择、立即预览、自动匹配、选中态；保存分类后才生效。现有新增、重命名、删除、固定行高和手柄拖动排序保留。
- `miniprogram/modules/shared/domain/catalog.ts`、`modules/shared/api/catalog.ts`：分类类型增加可选 `iconKey`，旧分类仍兼容。
- `miniprogram/modules/customer/controllers/catalog.ts`、`pages/index/index.wxml`、`pages/category/category.wxml`、`styles/customer-catalog.wxss`：首页及分类页使用每个真实分类自己的图标；选中使用白色资源，分类 ID、筛选逻辑和紫色高亮不变。
- `miniprogram/utils/merchantCategoriesCloud.ts`：保存含图标的请求必须由服务端回传相同的 `iconKey` 且明确支持图标；缺失、不同或未声明能力的响应均不进入已确认缓存，不误报保存成功。
- `backend/src/categoryIcons.mjs`：服务端独立 key 白名单及数据库能力检测。
- `backend/src/categoryManagement.mjs`、`backend/src/catalog.mjs`、`backend/src/server.mjs`：分类写入、商家读取、顾客商品接口中的分类列表接入 `iconKey`；权限、店铺隔离、版本冲突、删除商品约束和排序逻辑保留。
- `backend/tests/category-icons.test.mjs`：18 项图标与保存确认测试。原 `interaction-cloud-sync`、`frontend-interaction-state`、`build-navigation-isolation` 测试夹具已在中断前接入真实图标辅助模块。

可选图标：`grid` 全部、`drink` 饮料、`bowl` 食物、`snack` 零食、`bottle` 日用品、`apple` 生鲜水果、`snowflake` 冷冻食品、`cloche` 熟食、`cake` 甜品、`noodle` 面食、`rice` 主食、`lunchbox` 便当、`fries` 小吃、`sunrise` 早餐、`coffee` 咖啡、`bubble-tea` 奶茶、`bread` 烘焙、`seasoning` 调味品、`wine` 酒水、`more` 其他。

### 数据兼容与尚未上线的部分

显式有效的 `iconKey` 优先；未设置或未知 key 时，根据真实分类名称匹配内置图标，再按名称/ID 的稳定规则回退。因此旧分类可以立即显示不同的图标，不新增或伪造业务分类。未识别的值不会作为 URL/SVG 注入页面。

本地演示模式在已有分类记录中保存 `iconKey`，重新进入可恢复。云端持久化代码已准备，但**本次未执行迁移，也未部署后端，不能称为云端持久化已上线**。需要后续经授权新增 `categories.icon_key` 并发布兼容后端，服务返回 `categoryIconsSupported: true` 后才启用云端选择保存。未启用时页面明确提示，原名称、删除和排序仍可使用。

迁移提案：[category-icons.sql](../backend/migrations/proposals/category-icons.sql)。该文件位于 proposals，未加入任何自动迁移入口或 Phase 8 清单，未执行。字段允许 NULL 并约束为 20 个内置 key；旧数据无需回填。读取通过 `to_jsonb(...)->>'icon_key'` 兼容未加列的数据库；未支持时显式图标写入返回 `category_icons_not_available`，不静默忽略。名称单独修改不覆盖已有图标，图标变更参与 revision；全部 NULL 时保留旧版本哈希兼容性。

### 本次实际验证（不累计上次日志）

```powershell
node --test --test-name-pattern 'categor|icon' backend/tests/category-icons.test.mjs backend/tests/interaction-cloud-sync.test.mjs
node node_modules/typescript/lib/tsc.js --noEmit --pretty false
node scripts/check-boundaries.mjs
node scripts/build-miniapp.mjs combined
node scripts/build-miniapp.mjs customer
node scripts/build-miniapp.mjs merchant
```

- 本次仅执行分类相关 41 项：41 通过、0 失败、0 跳过。日志 `.local/category-icons-resume-tests.log`。中断前 `.local/category-icon-regression.log` 的 312 项保留为历史，不计作本次新结果。
- 覆盖新增、图标单独编辑、取消、刷新恢复、删除、拖动排序、保存失败草稿、旧接口降级、跨账号响应隔离、未知 key、版本冲突及服务端保存确认。
- TypeScript、三目标依赖边界及四个相关后端模块的语法检查通过。
- Combined / Customer / Merchant：135 / 81 / 90 个源模块，37 / 14 / 19 个页面，319 / 195 / 201 个输出文件；三目标构建及清单检查通过。
- 原 `dist/phone-preview` 通过已有就地刷新脚本更新，保持原 AppID、cloud-only staging 配置与域名校验；未创建新预览目录。预览包包含全部 40 个图标资源，输出清单检查通过。
- 微信开发者工具自带编译器：44 个 WXML、49 个 WXSS 编译通过。
- 未操作 Neon、Render 或正式数据库；未部署，未执行 Git commit / push / reset，未清理其他未提交修改。

仍待验收：授权迁移及后端发布后的真实跨设备图标保存/读取、真实数据库运行验证，以及微信真机上 SVG 显示与图标选择器触摸/安全区。离线测试、构建及原生模板编译通过不等于这些联调已经完成。

