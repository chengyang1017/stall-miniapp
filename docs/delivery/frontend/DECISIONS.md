# 前端决策记录

## 2026-10-30｜FE-07 小票需求与后端边界

本次“补充状态流转、数据库字段约束和双方权限”按需求文档工作执行，完整提案见RECEIPTS_REQUIREMENTS.md；不越权实现支付/退款、改业务后端/SQL或编造接口。支付尝试、业务订单、履约与退款分开；客户端失败/取消不推断资金终态。成功支付/退款只认服务端验真的官方结果，一单一正式票，原快照不可因退款覆盖。并发退款需保留未知/异常占用，真实额外扣款另记而不签第二票。

当前merchant成员角色不能假称已经有逐店授权/细粒度退款导出权限。顾客本人、当前店铺授权、导出下载和私有分享均要服务端鉴权；main独立顾客身份不与legacy商家会话自动互通。新增权限默认拒绝。本文表结构、枚举与事务/任务方案为项目提案，微信状态语义已核对官方文档，未宣称数据库已验证。普通小票与增值税发票分开。

## 2026-10-27｜FE-02

1. 默认在用户指定 zh 开发，正常提交与 push，PR 审核后由负责人决定合并。推送前核对远程历史，不 force、不推 main、不自动合并。
2. 根 AGENTS.md 只约束前端协作者，不改变后端负责人权限。当前仓库只有这份根指令，无历史 AGENTS 冲突；原任务全文保存 TASKS.md，末尾远程预览职责修正优先。
3. 微信预览和真机验证由项目负责人另一台电脑执行。本开发者不安装/登录/运行微信工具；统一 WAITING_FOR_OWNER_PREVIEW。源码/构建/mock 继续推进，不能假称平台或支付通过。
4. 导航契约是“经过角色适配器的实际跳转 + 服务端新鲜权限”，不是页面必须含直接 wx.navigateTo/wx.switchTab。保留原测试名称及拒绝/隐藏/身份变化/重复点击断言，VM 注入真实 Combined adapter，源契约验证适配器本体及构建别名。
5. 允许修改位于 backend/tests 的纯前端 fixture；禁止借此修改后端业务、SQL、Docker/凭据或负责人档案。由 verify-frontend.mjs 明确列出离线白名单，拒绝全目录测试通配导致 live 环境操作。
6. 后端协作分支可只读查看。RELEASE_GATE/HANDOFF 本地缺失就记录缺失和远端固定 SHA，不复制为本地已合并事实。
7. 当前首版候选仍 Combined；独立端构建通过不构成双 AppID 登录/扫码方案已落地。支付/退款必须等真实后端协议，不猜接口、不客户端写 paid。
8. 可选离线安全任务按证据推进；持久化规则不等于后台定时运行，每次会话有界执行、测试、记录并留下下一轮入口。

## 2026-10-27｜FE-03 身份及生命周期

- loginWithWechat保留原有返回Promise<void>和单AppID服务端协议，新增可选isActive取消检查，旧调用方不必修改；所有调用方已通过三目标编译。
- 每次发起登录分配单调序号，保存发起时requestIdentity；发送code及写入token前均验证最新序号/身份/调用方仍有效。后发登录优先，旧失败不覆盖当前会话。失败沿用session_or_store_changed本地错误，不要求后端更改。
- 后端登录请求显式15秒超时，响应token需符合既有Bearer令牌40—100位base64url契约；不输出会话和微信code。
- 商家输入在busy时禁用，页面隐藏/卸载使操作失效；被动权限验证仍不导航，显式登录且服务器授权通过才进入工作台。logout仍清理同一会话并保留未确认撤销提示，但旧响应不写新页面忙碌状态。
- 尚未全量审完其他调用页的生命周期；共享auth身份检查已统一生效，其他页面的额外isActive接入按证据推进。

## 2026-10-27｜FE-04 本地结算与订单Tab

- 按仓库内wx类型定义，redirectTo面向非Tab页面，switchTab必须为无query的Tab路径。DEMO保存后使用switchTab，不通过放宽mock/API边界来保留错误路由。
- 新订单提示只在customer/demo/orders模块内存保留id及发起身份上下文，orders.onShow一次性读取，同云端/身份变化隔离；不持久化敏感资料，不向云端迁移本机订单。缓存Tab收到新单后选全部；离开后清提示，不伪造paid。
- 本地确认弹窗busy锁独立于云端提交锁；hide/unload通过序号使旧回调失效。营业/配送/库存/起送/地址/时段确认前后共用同一校验，金额/数量/地址/时段快照变化需重新确认，不能静默使用未确认的新金额。
- 导航失败不回滚已原子保存的订单/库存，也不展示“重新建单”的误导提示。只提示本地已保存、待支付、从订单Tab查看。
- 本轮169项只代表离线白名单；所有任务书条目未全部验收，不宣布收尾。下一轮仍可独立推进云端结算生命周期候选验证。

## 2026-10-30｜main同步决策

main已演进为catalog控制器、账号资料/手机号、权限proof和5个Tab；合并时优先保留新产品结构，不把首页恢复成旧商家自动跳转。zh的会话竞态、DEMO确认/notice仍保留，并兼容main错误码、preview绑定及按购买项清购物车。合并只接入main后端，不编辑后端实现。旧任务候选需以新源码重新核查。

## 2026-10-30｜FE-06 本机收藏/浏览设计

- 优先复用首页、商品详情、个人页已有占位按钮；两个列表共用一个customer-only页面，避免重复页面与商家端依赖。
- 在后端没有收藏/历史接口的现状下，本次使用本机持久保存并在UI明确注明。按可信API、店铺和opaque账号cacheScope分区；令牌只用于内存请求身份比较，不写进记录。访客/DEMO独立，不自动把访客数据迁给登录账号。
- 成功确认详情才记浏览，不把推荐列表曝光/请求失败/隐藏旧响应当成浏览。最近100件去重MRU，收藏最多200件；删除/清空当前kind不动另一类。
- 只存公开商品快照的白名单字段，拒绝无效价格/ID/name并过滤签名图片查询串。列表重新确认商品：下架记录可删除，缺货详情仍可查看；网络失败标为旧价格/待确认，不混用DEMO或伪造当前售价。
- 清空弹窗与异步读取绑定scope+序号+可见性，账号/店铺/标签/重载变化使旧操作失效；失效后清屏，防止旧账号快照残留。单次storage写入保存两类集合，失败如实提示，重启可恢复。
- 无跨设备同步，不新增后端接口、真实登录或支付要求；未来云同步必须另定服务端权限、保留/删除和迁移契约。

## 2026-10-31 SBX-01
Partial Sandbox channel foundation implemented; DEVELOPMENT, full lifecycle incomplete. Details, files/variables, commands/evidence, external test steps and remaining implementation: [SANDBOX_PAYMENT_STAGE.md](SANDBOX_PAYMENT_STAGE.md). Backend payment 83/0/0, final frontend 221/0/0; first frontend 170 pass/45 fail preserved and harness fixes documented. Platform WAITING_FOR_OWNER_PREVIEW; no provider/PG runtime, migration or deployment. Baseline main@18f18f7; isolated codex/sandbox-payment-channels branch preserves collaborator state. Next: durable attempt/event ledger, duplicate collection compensation, refunds and receipts.
