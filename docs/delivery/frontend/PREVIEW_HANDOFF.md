# 项目负责人预览交接

## 最新可预览版本｜FE-04｜2026-10-27

**产品提交：27646b30ab3d9b13d26db93de71e37b853c236db**（zh）。已普通推送并用ls-remote核验远端一致，工作区当时干净。最后的文档回执不改变此受测产品代码。

- 三目标36/13/19页构建、边界、产物PASS；`npm run verify:frontend`最终169通过/0失败/0跳过，原始日志evidence/fe04-verify-final.txt。
- 预览清单：本文件FE-04增量（本地checkout→订单Tab、一次性新单提示、重复确认/取消/隐藏/营业暂停/改价重确认），并保留FE-02/03角色入口和登录竞态验收。
- GitHub草稿PR [#2](https://github.com/chengyang1017/stall-miniapp/pull/2)仍待负责人审核，不自动合并。
- 微信开发者工具、iOS、Android均WAITING_FOR_OWNER_PREVIEW，目前0条实际反馈；staging/真实登录/支付未验证。完整进度和未完工作见STATUS_AUDIT.md。
- 当前DEVELOPMENT，不是“独立任务全部完成/最终交付”。下一项FE-05云端结算生命周期仍可离线推进。


## 最新可预览版本｜FE-03｜2026-10-27

- **产品代码提交：91074bc20666693effe12f29594c7a3253ab6b4c**，已推送origin/zh且ls-remote核验一致；FE-02为172aa7d254432f97de924ebcf8032361fc29cb22。
- 草稿PR：[#2](https://github.com/chengyang1017/stall-miniapp/pull/2)，zh → main，未合并。后续仅交接文档更新不会改变此代码基线；负责人可在干净授权目录明确检出该SHA，或核对zh最新历史中的产品代码一致性。
- 本次构建：Combined/Customer/Merchant均通过（36/13/19页），最终143离线测试通过、0失败、0跳过；evidence/fe03-verify-final.txt。
- 预览任务：下方FE-02的角色入口与FE-03的登录/权限/退出竞态步骤，尤其merchant-login在Combined/Merchant下的离开后回写、重复点击、错误和新身份保护。
- 负责人执行平台与真机，本开发者不安装/登录/运行微信工具。状态WAITING_FOR_OWNER_PREVIEW，当前0条实际平台/真机反馈。


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

## FE-03 待预览增量｜WAITING_FOR_OWNER_PREVIEW

FE-02提交已确认：172aa7d254432f97de924ebcf8032361fc29cb22，已push并核验。FE-03修复见Git历史 `fix(frontend): discard stale WeChat login and merchant page responses`；提交后追加精确SHA供负责人定位。

三目标构建/边界/产物PASS，最终离线143通过/0失败/0跳过（fe03-verify-final.txt）。该结果不包括微信平台或真实登录。

负责人在已授权隔离环境检查 pages/merchant-login/merchant-login（Combined及Merchant）：

1. 正常显式微信登录+服务器店铺授权，应进入商家工作台；被动进入账号页只核验不自动跳。
2. 登录/核验中后端地址、店铺及本地测试会话输入应禁用；重复点击不产生并行跳转。
3. 请求中离开页面，再返回：旧响应不能迟到跳工作台、显示已认证或解除新请求loading。网络断开/超时显示失败并可重试。
4. 在另一入口切换店铺/后端/身份，或退出后返回旧登录响应：旧会话不能写回当前身份；不需要在反馈中提供任何令牌。
5. 退出请求未完成时离开、从其他入口换身份再返回，旧退出响应不影响新身份验证；服务端撤销未确认时应如实提示。
6. 顾客端地址/客服/评价的微信登录调用共享auth，需负责人在相同正式/测试号权限下抽查正常登录与失败重试。评价/GPS按原首版范围审批，不能绕过支付审核。

回传原始页面路径、提交SHA、工具/基础库版本、模式、步骤与脱敏截图/错误。当前0条平台/真机回传，仍WAITING_FOR_OWNER_PREVIEW。

## FE-04 待预览增量｜WAITING_FOR_OWNER_PREVIEW

代码提交按zh历史中的 `fix(frontend): make demo checkout confirmation and tab navigation safe` 定位；本轮提交后追加精确SHA。最终169离线测试通过、0失败/跳过，三个目标构建及边界/产物检查PASS；证据fe04-verify-final.txt，不等于平台通过。

负责人在Combined/Customer使用合成演示资料与可配送时段：

1. pages/checkout/checkout正常确认一次：跳到底部“订单”Tab，不报redirectTo不能打开Tab；显示新演示单提示与“待付款”，没有扣款。有限库存按数量预留，普通购物车清空；立即购买只清自己的临时选择。
2. 订单Tab先停留“已完成”筛选，再返回checkout新建：应选“全部”展示新单；再次离开回来，不重放新单提示。
3. 连续点击确认按钮：只出现一个确认弹窗；取消/弹窗失败不建单，购物车保留，可再次确认。
4. 弹窗期间离开/后台切换、调整营业/配送或演示商品价格：旧确认不偷偷建单；价钱/数量/地址/配送时段变化要刷新并重新确认。
5. 导航失败时显示“演示订单已保存/尚未扣款/从底部订单查看”，不能误报库存变化并要求重新建单。

只验本机DEMO；独立AppID/跨设备不共享演示存储。平台实际结果仍0条，请回传目标/SHA/工具/基础库/账号模式、页面步骤及脱敏截图/错误。全面进度见STATUS_AUDIT.md，尚未进入最终收尾。
