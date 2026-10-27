# 真实微信手机预览：同一商城、独立 Staging

本轮交付的是现有 Combined 商城的云端预览构建和离线安全测试，**不是离线商城、数据种子或第二套业务系统**。手机必须连接实际 Node.js + PostgreSQL Staging，所有商品/订单/权限来自该服务。本文命令是后续操作流程，未执行部署、微信平台发布或数据库写入。

## 当前实际条件

- 根工程 AppID 为 `wxeb1890c397d038d8`；用户说明当前使用微信测试 AppID。仅凭这个字符串不能确定账号类目、AppSecret/code2Session、域名或扫码权限。
- 原 `miniprogram/config/cloud.ts` 的 API/default store 为空；本轮不伪造真实域名或店铺。
- 根工程本机 project.private.config.json 的 urlCheck=false；本轮只读取该布尔值，未改文件。专用生成项目不复制它并设urlCheck=true，不能把原模拟器跳过域名的结果当成真机连通证据。
- 未发现既有 Staging 部署配置；仅有本地 compose.dev 与隔离数据库测试设施。backend 只有 .env.example；本次进程的 DATABASE_URL、WX_APPID、WX_APPSECRET 和所查对象存储配置均未设置。没有连接任何数据库核实店铺、商品或商家绑定。
- 现成后端支持 `/v1/auth/wechat`、`/v1/auth/me`、店铺商品、配送、地址、订单及商家授权接口；无需第二套认证。登录通过服务端微信 code2Session，主体格式 `wx:<AppID>:<OpenID>`，数据库会话只存 Token 摘要。
- 用户在马来西亚不改变商城的 CNY/人民币、Asia/Shanghai/北京时间规则；跨境网络延迟需真实手机 Wi-Fi/移动网络分别体验，不能由编译推断。

**当前没有可用 Staging 地址/真实测试店铺，因而尚不能交付可扫码连通的真实环境。**不得为了演示而准备假商品或假订单。根工程原有开发模式保留兼容，但不是本方案的真机交付入口；请使用下面的专用生成目录。

## 先单独授权的环境准备

推荐拓扑：手机 → 已登记合法域名的独立 HTTPS Staging API → 同一份 backend/src → 私网 PostgreSQL Staging。

1. 运维提供独立 `staging`/`stage`/`test` 主机名、DNS、可信 TLS 证书、后端主机及日志/限流策略。地址必须是 origin，不带端口、路径、账号密码或查询参数。名称含 staging 只是防误用条件，不是环境隔离证明。
2. **只有 HTTPS API 443 对外**。PG 在私网/回环网络，仅允许该后端专用角色访问；不公开 5432/55432/55433，不把当前 stall_dev、旧 Phase8 B0 或 V2 测试实例暴露到公网，不使用临时隧道直接转发开发库/API作为交付。
3. 使用专用 Staging 数据库、业务用户、管理员凭据和独立存储。用户另行授权后，按既有结构实际初始化并验收 001—020；不把本轮测试视为已执行迁移，不自动复用 Phase8 凭据/卷。后端启动会自动运行库存预留到期和定位保留任务，启动也必须单独批准，确认只接专用 Staging。
4. 在后端私有环境设置 DATABASE_URL、按拓扑需要的 PG_SSL/HOST/PORT、与预览包相同的 WX_APPID/WX_APPSECRET。Secret 不放在小程序、公开 JSON、URL 或 Git；不要把微信 session_key 返回给手机。实际 PostgreSQL TLS/私网证据由运维核验，不能仅凭 PG_SSL 字符串认定隔离。
5. 店铺需真实存在且启用，商品由授权商家在真实 Staging 维护；配送/营业规则需真实可用，未配置仍禁止下单。不自动导入本机数据、生成种子或复制生产个人资料。
6. 微信管理员确认账号控制权、预览/体验成员权限、AppID 的登录能力，并登记 API request 合法域名；图片/归档下载及对象存储上传分别检查 downloadFile/uploadFile 合法域名、HTTPS 和访问策略。浏览无图片的真实商品不要求伪造图片；图片上传和私有凭证需独立存储授权。
7. 用户实际微信登录后，维护者在受控环境确认该 AppID 下的真实主体，由**另行授权的管理员**绑定到正确 merchant_members 及 owner/manager/staff 角色。无自助升权，不用开发 Token 代替真实微信身份。不要把 Token/OpenID 查询结果截图到公开日志或聊天。普通顾客不加商家成员。

   绑定前通过独立可信渠道核对商家本人及精确微信主体，不能猜“最后一条登录会话”就是店主，也不能只凭前端提交的角色/公开店铺slug授予owner。当前没有自动商家注册/升权功能；既有issue-ui-session-dev脚本只用于本机开发，不适用于本方案。

不需要变更现有支付/库存/履约规则。真实支付由客户负责；没有可信支付的订单不能假装已收款，也不能为了体验接单/配送而把订单改为 paid。可体验商品管理、浏览、购物车、地址及真实规则的拒绝行为；支付完成后的履约验收等待正式支付对接。

## 一次配置，多次预览

维护者在仓库外准备**仅有公开配置**的 JSON，字段模板见 `apps/phone-preview.example.json`。模板故意留空且会拒绝构建；不要直接填写在手机上，也不要把 Secret 放进去。

字段：version=1、environment=staging、apiBase=实际 HTTPS Staging origin、storeSlug=实际店铺标识、appId=本次有权使用的微信 AppID。构建器拒绝多余字段、凭据 URL、HTTP/回环、私有主机名、无明确 staging 标识的地址和 touristappid；这些是静态校验，不是 DNS/TLS/平台真实性验证。

在项目根目录：

```powershell
# 路径指向运维已核实的公开配置；这里不提供虚构域名。
npm run preview:phone -- --check C:\YourApprovedConfig\phone-staging.json
npm run preview:phone -- --prepare C:\YourApprovedConfig\phone-staging.json
```

`--check` 只读、不请求 API。`--prepare` 只生成/更新构建器自己拥有的 `dist/phone-preview/`，拒绝未知或链接输出目录；它复用 Combined 页面、依赖、TypeScript 编译和完整产物检查，不启动服务、不迁移、不上传、不申请 AppID。默认 `npm run build` 和根项目仍是 Combined，不覆盖源码 cloud.ts 或现有未提交修改。

生成包 `project.config.json` 使用指定 AppID，启用域名检查；`miniprogram/config/cloud.js` 固定可信 origin/默认店铺、CLOUD_ONLY=true。不复制后端/.env/项目私有配置。缺少/损坏本机店铺缓存时仍走固定云端地址，无法解析店铺则明确失败，不转演示分支。分享/扫码最多选择同一可信 API 下的店铺，不接受 URL 传入任意 API 或商家角色。

第一次进入该 API/AppID 组合会清掉旧环境会话及商家入口偏好；保留原购物车/演示数据但不上传、不作为云端结果使用。后续同环境打开保留合法服务端会话，无需每次填地址、店铺或 Token。切换账号要退出/重新微信登录，私人缓存继续按身份/店铺隔离。

测试号与正式 AppID 都复用这份代码；更换 AppID/后端 origin 需重新准备包和对应后端微信配置。不同 AppID 的 OpenID/成员绑定不自动共享，不直接迁移生产身份记录。

## 开发者工具 → 手机

1. 上述真实 Staging 经独立授权启用、公开配置核实后，运行 --check/--prepare；当前尚未执行这一真实配置准备。
2. 微信开发者工具导入 **`dist/phone-preview`**，不是根项目、source/ 或失败的独立角色产物。确认 AppID 与后端 WX_APPID 一致，不使用 touristappid，不以“忽略域名/TLS校验”代替平台配置。
3. 工具执行微信平台编译；核对运行页的 Staging 标识、API、店铺，点击工具“预览”，由有权限的实际微信扫码。这里用的是 IDE 预览二维码；现有“商家正式店铺码”后端固定 release 环境，需要正式发布，不是本轮扫码入口。
4. 首次未登录可浏览当前店铺公开商品。看到的应是实际数据库商品；API失败应显示错误，禁止看到本机演示商品冒充真实返回。
5. 个人中心点“微信登录／重新验证身份”：微信 code 只发到固定 Staging 后端，服务端交换后持有会话；不让手机粘贴本地 Token。
6. 普通顾客：地址/购物车/商品详情/本人订单、客服均受真实身份与服务端约束；商家入口不出现。配送缺失时商品仍可查看，结算禁用。
7. 已绑定商家：个人中心在服务端验证后出现“商家工作台”，点击时再次验证。工作台本身也先验证，再加载经营数据；未授权/过期会话只显示权限错误，不加载经营卡片。账号与权限页自动沿用同一 API/店铺，无需手填。
8. 将退到后台、反复进入页面、切换店铺/账号、Wi-Fi→移动网络、弱网/断网重试列为手感检查；不要只记录“模拟器成功”。任何实际创建商品、订单、地址、消息或配置修改都会写入真实 Staging，须在后续运行授权范围内执行。

## 测试 AppID 与正式 AppID

| 账号情况 | 本方案如何处理 | 仍须平台/实际验证 |
| --- | --- | --- |
| touristappid/无真实AppID | 构建配置拒绝，不能交付真实微信身份方案 | 取得有权使用的微信账号 |
| 用户所说的微信测试号（wx...） | 可以作为明确的预览配置输入；不假设具有正式账号全部能力 | 必须确认提供匹配的可用AppSecret、code2Session、预览成员/域名/接口权限。缺少任一能力时登录明确失败，不伪造顾客或商家身份 |
| 客户正式AppID | 同一套业务/构建流程，无需重写商城 | 主体资质、合法域名、后台Secret、商家身份重新绑定、正式用户/支付/隐私/位置/UGC等能力审核 |
| 正式支付、退款、订阅通知、GPS后台/评价审核等 | 本轮不自动启用，也不因能扫码就算完成 | 客户支付模块及微信平台实际能力、合规配置和独立验收 |

目前只读访问微信官方[登录文档](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)、[网络文档](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)、[测试号说明](https://developers.weixin.qq.com/miniprogram/dev/devtools/sandbox.html)、[预览说明](https://developers.weixin.qq.com/miniprogram/dev/devtools/preview.html)均被工具访问限制阻断；未假称已从当前官方页面核实测试号具体权限。由微信管理员在实际账号后台确认，表格不是对该测试号准入的保证。

## 错误诊断与验收记录

| 现象 | 核对 | 不允许的绕过 |
| --- | --- | --- |
| --check失败 | 是否真实 HTTPS staging origin、实际店铺/AppID；JSON只含五个公开字段 | 填本机IP/Token或编造域名 |
| request:fail/domain not in list/TLS失败 | 手机DNS/TLS链、微信request合法域名、443防火墙、当前AppID、真机基础库 | 公开PG、关闭TLS验证当作通过 |
| preview_appid_mismatch/登录失败/503 auth_not_configured | 工具项目AppID与profile/后端WX_APPID一致，后台Secret/code2Session出站可用 | 本地Token、伪造openid/会话 |
| 401 | 真实微信重登、会话过期/已退出；敏感令牌不记入报告 | 把权限检查改成永远成功 |
| 403或商家入口不出现 | 当前AppID下真实主体的成员绑定与正确店铺/角色；后台维护者受控核查 | 手机自选owner、复制其他人的Token |
| 店铺404/商品为空 | storeSlug/启用状态/实际商品及上架计划；区分真正空集合与请求失败 | 自动插入假商品或改读本机数据 |
| 配送错误或未支付操作被拒绝 | 真实配置、支付契约、库存/营业和履约状态 | 默认配送/假支付来解锁按钮 |
| 图片/凭证打不开 | 上传/下载合法域名、私有桶、短时授权URL、账号/订单归属 | 改公开私有凭证桶 |

后续记录：代码SHA、手机系统/微信版本、账号类型（非Token）、预览包/profile、Wi-Fi/移动网络、请求路径和HTTP状态（隐去身份资料）、实际步骤/期望/结果。不保存密码、完整签名URL、手机号/地址或认证头。真实Phone验收目前未执行；本轮仅离线测试与编译，不证明任何Staging或微信环境已启用。

## 本轮源码与验证记录（2026-10-27）

公开配置及构建：`apps/phone-preview.example.json`、`scripts/phone-preview-profile.mjs`、`scripts/phone-preview.mjs`、package.json 的 preview:phone；复用并扩展 build-miniapp/miniapp-output，保留全部原产物检查。

运行期：config/cloud 增加默认关闭的专用构建标记；shared/runtime/phonePreview 固定来源/清旧环境会话，context 在该模式只返回云端上下文；auth 使用实际wx.login并校验AppID/来源/异步身份；merchant mutation 同样禁止把Token发往异域。app 启动接入，storeEntry 只从可信API解析店铺；profile 增加无需Token的微信登录，merchant-login/cloud-catalog 隐藏并固定连接配置；admin 在权限验证前不展示经营卡片。

新增 `backend/tests/phone-preview-safety.test.mjs` **35项全通过**。联合运行前端导航、auth-sessions、wechat-login、miniapp-preview-audit、miniapp-preview-build-guard和build-role-contracts：**171通过、0失败、0跳过、0取消**，已包含35项新测试及上轮购物车回归，不再相加。全部是离线模拟传输/VM/静态或编译检查；测试用常量仅位于测试夹具，不作为商城数据来源。最初4项失败中3项为VM跨上下文对象比较，使用JSON值归一后保留完整结构断言；1项促使策略不再把.test顶级域本身当作Staging标签。没有删减断言或绕过权限。

TypeScript noEmit、5项相关MJS语法检查、三目标依赖边界检查及Combined构建通过（126模块、36页、259产物）。真实profile尚无可填值，**没有执行真实配置的 --prepare，也没有可供真机连通的phone-preview包**；空模板拒绝在输出创建前退出，负向CLI测试已执行。普通Combined编译不是CLOUD_ONLY包的微信平台/真机验收。Customer/Merchant独立构建的既有跨端导航阻碍不属于本方案入口，本轮没有宣称修复。

上一轮购物车未提交修复全部保留。本轮没有改业务数据库、配送配置或后端业务源码；没有新增迁移、下载/安装依赖、启动API/worker、操作Docker或访问生产环境；未准备/修改真实凭据、未调用真实微信登录或上传预览包，未Commit/Push。

可重复的本轮离线回归命令：

```powershell
node --test backend/tests/phone-preview-safety.test.mjs backend/tests/frontend-navigation*.test.mjs backend/tests/auth-sessions.test.mjs backend/tests/wechat-login.test.mjs backend/tests/miniapp-preview-audit.test.mjs backend/tests/miniapp-preview-build-guard.test.mjs backend/tests/build-role-contracts.test.mjs
node node_modules/typescript/lib/tsc.js --noEmit --pretty false
npm run check:boundaries
npm run build:combined
```

不要无条件运行backend/tests/*.test.mjs，其中存在需要单独环境授权的live/staging数据库或HTTP测试。上述本轮结果不是这些外部测试的通过记录。
