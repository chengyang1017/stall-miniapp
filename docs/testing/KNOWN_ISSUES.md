# 已知问题、修复记录与剩余风险

更新日期：2026-10-27；本次Engine恢复后只读验收基线 `d63c80a553c2a852af485a1f289a146e86c018ed`。前轮构建前审计基线为 `80114f191668a8c9adb1da6b4de81a4a7ffadfef`；历史记录仍以对应提交/时点为准，不用最新运行态覆盖历史失败。
上述为B3-R历史设计时点。最新B3-V2基线 `083f67548d044c29ad4a9e0497d791e4348fd5f8`：已实现独立运行器源码，原138项加新97项共235项离线通过；未实际运行Docker资源或SQL、未恢复旧现场。已修复表示源码/指定离线范围成立，不表示真实业务环境已验收。

## 已修复并保留历史的问题

| 编号 | 问题 | 当前修复与证据 | 验证边界 |
| --- | --- | --- | --- |
| ORD-01 | 同一分页响应内重复订单 ID | [订单页](../../miniprogram/pages/orders/orders.ts) 接收时同时对旧列表及本批去重；提交 `2529b627f22882473cdbc62fff7422d0614e8087` | Phase6 对应断言，88 项 HISTORY 中的一部分 |
| ORD-02 | 用户身份变化仍保留旧列表/游标 | 同提交为加载数据绑定身份/店铺上下文并失效旧响应 | VM + 可控 Promise，不是真实跨设备测试 |
| ORD-03 | 店铺变化仍复用旧列表/游标 | 同提交；Phase6 store change 用例 | 同上 |
| ORD-04 | hasMore=true 接受空游标 | 同提交；空 next cursor 视为无效分页 | 同上 |
| ORD-05 | 接受缺少有效 ID 的订单 | 同提交；在渲染前验证响应 | 同上 |
| ORD-06 | 无效分金额导致 NaN 展示 | 同提交；金额校验及 malformed total 用例 | 同上 |
| ORD-07 | 旧请求 finally 关闭新上下文 loading | 同提交包含 identity/store × resolve/reject 四项附加回归 | 六项原缺陷之外的补充竞态覆盖，不擅自改写“修复6项”的历史口径 |
| PAY-01 | 不限库存未付款订单绕过履约付款门槛 | [orderWorkflow.mjs](../../backend/src/orderWorkflow.mjs) 合法非取消变更统一检查 paid；提交 `96e6a52442c8b4450249ad6e1546e69ecb4bca0b` | P7-44—49，合法未支付取消保留；没有实现支付或退款 |
| MODEL-01 | 到期事件备注模拟错误映射 | [SQL 适配器](../../backend/tests/helpers/business-phase7-db.mjs) 区分 SQL 字符串常量、参数、NULL；P7-29/30/48 精确断言 | 模型正确性修复，不证明真实 SQL 执行 |
| MODEL-02 | P7-31 以不符合 SQL 筛选的订单冒充锁候选 | 重设计为已到期 unpaid/new/held；同 `96e6a...` 提交 | 保留明确边界：没有验证 PostgreSQL SKIP LOCKED |
| B1-01 | 审核状态测试要求真实文件永久 approved=false | [整改测试](../../backend/tests/phase8-remediation.unit.test.mjs) 改用合成未批准对象，保留启动前拒绝断言；新增13项；提交 `b18a5d22974bf52205b542c71d3065d85a8a330e` | HISTORY：110/1/0 → 124/0/0；生产安全策略未改，真实登记保留 |
| B3-IMAGE | 带标签审核渠道拼入固定摘要引用，本机无法解析 | `85cceff85b8053cc5973a5f58b2f4964c5bf1f80` 改为 postgres@digest，审核渠道/摘要/ID检查保留 | 当时138项离线测试及真实只读镜像检查通过；与后续网络故障分开 |

第七轮原49项、整改前63项54通过9失败、整改后63通过的细分来自[既有报告](../../backend/PHASE7_BUSINESS_TEST_REPORT.md)，不是本轮复现。

## B0 七项整改：源码完成，运行环境仍待验收

| 编号 | 整改 | 当前源码证据 | 不得推广的结论 |
| --- | --- | --- | --- |
| B0-01 | 启动前独占、旧资源拒绝、独立重启授权 | `launch.mjs`、`receipts.mjs`、entrypoint | 不能保证检查与创建跨进程绝对原子；不防 Docker 管理员并行篡改 |
| B0-02 | inspect 独立 observer，无可写 Pool 暴露 | `bootstrap.sh`、`postgres.mjs`、`policy.mjs` | SQL 授权源码不等于真实 ACL 已验证 |
| B0-03 | 固定 PGDATA、监听与引导目标 | 两份 bootstrap shell、policy | Shell 语法检查不等于真实首次引导成功 |
| B0-04 | Docker 显式环境与固定本机端点 | `docker.mjs` | 需每次运行重新核对 context/端点 |
| B0-05 | 实际 catalog/ACL 指纹与 ready 一行更新 | `schema.mjs`、初始化器 | 未在 PG 执行过，不能以摘要账本代替结构验收 |
| B0-06 | 超时、未知 COMMIT、回滚失败销毁连接 | `leases.mjs` | 假客户端释放断言不等于真实驱动/网络故障恢复 |
| B0-07 | 镜像 digest/Image ID 固定与人工登记 | `image-approval.json`、policy、docker | 已批准镜像身份不是批准创建容器或连接数据库 |

以上文件均位于 [backend/testing/phase8](../../backend/testing/phase8)，初始化入口位于 [backend/scripts/init-test-db.mjs](../../backend/scripts/init-test-db.mjs)。B0/B1 离线通过记录见历史档案。

## 待解决风险与验收缺口

| 编号 | 状态 | 风险、来源及下一项验收 |
| --- | --- | --- |
| R-01 | 准备完成，持续保护 | B2 四份仓库外凭据/受限目录/UUID 已准备，B3 创建前复核；实际创建后回执非空，不再符合 first 重跑条件。不得覆盖、删除或公开密码/nonce |
| R-02 | 部分创建，受阻 | Phase8 容器 running/healthy，bootstrap有完成日志，但资源验收失败/回执failed；未独立 SQL 身份/角色核验，001—020迁移、ready/结构/约束未执行，不得进入B4 |
| R-03 | 未验证 | 真实多连接库存竞争、advisory/行锁、唯一约束等待、SKIP LOCKED、死锁40P01、未知COMMIT及最终状态；内存锁不能替代 |
| R-04 | 引用兼容已修复，历史保留 | 固定引用已改为 postgres@digest，原登记信息未变；早期 tag+digest 间歇行为仍不编造根因，不能把新网络故障误报为镜像失败 |
| R-05 | 受阻 | 可信支付、退款、通知及对账由客户负责。new队列仍可能包含unpaid，不能据此接单；队列口径与支付协议待确认；paid分支测试不证明收款 |
| R-06 | 未验证 | 老夹具可能与当前协议不兼容：checkout-transactions 的旧手机号/缺失note、order-state-transitions 的旧SQL匹配、order-status-safety 的旧送达断言；既有P7报告已提示，本次未执行，不报告具体失败数 |
| R-07 | 未验证 | 旧 live-db 探针隔离检查弱于 B0，仅有 test/dev 名称条件等；不能当作 B0 写入/环境验收入口；迁移和真实测试须复用新安全边界 |
| R-08 | 受阻 | [server.mjs](../../backend/src/server.mjs) 启动监听自动运行库存及定位保留任务；文档或单元测试不得随意 import/启动服务 |
| R-09 | 未验证 | 原开发迁移器存在 SQL 与账本分开记录的中断窗口；B0 新库初始化原子方案并未改造生产迁移系统。中断必须停止核对，禁止盲目重跑 |
| R-10 | 未验证 | [备份说明](../../backend/scripts/README.md) 指出校验摘要、pg_restore索引不等于恢复成功；DB JSON引用不包含R2实体；协调快照/隔离恢复尚无验收 |
| R-11 | 受阻 | 微信 AppID、合法域名、会话、定位隐私与类目权限、评价UGC审核、私有桶及R2访问需各自配置和真实验收 |
| R-12 | 未验证 | 历史通过记录缺少集中原始TAP/CI日志；本档案保留报告来源，不伪造日志。今后每轮记录精确SHA、命令、环境、日志与副作用 |
| R-13 | 已记录 | 历史 backend 文档仍保留早期017/018迁移、未批准镜像或MSYS失败等时点描述；当前迁移清单为020、镜像已登记，不能机械照旧文启用。本任务不修改那些原文件 |
| R-14 | 已定位设计冲突，未修复 | internal-only bridge + host loopback发布在当前 Engine未产生实际映射；请求保存在HostConfig、运行态Ports空、docker port空、Windows无监听，policy正确拒绝。匹配Engine GitCommit源码，非纯JSON差异；禁止放宽规则冒充通过 |
| R-15 | bridge变化已有解释，影响证据有限 | 本机持久日志证明Engine在12:02:36—43重新初始化，旧bridge缓存随后注销、新ID登记，早于12:03:29首次创建命令。当前无默认bridge成员/配置依赖，未见数据损坏证据；原先停止/唤醒触发原因及历史应用全链路影响未验证 |
| R-16 | 恢复入口缺失，受阻 | B0 first不可重跑；restart拒绝failed且要求ready验收。旧实例历史仅有bootstrap日志，当前即使已停止也未满足ready条件。须独立设计身份绑定、追加审计和只读核验流程；严禁改失败回执、清空卷或删除容器探路 |
| R-17 | V2源码及97项离线回归完成，真实环境受阻 | A方案已实现独立internal-runner-v1控制器/运行器/授权协议；runner镜像未批准，无Docker socket/运行时安装；实际isolated/宿主/出口隔离与Windows挂载必须另行验收，不能凭标志通过 |
| R-18 | 旧实例不可直接接管写测试 | 原HostConfig仍含发布请求，原网络不是新A的isolated规范；保留原ID/UUID/nonce/failed审计，无损只读识别有条件可设计。默认另建独立V2实例，不复用旧卷/材料，不静默豁免旧端口校验 |
| R-19 | Engine/store/builder可达性阻碍已解除 | 用户手动启动Desktop后本轮只读确认Engine29.6.2/Linux-amd64、Desktop4.85.0、containerd2.2.5、overlayfs/io.containerd.snapshotter.v1及内置docker builder/BuildKit0.31.2。不是构建或网络隔离验收成功 |
| R-20 | store/driver前提已确认，固定引用仍待真实产物验证 | 本轮确认containerd store和内置docker driver/BuildKit0.31.2；源码支持canonical/store/push机制，但仍须实际image inspect裸固定引用/RepoDigest/ID/平台/label。时间归一与unpack等可选参数需校核；不通过普通tag、私有registry去前缀或伪造digest绕过 |
| R-21 | 前轮41项内容已核验，本轮未重复；专用cache/Linux安装待验 | 基线d63c80a已保存41/41真实SHA512、包名版本、索引及归档依赖匹配，本轮输入/源码未变，未重读缓存内容。不是恶意代码/漏洞全审计；禁止整库复制，仍须独立精选/封存及Linux npm ci验收 |
| R-22 | 已有完整候选输入审计；物理context/产物尚未生成 | 新增PHASE8_V2_BUILD_INPUT_AUDIT.json列34源码的LF及raw hash、41依赖真实SRI/SHA256、Dockerfile/base/计划参数和工具状态；源bundle、审计清单摘要、正式context、OCI和Image ID严格区分，后两类不能预填。未证明逐字节重复构建 |
| R-23 | Node固定基础镜像缺失，需另行获取授权 | 固定平台引用和node:24.22.1-bookworm-slim标签均No such image，本地相关node镜像行/已知索引或配置ID也未匹配。PG固定镜像已匹配；不能把PG可用或Registry存在当成Node已在本地，未pull/tag/import |
| R-24 | 旧B0状态变化及统计差异已记录，成因未判定 | 原ID/卷/专网仍在，但B0为exited/255，FinishedAt02:16:22Z早于本轮；info最初1运行，后续逐项和info为0运行/11停止。默认bridge出现新ID，未据此推断数据损坏或自动修复；原回执只stat、mtime未变，未读取内容或证实字节完全未变 |

风险表中的“未验证”不是已证实业务缺陷；“已修复”也不是正式交付验收。发现新失败先保留原始断言及日志，确认夹具还是业务问题，未经授权不改生产规则。

R-14—16 的精确本地日志位置、时间线、匹配版本源码链接、三个网络设计选择及其授权前置条件见 [历史第10节](TEST_HISTORY.md#10-第八轮-b3首次创建失败的只读诊断)。本次只完成诊断，B4仍禁止；没有执行网络变更、数据库连接/SQL、迁移、修复或重启。

B3-R补充见 [详细网络/恢复设计](../../backend/PHASE8_NETWORK_RECOVERY_DESIGN.md) 与历史第11节。A/B/C比较、旧实例六问、只读probe、只追加恢复审计及新实例分阶段授权均已写明，但没有实现新运行入口或执行操作。原138项通过不关闭R-14/R-16/R-17/R-18；B3仍失败，B4继续阻塞。

## 关闭规则

### 最新补充：2026-10-27固定Node获取（基线352f748）

- **R-23更新：基础镜像缺失已解除。**用户明确确认后一次固定摘要linux/amd64 pull成功；本地Image ID/RepoDigest为 `sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae`。此前表格的缺失描述为历史状态，不能等同于最终runner构建或批准。
- **R-25新增：资源全量元数据比较未通过，成因未完全确认。**默认bridge的ID/创建时间确实变化；旧B0及其他项目关键身份状态、专网/卷身份、原回执stat未见变化，但不能由此证明所有字段完全不变。前快照仅保存整体SHA，没有完整逐字段基线；Docker返回的挂载数组顺序也存在变化。只读内存诊断未能完全解释整体摘要差异，不把差异全部归因于顺序，也不归因于pull或认定数据损坏。保留失败结论，建议单独授权只读调查；不重启、删除或重建资源，不改失败回执，不自动进入构建准备。详见历史第18节。

B3-V2 增补：原R-14/R-16/R-18继续开放；原失败实例没有改动或接管。V2实施不关闭旧B3失败、不解锁B4。新门槛包括：固定Node base与runner镜像/离线依赖来源审核、新材料和UUID、独占Docker管理窗口、真实网络/UID/ACL挂载、bootstrap独立只读验收。检查/创建不是跨资源原子操作，不能抵御宿主管理员并行篡改；grant只消费一次，失败不会自动恢复或清理。真实事务/并发/回滚/死锁/连接故障仍未执行。完整限制见 [V2 README](../../backend/testing/phase8-v2/README.md)。

每项记录由项目维护方按职责处理，不虚构具名负责人。关闭时填写修复提交、实际复现/复测命令、环境、结果和日志；外部依赖由客户/运维提供确认。不能删除历史失败、用跳过替代通过，或将旧通过结果覆盖新失败。


## 2026-10-27资源差异复核与材料准备补充（基线6ceff09）

- **R-25：bridge变化已有实际生命周期解释，整体原始摘要仍不能完全还原。**本机host日志3910—3920记录02:47:57Z镜像create API请求唤醒idle VM；vm/init.log4915—4945记录02:48:03—04Z Engine启动/网络初始化完成，与新bridge创建02:48:04.336Z对应。无现有容器使用默认bridge，容器/卷/项目专网逐项未发现关键身份异常；因此没有阻止文件准备的实质性资源风险证据。不能升级为数据无损/应用全链路验收。恢复时11条sandbox not found警告保留，不能证明历史已停止应用重启后网络一定正常；不启动它们验证。
- **R-21/R-22：精选缓存与正式context已准备。**34源码/41包复核及复制后完整性通过，41索引记录/41内容文件、无其他桶。119文件物理清单已封存；只包含5份获准旧B0共享源码，无实例运行材料。ACL仅当前用户/SYSTEM/Administrators。未执行npm ci，真实Linux安装、UID及镜像层权限仍待验。
- **R-20/R-17：最终runner仍未构建和批准，V2仍未创建。**材料满足申请受控构建的输入前提，不等于canonical exporter、离线安装或隔离网络已验收。需另行确认构建选项与独占窗口并授权build/image-store写入，不自动操作。旧B0现场、failed回执及B4阻塞保留。


## 2026-10-27运行器实际构建与身份验收（基线964273b）

- **R-20更新：本机canonical导出/解析条件已实际验证。**一次Buildx退出0，Moby/containerd image exporter产生真实RepoDigests；裸及完全限定固定引用均解析同一manifest。没有手工tag、Registry Push、修改安全策略或自动批准。
- **R-21/R-22更新：Linux离线npm安装和静态镜像内容已验证。**本次禁网RUN实际安装41包；读取镜像save字节流，仅在内存解析，验证34源码、bundle、41包及pg主文件。不是运行器启动、pg连接、漏洞全审计或位级重复构建证明。封存119输入文件未变。
- **R-17仍开放：最终镜像审核及真实运行条件待验。**runner-image-approval.json仍approved=false；USER/ENTRYPOINT为镜像配置证据，运行时只读根、capabilities、Windows挂载/ACL及V2 isolated网络等尚未实测。数据库实例/迁移/业务集成未执行，旧B3失败和B4阻塞不变。
- **R-26新增边界：整个BuildKit过程并非完全断网。**虽pull=false且RUN network=none，实际日志仍有library/node的Registry认证及metadata查询。未见新基础层下载或额外镜像，只有批准的Node材料；不能把npm离线通过扩大成resolver完全离线。若将来要求整个构建零外网，须另行设计可验证限制，不能仅依赖network=none或prefer-local。
- **构建警告保留：InvalidDefaultArgInFrom。**Dockerfile的NODE_BASE无默认值触发lint警告；本次显式固定参数、实际FROM和产物材料均匹配。不为消除警告修改已封存Dockerfile。BuildKit0.31.2同时rewrite-timestamp和unpack会冲突，本次显式rewrite=false/unpack=true，不宣称时间戳规范化或可重复镜像摘要。

## B3-V2 runner 独立审核待办（2026-10-27）

仓库中的构建审计支持对固定镜像身份和构建过程进行证据审查，但通过 GitHub 的本轮复核无法直接访问 Windows 上现存 Docker 镜像字节和资源，因而**不能独立断言当前镜像状态未变**。最终批准前须本地只读 inspect/内容与资源核验，随后对明确 digest 单独人工授权。`runner-image-approval.json` 继续 `approved=false`，旧 B3 与 B4 继续阻塞。见 [审查记录](PHASE8_V2_RUNNER_INDEPENDENT_REVIEW.md)。
