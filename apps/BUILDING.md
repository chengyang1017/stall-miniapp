# 三目标构建说明（Phase 30）

## 真实手机云端预览补充（2026-10-27）

顾客与商家同一AppID的真机手感预览复用Combined，不申请第二个小程序、不依赖独立角色构建。操作手册与测试号/正式AppID边界见 [PHONE_PREVIEW.md](../docs/testing/PHONE_PREVIEW.md)。获得独立HTTPS Staging、真实店铺及微信平台配置后：

```powershell
npm run preview:phone -- --check C:\YourApprovedConfig\phone-staging.json
npm run preview:phone -- --prepare C:\YourApprovedConfig\phone-staging.json
```

仅公开配置，模板apps/phone-preview.example.json故意留空并拒绝生成。成功时导入dist/phone-preview到微信工具；生成配置强制CLOUD_ONLY与域名检查，不回退本机演示，不需要手机输入Token/API/店铺。原项目、普通Combined和现有未提交源码不被配置器改写；--prepare只重建自身标记的固定生成目录。实际微信编译、扫码、真实登录、数据库/部署均是另行授权后的操作，本轮尚未完成。以下原阶段说明保留历史时点，不作为独立角色构建当前全绿的证明。

根目录仍是 Combined 微信开发者工具工程；根 project.config.json 未改动。`apps/build-targets.json` 是三目标页面归属、入口、依赖别名的唯一构建清单，不复制完整源码树。

在项目根目录执行（无需启动后端）：

```powershell
npm run check:boundaries
npm run build:combined
npm run build:customer
npm run build:merchant
npm run check:build-output
```

`npm run build` 默认构建 Combined。输出分别为 dist/combined、dist/customer、dist/merchant，已由现有 dist/ 忽略规则覆盖。构建只替换带本构建器标记的对应输出目录，拒绝未知目录或链接，不修改源页面。每个目录包含独立 project.config.json、编译后的 miniprogram/、所选依赖暂存 source/、tsconfig.json、build-manifest.json。微信开发者工具导入目标目录即可；运行根项目仍是原 Combined。不要把 source/ 当作小程序根。

Customer 保留首页、购物车、订单、我的四个 Tab；Merchant 从商家工作台启动，没有顾客 TabBar，沿用工作台现有导航。各自固定角色聊天、凭证页面仅注册在所属应用。Combined 另保留旧聊天/凭证 URL 重定向兼容入口。

使用已获授权的 AppID 时可显式传入：

```powershell
$env:STALL_CUSTOMER_APPID = 'wx0123456789abcdef' # 示例，替换为真实授权 AppID
npm run build:customer
$env:STALL_MERCHANT_APPID = 'wx0123456789abcdef' # 示例，不表示申请或共享身份
npm run build:merchant
```

仅 AppID 进入公开项目配置。Customer 未传入时沿用当前根工程 AppID；Merchant 未传入时使用 touristappid，只适合编译准备，不承诺登录。不会读取或复制 .env、AppSecret、会话、project.private.config.json 或后端文件。云端可信地址仍由 miniprogram/config/cloud.ts 配置。切勿在源码或构建参数中放 AppSecret。

构建过程：校验完整页面归属和工具模块归属 → 解析静态 import/export（含类型）与 JSON 组件 → 检查角色边界和循环 → 按目标选择依赖闭包并替换显式宿主导航适配器 → 复制依赖资源 → TypeScript 严格编译为 CommonJS JS → 检查页面、导航、输出依赖和产物清单。组件、WXML 模板和 WXSS 导入递归进入目标；非声明动态加载会被拒绝。新增页面必须同时登记归属和目标，Combined 页清单必须与默认 app.json 一致。

检查只分析源文件/产物，不执行页面、业务请求或测试。`check:build-output` 可再次检查三个已有输出，发现额外页面、异端目录、缺失 require 依赖、清单不一致会失败。具体页面、源码、资源全量列表均在对应 build-manifest.json；源码图可用 `node scripts/check-boundaries.mjs --list` 重复查看。

本阶段实际完成三目标 TypeScript 编译和上述静态检查；没有运行微信官方开发者工具/CI 的 WXML、WXSS、平台打包编译，没有真机或业务集成验证。独立发布前仍须分别在微信开发者工具执行平台编译、校验基础库/隐私声明/域名/体积，并在另行授权的阶段进行实际验证。不能将这里的 JS 编译成功等同微信发布成功。

后端当前仍只接受 legacy 单 AppID 的微信登录。传入独立 AppID 不会使后端自动支持该 AppID；双 AppID 的身份及店铺码操作步骤见 backend/APP_SEPARATION_READINESS.md。支付、数据库和 R2 不受本次构建改动影响。

## Phase31 定位增量

当前页面数 Combined34、Customer12、Merchant18。两个固定角色 tracking 页面分别归属各端。Combined/Merchant 只声明前台持续定位及用途；Customer构建移除持续定位声明，地图查看不包含GPS采集/上传代码。三个产物均不启用后台定位，产物检查额外验证此规则。GPS服务端需019迁移，配置和真实定位未验证。详情见 ../backend/GPS_TRACKING.md。

## Phase32 商品评价增量

当前页面数Combined36、Customer13、Merchant19。Customer评价展示/本人编辑及图片上传仅进入顾客目标；Merchant管理/回复仅进入商家目标；共享review-card不包含角色API。平台审核只在后端。Phase31 GPS隔离和默认前台声明保持不变。运行新接口需020及真实支付核验/私有图片/审核配置，详情见 ../backend/PRODUCT_REVIEWS.md。本阶段完成的仍是TypeScript编译及静态检查，未执行微信平台编译或业务测试。
