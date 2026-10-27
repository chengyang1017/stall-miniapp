# 项目负责人预览交接

## FE-02｜2026-10-27｜WAITING_FOR_OWNER_PREVIEW

责任：项目负责人在另一台电脑执行微信开发者工具和 iOS/Android 验证。前端开发者只交付源码、离线测试与说明，不要求其安装或登录微信。

已推送代码基线：4278c40802cdf7054a4a785bec00171743e5214f（origin/zh，普通 push 后 ls-remote 已核验）。FE-02 只调整测试夹具、离线校验入口和文档，产品行为基线仍为该提交；FE-02 自身提交以 Git 历史中 `test(frontend): repair navigation fixtures and persist collaboration rules` 为准，后续交接追加精确 SHA。

在自己的授权工作区 fetch 后核对 zh，再执行 npm ci、npm run verify:frontend。产物 Combined/Customer/Merchant 为36/13/19页；实际结果和原始日志见 TEST_LOG.md。不是微信平台成功证明。

| 目标与页面 | 操作 | 预期 / 待观察 |
| --- | --- | --- |
| dist/combined，pages/index/index | 干净演示存储启动，浏览商品/搜索/分类/加购 | 展示本机 DEMO，不声称跨设备或收款；布局、点击、错误状态截图 |
| Combined，pages/admin/admin | 编译模式启动工作台，点击进入顾客端 | 返回首页 Tab；与账号与权限按钮间距清楚 |
| Combined，pages/merchant-login/merchant-login | 仅用已授权隔离 staging，登录后返回首页/我的 | 服务端有商家权限才允许工作台；无权限/过期会话不绕过；不要求分享令牌 |
| dist/customer，pages/index/index、pages/profile/profile | 浏览首页/我的，有旧商家偏好时再次启动 | 不出现商家导航，不尝试跳不存在的 admin 页面 |
| dist/merchant，pages/admin/admin | 启动工作台 | 不显示进入顾客端，不尝试 switchTab 到未注册的首页 |
| Combined，购物车/结算/订单 | 合成资料演示购物，授权 staging 另行记录 | 空态/网络失败/重复点击不伪造成功；云端订单提示待支付，不能显示已扣款 |

负责人回传：Git SHA、构建目标、DevTools/基础库版本、游客/测试号/正式模式（不含秘密）、具体页面/操作、截图或原始编译报错、预期/实际。真机另附 iOS/Android 版本及机型；不得含真实顾客地址/手机号/支付数据。

平台/真机：WAITING_FOR_OWNER_PREVIEW，当前0条实际回传证据。staging、支付、双AppID/域名/隐私等依赖见 PLATFORM_BLOCKERS.md。未经授权不连旧 B0、生产或真实支付。
