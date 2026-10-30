const fs=require('fs');
const detail=`

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
- 首选命令 `npm run preview:phone -- --prepare ".local\\phone-staging.json"` 尝试遇到 Windows EPERM；未强制删除原目录，未杀进程，未创建任何替代预览目录。核对生成标记、清单、无符号链接、原 staging 配置/AppID/域名校验后，用已通过的 Combined 产物就地覆盖生成文件，并用原 phone-preview tsconfig 重新编译。原 cloud-only 配置与原目录保留，更新后重新通过输出及 WXML/WXSS 检查。辅助命令 `node .local/refresh-original-phone.cjs`。
- 本轮相关源码的 Git 空白检查通过；全量工作区检查另有上一轮未修改的 `profile.wxss` 文件末尾空行提示，不擅自清理既有变更。

可复现的相关测试集合：

\`\`\`powershell
$detailRegressionFiles = @(rg --files backend/tests | Where-Object { $_ -match '(frontend-.*|customer-ui-redesign|detail-merchant-theme|review-purchase-boundary|staging-payments-ui|interaction-cloud-sync|build-navigation-isolation)\\.test\\.mjs$' })
node --test $detailRegressionFiles
\`\`\`

本轮没有把离线 VM/UI trace 模型或原生模板编译当作真实微信渲染验收。仍需在开发者工具/真机中核验真实图片的裁剪与滚动、胶囊和窄屏安全区、底栏实际 top/height/width、键盘遮挡、商家分类拖动/表单焦点及真实 API 联调。上轮已知合法 request 域名问题仍需由实际配置验证；本轮未修改微信安全设置。没有进行真实支付、下单或远端商家写入。

未修改 Render / Neon / 数据库 / Phase 8 V2 资源；未执行 Git commit / push / reset，未清理既有未提交内容。
`;
fs.appendFileSync('docs/CUSTOMER_UI_REDESIGN.md',detail.replace(/\\`/g,'`'));
const record=`

## 2026-10-29 商品详情、商家主题与紧凑购物车（本轮 UI 验证）

本轮相关前端联合回归 **297 项，297 通过、0 失败、0 跳过**，不与前轮 140 或 Phase 8 的历史结果累加。执行集合为 frontend-*、customer-ui-redesign、detail-merchant-theme、review-purchase-boundary、staging-payments-ui、interaction-cloud-sync、build-navigation-isolation；命令及日志见 [改版交付](../CUSTOMER_UI_REDESIGN.md) 本轮追加节与 `.local/detail-ui-full-regression.log`。

新增详情/主题 19 项；保留并实际重跑购物车快速数量/慢请求/UI trace 节点身份、评价可信购买、未支付禁接单、模拟支付来源标识及商家权限隔离。修正旧测试夹具对上轮 catalog 工厂、普通订单路由和已选状态的假设；底栏 CSS 契约更新至 104rpx，原金额保护断言保留。初次针对性执行 158 项有 1 个旧高度契约失败；扩大集合后旧导航夹具产生 18 个适配失败；修正夹具后最终 297 项全通过，不能将中间执行次数累计为覆盖数量。

TypeScript、三目标依赖边界、Combined/Customer/Merchant 实际构建及输出清单通过。最新原 phone-preview：44 WXML、49 WXSS 经微信原生编译器通过。预检 0 错误、1 条生成 JS 项目无 TS 插件的提示。本轮改动范围 Git 空白检查通过；全量工作区仍有前轮 profile.wxss 末尾空行，未改动该文件。

19 个实际商家页面仅改 WXSS/导航配色；本轮开始时的 19 份 TS 与 19 份 WXML SHA-256 均匹配，全部页面原布局属性保留。商品详情无 SKU/标签 API，不显示虚假选项；收藏未开通；公共评价匿名显示，可信购买/审核/举报权限沿用既有 API。购物车底栏由 264rpx+安全区缩为固定 104rpx，价格确认和结算校验保留。

原预览目录常规重建遇到 EPERM，未删除/强杀/另建目录；校验后就地刷新生成文件并用原 phone-preview tsconfig 重编译，保留 cloud-only staging 配置、AppID 与域名校验，更新后产物/模板检查通过。没有上传、部署、数据库迁移或 Phase 8 V2 资源操作。真实微信/真机渲染、真实商品/配送/商家写入联调未验收；具体待验项见交付文档。本条仅更新 UI 状态，不改变其他 Phase 8 测试资源或数据库状态结论。
`;
fs.appendFileSync('docs/testing/TEST_HISTORY.md',record);fs.appendFileSync('docs/testing/TEST_STATUS.md',record);
console.log('Appended current delivery and test records to all three required documents.');
