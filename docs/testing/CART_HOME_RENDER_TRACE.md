# 购物车与首页渲染稳定性检查（2026-10-28）

本轮源码基线：`503a930465bd94f0ae276bc57e8ac3519d8eee7b`，开始工作区干净。只修改本地源码、测试和文档；没有访问真实API、修改Render/Neon、连接数据库、部署或Git提交/推送。以下把源码复现、模拟视图和实际微信运行时分开。

## 一、已找到的具体调用路径

### 1. 旧预览目录仍然执行清空列表的旧版本

只读查看已有 `dist/phone-preview/miniprogram/pages/cart/cart.js`：第54行仍在每次refreshCloud开始时提交items=[]、totalCount=0；第136/147行数量操作等待changeCloudCart后再refresh。其路径为：点击加号→等待商品校验→refresh→refreshCloud清空items→请求完成重新填充。对应WXML的wx:for在空数组时确实没有商品节点，不能用新源码测试通过排除这一旧产物路径。

同一旧目录的 `pages/index/index.js:172` 仍在loadCloudHome开始时清空products、discountedProducts和categories。旧目录的文件时间为2026-10-28 12:46左右，本轮读取时尚未包含此前的状态保持修复。**尚未读取实际开发者工具当前项目根目录，不能断言用户当时一定运行这个目录。请先核对项目详情中的目录。**

本轮再次执行默认phone-preview重建，Windows返回EPERM，发生在删除原输出目录阶段。没有强删、改ACL或直接修改其编译JS；也不能证明具体占用者。新增受限的命名输出选项后，以同一份 `.local/phone-staging.json` 成功生成全新 `dist/phone-preview-trace`。它仍为Combined、同一AppID、同一真实Staging和CLOUD_ONLY，不是第二套商城或演示环境。

### 2. 基线首页的retained条件会在相同店铺扫码入口等待时失效

基线onShow将hasPendingStoreEntry纳入retained条件；即使已确认身份和店铺未变，存在待解析scene时也同步清空products/categories等，再等待resolveStoreEntry。用 `git show 503a930...` 的真实页面函数在内存中复现：原products.length=1，resolver尚未完成时变为0、entryLoading=true。

现在根据API/店铺/会话上下文单独决定是否清除数据；待确认的新扫码目标暂时隐藏持久容器，确认同店铺后复用节点。未确认目标时不能把旧店铺当作新店铺展示。真实上下文变化仍清除旧数据；同身份普通返回不隐藏目录。真实登录初始化重复执行、但已有绑定和token未变时，上下文保持不变；**真正更换token仍按会话变化失效，不弱化隔离。**

### 3. 商品没有归零，也可能产生重绘与布局跳动

基线购物车确认操作提交完整items数组，包含未变的imageUrl和其他商品。真实基线函数复现：单次加号确认产生一次完整items字段提交。现在普通确认用 `items[i].quantity / subtotalText / priceText` 等真实差异；不变图片与行根不重复传输。新增/删除/重排才允许结构性数组变化，保留同key行的客户端附加字段。

基线刷新提示使用class=empty的动态节点，大上下padding会推移列表。现在首页/购物车保留44rpx同步状态槽，不因正常请求开始/结束插入或移除整块加载面板。错误仍明确显示，错误出现可能正常增加页面高度，不能声称所有布局永不变化。

缺图设置刷新失败以前回写placeholderStyle=none，使所有缺图样式wx:if分支均消失。现在同API/店铺短暂网络异常保留已确认样式并提示；首次没有可信配置仍为none，不回退演示样式。真实商品图片不改为占位图。

## 二、源码行为与网络

- 购物车每批数量意图只取一次最新商品quote，用同一quote校验库存、价格、持久化数量和计算总价，不再串行重复GET同一商品。十次同步快速加号的离线测试是一次GET；较晚到达的后续点击仍可产生下一批请求，不宣称无限点击永久只一次请求。
- 客户端数量先按行显示；金额确认前为“--/待确认”，不凭旧价宣布最终应付。错误保留内容、恢复实际持久化数量；401/403清除展示，持久化购物车不删除。真实下单价格、库存及身份校验仍由服务端执行。
- 现有购物车是按会话/店铺隔离的客户端临时选择加后端商品信息，并非服务端购物车写入API；不得把数量本地持久化称为服务器保存购物车成功。
- 首页使用已有business响应应用缺图设置，避免onShow额外读取一次相同经营配置；普通renderCloudProducts不再重复拉取购物车汇总，初次加载成功及实际加购后仍更新。
- 购物车商品/配送规则仍分别处理错误，配送未配置不能结算。首页目录不会由cloudBusy控制wx:if；外层常驻hidden容器和wx:key保持节点身份。

## 三、开发者工具追踪（默认关闭）

仅在 `wx.getSystemInfoSync().platform === 'devtools'` 且storage开关为true时启用；手机平台即使有相同开关也不启用。它不授予权限、不改变服务器认证、不上传日志。

在**新预览项目**控制台运行：

```js
wx.setStorageSync('stall_ui_trace_v1', true)
// 随后进入/重新显示首页或购物车，使本页面安装追踪。
getApp().globalData.uiTrace.read()
getApp().globalData.uiTrace.clear()
// 结束排查：
wx.removeStorageSync('stall_ui_trace_v1')
```

控制台前缀 `[stall-ui]`，内存环最多600条。记录onShow/onHide/onUnload、刷新/数量意图、上下文重置和丢弃旧响应、setData调用前/应用后/回调、patch字段名、调用路径和行号、items/products数量及数量值、请求开始/完成/耗时、原生行矩形与组件实例attached/detached。

身份以C/A/S/I别名（上下文/API/店铺/会话）表示，商品以R别名表示；不输出token、原始身份、API URL、商品ID、名称、图片URL或请求正文。read只返回副本；不持久化业务数据。禁止为了排查额外打印原始认证headers。若出现setData:hook-unavailable，说明运行时不能替换该方法，不能宣称已有完整setData追踪。

`setData:applied`是JS数据，`flushed`是setData回调，不是屏幕像素证明；要同时看实际render-probe生命周期、render:rects及开发者工具WXML/性能面板。追踪带来额外console/selector开销，不能用于宣称60FPS。打开/关闭开关会改变诊断探针本身，先启用再清日志，测量期间不要反复切换开关。

## 四、实际验证步骤

1. 开发者工具导入 `C:/Users/USER/WeChatProjects/miniprogram-1/dist/phone-preview-trace`，确认项目详情目录。编译源码已由准备器生成，勿编辑dist作为修复。
2. 开启上述开关，进入有真实商品的购物车，等待首次加载后清日志。记录行探针instance及render:rects。连续加号10次，再减号，模拟慢网络并切页返回。
3. 同身份/店铺普通数量确认应只提交items下标字段，不应出现items长度归零，不应出现同key probe detached后换instance attached；正常刷新状态槽不推移列表。减到0确实删除商品时，允许该行正常detach。
4. 首页同上下文返回、刷新、请求暂时失败，应保留products和同key行。检查home.restore中的sameContext/retained、context别名及setData调用origin。若I变化但A/S不变，先排查实际会话更换，而非隐藏该安全失效。
5. 对照request:start/end的id和operation：购物车一批应只有一个catalog.ids quote；配送与经营配置请求各有独立用途。不要把调用helper次数当HTTP次数。
6. 实际退出、切店或401/403时应清除旧内容；这些节点销毁是必要安全行为。新scene未确认时可暂时hidden，确认同店后节点instance应不变。无需修改数据库或配送配置验证。
7. 使用WXML树、性能录制与屏幕录制对应时间线，确认商品节点/图片是否真正消失。**本轮未操控真实微信运行时或手机；上述结果仍待开发者工具与真机采集。**

后续生成默认目录（先自行确认不再占用）：`npm run preview:phone -- --prepare ".local\phone-staging.json"`。本轮采用的新目录命令：

```text
npm run preview:phone -- --prepare ".local\phone-staging.json" --output phone-preview-trace
```

命名输出只接受phone-preview-加小写字母数字/连字符的受限名称，并要求该目录此前不存在；默认入口不变；拒绝覆盖命名输出、目录穿越、绝对路径和其他目标名称。再次使用需另选新名称，不能用这条命令覆盖本次trace目录。

## 五、本轮执行证据

- 新增 `frontend-render-stability.test.mjs` 25项：执行真实页面、helper、transport和探针函数，模拟可控请求与**排队setData的JS数据/视图数据差异**，依据key维护模拟节点并调用真实组件生命周期；包括慢请求、10次点击、同店scene、冷启动/返回、会话/API/店铺变化、401/403、促销及非法价格、日志脱敏和开关。
- phone-preview-safety新增3项：输出名边界、CLI在读取profile/编译前拒绝非法路径、非预览构建拒绝输出覆盖。修改既有测试仅更新嵌套setData路径处理、依赖夹具和新quote调用形态，保留身份/权限/价格/错误等断言。
- 实际执行联合回归：**324通过、0失败、0跳过、0取消**；包含新增28项及原296项对应回归，不能与历史数字再相加成唯一测试总量。
- TypeScript noEmit、依赖边界、Combined/Customer/Merchant纯TS编译及产物验证、新phone-preview-trace编译及产物验证、8个相关MJS语法检查、git diff --check均通过。
- 模拟节点生命周期不是微信渲染器结果；TS构建不是微信平台编译/上传；未访问真实Staging或执行数据库、Docker操作。测试数据只存在于离线测试夹具，不进入商城运行包。

## 六、文件范围

页面：cart与index各TS/WXML/WXSS/JSON；共享运行时：stableRows.ts、uiTrace.ts；诊断组件render-probe的TS/JSON/WXML/WXSS；商品/经营transport：shared/api/catalog.ts、business.ts；utils：cloudCart.ts、cloudCheckout.ts、storeEntry.ts、storePresentation.ts。

构建：scripts/phone-preview.mjs、miniapp-output.mjs、build-miniapp.mjs。测试：新增frontend-render-stability，更新frontend-interaction-state、frontend-navigation-cart-cloud、build-navigation-isolation及phone-preview-safety。文档：本报告、TEST_STATUS.md、TEST_HISTORY.md。未修改后台业务、SQL、认证规则、微信正式配置或.local配置。
