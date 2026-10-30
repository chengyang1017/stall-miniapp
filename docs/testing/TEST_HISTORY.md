# 微信商城测试历史记录（补录）

## 2026-10-28：Staging 模拟支付三个P1整改（本轮实际运行，未提交）

保留HEAD503a930与已有未提交修改。NODE_ENV=production继续作为Node模式；新增空的源码审核档案、Render service/Neon endpoint与角色约束、独立staging_control锚点核验，并保留真实微信会话/限时店铺测试授权。APP_ENV伪装、错部署/DB/角色、TLS参数覆盖、特权角色和授权表越权均默认拒绝。管理员可整体篡改配置/数据仍是部署级信任边界，不宣称绝对隔离。

021新增常量lock_key列供FOR SHARE最小UPDATE权限、迁移审计表；没有执行。新增仅默认离线的migrate-staging：校验固定001—021内容、剥除唯一外层事务包装、核验既有账本及实际约束/索引/触发器/catalog摘要、独占锁和超时；在同一事务中执行021+ACL+账本+前后摘要审计。回滚/未知COMMIT和权限不足可诊断，不采用本地migrate-dev连接Neon。终审修正public/pg_catalog搜索顺序，避免未限定DDL目标落入系统目录。

旧10项测试失败由过时SQL/角色夹具、generic delivered接口预期和未触及的事件故障路径引起。三文件实际27/27通过（原23项加4条未付款履约拒绝）；事件写入故障真正执行，断言ROLLBACK/无COMMIT/状态未推进；无合法凭证不能通过普通status接口完成送达。未改变正常业务规则。

最终联合命令覆盖frontend-render-stability、frontend-interaction-state、frontend-navigation*、build-navigation-isolation、phone-preview-safety、merchant-entry-contract、merchant-resume-lifecycle、interaction-cloud-sync、merchant-customer-support-handoff、delivery-rules、staging-payments-ui、staging-payments、business-consistency-phase7、review-purchase-boundary、staging-deployment-safety、order-security、order-state-transitions、order-status-safety及staging-postgres.integration：**531项，520通过、0失败、11跳过、0取消**。其中新部署/迁移离线安全40项、模拟支付39项、旧订单27项；不把它们再次累加到联合总数。

11项真实pg用例仅源码注册，默认跳过：Docker Engine命名管道不可达，也没有可验证隔离DB目标，未启动Desktop、未连接数据库。用例预留真实001—021/约束、三角色权限、不同PID并发/锁等待、确认幂等、取消/到期竞争、回滚和连接中断；传输模拟与真实PG执行明确分开。测试复用V2 seed/连接工具，历史资源不复用、不清理。现有runner封存须未来重新配对。

额外复跑 `node --test backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs backend/tests/phase8-v2.unit.test.mjs`：**235项，233通过、2失败、0跳过**。失败为B0 actual001—020 manifest校验及V2 artifact allowlist校验；均因未执行的新021存在于源码目录，原严格封存拒绝扩展。没有删除失败测试、修改其断言或把旧实例升级为021；这是尚未解决的历史测试设施版本兼容阻断，不是SQL已执行失败。不能汇报“所有回归全绿”。

TypeScript noEmit、依赖边界、三目标实际纯编译（build-navigation回归执行）、产物检查通过；44个MJS `node --check` 和 `git diff --check` 通过（仅既有CRLF转换提示）。没有重新生成phone-preview或创建新微信项目。未改Render/Neon配置、未迁移、部署、支付调用、R2或Git写入。真实Neon角色/owner/账本/catalog、独立PG与Staging端到端/真机仍待授权核验。完整文件清单和严格启用顺序见 [P1部署准备](../../backend/STAGING_DEPLOYMENT_PREPARATION.md)。

> 最新补充：第24节记录真实PG测试准备与新r2容器启动前验收失败；没有执行迁移或数据库测试。第23节三端构建通过结果保持。

> 最新补充：2026-10-27三目标导航修复与199项离线回归，详见第23节；早期独立构建失败为历史结果，不代表当前状态。

> 项目：`chengyang1017/stall-miniapp`
> 仓库位置：`docs/testing/TEST_HISTORY.md`
> 原补录日期：2026-10-26；本次维护统一使用北京时间（Asia/Shanghai，UTC+8）。
> 性质：此前轮次根据开发与执行报告补录，**不是本次重新执行测试的结果**；第 6 节保留 B2 实际准备证据，第 7 节记录本次 B3 只读复核及离线复测。缺少原始测试日志、运行时间或提交关联的项目，标为“未独立复核”，不得当作新鲜测试证据。

## 0. 本次维护的证据范围

原档案源码基线为 `b18a5d22974bf52205b542c71d3065d85a8a330e`；本次 B2 执行基线为 `edbf0a703940aa75acf97fd7541088773f184ef9`。原档案建立没有环境操作，本次 B2 则实际执行只读 Docker/端口检查及仓库外凭据/ACL 准备，未重跑测试。原补录有用内容及 B1 中间失败保留，具体边界见第 6 节。

B2 记录已提交为 `3051359520a8cb997908d4c000d65cfb6318061a`，也是本次 B3 基线，初查开始时工作区干净。B3 初查仅做只读复核并保留两份未提交档案；随后用户另行授权固定引用兼容修复。第 7 节保留初查失败，第 8 节记录最小修复及实际验证；均未修改凭据、ACL或镜像审核，未创建实例。

上述镜像兼容修复已提交为 `85cceff85b8053cc5973a5f58b2f4964c5bf1f80`。本次用户明确授权一次受控首次创建；以该 SHA、干净 main 开始，第 9 节记录实际创建和启动后验收失败。此前“未创建”属于当时快照，不能覆盖当前部分创建现场。

第 9 节已随 `934a2039b9b5dd6e6971c2d1b71cbcaae84842a6` 提交并推送；本次以该基线、干净 main 仅做故障诊断，见第 10 节。旧结论保留并由新增证据补充，不修改失败回执、启动代码或容器。

第10节诊断已随 `70145de43af8d649f43883dd6254af639cba8cac` 提交；本次 B3-R 以该基线/干净main进行网络与恢复设计，实际范围与离线回归见第11节。未实施运行源码、未重新查询实际Docker或连接数据库，B3失败与B4阻塞状态不变。

标记口径：GIT＝确认提交及Diff；SRC＝确认源码定义；HISTORY＝用户提供或既有执行报告；DOC-CHECK＝文档一致性检查；LOCAL-PREP＝B2 实际本地准备与核验；B3-CHECK＝只读环境核验/离线检查；B3-CREATE＝本次真实受控创建和失败后取证。第 7 节 124 项及第 8 节 138 项为各次复测，本次未重跑，不重复累加；本次 bootstrap 写入也不是业务 SQL 集成测试通过。

配套档案：[当前状态](TEST_STATUS.md)、[覆盖矩阵](TEST_COVERAGE.md)、[问题清单](KNOWN_ISSUES.md)、[发布清单](RELEASE_CHECKLIST.md)。

## 1. 当前状态快照

| 阶段 | 状态 | 最近已报告的结果 | 代码/环境进度 |
| --- | --- | --- | --- |
| 第一至六轮：前端导航、结算、订单回归 | 历史通过，未在本次重跑 | 88 项通过；修复 6 项云端订单页问题 | 已提交 `2529b627f22882473cdbc62fff7422d0614e8087` |
| 第七轮：后端业务一致性 | 历史通过，未在本次重跑 | 新增 63 项通过；与前端 88 项、既有后端 14 项合计 **165 项通过** | 已提交 `96e6a52442c8b4450249ad6e1546e69ecb4bca0b` |
| 第八轮 B0：PostgreSQL 安全基础设施 | 历史通过，未在本次重跑 | **111/111** 离线安全单元测试通过 | 23 个文件、1,530 行新增；已提交 `1289713649d72379905bd6759b683e12372ba53a` |
| 第八轮 B1：镜像和本机隔离审核 | 已完成（HISTORY）；登记已提交（GIT/SRC） | Docker、官方镜像来源、端口与资源清单为历史快照；非业务测试 | `image-approval.json` 为 `approved=true`，已随 `b18a5d22974bf52205b542c71d3065d85a8a330e` 提交 |
| 第八轮 B1：中间失败（已解决） | 保留历史，不是当前失败 | **110 通过、1 失败、0 跳过**（HISTORY） | 旧用例要求真实审核文件永久未批准；后续已改用合成对象 |
| 第八轮 B1：修复后最终回归 | 已完成，未在本次重跑 | **124 通过、0 失败、0 跳过**（HISTORY） | `b18a5d22974bf52205b542c71d3065d85a8a330e`；保留拒绝能力并新增13项覆盖 |
| 第八轮 B2：离线凭据准备 | **已完成（LOCAL-PREP）** | 四份不同的 64 位小写十六进制凭据、七个对象的受限 ACL、空回执目录核验通过 | 见第 6 节；未启动 Phase8 容器或连接数据库，不是数据库测试通过 |
| 第八轮 B3：首次创建前初查 | 历史阻塞保留，未创建 | 初查离线安全测试 124/0/0；真实固定引用 inspect 失败 | 见第 7 节；不抹去失败记录 |
| 第八轮 B3：固定引用兼容修复 | **镜像阻塞已解除，未创建** | 本次新增 14 项，138/0/0；受控 ensureImage 连续 3 次真实只读核验通过 | 见第 8 节；首次创建及数据库测试尚未执行 |
| 第八轮 B3：本次受控首次创建 | **部分创建，启动后验收失败** | 仅执行一次，退出 1：phase8_port_binding_rejected；容器 running/healthy，回执 failed | 第 9 节；bootstrap 有完成日志，未独立 SQL 核验；001—020 未执行 |
| 第八轮 B3：只读故障诊断 | 原拓扑端口发布冲突有代码及现场证据，未修复 | Compose 请求正确；实际未发布；bridge 重建发生于先前 Engine 初始化 | 第 10 节；无新测试通过数，failed 和 B4 禁止边界保留 |
| 第八轮 B3-R：网络/恢复设计 | 设计完成，运行源码未实施 | 原138项离线安全测试重跑138/0/0；新增0项 | 第11节；推荐A，新V2/旧实例probe均未实施，不是恢复通过 |
| 真实 PostgreSQL 业务集成测试 | **未执行** | 无 | 尚未执行真实迁移、并发、事务、索引与约束验证 |
| 真机、支付及生产交付验收 | **未完成** | 无法从现有记录确认通过 | 不可据此认定可正式上线 |

**计数口径：**165 项是前七轮的合并历史结果，111 项是 B0 独立的离线安全单元测试结果；它们不是本次统一重跑的 276 项结果。B1 的 110/1 是登记后的中间失败，已由后续124/0/0记录取代；B3 初查重跑124项，兼容修复增加14项后为138，不能把111、124、138相加，也不提供全仓唯一测试总数。

## 2. 第一至六轮：前端回归

- 覆盖方向：页面导航、购物车/结算、订单页面以及相关回归逻辑。
- 已报告：**88 项通过**；修复 **6 项实际云端订单页面缺陷**。
- 对应提交：`2529b627f22882473cdbc62fff7422d0614e8087`。
- 证据限制：未取得当时完整TAP日志或CI链接；当前测试名称、实际页面函数及断言可以从源码确认，详见覆盖矩阵。本轮没有因此宣称重新通过。

### 2.1 第一至五轮的逐轮边界

原记录没有足够证据把每份文件一一映射为第1、2、3、4、5轮，不能编造逐轮执行时间或通过数。当前五份测试按文件静态核对为：navigation 10、runtime 9、flows 11、lifecycle 11、guards 8，合计49；Git只证明前3份在 `b992e6692f547dfe29ca548e6f3149833cad4d60` 一起提交，后2份在 `fdb636eec522c29f4f512682a389dbd43bc8c95e` 一起提交。

### 2.2 第六轮的失败、修复与补充

- 历史任务/执行报告：最初35项中29通过、6失败；根因分别为同批重复ID、身份与店铺变化残留、空游标、无效ID、无效金额。
- `2529b627f22882473cdbc62fff7422d0614e8087` 的Git Diff确认订单页修复及Phase6文件；当前源码39项包含最后追加的4个 identity/store × resolve/reject 的finally/loading竞态用例。
- 49 + 39 = 88仅用于这六份前端文件的组内口径；不是全仓或真机测试数量。

## 3. 第七轮：后端业务一致性

- 新增后端一致性测试：**63 项通过**。
- 同期合并运行结果：前端 88 + 新增后端 63 + 既有后端 14 = **165 项通过**。
- 修复过的关键问题：**未支付订单在不限库存商品场景下，可能被商家推进履约状态**。后端订单工作流增加支付状态守卫，非取消的履约推进必须先确认 `payment_status === 'paid'`；更新支付集成契约文档。
- 对应提交：`96e6a52442c8b4450249ad6e1546e69ecb4bca0b`。
- 证据限制：部分测试使用模拟数据库适配器；模拟锁并不等于真实 PostgreSQL 的行锁、事务隔离或并发行为已验收。

## 4. 第八轮 B0：安全基础设施与离线验证

### 4.1 已提交内容

- 为独立 PostgreSQL 16 测试环境新增 **23 个文件，共 1,530 行**。
- Compose 测试环境隔离目标：项目 `stall-phase8-b0`；容器 `stall-phase8-pg16`；卷 `stall-phase8-data`；内部网络 `stall-phase8-network`；数据库 `stall_test_phase8`；宿主机 `127.0.0.1:55433`。
- 只允许经审核的固定镜像摘要；创建必须通过受控入口、资源独占检查与持久回执；禁用直接将 `docker compose up` 当作已验收入口。
- 拆分 bootstrap、migrator、app、observer 权限；observer 仅用于只读检查；防止开发/生产数据库连接串回退。
- 核查迁移文件清单、SHA-256、约束、索引、触发器、权限和 schema 指纹；保护连接超时、回滚失败、未知提交结果等情形。
- 对应提交：`1289713649d72379905bd6759b683e12372ba53a`。

### 4.2 已报告的静态及离线检查

| 检查 | 历史报告结果 | 说明 |
| --- | --- | --- |
| `phase8-safety.unit.test.mjs` + `phase8-remediation.unit.test.mjs` | **111 通过、0 失败、0 跳过** | 修改镜像审核文件之前的结果；假 Docker/PG transport，不是数据库实测 |
| `.mjs` 语法检查 | 15 个文件通过 | 历史静态记录 |
| TypeScript `--noEmit` | 通过 | 历史静态记录 |
| `git diff --check` 等空白检查 | 通过 | 历史静态记录 |
| 相对导入路径核对 | 40 个目标通过 | 历史静态记录 |
| Compose 配置解析 | 通过 | 用测试变量进行配置解析，未启动容器 |
| Shell 语法检查 | 两份脚本通过 | 通过 `wsl -d Ubuntu -- bash -n ...` 检查，返回码均为 0 |
| 原始迁移清单 | 20 份 SHA-256 已报告匹配 | 尚未在真实 PostgreSQL 上执行 |

- Shell历史说明：B0旧文记录Windows Git Bash/MSYS权限失败；后续用户报告Ubuntu两份bash -n通过。两者时点不同，本次均不复测，不将Shell语法通过等同首次引导通过。

### 4.3 B0 尚未验证的行为

- PostgreSQL 真实角色权限、数据库身份检查及 bootstrap 执行。
- 20 份迁移在真实数据库上的可执行性和原子性。
- 真实 FK/CHECK/UNIQUE/触发器行为。
- 并发订单、行锁、`SKIP LOCKED`、死锁与隔离性。
- COMMIT 响应丢失、网络中断后最终状态恢复。
- 完整备份/恢复及生产部署。

## 5. 第八轮 B1：Docker 与镜像审核

### 5.1 环境只读检查

- Windows Docker CLI：`29.6.2`；Docker Desktop：`4.85.0.235549`；Compose：`5.3.1`。
- 初查 Docker Engine 不可访问，后由操作者启动 Docker Desktop。
- 后续检查：Engine `OSType=linux`，context `desktop-linux`；端点 `npipe:////./pipe/dockerDesktopLinuxEngine`。
- 本地镜像：`postgres:16-alpine`，架构 `linux/amd64`。
- 当前 Engine 的只读清单：**10 个容器、10 个卷、7 个网络**；未见 Phase8 同名资源；开发数据库占用 `55432`、卷 `backend_stall_dev_pgdata`；Phase8 目标端口 `55433` 当时未占用。
- 注意：上述是**当时的资源快照**，不代表首次创建前可以跳过再次检查；不能删除或重用现有开发及其他项目的数据卷。

### 5.2 已报告的官方镜像来源核验

| 身份层级 | 摘要 |
| --- | --- |
| OCI 多架构索引、当前本地 Image ID | `sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` |
| `linux/amd64` 平台清单 | `sha256:cbf42f0edc946c0bc1b8eeed62403734e1f25dc67a3491455d07a92fdb558b28` |
| 平台配置 JSON | `sha256:6a2e324ebe59af6031c4c1cd96c1d5072c2ebc36563d2196365e43b8297c062d` |

- 元数据版本：`PG_VERSION=16.15`，OCI 版本 `16.15-alpine3.24`，创建时间 `2026-10-21T22:57:10.664514874Z`。
- 官方构建来源提交：`9d15534160ade17f2b6c455a39ee967c49b1937d`。
- 历史来源核验报告称经HTTPS读取官方Registry旧索引、amd64平台清单及小型配置JSON，逐项核对摘要；没有下载镜像层。该结论不是逐层文件实体重算，本次不再查询Registry。
- 官方浮动标签 `16-alpine` / `16.15-alpine` 在核验时对应新索引 `sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab`，报告指出变化来自 riscv64 及其 attestation，**amd64 清单不变**。
- 来源参考：
  - https://registry-1.docker.io/v2/library/postgres/manifests/sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36
  - https://github.com/docker-library/official-images/blob/master/library/postgres
  - https://github.com/docker-library/postgres/blob/9d15534160ade17f2b6c455a39ee967c49b1937d/16/alpine3.24/Dockerfile
- 范围限制：本次核验不等于漏洞扫描、签名审计、逐层内容重算或 PostgreSQL 运行验证。

### 5.3 审核登记及中间测试失败（历史状态，已解决）

- 登记时先在本地将 `backend/testing/phase8/image-approval.json` 从 `approved=false` 登记为 `approved=true`，固定上述索引摘要与 Image ID。
- `reviewedAt`：`2026-10-26T10:33:23.210Z`；审核备注限定本机 Phase8 `linux/amd64` 测试用途。
- 已报告 JSON 解析、`approvedImage()`、真实 `ensureImage()` 检查通过；文件 diff：6 行新增、6 行删除。
- 登记后重跑离线安全测试：**110 通过、1 失败、0 跳过**。
- 唯一失败：`backend/tests/phase8-remediation.unit.test.mjs` 中测试 `R-P3 actual unapproved image file blocks controlled launch before any IO` 强制要求实际审核文件一直处于 `approved=false`。该假设不再适用，应改用**合成未批准对象**验证拒绝路径，并另外验证有效批准对象；不能改弱安全策略、跳过测试或假称通过。
- 登记中间状态的HEAD为 `1289713649d72379905bd6759b683e12372ba53a`，当时仅审核JSON未提交；这是历史快照，后续已由下节提交闭环。

### 5.4 B1最终修复与提交（B1完成状态）

- GIT：`b18a5d22974bf52205b542c71d3065d85a8a330e`，提交信息 `test(postgres): approve pinned phase8 image and update safety tests`；仅审核JSON与整改测试，43行新增、9行删除。提交时间为2026-10-26北京时间18:38:16；提交时间不是测试运行时间。
- SRC：原拒绝用例保留，改用合成且明确未批准对象；有效批准对象应返回准确固定身份，缺失/无效审核字段必须在任何启动IO前拒绝；真实文件仅做状态一致的只读检查。生产策略未修改，批准登记保留。
- HISTORY：修复前110通过/1失败/0跳过，修复后124通过/0失败/0跳过；比原111增加13项，当前为原安全组67 + 整改组57。Node语法、JSON解析、Diff空白检查也报告通过。
- HISTORY：普通push后本地与远程main一致、工作区干净；此前档案建立时读取在线远程main也确认该SHA，随后档案提交推进至 `edbf0a703940aa75acf97fd7541088773f184ef9`。没有原始完整运行日志/CI链接，不伪造。
- 此前档案建立及本次 B2 均不重跑这些测试，也不把模拟安全测试说成真实PostgreSQL验收。

## 6. 第八轮 B2：实际离线凭据准备

- 执行基线：`edbf0a703940aa75acf97fd7541088773f184ef9`，分支 main；开始前工作区干净，在线远程 main 与本地一致。
- 已读取实际受控启动入口、凭据读取、回执、安全策略、Compose 与镜像审核配置。本次不修改这些文件，不启用授权环境变量。
- 只读 Docker 快照时间：`2026-10-26T11:23:15.895Z`。context `desktop-linux`；端点 `npipe:////./pipe/dockerDesktopLinuxEngine`；Engine 29.6.2、Linux；枚举并检查 10 个容器、10 个卷、7 个网络及 Compose 项目，无 Phase8 目标名称、标签、挂载或项目冲突；固定引用与已审核本机镜像身份检查通过，未查询 Registry 或下载镜像。
- Windows 端口只读检查：55433 无 TCP 监听/占用，不在 IPv4/IPv6 排除端口范围。此为检查时点状态，不能替代首次创建前复核。
- 实际准备完成时间：`2026-10-26T11:25:52.4300694Z`（北京时间 19:25:52）。新 UUID v4：`43805bf5-1391-4d3f-b8ce-e3bfa9448d48`。
- 仓库外专用目录：`C:\Users\USER\StallPhase8-Test-43805bf5-1391-4d3f-b8ce-e3bfa9448d48`，内含 `secrets` 与 `receipts` 两个子目录。拒绝已有目录；未复用、覆盖或清理任何旧对象。
- `secrets` 中四个文件：`admin.secret`、`migrator.secret`、`app.secret`、`observer.secret`。使用 .NET `System.Security.Cryptography.RandomNumberGenerator` 各生成 32 字节并编码为 64 位小写十六进制；采用 `CreateNew`，无 BOM/换行。私下读取确认四份非空、格式与长度正确、彼此不同；未记录密码、密码摘要或完整连接串。
- 使用带显式安全描述符的 Win32 `CreateDirectoryW` 独占创建目录，在创建时限制访问；文件同样在创建时携带显式 ACL。全部七个对象均非重解析点、当前用户所有、DACL 禁用继承，仅当前用户、SYSTEM、BUILTIN Administrators 拥有 FullControl。创建后独立 `Get-Acl`/文件回读与 `icacls /verify /T` 均通过；`receipts` 为空，未预造启动授权或初始化回执。此 ACL 不防御具有系统管理权限的主体。
- 本次实际操作类别：Git 只读核验；Docker context/info/inspect/资源清单等只读查询；Windows 端口只读查询；仓库外目录、ACL 和凭据创建；两份档案更新及范围/空白/秘密检查。未运行商城功能、安全单元或数据库测试，因此没有新增测试通过数量。
- 环境变量名称清单见 [当前状态](TEST_STATUS.md)。仅记录目录、UUID、权限及核验结果，不在 Git 中存储私人回执或秘密文件。
- **结论：B2 本地准备完成，真实 PostgreSQL 实例仍未创建。**未创建、启动、停止或删除容器、卷或网络；未连接数据库、运行迁移、启动后端/worker、访问支付或生产 R2。已有其他项目资源保留。
- 下一步必须另行授权首次创建，并重新核验资源、端口、镜像、目录身份/ACL、空回执与受控启动策略。本次不能证明未来 Docker 管理权限独占，也不能消除检查/创建竞争窗口。迁移与真实数据库测试不在本次授权内。

## 7. 第八轮 B3：首次创建前只读验收（历史阻塞，未创建）

- Git：HEAD `3051359520a8cb997908d4c000d65cfb6318061a`，main，开始时干净；B2 凭据未重新生成，未覆盖目录或回执。只允许本节和状态档案的非秘密记录变更。
- 环境快照：`2026-10-26T11:41:30.242Z`（北京时间 19:41:30），Engine 29.6.2/Linux，Compose 5.3.1，context `desktop-linux`，端点 `npipe:////./pipe/dockerDesktopLinuxEngine`；使用 `C:\Users\USER\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`。B0 受控 context 核验通过。
- 枚举全部容器（含已停止项）、卷、网络的元数据和项目标签/挂载：10/10/7。Compose 项目为 backend、clyven_backend_server、glyphora_backend_server、shangchenghouduan_server；无 Phase8 名称/身份/挂载冲突。商城开发容器 `/backend-postgres-1` 使用 `backend_stall_dev_pgdata`，不与目标专用卷共享；其他项目资源未操作。55433 无 TCP 占用或 IPv4/IPv6 保留冲突。
- B2 复核：UUID 仍为 `43805bf5-1391-4d3f-b8ce-e3bfa9448d48`；四个文件在原仓库外目录、各 64 字节且为不同的小写十六进制密码；七个对象非重解析点、当前用户所有、ACL 继承关闭且仅允许当前用户/SYSTEM/Administrators。独立 `Get-Acl`、私下文件回读、`icacls /verify /T` 通过，receipts 仍为空。没有输出秘密或完整连接串，没有修改材料或 ACL。
- 镜像审核文件仍为 approved=true，批准索引及 Image ID 均为 `sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36`。本地浮动标签 inspect 成功，平台 linux/amd64，创建时间 `2026-10-21T22:57:10.664514874Z`；这些不是新的来源证明。
- **真实阻塞**：真实 `createDocker().bind()` 通过后，`ensureImage()` 读取代码生成的 `postgres:16-alpine@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` 重复返回 `phase8_docker_command_failed`。独立执行同一引用的只读 `docker image inspect` 返回 `Error response from daemon: No such image`，退出码 1。标准 `postgres@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` inspect 则退出 0，匹配 Image ID/RepoDigest 和平台；未以此绕过启动规则，也未重新标记或拉取。B1/B2 曾报告 tag+digest 成功，当前差异原因仍未确定，保留历史并以本次失败阻止首次创建。
- 精确路径：`backend/testing/phase8/policy.mjs:12` 拼接 tag+digest；`docker.mjs:52` 的 ensureImage 按原样 inspect；`launch.mjs:32` 在创建 Docker 资源前核验镜像。`launch.mjs:30` 会先申请 `wx` 回执，镜像失败可能留下空回执；因此本轮没有调用真实 --create-first，也未产生尝试回执。
- 启动源码审查：受控 create-first 与 restart 独立授权；首次旧资源一律拒绝，创建各阶段重查 context/nonce/拓扑并在 start 前重查不可变容器 ID；never pull、no-build/no-recreate；没有自动停止、删除、修复旧资源的路径。仅一个 PG 服务、专用卷、internal 网络和 127.0.0.1:55433，未接入 stall_dev、Glyphora 或商城服务/worker。
- **数据库写入边界**：未来首次启动会执行官方 initdb/建库及本容器 hook（`bootstrap.sh:26` 固定 socket/libpq 目标，`:31`—`:67` 事务创建角色、ACL 和实例标识）；不等于完全无数据库写入，也不会执行 001—020 业务迁移。`launch.mjs:71` 只有 restart 才调用数据库核验；首次 created_verified 仅表示容器元数据核验，不代表 hook 已完成、healthcheck 健康或业务 schema ready。后续必须单独验收，不能直接运行初始化碰运气。
- 本次实际执行 `node --test backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs`：**124 通过、0 失败、0 跳过、0 取消**。真实安全函数与假 Docker/PG transport；默认无参 CLI 子进程不连接数据库。未运行其他 backend 测试。结果为本次进程输出摘要，未另建原始日志文件。
- 静态检查：15 个相关 MJS 的 node --check、审核 JSON 与迁移 manifest JSON 解析通过；Ubuntu `bash --noprofile --norc -n` 分别检查 bootstrap-entrypoint.sh、bootstrap.sh 通过，未执行脚本。Compose `config --format json` 使用受控环境及显式 empty.env 纯解析通过，私下核对实际四份 secret 和脚本路径/只读挂载。解析用合成令牌，回执路径尚不存在且未创建；这不能证明运行时 mount 或固定镜像可用。TypeScript/构建本轮未执行。
- 未执行：Docker 创建/启动/停止/删除/拉取/重标记，数据库连接/迁移/写入，后端或 worker 启动、真实业务测试、部署。没有修改业务、安全策略、测试、审核配置或私人材料。
- **初查结论（历史）：B3 首次创建前验收未全部通过，不具备执行条件。**当时两份档案未提交；后续用户明确授权最小兼容修复并在验证成功后提交/普通推送，见第 8 节。原失败证据保留。

## 8. 第八轮 B3：固定镜像引用兼容修复（未创建）

- 开始前 HEAD 仍为 `3051359520a8cb997908d4c000d65cfb6318061a`；仅有上述 TEST_STATUS.md、TEST_HISTORY.md 两份预期未提交修改，全部保留整合。没有任何真实回执需要迁移，也不重新生成 B2 材料。
- 根因：审核 repository 是渠道名 `postgres:16-alpine`，原 policy 把它直接拼成 tag+digest 运行引用；本机镜像的 RepoDigest 是不带标签的 `postgres@sha256:…`，原别名 inspect 返回 No such image。官方 [Docker CLI 文档](https://docs.docker.com/reference/cli/docker/image/pull/) 提供 NAME@DIGEST 格式。本地现象证明应用引用构造不兼容，不能据此宣称所有 Docker 都禁止 tag+digest，也未证明此前 B1/B2 报告差异的 Engine 内部原因。
- 最小源码修复：`backend/testing/phase8/policy.mjs` 仅修改 reference 构造为 `postgres@`+digest，仍要求 approved=true、repository 精确等于 postgres:16-alpine、完整摘要/Image ID、非空审核人和原时间校验。`bootstrap-entrypoint.sh` 同步其格式守卫；未改变批准配置、完整摘要或 Image ID。
- 修复前：`postgres:16-alpine@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36`。修复后：`postgres@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36`。不存在使用浮动标签的失败回退、pull、tag 或其他仓库选择路径。
- 一致性：docker.ensureImage 继续同时核对 Image ID 与 RepoDigest；assertResources 严格匹配 Config.Image、实际 Image ID 和环境固定引用；launch/Compose/回执均使用 policy 的同一返回值，无需新增平行引用字段。同步独立合成夹具两处固定引用及两个既有测试的协议期望，不把生产函数用于生成测试期望；保留原未批准、错 repository、错摘要/ID、缺审核信息及所有资源隔离断言。
- 新增 14 项 `R-B3`：3 项额外 repository 白名单拒绝；附加字段不得覆盖引用；ensureImage 仅查询 canonical pin；错误本地 ID、错误 RepoDigest、缺失 RepoDigests 各 1 项；镜像缺失不得回退；容器引用严格匹配；容器环境匹配；launch/审计记录传递；Compose 必须提供固定变量且无浮动默认；引导守卫仅接受 canonical digest 格式。transport 均为模拟；Compose/引导的单元断言为配置/守卫源码检查，不能冒充容器运行。
- 实际命令：两份指定 Phase8 `node --test`，**138 通过、0 失败、0 跳过、0 取消**（原124项+14项）；15 个相关 MJS `node --check` 及 Ubuntu 两份 `bash --noprofile --norc -n` 通过。未运行其他 backend、真实业务或数据库测试，没有新增原始日志文件；结果取自实际进程输出。
- 真实只读核验：`2026-10-26T11:52:34.112Z`（北京时间 19:52:34），desktop-linux，本机端点 `npipe:////./pipe/dockerDesktopLinuxEngine`，Engine 29.6.2/Linux。修复后的真实受控 ensureImage 连续 3 次通过；独立 inspect 返回原批准 Image ID/RepoDigest、linux/amd64。只读取本地元数据，未重新查询 Registry、下载镜像或访问数据库。
- Compose `config --format json` 纯解析通过：service image、STALL_PHASE8_IMAGE 均准确为新的固定摘要引用，pull_policy=never，127.0.0.1:55433、专用 internal 网络及四份原 secret 源映射保持一致。使用合成启动令牌，不生成真实授权回执，receipts 仍为空。
- **结论：首次创建前的镜像阻塞已解除；首次创建尚未执行。**仍须单独授权，并在实际动作前重新检查端点、资源/端口、材料 ACL 和空回执，确认 Docker 管理权限独占。bootstrap 是真实内部初始化写入，001—020 迁移另行授权，created_verified 不等于 ready；这些边界保留。
- 本次仅修改 policy、bootstrap-entrypoint、合成夹具、整改测试及两份档案；未修改商城业务、真实凭据/ACL、审核记录或 Compose/launch/回执代码。全部验证和秘密/范围检查通过后，按本次授权以 `fix(test-postgres): resolve pinned image reference compatibility` 提交并普通推送，具体 SHA 以 Git 为准，不预填未生成的提交。

## 9. 第八轮 B3：受控首次创建实际记录（启动后验收失败）

- 日期：2026-10-26；以下操作时刻以 UTC 记录，北京时间为 UTC+8。基线 `85cceff85b8053cc5973a5f58b2f4964c5bf1f80`、main，开始工作区干净。只授权专用资源首次创建和必要 initdb/建库/bootstrap，不授权 001—020 迁移或业务写入型测试。
- 用户在执行前明确确认“本次窗口仅由当前任务管理 Docker”；现有其他项目容器可继续运行。只读机器检查无法独立证明没有其他人员/自动化，使用该用户确认作为 HOST_EXCLUSIVE 的操作性依据，未声称防御管理员或消除竞争。
- 预检通过，快照 `2026-10-26T12:02:44.578Z`：desktop-linux，本机 npipe 端点、Linux Engine 29.6.2、固定 postgres@digest、原批准 Image ID/linux/amd64 均一致。枚举全部容器/卷/网络及 Compose 项目，原数量 10/10/7，无 Phase8 旧资源、标签、挂载或项目冲突；原商城、Glyphora 等项目保留。55433 无 TCP 占用或 IPv4/IPv6 排除范围冲突。
- B2 材料：UUID `43805bf5-1391-4d3f-b8ce-e3bfa9448d48` 与原仓库外目录一致；四份密码各 64 字节、小写十六进制、彼此不同，七个原对象所有权/受保护 ACL 验证通过；receipts 原为空。未重新生成、覆盖密码或修改 ACL。
- 唯一受控命令 `node backend/scripts/start-test-db.mjs --create-first` 于 `2026-10-26T12:03:29.831Z` 开始，`2026-10-26T12:03:50.297Z` 结束；仅在子进程设置源码规定的 AUTHORIZE、INSTANCE_ID、DOCKER_EXE、HOST_EXCLUSIVE、RECEIPT_DIR、START 和四份 PASSWORD_FILE 路径。密码未进入 argv/输出/Git，无全局环境或生产配置修改。
- 实际结果：退出码 1、`phase8_port_binding_rejected`；没有 signal/子进程超时，未重试。受控入口已完成资源创建并执行 container start，失败在 `launch.mjs` 启动后的 `assertResources` 运行态门槛，不是镜像解析或启动前失败。不能把命令运行过或数据库 healthy 写成 created_verified。
- 容器 `stall-phase8-pg16`：ID `355ecc6045fa467319f906363d521a8c764ed1aabde737a3ca364847b89cfd06`，启动时间 `2026-10-26T12:03:45.995727695Z`；`12:05:07.344Z` 和 `12:11:05.059Z` 只读核验为 running/healthy，restart policy=no。镜像 `postgres@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` 及批准 Image ID 匹配。
- 卷 `stall-phase8-data` 为 local；网络 `stall-phase8-network` 为 internal bridge，ID `7918eeb7a1a787d8c4afb1871beecd1d36e61e16ba7d9fe52c0cc9a2227766af`，一个目标容器成员。实际总数 11 容器/11 卷/8 网络。资源项目/scope/实例 UUID/nonce 标签与私人回执一致，不记录 nonce 明文。数据卷专用，七个 bind（四个 secret、两个脚本、启动回执）均只读，源路径为原 B2 材料和仓库脚本；bootstrap.sh 在 inspect 中显示 Docker Desktop 的等价 host/c 路径，未指向其他项目。
- 端口失败证据：HostConfig.PortBindings 配置准确为 `{"5432/tcp":[{"HostIp":"127.0.0.1","HostPort":"55433"}]}`；运行态 NetworkSettings.Ports 却为 `{"5432/tcp":[]}`，Windows 本机 55433 无 TCP 端点。重新调用真实运行态 assertResources（仅传入已读元数据）仍拒绝同一错误。配置不等于实际发布；Engine/网络层成因尚未确认，不自动放宽安全策略、改 internal、换端口或尝试重启。
- 私人回执：原 receipts 下新建 `stall-phase8-b0.json`、`stall-phase8-b0.launch`；JSON 为 failed，容器 ID 与实际匹配；启动文件 MODE/实例/镜像/nonce 与 JSON 和资源标签一致。仅回执一致性/状态进入档案，不复制其内容或令牌。目录仍禁用 ACL 继承；新文件继承受限父目录的当前用户/SYSTEM/Administrators FullControl、当前用户所有，未出现额外主体或修改 ACL。
- bootstrap 日志：只读取目标容器日志，在内存检查白名单，存在 `Phase8 bootstrap complete; business migrations NOT initialized.`、官方 init process complete 和 server ready 标记。原 bootstrap 脚本在 SQL COMMIT 后才打印完成标记，故可报告日志显示 bootstrap 已完成，且有真实 initdb/建库/角色和标识初始化写入；没有独立 SQL 身份/角色/持久标识核验，也不声明 ready。当前公开 observer 核验入口要求业务 schema ready，不能拿来当无迁移 bootstrap 入口，因此未调用、未直接连接 PostgreSQL。
- 其他项目比较：原 10 个容器的 ID/运行状态/镜像配置/标签/挂载/端口配置以及 10 个卷静态身份一致，其他具名项目网络一致。但默认 bridge 的 ID 从 `9b4155efccc80a9c280a988914356b99c12f0c9a0995334df2fe71bbc36e0984` 变成 `47aa819ea371964586f64f3f7dafe864e14af45a879fb64c01bb075ae53c876f`；其驱动/internal/标签/空成员身份摘要一致。Phase8 未连接该 bridge，受控入口没有变更它的指令，但成因未确认，不能保证其他环境完全无影响。有界 Docker events 返回最近 256 条、主要是健康探测 exec，未保留创建早期全过程，不能由缺失事件推导“无变化”。没有清理、修复或回退该差异。
- 本轮没有重新运行 138 项单元测试或任何业务测试；未执行业务迁移、主机 SQL 查询、后端/库存/追踪 worker、支付/R2 操作、部署。失败后只读 inspect/logs/events/Windows ACL/端口；未停止、删除、重建、重新启动容器、卷或网络，未改源码、配置、凭据或 ACL。
- **结论：保留部分创建的运行容器、卷、网络和 failed 回执，停止并等待人工审查。**created_verified 未获得，bootstrap 仅有完成日志证据，ready 未获得；不具备进入 B4 迁移准备的条件。下一步应先审查运行态端口、默认 bridge ID 差异和失败回执处置，再单独授权后续行动，不得再次 --create-first 或自动修复。本次无论失败仍按授权永久提交两份非秘密档案；提交 SHA/普通 push 结果以实际 Git 为准。

## 10. 第八轮 B3：首次创建失败的只读诊断

### 10.1 范围与现场

- Git 基线 `934a2039b9b5dd6e6971c2d1b71cbcaae84842a6`，main，开始工作区干净。2026-10-26，只读 Docker inspect/port/info/version/logs/events、Windows 监听/本地 Docker Desktop 日志及必要非秘密设置字段；另行查阅 Docker 文档与 Moby 源码/问题记录。不启动或停止任何资源，不执行 SQL/迁移/业务测试，不修改源代码、设置、密码、UUID、ACL或回执。
- 快照 `12:48:25.070Z`：context desktop-linux、本机 npipe；Engine 29.6.2、GitCommit `3d80467`、Docker Desktop/WSL2 kernel `6.18.33.2-microsoft-standard-WSL2`、LiveRestore=false；网络无显式 gateway_mode 覆盖。容器仍为第 9 节相同 ID、镜像、UUID、专用卷/网络；running、healthy、RestartCount=0、StartedAt=`12:03:45.995727695Z` 未变。数据库内容未读取，不据此证明迁移/业务正确。

### 10.2 端口原因：请求已保存，实际未映射

| 检查 | 本次证据 | 结论 |
| --- | --- | --- |
| Config.ExposedPorts | 5432/tcp 存在 | 声明暴露，不等于宿主发布 |
| HostConfig.PortBindings | 127.0.0.1:55433 → 5432/tcp | Compose 将正确请求提交并被 Engine 保存 |
| NetworkSettings.Ports | `{"5432/tcp":[]}` | 无实际返回的宿主映射 |
| Networks / NetworkMode | 唯一 stall-phase8-network；Internal=true、bridge、IPv4 | 没有其他外部 gateway endpoint |
| 网络/endpoint 网关 | IPAM 有 172.22.0.1，endpoint Gateway 为空 | IPAM 子网配置不等于 endpoint 默认路由 |
| docker port | 空输出 | 与运行态 inspect 一致 |
| Windows Get-NetTCPConnection/netstat | 55433 均无结果 | 不只是 JSON 形式变化；未进行 TCP/SQL 连接探测 |
| 现有 policy | 真实 assertResources 再次返回 phase8_port_binding_rejected | 正确拒绝实际不符合承诺的端口；不降低规则 |

- 与本机 GitCommit 对应的 [Moby bridge_linux.go](https://github.com/moby/moby/blob/3d80467/daemon/libnetwork/drivers/bridge/bridge_linux.go#L1350)：internal endpoint 不设置 gateway；ProgramExternalConnectivity 根据 gateway endpoint 决定 IPv4/IPv6 绑定。配合 [default_gateway.go](https://github.com/moby/moby/blob/3d80467/daemon/libnetwork/default_gateway.go#L107) 对 internal 的默认网关处理和 [port_mapping_linux.go](https://github.com/moby/moby/blob/3d80467/daemon/libnetwork/drivers/bridge/port_mapping_linux.go#L187) 的选择条件，解释本例默认 NAT 下没有 host mapping。源码审查与现场一致，确认 B0“仅 internal 网络 + 要求宿主端口发布”的设计冲突；不是凭 issue 猜测。
- [Moby 53256](https://github.com/moby/moby/discussions/53256) 同型 29.6.2 报告、[44986](https://github.com/moby/moby/issues/44986) 较早案例仅作旁证；[53960](https://github.com/moby/moby/issues/53960) 混有不同版本/kernel 的另一类故障，不能直接套用其所有结论。本轮未做改网络 A/B、未查询 VM iptables/nftables，故不声称排除额外 Desktop 转发故障、不认定是 Compose 专有 bug，也不保证升级即可解决。
- healthy 的测试命令是在容器内部调用 pg_isready，不涉及宿主 loopback 端口。`launch.mjs:67` start 后到 `:70` assertResources，`:72` 成功回执前已抛错，`:74` catch 写 failed；健康与验收失败衡量不同条件，可以同时成立。

### 10.3 回执与 bootstrap 的真实时间线

- 回执 JSON 创建时间 `12:03:30.583Z`；专用卷创建 `12:03:35Z`，专网创建 `12:03:38.798689136Z`，容器创建 `12:03:43.138592873Z`，启动 `12:03:45.995727695Z`。
- 带 Docker 时间戳的日志白名单：`12:03:47.706725815Z` 临时数据库接受连接；`12:03:47.940234329Z` bootstrap 完成标记；`12:03:48.144010015Z` 官方初始化完成；`12:03:48.179856792Z` 正式数据库接受连接。只取白名单标记，未输出原始日志、密码、SQL 参数或私有令牌。
- 回执 mtime=`12:03:50.272Z`、status=failed；子进程 `12:03:50.297Z` 退出 1。回执容器 ID/镜像/实例 UUID/nonce 与资源标签一致；不复制 nonce 或完整回执。本次只读取，未改内容/时间，容器无重启，现有数据库和回执保留。日志支持 bootstrap hook 已完成，但没有独立 SQL 核验持久 UUID、权限/角色、业务表或 ready。

### 10.4 默认 bridge：Engine 初始化与缓存同步，发生在创建命令之前

- 旧 ID `9b4155efccc80a9c280a988914356b99c12f0c9a0995334df2fe71bbc36e0984`，新 ID `47aa819ea371964586f64f3f7dafe864e14af45a879fb64c01bb075ae53c876f`。
- 可复核的仓库外本机日志，根目录为 `C:\Users\USER\AppData\Local\Docker\log`：
  - `host/com.docker.backend.exe.log.20261026-204610.595:3569/3587/3608`：12:00:33、12:01:33、12:02:33 的 apicache GET 旧 bridge。
  - 同文件 `:3669`：`12:02:36.895827900Z` 引擎 linux/wsl 从 stopped 进入 starting；`:3723`：恢复 Desktop、Idle=shutdown、cgroup pause 路径 no-such-device 错误。
  - `vm/init.log.20261026-200419.626:5619`：`12:02:42.386303708Z` daemon 启动；`:5643` 标明 29.6.2/3d80467；`:5646` `12:02:43.818745021Z` 初始化完成。
  - 新 bridge inspect Created=`12:02:43.431715414Z`；host 同文件 `:3800/:3802` 在 `12:02:43.881Z` 注销旧资源、登记新资源。
- [同版本 daemon_unix.go](https://github.com/moby/moby/blob/3d80467/daemon/daemon_unix.go#L774) 的无活动 sandbox 初始化路径，会清除旧默认 bridge 再创建默认网络。这与本机日志/新网络创建时间相符，解释 ID 改变；**该时间早于首次创建命令 `12:03:29.831Z`，不是受控入口向 bridge 发出删除指令的证据**。先前比较跨越了初始化/缓存同步，不能当作原子快照。
- 已确认 Engine 有重新启动/初始化过程；日志也有唤醒语义，但无法仅据此确认其原先停止的原因、哪个 API 请求触发唤醒，或严格归因 Resource Saver 设置。[Docker Resource Saver 文档](https://docs.docker.com/desktop/use-desktop/resource-saver/) 说明部分列表查询可由缓存处理，WSL 的暂停行为又有差异；不能把一般机制当成本机完整因果证明。
- 当前 bridge 无成员；检查含停止项的 11 个容器，其他 10 个均 exited，配置使用各自具名项目网络，未发现任何容器配置指向默认 bridge。没有发现可验证的数据损坏或本轮造成的应用异常，亦没有访问数据库/做全链路测试，因此不承诺历史业务完全无影响。事件接口只保留最近 256 条健康探测相关事件，不能恢复创建早期全过程；本机持久日志提供了上述补充。

### 10.5 修复选择与恢复前置条件（仅分析，未执行）

| 选择 | 可行性与隔离代价 | 必要前置条件 |
| --- | --- | --- |
| 保留 DB internal，将测试进程放到同一专网 | 不依赖 Windows 发布端口；改变 host-only URL/runner 身份与拓扑契约 | 用户接受访问模型改变；审批运行器镜像、角色、只读材料/网络边界，新增安全入口和真实验收 |
| 保留 DB internal，独立受限 TCP 代理连接内部网与专用入口网 | 数据库不直接获得外部网络；代理仅转发本机固定端口到该实例，不作为通用出口 | 新组件/镜像审核、限制代理目标/方向/权限、防跨项目访问、回执和安全策略显式扩展；禁止直接给 DB 接任意外网 |
| 专用非 internal bridge + 强制出口/跨项目防火墙 | 更贴合现有 host loopback 使用方式，但会失去 internal 默认无外网保证 | 单独授权隔离设计和精确防火墙；在 Desktop VM/宿主层验证实际出口、loopback、其他项目隔离，不只是把 internal 改 false |

- 维持当前完全相同拓扑，仅重启、改端口元数据断言或盲目升级，没有已验证解决依据；`routed/isolated` 模式也不是保持原 127.0.0.1:55433 NAT 契约的无风险开关。上述方案均未执行，未拉取镜像或修改全局 Desktop/daemon 设置。
- **现有 B0 不支持当前失败实例的安全接管**：first 的 wx 回执/旧资源/非空 PGDATA 保护阻止重跑；restart 需要停止容器及允许状态的原回执，failed 不在 `readReceipt()` 白名单，启动后又要求业务 schema ready。restart 还会先创建自己的尝试回执，所以不能“调用看看”。现容器仍运行且仅 bootstrap，不能通过更改 failed、删回执或假称 ready 绕过。
- 未来如选择保留该已初始化实例，需另行授权设计显式的失败实例核验/恢复流程：绑定原 UUID/不可变容器ID/卷/镜像/标签，保留原失败回执，独立追加审计；先有验证过的网络方案，再提供受最小 observer 权限约束的 bootstrap 只读身份/角色核验，确实满足资源条件后才作新的受控验收记录。不得覆盖原失败证据或批量改历史状态，不能承诺当前已有这种入口。
- **B4 仍禁止**。修复方案、恢复机制及其真实验收均未授权或实现，本轮只提交三份诊断文档，没有新增测试通过数量。

## 11. 第八轮 B3-R：网络架构整改与失败实例恢复设计

- 日期2026-10-26，基线 `70145de43af8d649f43883dd6254af639cba8cac`、main，开始工作区干净。已读取Compose、policy/launch/docker/receipts/postgres、真实pg夹具、初始化器、B0说明和三份当前档案，不以文件名推断兼容性。
- 新增 [详细设计](../../backend/PHASE8_NETWORK_RECOVERY_DESIGN.md)：逐项比较 A/B/C 的真实事务与并发、防误连、出口、Windows兼容、镜像/凭据/权限/组件、夹具改动、自动回归和恢复复杂度；映射当前每个安全函数的实施接缝。
- 推荐 A：DB与Node运行器处于专用internal网络，新V2优先internal+isolated IPv4、IPv6禁用，无宿主发布。internal默认模式并不绝对隔离宿主服务，localhost入站也不控制出口；仍需实际metadata+可控canary拒绝测试，不能只凭网络标志证明安全。宿主负责Docker attestation，runner无socket，单用途角色/只读挂载/短期私有grant，SQL身份核验在写入前完成。
- 因A需要新运行器镜像、新拓扑和显式V2授权协议，本轮按边界**只做详细设计**。未修改运行源码、Compose、安全策略或测试，不半实现新路径，更不删除端口失败断言。B0仍拒绝当前现场，B3仍失败，B4仍阻塞。
- 旧实例六问已逐项回答：可另行授权observer probe无损识别；增加runner/代理不必重建DB，修改网络属性/发布契约不能视为无成本原地开关；不重建可保留原ID/UUID/nonce，但failed回执永久保留；现有first/restart不是恢复入口，不能试调用。
- 默认选择：旧容器/卷/网络保留审计，另建互不共享资源的V2可写实例。旧HostConfig有未生效发布请求、网络非isolated，不符合新A严格零发布基线，不能宽松接管。可选旧实例只读probe仅追加调查结果、不赋予迁移或写权限；若坚持原实例写测试，需另审legacy/C方案，不承诺当前能安全恢复。
- 设计给出候选V2命名空间stall-phase8-r2、全新材料的后续授权、host/runner两段身份协议、只读bootstrap SQL白名单、只追加审计和原失败回执绑定、新协议真实验收顺序。新UUID/密码/镜像摘要均未生成或编造，任何资源创建、镜像构建/下载、旧网加入probe、SQL只读核验与迁移须分别授权。
- 实际离线命令：`node --test backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs`，**138通过、0失败、0跳过、0取消**。15个相关MJS的node --check通过，检查结束输出时间 `2026-10-26T13:09:16.6640098Z`。这些是现有真实安全函数+假Docker/PG transport，不是新方案/真实数据库验收；不与历史138再次累加。
- 新增测试 **0项**：无新运行实现就不制造设计“通过”用例；完整文档列出下一轮必须针对实际新函数编写的合成拒绝测试与真实Docker/PG验收，不把未编写项计入覆盖。没有运行其他backend/数据库测试、后端或worker。
- 修改范围：一个设计文档、B0说明的当前使用限制提示、三份测试档案；无实际Docker命令或数据库连接，无材料/failed回执变更。当前资源状态只引用前轮现场记录，未声称本轮新鲜核验。按授权在文档/范围/秘密/空白检查通过后提交并普通推送；具体SHA以Git为准。

## 12. 当前阻塞与下一步

1. **已完成：B1过时断言修复**。真实文件不再永久绑定未批准状态，安全拒绝断言保留；124/0/0为历史报告。
2. **已完成：B1审核登记与修复提交**。Git确认提交 `b18a5d22974bf52205b542c71d3065d85a8a330e`；本轮档案提交前仍要核对远程没有意外推进。
3. **已完成：B2离线凭据准备**：本次实际创建四份凭据、受限回执目录及新的 v4 UUID，独立回读核验通过。具体非秘密证据见第 6 节；严禁将密码或完整连接串提交仓库。
4. **已解除：B3 固定引用兼容阻塞**：最小修复已获授权并验证，使用标准 postgres@digest，审核渠道、Image ID、完整 digest 和 ensureImage 身份核验仍保留。未批准浮动标签回退或镜像升级。
5. **首次创建故障未修复，B3-R仅设计完成**：推荐A/V2新可写实例，原失败实例保留；新运行器/授权协议、旧实例可选只读probe和真实隔离验收均待单独实施/授权。不得重试、清理或进入B4，不把设计或healthy当作created_verified/ready。
6. **迁移及真实数据库测试另行授权**：执行 20 份迁移和只读 schema/身份检查后，才能验证业务并发、锁、约束、订单/库存一致性。
7. **最终上线验收**：支付/收款流程、商家/顾客端真机测试、备份恢复、生产部署、安全与权限等均需独立验收；不能因测试设施准备完毕直接交付商家。

## 13. 后续每轮记录规范

以后每次测试在此文件追加一个记录块，至少写明：

```text
日期与时区：
Git HEAD / 分支 / 工作区是否干净：
阶段与测试目的：
实际执行命令（不含密码）：
环境（Node/Docker/PostgreSQL，涉及哪一个专用实例）：
通过 / 失败 / 跳过 / 未执行：
失败测试名称、错误与跟踪位置：
实际更改的源码/测试/配置文件：
是否修改数据库、容器、网络、部署：
提交 SHA / 是否已推送：
下轮前置条件与禁止操作：
原始日志保存路径或 CI Run 链接：
```

**长期原则：**不能只用聊天记录保存结果；不能将“以前通过”“模拟通过”“只读检查通过”写成“当前真实数据库全面通过”。商家不承担开发测试任务。

## 14. 第八轮 B3-V2：独立运行器源码实现

日期：2026-10-26（档案按北京时间）；Git 基线 `083f67548d044c29ad4a9e0497d791e4348fd5f8`，main，开始工作区干净。按用户授权只实现源码、合成安全回归与静态检查，没有进入真实资源准备。

- 新增 `compose.test-v2.yml`、V2 host/controller/docker/policy/grants、固定 runner/sql/initialize/fixture、审核占位、Dockerfile 与 allowlist 构建上下文准备脚本。旧 B0 文件、failed 回执、容器/卷/网络、UUID、nonce 和凭据未操作；未读取旧密码。
- 协议为 `internal-runner-v1`；目标项目 `stall-phase8-r2`、容器 `stall-phase8-r2-pg16`、卷 `stall-phase8-r2-data`、网络 `stall-phase8-r2-network`，internal + isolated、禁 IPv6、无宿主端口。
- 运行器镜像独立审核、未批准默认拒绝；固定任务范围、60秒 grant 启动期限、5分钟执行上限、持久化 wx 消费、防重放、非root/只读root/cap-drop/NNP/最小挂载。bootstrap 仅只读 SQL；初始化与真实业务测试须额外授权。
- 静态核对修正了新 Compose secret 目标、Node base CMD 继承，以及 order_items 无 store_id 时的最终快照关联查询；没有修改商城业务源码或原138项断言。
- 新增 `backend/tests/phase8-v2.unit.test.mjs` 97项，实际运行 **97通过、0失败、0跳过**。调用真实 V2 函数并注入合成 Docker/PG 元数据；不是数据库行为模型或真实 SQL 验收。
- 完整执行：`node --test backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs backend/tests/phase8-v2.unit.test.mjs`，**235通过、0失败、0跳过**（含原138项）。不与历史165项相加。
- 14个新增MJS的 `node --check`、项目 `tsc --noEmit --pretty false` 通过。Docker CLI仅执行 `compose ... config --format json`，验证专用名称、零发布端口、isolated、IPv6关闭及四个secret目标；没有访问Engine资源。Git空白与范围检查作为提交门槛。
- 未执行：构建上下文准备、npm安装、镜像下载/构建/审核、创建凭据/UUID、Docker资源创建或修改、DB连接/SQL/迁移、API/worker启动、真实业务测试。没有生成真实运行回执或数据库ready证据。

结果：V2 源码与离线门槛已建立，**旧B3仍失败，B4仍阻塞**。可进入另行授权的 V2 镜像审核准备，不能自动启动。真实挂载/UID/ACL、网络出口隔离及 PostgreSQL 语义均待验收。详见 [V2 契约](../../backend/testing/phase8-v2/README.md)。本节随本轮授权提交普通推送，具体SHA以包含本节的Git提交为准，不预填尚未生成的SHA。

## 15. 第八轮 B3-V2：运行器镜像供应链准备

日期：2026-10-27（客户端Asia/Kuala_Lumpur，档案Asia/Shanghai，同为UTC+8）。起始HEAD `dd83d09d51797c05aff8a5a0db8e3793d49c54cd`，main，工作区干净。仅更新本档案、TEST_STATUS和KNOWN_ISSUES；不修改V2源码、策略、Dockerfile、依赖或审核文件。

### 15.1 官方Node候选与来源

推荐候选 **`docker.io/library/node:24.22.1-bookworm-slim` / linux/amd64**，不是自动批准。24.x已按官方日程于2026-10-20进入Maintenance LTS，支持至2028-04-30；24.22.1为2026-10-21的安全发布。26.x计划2026-10-28进入LTS，本次不为了新版本临时更换主版本。选择Debian/glibc版避免引入Alpine/musl适配差异；没有声称已完成漏洞扫描。

来源交叉核对：

- [官方镜像维护清单](https://github.com/docker-library/official-images/blob/master/library/node)：Maintainers为Node.js Docker Team，GitRepo为nodejs/docker-node；该版本bookworm-slim目录指向提交 `80f02a542da739e6a662451d1db66456a0dea253`。
- [该提交的Dockerfile](https://github.com/nodejs/docker-node/blob/80f02a542da739e6a662451d1db66456a0dea253/24/bookworm-slim/Dockerfile)：NODE_VERSION=24.22.1、node UID/GID1000；官方构建步骤包含Node发行包签名/校验和核验。本轮没有重新下载二进制或独立执行GPG验证。
- [Node官方发布](https://nodejs.org/en/blog/release/v24.22.1)、[官方支持日程](https://github.com/nodejs/Release/blob/main/schedule.json)。

Registry读取时点 `2026-10-27T01:49:01.682Z`（UTC）。仅以临时匿名只读token请求 `registry-1.docker.io/v2/library/node` 的manifests及配置JSON；token只在内存，不打印、不保存。没有请求镜像层、npm tarball或其他依赖。再次读取索引，摘要未变。

| 身份 | 实际值 | 本轮证据 |
| --- | --- | --- |
| 多架构OCI索引 | `sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205` | 原始响应字节重算SHA256=响应Docker-Content-Digest |
| linux/amd64平台manifest | `sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae` | 索引descriptor、1929字节长度、响应头与重算SHA256一致 |
| OCI配置blob | `sha256:dc1f22974dab4be31a8b56d58cb1f8fc218e83de83ccd831d885b3d7ac1223fb` | manifest.config.digest=配置响应字节SHA256；不是本地Image ID的替代值 |
| 配置创建时间 | `2026-10-21T11:35:50.393702483Z` | config.created；不是本机下载/审核时间 |
| 基础Debian摘要 | `sha256:ec31d744f83f4a73447ba045aaab9409997efe5cc706eca4890c1be36cc1606a` | amd64 descriptor的base.digest注解，本轮未另行拉取/批准该基础镜像 |
| 来源注解 | `nodejs/docker-node.git#80f02a542da739e6a662451d1db66456a0dea253:24/bookworm-slim` | 与官方维护清单/源码一致，不作为独立签名证明 |
| 配置环境 | NODE_VERSION=24.22.1、YARN_VERSION=1.22.22、标准PATH | 符合V2允许的环境字段；base默认root，最终Dockerfile改为1000:1000 |
| 本地Image ID / RepoDigest | **未知** | 本机Engine不可达，不能把配置摘要或Registry摘要填充为本地观测值 |

完整索引含6个descriptor：

| 平台/类型 | 摘要 |
| --- | --- |
| linux/amd64 | `sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae` |
| amd64对应attestation-manifest（unknown/unknown） | `sha256:3089de3a9d5cf514855082aa236fe9a1bf4b264d7460dccf98a9977c6af365cd` |
| linux/arm64/v8 | `sha256:294d33a992da016e059121deb0c979dffb4478b77a304376bca41393297c1ea2` |
| arm64对应attestation-manifest（unknown/unknown） | `sha256:f6322dd419dac62e3f5462da86f11a1cb8fe0a7b52ab85d72721fb4a6681c6a4` |
| linux/ppc64le | `sha256:41a7d6337c4dfc9f286af709ad6551d931660f822c464e134f329a799a7f9cb9` |
| ppc64le对应attestation-manifest（unknown/unknown） | `sha256:ec43273f93e3f68d1ecb2f98de307afb48f77fc608db7305e1daebcd2bcd3b52` |

attestation descriptor本身不等于已验证签名/完整证明链。本次未获取或验证其payload。摘要相同的重复读取也不算独立来源证据。后续固定baseReference建议明确使用已核对的amd64平台引用 `node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae`，同时保留索引与config关系；未登记到审核文件。

### 15.2 本机Docker检查及限制

- Docker CLI 29.6.2，windows/amd64；Buildx `v0.35.0-desktop.2`。当前context为desktop-linux，端点 `npipe:////./pipe/dockerDesktopLinuxEngine`，符合V2允许的本机端点格式。
- version/server、info/DriverStatus、image ls及候选image inspect均无法连接该管道；在解除文件沙箱限制的只读复核中仍是“系统找不到指定文件”。**仅证明Engine不可达，不推断Docker Desktop一定已停止，也不判定镜像不存在。**未启动、唤醒或更改Docker配置。
- 因此本地候选镜像、实际Engine版本、containerd/classic image store、内置builder及其已缓存基础层均未验证。没有根据旧PostgreSQL Image ID等历史表现推断当前存储后端。
- buildx version/build --help只读取CLI能力。首次buildx ls因尝试打开用户目录下.lock被沙箱拒绝，未获得builder清单；未提升权限重跑该命令。后续仅读取已有buildx实例配置目录，没有实例记录；默认context builder可能不以该文件形式存储，不能据此说“没有builder”。
- 未枚举或访问旧B0数据库/密码/回执。旧资源运行状态本轮未重新核验；没有停止、重启或修改任何项目资源。

### 15.3 锁文件、缓存、白名单与摘要

lockfileVersion=3，根name/version/三项依赖与package.json一致；41个非dev包，148条普通依赖边全部能在lock中解析且版本满足范围。41项resolved均为registry.npmjs.org，均有SHA512 integrity；无缺失resolved/integrity、无hasInstallScript、无os/cpu限制，1个optional包为pg-cloudflare。声明的Node engine范围兼容24候选；没有执行包代码或网络npm查询。

实际用户缓存 `C:\Users\USER\AppData\Local\npm-cache`：41/41所需内容文件存在，相应41个request-cache索引的URL与integrity匹配；`C:\Users\USER\.npm`不存在。最初沙箱重定向LOCALAPPDATA下未找到缓存，不将该虚拟路径结果误作主机缺失。只读取匹配索引和文件stat，**未读取tarball内容/SRI重算，未运行npm ci/verify/install或改变缓存**。所以结论是“缓存元数据齐全，离线安装尚未验证”，不是“离线安装通过”。

构建上下文准备器静态契约：仓库外全新目录，授权开关，已有目录拒绝；仅复制34个白名单文件（含20份001—020原SQL），统一LF；生成bundle.json、Dockerfile、Dockerignore。白名单不含.env、凭据、回执、server入口或整个仓库；源码只读manifest和原迁移哈希检查通过。**本轮未调用--prepare，未创建构建目录。**

| 输入摘要 | 当前值 |
| --- | --- |
| 源码bundle.json的预期SHA256 | `f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289` |
| Dockerfile.runner原始字节SHA256 | `a8518b86a2af948a3090a4630c49c6628d66560c3aceaf627a5bac89d3099eb7` |
| package-lock.json原始字节SHA256 | `306ec2ccef7e599b76f6b5d37e57039584a1d721ec5b42ee87b33064d4cbc3a1` |
| prepare-phase8-v2-context.mjs原始字节SHA256 | `a429bfa232d9e769cb294f0e205a1fa49725fb14065329c62dc028ee64b998c2` |

源bundle不是完整构建上下文摘要：不覆盖Dockerfile、Dockerignore、npm-cache、base或构建参数。下阶段需另生成完整输入清单，校验实际payload没有额外文件/重解析链接，记录文件字节/模式、精选缓存SRI和构建参数，保存清单自身SHA；不能把上表bundle字段冒充完整context hash。已有准备器不自动完成缓存精选或完整上下文审计。

不得复制整个用户npm-cache到构建上下文：可能携带其他项目/私有URL/缓存元数据。应单独授权，从lock所指的41份内容按SRI校验后重建专用最小cache/index，不拷贝.npmrc、认证headers、日志或用户配置。当前没有该专用缓存或完成记录，不能直接build。

Dockerfile在构建阶段通过 `npm ci --offline --ignore-scripts --omit=dev` 使用COPY进来的cache；基础层完整可用、缓存字节有效及npm兼容时，npm不需要公网依赖下载。现有Dockerfile把cache留在最终镜像中，故精选无敏感元数据是硬前提。最终USER=1000:1000；只读root/cap-drop/NNP由V2容器创建及身份策略强制，不是Dockerfile自身实现只读root。尚未实际创建运行器或验证Windows挂载可读性。

### 15.4 固定镜像方案比较与结论

| 方案 | 是否可满足当前策略 | 运行前置条件/边界 |
| --- | --- | --- |
| **首选：内置docker driver + containerd image store + image exporter** | 条件可行：exporter支持store及canonical name，image store可产生真实RepoDigest；本地记录必须实际可按裸repo@digest解析 | 先核实真实Engine/image store/builder和完整base。`push=false`，保持 `stall-phase8-r2-runner` 的现有精确repo；不是推到Docker Hub library仓库。当前Engine不可达，未证明本机支持 |
| OCI layout导出、审计后导入Docker containerd store | 条件可行，不保证任意docker load都保留所需引用 | docker driver不能直接提供OCI exporter；需要另行审核/授权docker-container或其他builder、固定BuildKit镜像及新增资源。需审计index/manifest/config、引用注解和导入后实际inspect；本轮未创建builder或OCI文件 |
| 专用本地/私有Registry分发 | **当前不可直接采用** | 通常得到 `localhost:port/...@digest` 或私有域名引用，现有policy/grant精确repo拒绝；需要额外registry镜像/端口/权限。不得剥掉前缀伪造RepoDigest。若首选不可用，须另行审批显式分发身份设计及回归，不能偷偷放宽 |
| 普通build/--load、再手动tag或拼接digest | 不足以证明 | classic store常只有配置Image ID；即使某containerd版本能显示digest，也必须核验真实固定引用、manifest对应和本地数据，不把tag/字符串当来源证明 |

机制依据：[Docker image exporter](https://docs.docker.com/build/exporters/image-registry/) 的name-canonical/store/push参数、[docker driver](https://docs.docker.com/build/builders/drivers/docker/) 的本地存储行为、[containerd store说明](https://docs.docker.com/desktop/features/containerd/)、[Moby containerd ImageInspect源码](https://github.com/moby/moby/blob/master/daemon/containerd/image_inspect.go)。Moby该源码的ID可能是target descriptor摘要，而非config摘要；具体以本机实际版本为准。RepoDigest在本地可由descriptor派生，不是独立的外部来源签名。OCI边界见[exporter文档](https://docs.docker.com/build/exporters/oci-docker/)。这些是官方机制与源码支持的方案，不是本机实测通过。

审核完成必须同时留存：原base官方来源/索引/平台/config及实际本地身份、34文件bundle、完整context清单、lock+精选缓存SRI、Dockerfile、构建参数/工具版本/日志、产物OCI根descriptor/平台manifest/config、实际Image ID及RepoDigests和固定引用inspect结果。三个digest层次不能互相填充。仍保持审核文件approved=false，只有后续明确授权且全部验证后才能登记。

### 15.5 下次所需授权及实际命令（本轮未执行）

授权应分开：①允许用户启动/恢复Docker Desktop并做本机只读复核；②如果缺基础层，明确授权获取上述固定Node引用（不是跟随浮动标签）；③允许仓库外生成唯一全新上下文及精选缓存、读取已核对的41份tarball进行SRI校验；④确认containerd + 内置docker driver后，授权一次受控镜像构建及本地image-store写入/构建缓存，不包含任何V2 DB/runner容器创建；⑤独立人工审核登记。OCI备用builder/私有registry绝不隐含在④中。

未来只读前置命令：

```powershell
docker context inspect desktop-linux
docker --context desktop-linux info --format '{{json .DriverStatus}}'
docker --context desktop-linux buildx inspect desktop-linux
docker --context desktop-linux image inspect node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae
```

不加buildx `--bootstrap`，不创建新builder。核对image store/builder端点、Linux/amd64及完整本地基础层；若需要切换image store，须单独评估其他项目影响并授权，不能为构建擅改。当前本地是否有镜像未知，所以不自动执行pull；若②另行批准且确定缺失，才可精确获取：

```powershell
docker --context desktop-linux pull --platform linux/amd64 node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae
```

③授权后，全新目录名只是候选路径，不是本轮创建的目录：

```powershell
$env:PHASE8_V2_BUILD_CONTEXT_AUTHORIZE = 'PREPARE_NEW_CONTEXT_ONLY'
$env:PHASE8_V2_BUILD_CONTEXT = 'C:\Users\USER\StallPhase8-V2-Runner-Context-dd83d09'
node backend/scripts/prepare-phase8-v2-context.mjs --prepare
```

然后必须完成精选缓存/SRI/额外文件/完整context清单检查；**现有脚本不会完成此步，本轮没有实施缓存准备工具，未完成时不得跳到下面build命令**。确认上下文、base和工具版本未漂移，④授权后候选命令为：

```powershell
docker --context desktop-linux buildx build --builder desktop-linux `
  --platform linux/amd64 --pull=false --network none --provenance=false --sbom=false `
  --build-arg NODE_BASE=node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae `
  --build-arg BUNDLE_SHA256=f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289 `
  --build-arg SOURCE_DATE_EPOCH=1793023505 `
  --output 'type=image,name=docker.io/library/stall-phase8-r2-runner:review-dd83d09,push=false,store=true,name-canonical=true,oci-mediatypes=true,rewrite-timestamp=true' `
  --metadata-file C:\Users\USER\StallPhase8-V2-Runner-Context-dd83d09\build.metadata.json `
  C:\Users\USER\StallPhase8-V2-Runner-Context-dd83d09
```

以上时间戳取源码基线commit，不是今天时间；base/bundle/工具链改变时重新审核。metadata输出放上下文根目录时须确认Dockerignore将其排除，且预先不存在，防止覆盖旧审计材料。使用单平台和关闭自动provenance/SBOM避免隐含scanner镜像下载；来源证据以显式输入/构建记录保留。时间归一机制见[Docker文档](https://docs.docker.com/build/ci/github-actions/reproducible-builds/)，未验证重复构建能产生相同digest。

`--network none`约束RUN网络，`--pull=false`只是不强制更新基础镜像；它们不等于禁止BuildKit resolver联网或证明所有基础层本地齐全。须先核实完整base和内置frontend，记录任何resolver访问；不能在缺基础层时偷偷下载或声称整个构建已离线通过。若上述exporter属性/默认builder在实际Engine不支持，停止，不回退浮动标签、--load假digest或自动创建备用builder。

构建后从metadata提取真实根descriptor摘要，再按 `stall-phase8-r2-runner@sha256:<实际产物摘要>` 执行只读image inspect（不使用带tag@digest形式）；确认RepoDigests包含精确短引用或现有策略允许的docker.io/library完整形式，读取实际Image ID（不可预填config digest）、Linux/amd64、NODE_VERSION、USER、ENTRYPOINT/CMD和bundle label，必要时离线审计层内容/额外文件。未通过时保持未批准。新digest不能在构建前编造。

### 15.6 本轮验证与结论

12个相关MJS的node --check通过；只读源码/manifest/迁移摘要/当前未批准拒绝断言通过。前轮235项离线安全回归**本轮未重跑**，仍作为历史结果；未新增测试或修改既有断言。网络操作仅官方网页/Registry元数据和授权Git同步；Registry匿名token不落盘。Docker只读查询失败未触发自动启动。

仅准备调查完成，不具备直接创建V2或执行B4条件。Engine可达性、本地Node基础层、image-store/exporter实测、精选缓存及完整上下文、真正构建与人工审核均待后续授权。没有创建目录/密码/UUID/镜像/容器/卷/网络、下载依赖、读旧密码或failed回执、连接数据库、运行迁移/API/worker。文档随本轮授权提交普通Push；提交SHA由包含本节的Git提交确定，不预填未来SHA。

## 16. 第八轮 B3-V2：Engine恢复核验与运行器构建前审计

日期：2026-10-27；客户端Asia/Kuala_Lumpur与档案Asia/Shanghai均为UTC+8。起始HEAD及只读查询到的远程main均为 `80114f191668a8c9adb1da6b4de81a4a7ffadfef`，main，工作区干净。前轮曾报告Push认证失败，但本轮开始远程已追平，不推定由谁补推，也不追认前轮失败命令成功。

本轮用户澄清：“仅禁止旧实例运行材料，保留已审计共享源码”。因此现有白名单中5项 `backend/testing/phase8/` 公共源码可列入审计；没有纳入或读取旧实例密码、私人回执、nonce文件、数据库文件或用户目录。没有修改任何商城业务、V2代码、依赖、安全策略或测试断言。

### 16.1 Docker与资源状态

实际只读命令：可见进程查询（Docker Desktop/com.docker.backend/com.docker.proxy/dockerd）、`docker context show`、`docker context inspect desktop-linux --format '{{json .Endpoints.docker}}'`、`docker --version`、`docker compose version`、`docker buildx version`、`docker --context desktop-linux version --format '{{json .Server}}'`。

- CLI 29.6.2（dfc4efb），Compose 5.3.1，Buildx v0.35.0-desktop.2，宿主Node v24.16.0。
- context为desktop-linux，实际配置端点 `npipe:////./pipe/dockerDesktopLinuxEngine`，SkipTLSVerify=false。
- 被查询的Docker相关进程未列出；Engine返回“open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified”，Server=null。结论是**Engine没有恢复可达**；不扩张成数据/资源被删除的判断。
- 按任务要求停止后续依赖Engine的info/image inspect/builder及资源查询。实际Engine版本、DriverStatus、containerd image store、builder驱动/平台/exporter、本地Node镜像ID/RepoDigest与完整基础层均未验证。
- 旧B0容器/卷/网络、商城与Glyphora资源当前ID/状态/标签无法重新读取；没有触碰它们，没有重启Desktop/Engine、没有改变builder/存储后端或网络。历史failed回执未读未改。V2本轮未创建，历史尚未创建的记录未被运行时核验取代。

### 16.2 官方基础镜像复核

`2026-10-27T02:14:00.956Z`（UTC）再次从Docker Official Registry只读获取标签索引、固定amd64清单及配置JSON，重算响应字节SHA256，三个摘要均与第15节一致：

| 类型 | SHA256 |
| --- | --- |
| node:24.22.1-bookworm-slim索引 | `55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205` |
| linux/amd64 manifest | `2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae` |
| 配置blob | `dc1f22974dab4be31a8b56d58cb1f8fc218e83de83ccd831d885b3d7ac1223fb` |

Registry环境仍为NODE_VERSION=24.22.1、linux/amd64，来源注解仍指向官方提交 `80f02a542da739e6a662451d1db66456a0dea253:24/bookworm-slim`。没有请求镜像层或保存/打印临时匿名token。**官方存在不证明本机存在；本地状态未知，runner-image-approval.json仍为approved=false。**基础镜像支持Node>=20及UID1000需求，与当前Dockerfile兼容属于源码/元数据判断，不是实际构建通过。

### 16.3 41包真实内容与依赖闭包

本轮读取当前用户npm-cache中lock选择的41个内容文件，逐一重算实际SHA512并与lock的integrity比较，同时记录内容SHA256和字节数。合计 **1,562,730字节，41/41通过，0缺失、0损坏、0无法验证**。在内存中使用已安装npm附带tar 7.5.13解析归档，没有解压文件或执行其中代码。

- 41份归档的package.json包名、版本及dependencies/optionalDependencies/peerDependencies字段与lock匹配。
- 41份对应索引记录的校验和、请求key及integrity匹配；所选内容和索引在读前后的size/mtime保持一致。没有修改原缓存，没有执行npm install/ci/cache verify/add或在线npm下载。
- 148条普通依赖边、1条optional边、1条必需peer边通过版本范围检查；另1条optional peer为 `pg-native >=3.0.1`，缺席符合其optional声明，不是缺失必需依赖。归档依赖与lock闭包无不一致。
- 对所选索引metadata及归档的指定凭据字段、可疑文件名、私钥/GitHub令牌形态、路径逃逸/链接检查均无发现。没有保存索引原始headers或认证值；这不是完整DLP、恶意代码或漏洞审计，不承诺任意秘密均可识别。
- 全局index-v5共7150个文件桶，选中41个，其余7109个仅读目录/文件存在性计数，**没有读取内容或批准纳入镜像**。全局缓存可能含其他项目资料，仍禁止整库复制；正式精选cache未生成，Linux/npm离线安装未运行。

### 16.4 可审计输入清单与边界

新增非秘密审计文档 [PHASE8_V2_BUILD_INPUT_AUDIT.json](PHASE8_V2_BUILD_INPUT_AUDIT.json)：

- 精确列出现有34个白名单文件（含20份原始迁移及5项用户允许的共享源码）的相对路径、UTF8-LF内容SHA256、原始工作区字节SHA256及规范化字节数。源bundle SHA256仍为 `f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289`。LF与工作区CRLF的摘要分别标记，不混算。
- Dockerfile、package-lock、上下文准备器和预期Dockerignore有单独摘要；41项依赖列出公开resolved地址、版本、实际SRI/SHA256、内容字节数和审计结果，不列原始缓存metadata或任何私人材料。
- Node固定平台引用、Registry身份链、计划build参数/工具版本/未验证状态均有记录。计划SOURCE_DATE_EPOCH=1793023505沿用dd83d09的源码提交时间；当前80114f1为文档提交，没有改变源bundle。
- 11个运行时MJS的静态import经Node VM解析、literal动态import交叉检查，21条相对import均在白名单内，非builtin依赖仅pg；未链接/求值模块，没有导入API/worker入口。最初附加分析尝试使用旧TypeScript JS API失败（本项目TS7没有该旧入口），改为已有Node解析能力后检查通过；未安装工具或修改源码，不将工具错误列为业务缺陷。
- 审计清单自身 `evidenceSha256=968c119f257124719806a2a661c68d08d5e707bde0addf330b04284c404ba0c9`，按JSON字段说明可重算；它证明所记录清单的内容一致性，不是签名或物理context/最终镜像digest。
- **正式context未生成**：sourceManifest不含正式cache索引/物理文件模式/mtime或未知额外文件；完整候选输入可审计，但正式上下文封存与实际OCI产物仍不存在。`contextSnapshotSha256`及本地Image ID/RepoDigest保留null，未造假填值。新增JSON只是docs/testing审计文档，不是可写构建目录、凭据文件或备份。

### 16.5 固定摘要能力与验证结果

现有精确策略仍要求 `stall-phase8-r2-runner@sha256:<真实产物>`、实际Image ID、RepoDigest、平台及bundle label一致。官方[image exporter文档](https://docs.docker.com/build/exporters/image-registry/)支持name-canonical、store、push参数；store依赖worker有image store，不能据CLI版本推断本机支持。[docker driver文档](https://docs.docker.com/build/builders/drivers/docker/)描述默认本地加载机制，也不是当前Engine的实测证明。

当前结论：containerd+内置docker driver+image exporter（name-canonical=true/store=true/push=false）**有条件可行，但本机能力仍未核实**。不切换全局后端，不创建备用builder、不引入私有Registry或去前缀绕过精确repo；实际后端不兼容时先另行审批兼容设计。完整Node基础层、正式精选cache/context、真实构建、canonical引用inspect和人工审核均为后续门槛。

本轮实际运行：

```text
node --test backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs backend/tests/phase8-v2.unit.test.mjs
235通过 / 0失败 / 0跳过 / 0取消
24个相关MJS的 node --check：通过
node node_modules/typescript/lib/tsc.js --noEmit --pretty false：通过
Docker Compose config --format json（合成变量与空文件占位，无Engine操作）：通过
```

Compose断言验证r2项目、无发布端口、pull_policy=never、internal/isolated/禁IPv6及4个secret目标。只对配置解析作结论，不代表挂载、网络或运行安全验收。41份内容校验不作为新增node:test数量累加到235。Git空白、文档/JSON摘要与秘密/范围检查作为提交前门槛。

### 16.6 后续授权与Git边界

仍不具备**直接执行**运行器构建的条件。下一轮应先单独授权恢复Desktop可达性（或由用户自行恢复），重新只读核对Engine/image store/builder/本地基础层及旧资源身份；随后分别授权精选cache与正式context、必要的固定base获取、受控构建/产物审核。只有后续实际兼容核验通过，才可申请包含构建写入的执行授权。不得自动开始这些步骤，旧B3仍失败，B4仍阻塞。

本轮未创建/启停/修改Docker资源、拉取/构建/导入镜像、创建V2材料、读取旧实例密码/回执、连接数据库、执行迁移或启动API/worker。实际网络仅官方元数据及授权Git同步。拟提交仅三份档案及上述审计JSON；提交与普通Push结果以最终Git核验为准，不预填未来SHA，也不将本轮235项离线通过称为真实PostgreSQL集成通过。

## 17. 第八轮 B3-V2：Engine恢复后的Docker只读验收

日期：2026-10-27，时点以下为UTC（本地UTC+8）。用户已手动启动Docker Desktop；起始本地HEAD/远程main均为 `d63c80a553c2a852af485a1f289a146e86c018ed`，main，工作区干净。本轮只补足此前受Engine阻塞的元数据检查，不授权启动、切换或修改任何Docker资源/builder，不使用旧密码或连接数据库。

### 17.1 Engine与builder（已确认）

`2026-10-27T02:26:18.986Z`真实查询：context=desktop-linux，本机endpoint=`npipe:////./pipe/dockerDesktopLinuxEngine`，SkipTLSVerify=false；Engine29.6.2/Git3d80467、linux/amd64，Docker Desktop4.85.0(235549)，containerd v2.2.5、runc1.3.6、docker-init0.19.0。Storage Driver=overlayfs、DriverStatus中的driver-type=io.containerd.snapshotter.v1，**containerd image store前提已实测确认**。Engine ID在本次info快照中保持 `055d945d-b3f7-4a50-adaa-423c2cde2b60`。

执行 `docker --context desktop-linux buildx ls` 和 `buildx inspect desktop-linux`，未加--bootstrap、未create/use或修改builder：

- default与desktop-linux均为已有docker驱动builder；当前选中desktop-linux。
- desktop-linux节点Endpoint=desktop-linux、running、BuildKit v0.31.2；Last Activity仍为 `2026-10-22 11:42:37 +0000 UTC`，没有发起构建。
- 平台：linux/amd64、amd64/v2、v3、v4、arm64、riscv64、ppc64le、s390x、arm/v7、arm/v6。
- worker.executor=containerd，worker.containerd.namespace=moby，snapshotter=overlayfs；worker.network=host。这个worker标签不能作为RUN或整个构建出口隔离证明，后续仍需--network none及基础层/依赖预备；不自动更改其网络。
- 尾部再次不带--host查询context show仍为desktop-linux，端点不变。显式--host时context show可显示default，不误记为全局context切换。

本机依赖的[BuildKit v0.31.2源码](https://github.com/moby/buildkit/blob/v0.31.2/exporter/containerimage/export.go)支持name-canonical/store/push选项；[Docker image exporter文档](https://docs.docker.com/build/exporters/image-registry/)和[内置driver说明](https://docs.docker.com/build/builders/drivers/docker/)与上述前提相容。**已确认支持机制和本机环境前提，不是canonical引用实际导出通过**。最终裸repo@digest解析、RepoDigest/Image ID/descriptor/bundle label仍须另行授权build后实测。源码还明确rewrite-timestamp与unpack同时为true会冲突；旧候选命令中的可选时间归一项需要结合实际driver设置校核，未宣称本轮证明所有参数一次构建成功。

### 17.2 基础镜像（Node缺失，PG匹配）

`02:28:01.498Z`在同一固定endpoint上只读image inspect：

| 引用 | 实际结果 |
| --- | --- |
| `node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae` | No such image |
| `node:24.22.1-bookworm-slim` | No such image |
| `postgres@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` | 存在；Image ID和RepoDigest均与批准记录精确匹配；linux/amd64，PG_VERSION=16.15 |

PostgreSQL Descriptor为OCI index、digest=f461…、size=10301，配置created为 `2026-10-21T22:57:10.664514874Z`。本地ID与index digest相同不是两份独立来源证明。Node候选没有可报告的本地Image ID/RepoDigest/平台，不能用官方配置digest预填。额外image ls未发现node仓库行或候选已知index/platform/config ID；不由此推断所有底层字节在其他镜像中都不存在，但**选定固定引用尚不可用，需单独授权获取**。没有pull、tag、build或导入；runner审核仍为approved=false。

### 17.3 旧B0及其他资源快照

首次info返回36镜像、11容器（1运行/10停止）；`02:30:31.266Z`逐项inspect及随后info为11个exited、0运行/11停止。`02:33:27.814Z`复核仍无运行容器、相同11个容器ID。以最新逐项状态报告，不把用户较早实测或初始info当成当前状态。仅凭这些快照不能判断统计切换的触发者/具体恢复机制，没有隐瞒差异或自动修复。

| 容器 | 本次ID | 最新状态 |
| --- | --- | --- |
| stall-phase8-pg16 | `355ecc6045fa467319f906363d521a8c764ed1aabde737a3ca364847b89cfd06` | exited |
| backend-postgres-1 | `45941853a7d833be35585f5f66d1da2065ac40500ade71f682db2cf63a0745d8` | exited |
| clyven_backend_server-postgres-1 | `ab7b56b8db176a16cc1463a099792000a65b8770daca82419ad43547f6584835` | exited |
| shangchenghouduan_server-postgres_test-1 | `a022681b2496bb7324f0676b01eef6426f4c1ae021284f059c87a46bab5f7cfc` | exited |
| shangchenghouduan_server-postgres-1 | `5df8966045e96270b97f4211bf6a7fbdd0a613112856acf3b683d57d7c2ed9c3` | exited |
| shangchenghouduan_server-redis-1 | `cbe24731b6636ec7d65c77e9d847a859080662b8aae2970518d2e405b1ed998a` | exited |
| shangchenghouduan_server-redis_test-1 | `2b82da11fce4c43b9aed7d20a76b61bfdd24257e56be61240872722f8a9ae6d9` | exited |
| glyphora_backend_server-postgres-1 | `d823d411bd945b184686455b1af8391b1f07342bf23c9864cd39d96b269dc651` | exited |
| glyphora_backend_server-postgres_test-1 | `17535509e609d4281bd8baeb4ccf0ddfeffcaf64ea74b8948ba565d084faa06a` | exited |
| glyphora_backend_server-redis_test-1 | `64256f7f7974e9588b9376880e62b8d7ac51444abfcd2ae30cc08c4aad42e46c` | exited |
| glyphora_backend_server-redis-1 | `9294df5d594480c4bbf11d8e1252e4c1eedcbf8b2b50e84d8eaf97472ff1abb4` | exited |

旧B0：原容器ID、镜像固定引用/Image ID、Compose project=stall-phase8-b0、service=phase8-postgres、scope=isolated-integration及实例UUID `43805bf5-1391-4d3f-b8ce-e3bfa9448d48`匹配历史。容器/卷/网络的nonce格式正确且三者一致，仅在内存比较，未打印；没有读取原回执内容做nonce比对。StartedAt仍为 `2026-10-26T12:03:45.995727695Z`，FinishedAt=`2026-10-27T02:16:22.509638868Z`、ExitCode255、RestartCount0、restart=no。结束时间早于本轮首次Engine检查。停止容器的Health字段是starting，**不能将其当作正在启动或健康**；停止原因和数据库内容未验证。

旧B0仍唯一配置stall-phase8-network，数据挂载为stall-phase8-data到/var/lib/postgresql/data，7个bind均只读，无其他数据卷。HostConfig仍请求127.0.0.1:55433，停止态NetworkSettings.Ports={}；不把停止态空映射当作解决或重新复现了历史运行态端口故障。

11个卷均可枚举：stall-phase8-data、backend_stall_dev_pgdata、clyven_backend_server_shipin_backend_data、Glyphora的glyphora_backend_data/glyphora_backend_test_data两个具名卷、商城的shangchenghouduan_data/shangchenghouduan_test_data两个具名卷，以及4个匿名卷（名称前缀a04cbb249303、b51b1b7c2c72、d0c612f98600、e45bf72b142f）。具名卷的完整名称带各自Compose项目前缀；均未挂给B0。旧Phase8卷创建时间仍为 `2026-10-26T12:03:35Z`，local。没有读取卷目录或数据库文件。

| 网络 | ID | 属性 |
| --- | --- | --- |
| backend_default | `1dd13ad0a2fad48c9e3ae94191f0ecb2f42112511829eddb82dc159cf8fae72c` | bridge，非internal |
| bridge | `5e14091728c748828481f460475823e716caf025569eda7855cb59b4de746426` | bridge，非internal |
| clyven_backend_server_default | `9e94983b9531a895c548f706fb5870b05e86a4b514eecd5f56cd49c477f609e8` | bridge，非internal |
| glyphora_backend_server_default | `469479ed8c2fc9d29dd9bf34aca633ad24febebc745aa76125408b4a2e985927` | bridge，非internal |
| host | `e170620f17aedea2cce703fb4081ff731c3d7ec5d1e01409baf081110b663a21` | host |
| none | `d7bc970371faad74a3e1ca3f789ec79dc3568bcdbc52ad69165898f965d1616f` | null |
| shangchenghouduan_server_default | `63c925e0ef4f538162db0bf055bf37639d6293779ee336d6d1b2c4d4d47375bd` | bridge，非internal |
| stall-phase8-network | `7918eeb7a1a787d8c4afb1871beecd1d36e61e16ba7d9fe52c0cc9a2227766af` | bridge，internal=true，IPv6=false |

8网当前均无运行endpoint。旧专网ID/创建时间 `2026-10-26T12:03:38.798689136Z`与历史一致。默认bridge则不同于第10节历史ID，当前created=`2026-10-27T02:26:25.950012349Z`，位于本次Desktop恢复窗口；本轮未执行network create/rm，未调查完整Engine启动日志，不能仅由ID变化断言数据损坏或认定具体原因。对其他项目只核对元数据，没有做应用可用性验收。

原私人回执只读取文件stat：普通文件、非symlink、531字节，birthtime=`2026-10-26T12:03:30.583Z`、mtime=`2026-10-26T12:03:50.272Z`；与已记录时间一致。末次复核大小/mtime不变，未读取JSON内容、未输出nonce、未写ACL或任何材料。不能把元数据一致扩大成文件字节摘要已重新验真；原failed记录继续作为失败证据，不改为成功。

V2项目/容器/卷/网络命名范围未发现匹配，既有资源没有被V2复用。本轮首个全容器模板因无Health字段对象失败，移除该通用字段后只读重查成功；这是查询模板问题，不是业务/数据库故障，未修改源码或实际资源。

### 17.4 构建条件、证据复用与下一步

已确认环境满足首选方案的主要前提：本机Linux/amd64、containerd store、docker driver和目标平台。不需要为本轮结果切换全局存储后端、创建新builder或引入Registry服务。尚缺Node固定基镜像、正式输入目录及精选cache、实际OCI产物/canonical引用验收与最终审核。

只读重算已提交输入清单自身evidence hash、34个源码以及锁文件/Dockerfile/准备器摘要，全部与封存记录一致。原[PHASE8_V2_BUILD_INPUT_AUDIT.json](PHASE8_V2_BUILD_INPUT_AUDIT.json)保持原样，仍是前轮时点的快照，本节补充最新环境结果，不回写其null字段来篡改历史。源码bundle仍为 `f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289`。**本轮没有读取npm缓存内容、重跑41包审计或235项回归测试**；那些通过结果保留为前轮证据，不声称本轮复测。

下一轮可申请明确分阶段授权：①仅获取候选固定Node平台镜像，下载后核对本地身份及完整层；②生成仓库外全新正式上下文/精选缓存并封存物理输入，内容漂移时才重新SRI验证；③确认独占构建窗口和最终参数后执行一次受控build及image-store写入，不push Registry；④只读检查实际产物/固定引用/RepoDigest/Image ID/bundle后另行授权审核登记。任何阶段不含V2容器/卷/网络/密码/UUID/回执创建或旧B0重启。当前不能跳过①②直接执行离线build。

本轮只提交TEST_STATUS、TEST_HISTORY、KNOWN_ISSUES三份档案；Git空白、秘密和变更范围检查作为提交门槛。没有Docker资源写操作、数据库连接/迁移、后端/worker启动或部署；旧B3仍失败，B4仍阻塞。提交及普通Push以最终Git核验为准，不预填未来提交SHA。

## 18. 第八轮 B3-V2：固定 Node 基础镜像受控获取（2026-10-27）

### 18.1 预检与授权

开始本地HEAD、远程main均为 `352f74849378acaaa33ecd99f14b9f86cbb2b758`，main工作区干净。desktop-linux端点为 `npipe:////./pipe/dockerDesktopLinuxEngine`，Engine29.6.2/Linux-amd64，Engine ID `055d945d-b3f7-4a50-adaa-423c2cde2b60`，overlayfs/io.containerd.snapshotter.v1。36镜像、11停止容器、11卷、8网络；目标Node固定引用缺失。原B0及其他项目只读取选定Docker元数据，私人回执仅stat，不读密码或回执内容。

`2026-10-27T02:43:54.674Z`重新读取官方Registry元数据并核对已封存审计：多架构索引 `sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`；linux/amd64平台清单 `sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae`；配置 `sha256:dc1f22974dab4be31a8b56d58cb1f8fc218e83de83ccd831d885b3d7ac1223fb`。来源annotation为 `https://github.com/nodejs/docker-node.git#80f02a542da739e6a662451d1db66456a0dea253:24/bookworm-slim`。渠道node:24.22.1-bookworm-slim；这些是不同层级摘要，不算多份独立来源。匿名Registry令牌只在内存使用，未记录。

预检后明确询问是否允许该一次固定平台下载，用户回复“确认，允许本次固定摘要下载”。收到回复后重新核验Git、Engine及同一资源快照摘要，才执行获取。

### 18.2 唯一一次实际获取及本地身份

通过已核验的Docker绝对路径执行以下参数（无秘密）：

```powershell
docker --host npipe:////./pipe/dockerDesktopLinuxEngine pull --platform linux/amd64 node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae
```

退出码0，5层Pull complete，Docker报告同一digest。没有重试、其他镜像源、浮动标签回退或手工tag。该pull是本轮唯一Docker写操作。

`2026-10-27T02:50:17.330Z`后验：短固定引用和 `docker.io/library/node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae` 均解析到同一镜像。

| 字段 | 实际值 |
| --- | --- |
| Image ID | sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae |
| RepoDigest | node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae |
| Descriptor | OCI平台manifest，digest同上，size1929 |
| OS/Architecture | linux/amd64 |
| Created | 2026-10-21T11:35:50.393702483Z |
| 版本元数据 | NODE_VERSION=24.22.1，YARN_VERSION=1.22.22；未运行容器验证 |

containerd本地Image ID等于manifest摘要，不等于官方config摘要，也不构成额外来源证明。未构建最终runner，runner-image-approval.json仍approved=false。批准的PostgreSQL固定引用 `postgres@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` 的ID/RepoDigest/linux-amd64核验通过，没有更新它。

### 18.3 资源比较异常：不隐瞒、不自动修复

镜像数36→37，容器仍11个且全部停止，卷11、网络8。首次整体资源比较断言实际失败：`Error: Existing resource metadata changed`。保存前摘要 `25ef8681408108c15c3ec2b7549a4c5c96668f4ffe9c84d80db0f353b9b0060e`，后续快照摘要包括 `6cab354d78c69650b8b81e7009e0c5c5e0e52835fabbcb5058ce7900b94a1b02` 和 `8d50facb2d4059cb8ff891122fb7ced91ba0b3b04f09a177aea3e1abd1c9bef9`。这些是选定元数据序列化摘要，不是数据库内容摘要。

确认默认bridge发生真实变化：

| 字段 | 前 | 后 |
| --- | --- | --- |
| ID | 5e14091728c748828481f460475823e716caf025569eda7855cb59b4de746426 | 6ee5bbb1f0c0c790165339dc17c22038606b915ef3b0a1d3d2513f1bc1010c62 |
| Created | 2026-10-27T02:26:25.950012349Z | 2026-10-27T02:48:04.336419132Z |

两者均非internal的bridge、IPv6=false、无成员，Engine ID未变。未执行network创建/删除或Desktop启停命令；不能据此确定变化由pull或何种Desktop生命周期触发，不能推断数据损坏。

后续仅进行只读诊断。B0的Mounts数组顺序在查询间变化；内存中用原bridge字段替换并重排、枚举B0挂载顺序，仍未复现原摘要。这不是自动化测试通过证据，也没有写回Docker。**前快照仅保存整体摘要，没有完整逐字段基线；因此无法完整解释其余差异，不将其全部归因于数组顺序。**保留原失败断言，不能宣称所有资源未变。

与已记录关键字段相比：11容器ID及停止状态、各具名卷/专网身份未见变化。旧B0容器仍 `355ecc6045fa467319f906363d521a8c764ed1aabde737a3ca364847b89cfd06`、exited；StartedAt `2026-10-26T12:03:45.995727695Z`、FinishedAt `2026-10-27T02:16:22.509638868Z`。卷stall-phase8-data创建时间 `2026-10-26T12:03:35Z`；专网ID `7918eeb7a1a787d8c4afb1871beecd1d36e61e16ba7d9fe52c0cc9a2227766af`、internal=true、IPv6=false。原私人回执仍531字节、birthtime `2026-10-26T12:03:30.583Z`、mtime `2026-10-26T12:03:50.272Z`；未读内容或计算文件字节摘要，历史failed不改。上述是关键元数据比较，不是所有字段/数据库完整性或应用全链路验收。

### 18.4 当前结论、边界及下一步

Node固定基础镜像获取成功且本地身份匹配，R-23的缺失已解除；资源全量比较异常记为R-25，尚未完全查明。建议下一轮先进行单独只读差异调查，之后再申请仓库外精选缓存及正式上下文准备授权；不能自动构建、批准runner或创建V2。

未重跑235项安全测试或41包SRI审计，均为历史证据；未修改34源码、输入审计JSON、镜像批准策略或任何商城功能。未创建上下文、V2密码/UUID/回执、容器/卷/网络，未连接数据库、运行迁移、后端或worker。旧B3失败与B4阻塞保持。本轮仅更新三份测试档案，核对diff/秘密/范围后按授权提交并普通Push，结果以最终Git核验为准，不预填未来SHA。

## 19. 第八轮 B3-V2：资源差异复核与正式构建材料准备（2026-10-27）

### 19.1 基线与阶段A决定

本轮HEAD和远程main均为 `6ceff09e4080e2d1256ed7205e80a9ef4417c43e`，工作区干净。Engine仍为29.6.2/Linux-amd64，ID `055d945d-b3f7-4a50-adaa-423c2cde2b60`，desktop-linux端点 `npipe:////./pipe/dockerDesktopLinuxEngine`，overlayfs/io.containerd.snapshotter.v1。只读Docker及本机日志查询，不修改Desktop配置或Docker资源。最初尝试读取不存在的vm/dockerd.log失败，随后使用实际存在的vm/init.log；未安装工具或制造日志。

**bridge变更的生命周期原因已有直接日志证据：**

- `C:/Users/USER/AppData/Local/Docker/log/host/com.docker.backend.exe.log`，3910—3920行：`2026-10-27T02:47:57.267053200Z` idle→busy，原因是Docker-Client的 `/v1.55/images/create` 调用；同时间记录starting VM和engine start requested、linux/wsl stopped→starting。这是上轮获准pull触发的Desktop休眠恢复，没有执行显式管理启动/重启命令。
- `C:/Users/USER/AppData/Local/Docker/log/vm/init.log`，4915行Engine Starting up=`02:48:03.571984342Z`，4920行Loading containers start；4943行Daemon initialized=`02:48:04.739378004Z`。
- 新默认bridge `6ee5bbb1f0c0c790165339dc17c22038606b915ef3b0a1d3d2513f1bc1010c62` 创建时间 `02:48:04.336419132Z` 位于上述初始化窗口；旧ID `5e14091728c748828481f460475823e716caf025569eda7855cb59b4de746426` 的创建时间为 `02:26:25.950012349Z`，同样对应日志中此前一次Engine启动。由此确认变化对应Engine初始化时默认网络重建，不再仅凭ID差异猜测数据损坏。

不把上述证据扩大为所有原始摘要差异均已完整解释。旧快照缺乏完整逐字段基线，挂载数组顺序还会变化；上轮断言失败记录原样保留。恢复日志4928—4938有11条历史sandbox not found警告，不能据此证明已停止应用重启后一定正常，也没有为验证而启动它们。日志说明Engine生命周期，不是数据库完整性证明。

当前逐项核验11容器ID均在此前Git档案中，均为exited，结束时间未见相对已记录值的新变化；所有容器的NetworkMode及Networks均不引用默认bridge。11卷名称/既有卷关联、8网络及各项目专网ID匹配已记录身份，未发现关键容器/卷/专网身份异常；没有把数量一致当作充分条件。旧B0原容器ID、UUID/项目/scope标签及容器/卷/专网nonce在内存中核验一致，不记录nonce。原卷创建 `2026-10-26T12:03:35Z`、专网创建 `2026-10-26T12:03:38.798689136Z` 不变。所有既有业务仍未进行数据库或应用可用性验收，卷名称与创建时间不能证明内容未变。

**阶段A结论：没有发现需要阻止文件材料准备的实质性资源风险证据，允许按本次分阶段授权进入阶段B。**不解除旧B3失败或B4阻塞，不修复原实例。新增输入审计记录保存排序后的安全资源快照，包含容器ID/状态/卷关联、卷创建元数据、网络ID/成员；排除原始nonce、环境变量、密码、私人回执内容和数据库文件，供今后逐字段比较。

### 19.2 Node与构建输入复核

固定 `node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae` 只读inspect通过：本地Image ID及RepoDigest与该平台摘要匹配，OCI平台manifest、linux/amd64，size1929。来源依据既有官方index/platform/config审计及第18节重新核验，不另行pull/tag或将本地ID当独立来源。本轮未重新访问Registry，runner审核仍approved=false。

34白名单源文件的原字节及LF摘要均与原审计匹配，sourceManifest SHA-256仍 `f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289`。Dockerfile原字节摘要 `a8518b86a2af948a3090a4630c49c6628d66560c3aceaf627a5bac89d3099eb7`、lockfile及准备器3项额外输入均匹配。仅含已授权的5项旧B0共享源码，不包含旧实例运行材料。

原缓存41个包的真实字节SHA-512、SHA-256、长度和匹配索引完整性重新核验：41/41通过，共1562730字节；未修改原缓存。依赖闭包重新计算：145条包间普通依赖+3条根依赖=148条，optional1、required peer1、optional peer1；仅允许缺省pg-native这一optional peer。匹配原清单包名版本及lockfile，包内容与此前tar身份/敏感文件审计完全相同，复用其内容检查结论；不是新一次恶意代码/漏洞全审计。元数据扫描的一个宽泛token字符串命中实际是合法包名@aws-sdk/token-providers的公共URL，不是令牌；没有输出秘密值或复制认证配置。

### 19.3 阶段B实际写入与材料验收

全新仓库外目录：`C:/Users/USER/StallPhase8-V2-Build-20261027-030427`。先确认不存在，再仅在当前进程设置实际源码规定的 `PHASE8_V2_BUILD_CONTEXT_AUTHORIZE=PREPARE_NEW_CONTEXT_ONLY` 与该绝对 `PHASE8_V2_BUILD_CONTEXT`，执行现有 `node backend/scripts/prepare-phase8-v2-context.mjs --prepare`。退出0，files34，bundleSha256与上述一致，dependenciesPrepared=false/imageBuilt=false是该脚本返回的当时结果，后续缓存单独准备。

脚本创建34个payload白名单文件、payload/bundle.json、Dockerfile和.dockerignore；未绕过脚本复制源码、未修改白名单。只对本轮新目录及文件设置受限Windows ACL：当前用户、SYSTEM、Administrators；根禁继承，文件不引入其他主体。复制缓存后全部291个文件/目录对象ACL检查无额外主体。没有修改用户目录、原缓存或旧材料ACL；Windows stat mode不等于未来Linux镜像权限证明。

精选缓存为新目录下npm-cache/_cacache：只复制41份已验证内容字节，以及对应41份最新、checksum有效的完整索引记录。保留原记录的key/integrity/size/time/metadata及其校验字符串，不整桶带入无关记录。原选定索引/内容复制前后摘要相同；新索引可由现有cacache读取，精确41个key与lock-selected公共Registry tarball集合一致。无其他7109个历史无关索引桶、.npmrc、认证文件、私人回执或数据库文件；原缓存没有执行清理、写入或修补。

复制后验证：真实verifyArtifact(payload,bundleSha256)通过，Dockerfile/.dockerignore摘要匹配；41份缓存再次SHA-512/SHA-256匹配。精确119文件=34源码+bundle.json+Dockerfile+.dockerignore+41索引+41内容，无symlink或额外文件。物理文件清单记录相对路径、真实字节SHA-256、size、mtime、Windows mode，摘要 `31ceb4bcb711dfd7033d1d1bdcc71023f1761dfe88e21e429a09bc2a8d86d093`。它不是bundle摘要或镜像摘要，也不是逐字节重复构建证明。

**精选数据/索引闭包准备成功，但尚未证明实际Linux npm ci --offline成功。**本轮按禁止范围未执行npm ci、安装脚本或Docker RUN。已审计pacote按完整lock的integrity读取cacache内容的接缝，实际npm版本、Linux安装及镜像构建仍需后续授权执行，若缓存不足必须失败关闭，不能联网补齐。不会仅凭缓存文件存在宣称可以成功构建。

### 19.4 实际验证、文档与下一步

实际运行：

```text
node --test backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs backend/tests/phase8-v2.unit.test.mjs
```

235通过、0失败、0跳过、0取消。是离线合成Docker/PG安全测试，不是真实数据库结果，新增测试0。4个MJS语法检查通过：prepare-phase8-v2-context、artifact、V2 policy、phase8-v2.unit.test。没有运行所有backend测试或任何数据库测试。本轮没有修改业务源码、安全测试或镜像审核配置。

输入审计JSON保留原顶层时点与旧evidence摘要，新增materialPreparation记录实物、缓存、ACL、源输入及安全资源快照；原摘要放入previousEvidenceSha256，新evidence覆盖新增内容。顶层materializedContext=false等是原observedAtUTC的历史值，不描述本轮新实物，以materialPreparation为最新证据。物理context不是Git提交内容。

可申请下一轮受控build授权，但执行前仍须复核119文件快照、基础镜像/独占窗口，定案rewrite-timestamp与unpack兼容参数；build本身的离线安装、exporter/canonical RepoDigest与最终runner审核尚未验证。不得自动build、image-store写入、创建V2密码/UUID/实例或连接数据库。旧B0现场及failed回执保留，001—020未执行，B4仍阻塞。

本轮仅提交TEST_STATUS、TEST_HISTORY、KNOWN_ISSUES及输入审计JSON四份非秘密档案；检查范围、秘密模式、Git空白后按授权普通提交推送，最终SHA以Git核验为准。未创建/停止/启动/删除任何Docker资源，未pull/build/tag/import或连接数据库、迁移、启动商城后端/worker、部署。

## 20. 第八轮 B3-V2：Node运行器受控构建与镜像身份验收（2026-10-27）

### 20.1 构建前核验与本轮人工确认

开始本地HEAD及远程main均为 `964273b09d2e33b1c40eaefd2874bc6382a8e2ce`，main工作区干净。Engine29.6.2/Linux-amd64、ID `055d945d-b3f7-4a50-adaa-423c2cde2b60`、desktop-linux、端点 `npipe:////./pipe/dockerDesktopLinuxEngine`、overlayfs/io.containerd.snapshotter.v1均匹配。现有desktop-linux builder为docker driver、BuildKit0.31.2，支持linux/amd64；未创建/切换/启动builder。

重新读取并验证119个精确物理文件集合及每项内容/mtime/mode，物理清单SHA仍 `31ceb4bcb711dfd7033d1d1bdcc71023f1761dfe88e21e429a09bc2a8d86d093`；291个ACL对象仅当前用户/SYSTEM/Administrators，根禁继承，无symlink或额外文件。bundle及34源码实际verifyArtifact通过，源码bundle仍 `f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289`；41个精选包真实SHA-512及索引匹配，Dockerfile和.dockerignore精确匹配。未修改既有构建目录或原缓存。

固定Node和PostgreSQL批准镜像的本地ID、RepoDigest及linux/amd64匹配。与第19节安全快照比对：11容器ID/停止状态/结束时间/卷及专网关联、11卷及创建元数据、项目专网ID均一致，旧B0三资源标签/UUID/nonce内存比对通过，V2资源不存在。默认bridge在本轮预检时已变为 `1b2e20545bf3c86b7e1965bc1ae10c7cb865d57a1ec3b0c5350dac670de244e2`，创建03:27:18.102716505Z；本机vm/init.log对应03:27:17.440200736Z Starting up及03:27:18.455955451Z Daemon initialized，无既有容器引用默认bridge。将该初始化后的状态封存为本次构建前基线；不据此推断应用或数据库内容已验收。

读取[Docker image exporter文档](https://docs.docker.com/build/exporters/image-registry/)、[Buildx命令参考](https://docs.docker.com/reference/cli/docker/buildx/build/)、[BuildKit0.31.2 exporter源码](https://github.com/moby/buildkit/blob/v0.31.2/exporter/containerimage/export.go)、[Buildx0.35.0 opt.go](https://github.com/docker/buildx/blob/v0.35.0/build/opt.go)。image/store/name-canonical/push参数有对应实现；docker driver会将image转到Moby exporter，真实canonical结果仍需产物核验。未取得额外Moby路径源码（请求的版本路径404），不把未读代码当作已证实能力。BuildKit rewrite-timestamp=true与unpack=true冲突，因此选择rewrite=false/unpack=true，不加SOURCE_DATE_EPOCH、不更改封存输入或承诺位级可重复构建。pull=false在Moby driver使用prefer-local，但不等于严格禁止resolver访问Registry。

完整展示命令、固定材料、镜像存储和缓存写入范围后，按本轮第五节另行请求授权；用户明确回复：**“授权一次构建，并独占本次 Docker 管理窗口”**。这是本轮确认，不复用上轮pull或更早创建授权。随后再次核验输入、Engine/context、资源基线、输出名称无冲突及metadata文件尚不存在，才执行构建。

### 20.2 唯一一次实际构建命令与结果

工作目录为本项目根目录，通过Docker绝对路径执行以下命令。子进程只保留必要Windows路径/用户目录/临时目录等环境键，不传旧B0凭据、任意Buildx/BuildKit覆盖或代理构建参数。

```powershell
& 'C:\Users\USER\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe' `
  --context desktop-linux buildx build `
  --builder desktop-linux `
  --platform linux/amd64 `
  --pull=false --no-cache --network=none `
  --provenance=false --sbom=false --progress=plain `
  --build-arg NODE_BASE=node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae `
  --build-arg BUNDLE_SHA256=f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289 `
  --output 'type=image,name=docker.io/library/stall-phase8-r2-runner:build-964273b,store=true,push=false,name-canonical=true,oci-mediatypes=true,unpack=true,rewrite-timestamp=false' `
  --metadata-file 'C:\Users\USER\WeChatProjects\miniprogram-1\docs\testing\PHASE8_V2_RUNNER_BUILD_METADATA.json' `
  'C:\Users\USER\StallPhase8-V2-Build-20261027-030427'
```

构建03:32:30.241Z开始，03:32:39.694Z结束（客户端UTC+8为11:32:30—39），**退出码0，执行次数1**。没有自动重试、改Dockerfile、回退标签、下载补包、Registry Push或清理。

实际RUN保持 `npm ci --offline --ignore-scripts --omit=dev --cache /tmp/npm-cache`，日志added41 packages/audited42 packages，约3秒完成；RUN network=none。日志的“found 0 vulnerabilities”不等于在线漏洞数据库审计或安全认证，不扩大其结论。

**实际网络边界：**BuildKit输出有library/node Registry pull-token认证和固定基础镜像load metadata步骤，不能声称整个构建完全断网。没有观察到新基础层下载或额外基础镜像，FROM使用精确固定平台摘要，产物materials与原Node层前缀匹配。若未来要求整个resolver零外网，需另行设计并验证，不能依赖本次pull=false或network=none作证明。

构建保留一项InvalidDefaultArgInFrom警告：NODE_BASE无默认值；本次实际明确提供了批准固定值。未为消除警告修改输入。--provenance=false关闭镜像输出attestation，但Buildx仍写本地metadata provenance，不把它等同于签名供应链证明。

### 20.3 实际镜像身份和静态文件核验

| 字段 | 实际结果 |
| --- | --- |
| 输出名称 | docker.io/library/stall-phase8-r2-runner:build-964273b |
| Docker本地Image ID | sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849 |
| OCI平台manifest digest | sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849，size2195 |
| config digest | sha256:abd8b7640f70fdd7d92d8c90496c5af4ee80d16e35f5d62c2d6a68389f77e29f |
| RepoDigest 1 | stall-phase8-r2-runner@sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849 |
| RepoDigest 2 | stall-phase8-r2-runner:build-964273b@sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849 |
| platform | linux/amd64 |
| USER | 1000:1000 |
| ENTRYPOINT | node /opt/phase8/backend/testing/phase8-v2/runner.mjs |
| CMD | 空；inspect省略Cmd字段，按空数组解释 |
| bundle label | f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289 |

裸 `stall-phase8-r2-runner@sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849` 及 `docker.io/library/` 完整前缀固定引用均通过真实image inspect解析同一ID。RepoDigest来自实际Engine返回，未手工拼接当作成功、未docker tag。manifest和本地ID同值是当前containerd表示，不把它们算作独立来源证明；config摘要不同，分别记录。

从实际image save stdout读取84835840字节，**只在内存解析，没有落地镜像归档、解包文件或创建/运行验收容器**。核对OCI blob SHA-256、manifest与config digest；原Node基础层5个DiffID前缀一致；新增5层的真实未压缩DiffID匹配。按层次处理whiteout后，34源文件及bundle摘要全部匹配；41个已安装依赖的package.json名称/版本匹配lock，pg8.23.1及pg/lib/index.js存在。未通过运行Node或连接数据库来补做验证，不能证明运行时模块导入、权限或网络行为。

只读辅助查询中的工具错误原样记录：最初Go模板因Cmd字段省略报错，改为JSON inspect后处理空数组；首次内存归档辅助代码用了当前tar不导出的Parse构造器，更正为实际Parser后重新执行只读image save核验成功。两者不是镜像构建失败或业务缺陷，没有重试build、改断言/业务源码或修改镜像。

### 20.4 资源变化、回归与当前授权边界

构建后选定容器/卷/网络元数据与本次预检完整安全快照**精确一致**，包含默认bridge；旧B0及其他项目11容器均仍停止，11卷和8网络身份/关联未变。Node/PG批准镜像身份未变。唯一新增镜像即本次runner，37→38，没有删除镜像。BuildKit缓存记录456→469，新增13、移除0；记录ID清单在审计JSON中。缓存条目计数不等于净磁盘增长，未清理缓存或其他项目数据。

V2容器/卷/网络/密码/UUID/回执未创建；旧B0私人凭据和failed回执未读取或修改。旧B3失败仍保留，B4阻塞。上述资源元数据精确匹配不等于数据库内容或其他应用全链路验收；未启动它们。

实际重跑三份既有Phase8离线安全测试：**235通过、0失败、0跳过、0取消，新增0项**。它们使用合成Docker/PG transport，不是本轮运行器或数据库集成测试。构建后再核对原119封存文件及mtime全部匹配；安全策略、Dockerfile、业务源码和runner-image-approval.json未改，批准状态仍false。

完整证据见 [PHASE8_V2_RUNNER_BUILD_AUDIT.json](PHASE8_V2_RUNNER_BUILD_AUDIT.json)，含实际命令/授权文字/构建日志、前后安全快照、镜像/内容及缓存检查；[PHASE8_V2_RUNNER_BUILD_METADATA.json](PHASE8_V2_RUNNER_BUILD_METADATA.json)是Buildx实际写出的产物元数据，原字节SHA-256 `f1de5565528627f9bbe951f0f0782e9d2313b34f87db734b0efa7c0c1f241ba6`。审计JSON自身evidence摘要为 `77d06a6419abdf82bbc68020b782e3ffd2de752f49d28655235466e5c3d54681`，不等同于镜像签名或外部见证。

**具备申请最终运行器镜像独立审核的证据条件，尚未获准运行。**下一轮可审查真实canonical digest/Image ID/base/bundle及供应链记录后另行决定是否登记批准；本轮不能自动将approved改true。运行时USER、只读根、capabilities、挂载ACL、真实V2 isolated/IPv6/出口、PostgreSQL bootstrap/001—020/业务并发事务与故障恢复全部仍待独立授权和验收。未部署、启动后端/worker或操作数据库。

本轮仅提交上述三份永久档案及两份非秘密构建记录，不提交仓库外上下文或任何密码/私人材料；检查Diff/秘密/远程基线后普通提交推送，最终提交SHA以Git核验为准。

## 21. 云端购物车配送未配置显示修复（2026-10-27，未提交）

基线HEAD为 `cf89c59b189c63c9d515073f8a3d990b29d66e9b`，开始工作区干净。本轮用户授权本地修复/回归/编译，不授权修改数据库或配送配置；没有进行Commit、Push或其他Git写操作。

### 根因与实现

实际读取cart.ts、cart.wxml、cloudCheckout.ts、cloudCart.ts及身份/金额/配送模块后确认：loadCloudDelivery对configured=false抛错符合拒绝下单要求，但cart.refreshCloud把它和商品读取放入共享Promise.all/catch，任何配送失败都会把正常商品结果清空。页面也没有实际展示cloudError。

cart.ts现在保留并发读取，但每个异步分支单独处理错误、立即发布自己的结果；商品不必等待配送完成即可显示。配送未配置或读取失败仅设置deliveryError/cloudDeliveryReady=false，不抹去已取得的价格和数量；按钮disabled和checkout处理函数均检查配送状态。起送门槛必须来自合法服务端规则，不伪造默认门槛；非法配送金额按配送错误处理。商品失败显示明确错误和未知金额“--”，不读取演示价格。仅清理过期展示，不因云端读取失败调用购物车删除或写入。

新增本次视图上下文键（身份+apiBase+storeSlug）及序号检查，两路成功/失败都受同一失效规则约束；hide/unload使请求失效，云端/本地切换重置展示。checkout在上下文已变化时重新读取并拒绝使用旧视图导航，防止旧商品/加载状态覆盖新页面。cloudCheckout.ts和后端未修改：真实loadCloudCheckout仍因未配置配送拒绝；backend/src/checkout.mjs第59—60行仍执行verifyDelivery并在失败时回滚/返回409。

cart.wxml补齐商品/配送错误与加载文案，错误时不显示“空购物车”冒充成功空结果，隐藏未知起送金额并禁用结算。没有自动配置配送、改价、删除商品或变更服务端订单校验。

### 实际回归证据

新增 `backend/tests/frontend-navigation-cart-cloud.test.mjs`：20项，包括19项真实页面/服务函数VM执行、1项WXML契约。使用Node原生TypeScript剥离、可控Promise及假微信请求，执行实际cart Page、cloudCartDetails、loadCloudDelivery/loadCloudCheckout、身份上下文、金额与库存纯函数；不复制对应业务算法。外部网络/微信存储均隔离。数据使用用户报告的商品ID/“动画”/1500分/2件，生产代码无对应硬编码。

覆盖未配置配送先/后到达均保留动画×2/¥30.00、等待配送时禁止结算、正常配送两种乱序、商品失败、双路失败、非法商品价格、店铺暂停、非法配送起送额、身份/店铺/端点切换、旧请求成功/失败、隐藏/卸载、云端转演示、点击结算时身份变化、重试恢复，以及结算服务继续严格拒绝未配置配送。验证存储购物车条目/数量不因云端错误删除或写入，未知价格不显示NaN或演示金额。

初次19项中18通过、1失败：演示测试夹具错误使用active字段且缺discountPrice，实际本地模型要求available/discountPrice；修正夹具为真实结构，未修改业务规则或降低断言。另补非法配送门槛回归后最终20/20通过。原frontend-navigation-guards仅更新夹具以提供新增上下文字段和加载状态，原断言全部保留。

| 实际命令 | 实际结果 |
| --- | --- |
| node --test backend/tests/frontend-navigation-cart-cloud.test.mjs | 20通过、0失败、0跳过 |
| node --test backend/tests/frontend-navigation*.test.mjs | 108通过、0失败、0跳过、0取消；包含新增20，不重复累加 |
| node node_modules/typescript/lib/tsc.js --noEmit --pretty false | 退出0 |
| node --check backend/tests/frontend-navigation-cart-cloud.test.mjs | 退出0 |
| npm run build:combined | 退出0；125源模块、36页、258产物 |
| npm run build:customer | 退出1；既有index/index.ts第88行引用/pages/admin/admin，customer页面清单不包含它 |
| npm run build:merchant | 退出1；既有admin/admin.ts第11行引用/pages/index/index，merchant清单不包含它 |
| npm run check:boundaries | combined/customer/merchant依赖及循环边界均通过 |
| npm run check:build-output | combined通过后，缺dist/customer/build-manifest.json而退出1；customer构建前已失败，不能宣称全目标产物通过 |
| 单独checkOutput('combined') | 通过 |
| git diff --check | 通过 |

两处独立构建阻碍均用git show HEAD与当前文件逐字归一换行比较相同，路线在基线已存在；本次不修改index/admin或放宽构建保护。失败的customer/merchant产物仅位于Git忽略的dist，不视为成功产物。Combined是本次已完成的编译；未执行微信平台WXML编译、开发者工具或真机验收，未调用真实商品/配送API。

本轮预期变更：cart.ts、cart.wxml、新cart-cloud回归文件、旧guards夹具，以及TEST_STATUS/TEST_HISTORY两份真实结果档案。所有改动保留未提交。没有连接/修改数据库、修改配送配置、启动后端、部署或操作Docker；第八轮运行器批准状态不变。本次不修复无关的独立构建导航遗留问题。

## 22. 真实手机云端预览源码准备（2026-10-27，未提交）

用户要求顾客/商家都通过真实Node.js+PostgreSQL体验，而不是本机演示或假订单；随后明确“尚未准备Staging，先完成离线源码方案”，并说明当前是微信测试AppID、人在马来西亚。此处离线指不部署/不操作实际环境，不是新增离线商城。基线HEAD仍为cf89c59，上轮购物车6个未提交文件在开始时均存在，完整保留。

实际调查：源发布API/default store为空，根工程AppID为wxeb1890c397d038d8（仅用户描述为测试号，不能靠字串判断平台权限）；project.private仅核对urlCheck=false，不复制、不修改。backend只有.env.example，本次进程相关DB/微信/存储变量未设置；没有数据库/服务器连接，无法确认实际店铺、授权或外部Staging是否存在。现有微信code2Session/会话、商家permittedStore、store-entry、商品/配送/订单接口已存在，因此不重建认证、数据库或业务API。现有server启动会启动库存与定位任务，本轮没有import/start它。

新增公开profile校验与preview:phone --check/--prepare；必须提供HTTPS Staging origin、真实storeSlug及AppID。禁止凭据、HTTP/回环/私有主机、无显式staging标签和touristappid；空模板拒绝，不编造域名。--check不联网，--prepare未来复用Combined编译到dist/phone-preview，固定PUBLIC_API_BASE/DEFAULT_STORE_SLUG/CLOUD_ONLY/PREVIEW_APP_ID并启用urlCheck，保留原全量产物检查，不改原配置源码或申请第二AppID。

Shared运行期pin可信来源，首次/来源变更清旧Token与偏好但不删除购物车；跨环境再回来即使旧preview marker相同也清不匹配来源会话。云端上下文不因缺缓存而变成演示模式。wx.login仅向该后端发送code；校验实际AppID，阻断过期登录响应，preview中连模拟器也拒绝本地Token。个人中心提供微信登录与服务器授权后的商家入口，工作台先验证授权再读经营数据，普通顾客/过期会话不加载卡片。商家登录和旧维护页在该模式隐藏/固定API与店铺，不要求手机输入Token。后端支付、库存、订单状态和权限机制未修改。

新增phone-preview-safety 35项；连同frontend-navigation*.test.mjs、auth-sessions、wechat-login、miniapp-preview-audit、miniapp-preview-build-guard、build-role-contracts联合执行：171通过、0失败、0跳过、0取消。已包含新35及前轮购物车20，不重复累加。这些是实际源码函数+模拟微信/网络或假pool、语法/编译/静态检查，不是微信身份或PostgreSQL运行验收。初次28项有4项失败：3项为VM对象原型比较，归一JSON值且保留结构断言；1项修正hostname策略不把.test顶级域当显式Staging标识，后续增加回归全部通过。未删除/跳过断言。

TypeScript noEmit、phone-preview/phone-preview-profile/build-miniapp/miniapp-output/phone-preview-safety 5个MJS语法检查、Combined/Customer/Merchant源依赖边界通过；Combined构建126模块/36页/259产物及原产物检查通过。没有真实Staging配置，未执行真实配置的phone --prepare/微信平台编译，未生成带假域名的交付包；仅测试空模板提前拒绝。Customer/Merchant独立构建的既有导航阻碍仍按前轮记录，当前手机方案不依赖它们。

测试号能力未冒充可用：访问微信官方登录/网络/测试号/预览文档被工具限制，保留URL供管理员核对；是否有同AppID有效AppSecret/code2Session、request/upload/download域名和体验成员准入需要平台证据。正式AppID可用同一业务逻辑，但OpenID/商家成员不自动跨AppID共享。普通预览二维码来自IDE，不冒用原release店铺码。没有可信支付不能伪造付款来演示履约。

完整文件职责、一次配置/多次预览、私网DB+HTTPS API拓扑、账号绑定及扫码/错误诊断流程见PHONE_PREVIEW.md，apps/BUILDING.md增加入口。需下一轮分别授权部署、DNS/TLS、私有凭据、独立DB初始化/真实店铺与商家绑定及实际手机操作；不能用直接暴露stall_dev或Phase8数据库替代Staging。本轮没有安装软件/依赖、Docker操作、真实微信登录、API访问、数据库/配置写入、迁移、服务启动、预览上传、发布或Git Commit/Push；官方文档只读访问尝试不涉及用户服务。

## 23. 独立构建跨端导航整改（2026-10-27，未提交）

本轮HEAD仍为cf89c59b189c63c9d515073f8a3d990b29d66e9b，开始时保留全部既有购物车、手机预览与交付清单未提交修改。实际源码中index.ts与admin.ts直接导航到另一端页面，虽然导入图隔离检查通过，构建器对导航字面量的检查仍正确拒绝；修复首个Customer错误后，进一步发现profile.ts也有直接商家导航，因此一并整改。

复用已有singleAppHost别名机制：首页/个人中心调用openMerchantWorkspace，Customer常量关闭商家入口与权限查询；Combined商家偏好恢复仍要求服务端响应及身份/店铺/页面可见性/当前偏好一致。Combined适配器保留navigateTo工作台与switchTab顾客首页。admin使用CAN_OPEN_CUSTOMER与openCustomerShop适配器，Merchant角色别名指向本角色navigation，隐藏并拒绝顾客切换，不写错误偏好。Combined显式切换仍保存customer偏好。未改服务器鉴权、支付、正式微信配置、依赖包、数据库或既有演示数据层；构建越界断言完全保留。

新增backend/tests/build-navigation-isolation.test.mjs共21项。18项运行实际页面函数和实际按目标选择的导航适配器（模拟微信/网络边界），覆盖Combined双向导航、独立端拒绝、旧偏好、伪造UI授权、服务端拒绝/非法响应、身份/店铺/隐藏/偏好改变的过期请求、进入工作台前/点击时权限复核、两种含商家构建的授权闸门；3项调用真实构建器，逐端核对页面归属、首页、源文件/产物隔离、导航和完整checkOutput。不是仅通过正则判定运行行为。

3份旧测试frontend-navigation-runtime、frontend-navigation、merchant-entry-contract适配了入口移动后的VM依赖/源码证据位置；保留原目的地、偏好、授权与时序断言，没有删除/跳过用例，并补角色门槛/真实适配器证据。原phone-preview和购物车回归完整保留。

实际执行：新文件单独21通过；联合旧171项、merchant-entry-contract7项及新增21项，共199通过、0失败、0跳过、0取消。命令如下，199已包含所有子集，不与历史轮次累计：

```powershell
node --test backend/tests/build-navigation-isolation.test.mjs backend/tests/phone-preview-safety.test.mjs backend/tests/frontend-navigation*.test.mjs backend/tests/auth-sessions.test.mjs backend/tests/wechat-login.test.mjs backend/tests/miniapp-preview-audit.test.mjs backend/tests/miniapp-preview-build-guard.test.mjs backend/tests/build-role-contracts.test.mjs backend/tests/merchant-entry-contract.test.mjs
```

TypeScript noEmit、check:boundaries（126/73/85模块）、4个测试MJS语法检查通过。真实编译结果：Combined126模块/36页/259产物，Customer73模块/13页/137产物，Merchant85模块/19页/154产物，各自完整产物校验通过。新增测试会重复执行三种纯构建，便于后续复现，输出仅使用构建器已有的dist受控目录。

未进行微信平台编译、真实AppID/真机登录、数据库迁移/连接、云资源购买/部署或Git提交/推送。独立AppID后端认证、正式云发布配置、生产迁移/部署模板、支付及端到端验收仍未完成，不把“三端纯编译通过”当作可正式发布。


## 24. 真实 PostgreSQL 集成测试准备及首次资源验收失败（2026-10-27，未提交）

开始HEAD为cf89c59b189c63c9d515073f8a3d990b29d66e9b，保留全部前轮未提交修改。用户先授权全新stall-phase8-r2资源、四份新凭据/UUID、必要本地运行器构建和审核、仅新集群001—020测试迁移及真实集成测试，再明确确认独占Docker管理窗口。禁止访问stall_dev、stall_restore_20261027、旧B0/其他现有库；保留失败现场，无自动清理。

现有V2固定fixture仅检查3个不同PID，不能当业务集成验收。新增business固定任务，绑定app角色、business-consistency-v1范围、独立写入授权和同实例ready回执；白名单增加真实checkout/orderWorkflow/inventory及依赖闭包，不打包server入口。每个场景独立新UUID商户/店铺/商品/会话，直接调用真实函数；并发使用数据库pg_blocking_pids观察，不用固定sleep当正确性证据。最终断言真实订单/明细/预留/库存流水/状态事件，不使用第七轮内存SQL适配器。无删除/清空/触发器绕过。断言失败报告先保存，再使宿主任务失败。

实际准备：新UUID b986df49-4ffc-4b26-bfe4-13e97e1e30ef，专用仓库外StallPhase8-R2目录，4个不同64位随机hex凭据，ACL仅当前用户/SYSTEM/Administrators。新构建目录StallPhase8-V2-Integration-Build-b986df49-4ffc-4b26-bfe4-13e97e1e30ef，45源码/bundle与41个包真实SHA-512核验，130文件，无旧B0运行材料。构建第一次CLI因host与builder组合不允许在构建开始前拒绝；改用显式desktop-linux context后实际build成功，无Registry Push，RUN禁网且npm ci --offline --ignore-scripts --omit=dev安装41包成功。基础镜像元数据有Registry查询，不能说构建全程断网。

运行器manifest/Image ID：sha256:a6d03ce3ee71c18236737ea011b5b5ee4a68bc6988dc5c08f0acad8623c951db；配置摘要另为sha256:b246ea70777f4020ab6dda384c2562a013dbd31b11c80c5d2cfc8984648fe00e。canonical stall-phase8-r2-runner@上述manifest实际可解析，linux/amd64、USER1000:1000、固定ENTRYPOINT和bundle匹配。bundle SHA256为2d6720dc8d9ea7b23969d010ed580b9b33bd3b672d68d7387e8b68ca5c3ec2e5。按本轮授权更新runner审核记录；该登记不证明运行隔离/数据库测试通过。

受控create-db首先在资源预留前报private_acl_rejected。实际ACL正确，定位到宿主PowerShell脚本使用$env.NAME而非$env:NAME；修复并加回归，保留所有ACL断言。活动pg连接事件处理也补强为传输错误销毁租约并禁止复用，离线EventEmitter回归通过；真正数据库断线场景仍未运行。

再次执行唯一受控创建入口后实际只创建：

- 容器stall-phase8-r2-pg16：04d174ff32ab69b3eae39ee5b067d309a26132f87185baabcfada5247d0b593f，状态created，Running=false，未启动。
- 卷stall-phase8-r2-data：local、无自定义driver options；未读取卷内容。
- 网络stall-phase8-r2-network：e269447bc2094406480763cbfde870c32c2ccc298d756910daad21c13cce81d4，internal=true、isolated、EnableIPv6=false、无成员、无宿主端口。
- 原始失败记录stage=container，code=phase8_v2_network_rejected；未生成created_verified回执。

原因：Engine/Compose实际Options只返回gateway_mode_ipv4=isolated、enable_ipv4=true，省略重复enable_ipv6=false，而原策略要求该字符串也存在。不是数据库、订单或库存的测试失败。随后用户明确限制“只处理重复配置；如果不能只改本轮Compose解决则停止”。仅改Compose不能在不调整元数据策略的前提下满足原断言，因此停止；未执行已讨论的一次性恢复设计，撤下未执行的策略兼容/恢复入口改动。没有重跑create-first、修改failed回执、启动/重建/删除资源。历史Phase8、商城与其他项目未收到本任务写操作；Engine曾由用户手动启动，不能据此推断所有其他应用链路无影响。

本轮26个真实场景源码清单如下，全部未运行（不是node:test的skipped，也不是通过）：

| # | 场景 | 实际状态 |
| --- | --- | --- |
| 1 | same key serial retry creates one order and one reservation | 未运行 |
| 2 | concurrent same key waits and returns one committed order | 未运行 |
| 3 | concurrent same key different payload conflicts without extra decrement | 未运行 |
| 4 | two customers contend for last item using observed PostgreSQL row blocking | 未运行 |
| 5 | many simultaneous requests cannot oversell available stock | 未运行 |
| 6 | insufficient stock rejects without any partial order | 未运行 |
| 7 | multi-product insufficiency rolls back every product and order line | 未运行 |
| 8 | product delisted during checkout lock wait is not purchased | 未运行 |
| 9 | real SQL failure after INSERT INTO order_items rolls back and same key can retry | 未运行 |
| 10 | real SQL failure after UPDATE products SET stock_quantity=stock_quantity-$3 rolls back and same key can retry | 未运行 |
| 11 | successful COMMIT with lost result is reconciled by retry key | 未运行 |
| 12 | expiry workers compete without releasing stock twice | 未运行 |
| 13 | terminated checkout connection rolls back real stock and permits safe retry | 未运行 |
| 14 | opposite cart order uses consistent product lock order without deadlock | 未运行 |
| 15 | concurrent accept serializes an explicitly paid test fixture without duplicate commit | 未运行 |
| 16 | two concurrent cancellations create one event and one release | 未运行 |
| 17 | cancellation racing expiry commits one release atomically | 未运行 |
| 18 | unpaid finite order cannot be accepted | 未运行 |
| 19 | unpaid unlimited order cannot be accepted | 未运行 |
| 20 | merchant cannot change order through another store path | 未运行 |
| 21 | unrelated merchant identity is rejected before changing another tenant | 未运行 |
| 22 | database unique index independently rejects duplicate retry key | 未运行 |
| 23 | customer cannot read another customer order | 未运行 |
| 24 | CHECK and composite foreign key constraints reject invalid inventory | 未运行 |
| 25 | SKIP LOCKED skips a genuinely eligible locked expired order | 未运行 |
| 26 | real deadlock yields 40P01 and both transactions leave no stock change | 未运行 |

其中COMMIT丢结果用例在真实COMMIT成功后由受控transport丢弃返回值，只验证已知提交后的幂等核对，不等同全套随机网络COMMIT未知结果。真实后端终止、死锁40P01、SKIP LOCKED与约束必须实际运行才有证据。并发接单使用隔离库内显式paid状态夹具，只用于状态机，绝不是微信支付验收或真实收款。开放营业时段受现有规则00:00–23:59约束，运行落入最后一分钟会明确失败而非绕过营业校验。

离线结果：新增phase8-business.unit.test.mjs 14项全部通过；与既有三份安全测试联合249通过、0失败、0跳过、0取消。旧235全部保留。合成授权/报告/租约测试不计入26项真实PG结果。前端199及类型/边界/构建最终检查另见TEST_STATUS最新补充。

数据库实际执行结果：0条测试业务SQL、0次连接、0份业务迁移、26项未运行。Docker创建流程在start之前失败，因此initdb/bootstrap未执行，逻辑库stall_test_phase8尚未创建，不能称ready。资源保留供审查；下一步必须先单独批准等价网络元数据策略修复及绑定本轮资源的显式恢复设计，不能绕过启动器或把失败回执改成成功。没有Git提交/推送、正式迁移、云部署、微信支付、全局清理或旧资源操作。


## 25. 网络元数据兼容与一次性恢复源码（2026-10-27，未提交）

本轮只读诊断Engine29.6.2/Linux amd64、Desktop4.85.0、Compose5.3.1，desktop-linux仍为本机端点。目标网络ID/容器ID/UUID和原始证据摘要与第24节一致，容器created、StartedAt为零、RestartCount0。Compose纯解析保留enable_ipv6=false、重复driver false、internal和isolated，无宿主端口；实际inspect明确EnableIPv6=false而不返回重复option。未读取/修改daemon全局设置，未用目标状态推断全局默认。

修复仅调整读取策略：要求实际字段明确布尔false，重复option可缺省，如存在必须精确字符串false；实际字段缺失/null/字符串/0/true或冲突option均拒绝，保持单网卡/成员/标签/UUID/固定镜像/挂载/无端口/internal/isolated。额外拒绝IPv6Gateway。同一真实资源的新纯策略、完整拓扑、恢复计划函数只读核验通过；没有调用恢复控制器。原始inspect工具输出一次包含内部启动标记，后续仅记录哈希/匹配布尔值及脱敏网络数据，不重复写入仓库。

新增固定--recover-created入口和checked-in recovery-anchor.json，绑定本轮UUID、容器/网络ID及创建时间、卷元数据、EngineID/版本、PG镜像、配置/挂载摘要、原attempt/failure/launch字节摘要。只接收全新never-started created状态和恰好三个本轮资源，拒绝旧B0、退出过/重启过实例、额外运行器。需原授权/独占窗口加START_PINNED_CREATED_ONCE新授权。启动前wx+fsync排他写新尝试记录并重复核验，成功才新增db.created附原failure/锚点摘要；失败保留独立failure，不删除/改写任何原证据，不自动重试。这些均为源码，未执行真实claim或start。

新增phase8-recovery.unit.test.mjs 50项：16类IPv6/隔离拒绝、完整拓扑、资源/配置/状态/身份/证据拒绝、授权顺序、额外成员、启动前后漂移、失败不提升状态、重复执行拒绝，以及真实临时文件的并发排他claim。除临时文件IO外是实际纯策略/控制器+合成Docker transport，不是数据库或Docker集成验收。首次47项中1项期望错误码错误，实际正确拒绝额外网卡为network_mode_rejected；修正精确期望，不放宽断言。最终新增50通过，与原249项联合299通过、0失败、0跳过、0取消。7个MJS语法、TypeScript、边界、Compose纯解析通过。

当前源码bundle=6a040792d3c8f8a205dd578cb04cf5c4dc5ada98af00573b62b2ec59a4cc2a29，既有批准镜像bundle=2d6720dc8d9ea7b23969d010ed580b9b33bd3b672d68d7387e8b68ca5c3ec2e5，两者不同；本轮不构建、不修改镜像审核记录，未来运行器需重新审核版本配对，不能声称新源码已进入镜像。恢复脚本只启动PG仍需下一轮明确授权和现场再核验；SQL bootstrap核验、001—020迁移和26项业务测试是另外的操作范围。

详细设计见PHASE8_V2_RECOVERY.md，脱敏元数据见PHASE8_V2_NETWORK_COMPATIBILITY_AUDIT.json。所有私人材料只读，没有创建/修改恢复回执，没有启动/停止/删除/重建容器，没有改网络、卷、密码或旧实例，没有数据库连接、迁移/集成测试、Git提交/推送。P0真实PG验收仍阻塞。


## 26. 新运行器对齐与受控恢复再次受阻（2026-10-27，未提交）

用户本轮授权先只读审核，如runner版本不匹配则构建/审核新镜像；第一阶段通过后，仅恢复本轮指定PG并允许initdb/bootstrap，不允许001—020或26项集成测试。另通过异步确认授权一个仅挂observer凭据的只读bootstrap验收运行器。上述权限没有用于绕过任何检查。

第一次单次只读预检通过：同一UUID b986df49-4ffc-4b26-bfe4-13e97e1e30ef、容器04d174ff32ab69b3eae39ee5b067d309a26132f87185baabcfada5247d0b593f、网络e269447bc2094406480763cbfde870c32c2ccc298d756910daad21c13cce81d4、卷创建信息、标签、原证据摘要及ACL匹配，未写恢复文件。源码bundle为6a040792d3c8f8a205dd578cb04cf5c4dc5ada98af00573b62b2ec59a4cc2a29，旧已批准镜像bundle为2d6720dc8d9ea7b23969d010ed580b9b33bd3b672d68d7387e8b68ca5c3ec2e5，不匹配，因此没有直接使用旧镜像。

新仓库外上下文C:/Users/USER/StallPhase8-V2-Bootstrap-Build-20261027-151135通过45文件bundle与41包SHA-512校验，130个构建输入文件。固定Node base不变。一次Buildx成功，npm ci --offline --ignore-scripts --omit=dev安装41包；无Registry Push，无新增基础镜像，RUN禁网但有Registry基础镜像元数据认证/查询。新canonical运行器stall-phase8-r2-runner@sha256:c3752474aa41668d4e95400c38a2645957195fab3bf51031e6c65d6d6d210303实际可解析；Image ID同该manifest，配置摘要另为sha256:727a4a6bf6045594329954421dbe0cecc0fed44ce83471a6a218b59191f5a3d3。平台linux/amd64、USER1000:1000、固定ENTRYPOINT及当前bundle标签匹配；已按本轮授权登记审核，不修改业务代码或安全策略。

之后仅调用一次node backend/scripts/phase8-v2.mjs --recover-created。退出1、phase8_v2_recovery_resource_changed，发生在reserveRecovery之前。没有db.recovery.attempt.json/db.recovery.failed.json/db.created.json；没有发出container start命令。容器仍created、Running=false、StartedAt为零、ExitCode0；未执行initdb/bootstrap，逻辑库和连接身份尚未通过SQL验收。未创建observer运行器、未连接PG、未执行迁移或26项测试。原始attempt/failure/launch字节摘要未变。

按用户“任何不匹配即停止”要求，没有修改或重新核准锚点，没有修复指纹算法、重试启动、删除/重建或清理资源。仅继续只读诊断并保存证据。连续inspect展示Mounts数组顺序变化，原始整体指纹随之变化；Config、HostConfig和按Destination排序的挂载集合摘要在观测中一致。对同一8个挂载的40320种排列作纯内存哈希比对（未写回资源/锚点），没有复现原始整体指纹。因此已确认有顺序敏感的指纹模型缺陷，但还不能把原摘要差异全部归因于挂载顺序，更不能推断数据损坏或擅自替换原锚点。

本轮299项离线安全测试重新通过，0失败/跳过；不是数据库运行验收。真实新增变化仅为新的构建上下文、本地运行器镜像/BuildKit缓存和审核登记；未操作其他项目/历史Phase8数据库资源，无全局清理、云部署、Git提交推送。所有既有未提交修改保留。

详细脱敏证据：PHASE8_V2_BOOTSTRAP_START_AUDIT.json。下一步只能先另行审查规范化指纹和完整元数据基线，补足不稳定顺序及真正字段变化的对抗性回归；不能继续沿用本轮授权自动修复或再启动。P0真实PG验收仍阻塞。

## 20. B3-V2 runner GitHub 独立供应链证据审查（2026-10-27）

基线 `cf89c59b189c63c9d515073f8a3d990b29d66e9b`。通过 GitHub 读取既有 RUNNER_BUILD_AUDIT、BUILD_INPUT_AUDIT、Dockerfile、V2 policy、README 和 runner 批准文件。既有审计报告一次 Buildx 构建成功、`npm ci --offline` 安装41包、固定 runner manifest/Image ID/RepoDigest 均为 `sha256:b1b2cc386667fa68b5136c36f4c3ad8170035a203eb204f4be24edb4c82b0849`，Node 基础摘要 `sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae`，bundle `f5164c3cf47dba291978b5745424d018266facb98a78c09b41b603f5ef68c289`。构建日志同时含 Registry 授权/元数据查询，不称整体断网。上述均是**读取前一轮本机执行产生的审计证据**，不是本次重新执行 Docker inspect、镜像字节扫描或离线测试。本轮通过 GitHub 直接提交审查文档，无本地 Docker/工作区权限。批准保持 false，待本机实时核验及单独审批。详见 [独立供应链审查](PHASE8_V2_RUNNER_INDEPENDENT_REVIEW.md)。


## 云端交互与状态同步优化（2026-10-28，未提交）

基于当前所有本地修改继续：取消首页依历史商家偏好自动导航；复用会话/API/店铺内近期权限证明和进行中请求，显式管理操作仍服务器授权；客服使用发送中/失败临时行及同clientKey重试，后端增加clientKey返回以便轮询精确合并；分类保留已确认列表和输入，乐观CRUD/排序、409人工核对、请求代际保护、transform局部节流。另修复商品列表、客服收件箱及备注标签的同身份隐藏清空。

新增48项interaction动态测试和1项support handler回归；原导航自动跳转测试按新需求改为禁止自动跳转，权限断言不放宽。实际完整结果、性能口径和手工步骤见INTERACTION_CLOUD_SYNC.md。三目标构建实际执行，无数据库/真实微信测试。本轮预览重建在固定输出目录遇EPERM后停止，没有强删或直接改产物；没有修改.local配置、Render/Neon、迁移、部署或Git提交推送，未解除原交付阻断。

本节实际最终联合246/246通过，0失败/跳过；Combined/Customer/Merchant各自真实纯编译、TS、边界及产物检查、3个MJS语法和git diff --check通过。性能指标仅合成JS状态更新：本次发送0.485ms、新增0.194ms、改名0.102ms、删除0.099ms、恢复0.319ms；200合成触摸事件13个局部patch，不是手机FPS或服务器RTT。


## 购物车、首页与配送/地址交互修复（2026-10-28，未提交）

实际基线539f108389385e8605593a8e6de3c9a06e246186，起始工作区干净，保留此前已落入当前源码的所有功能。购物车按真实架构处理：设备端身份/店铺隔离的数量状态，远程商品价格与库存校验；局部乐观数量、串行合并意图、待确认金额不臆算、旧读取/旧错误隔离。首页复用进程内已解析入口，不清空同上下文已确认内容、失败保留，并保持禁止自动回商家端。

真实配送页delivery使用4个原生时间picker，新增完整有效才提交；独立商家会话编辑状态机串行写expectedRevision、保留离页草稿/任务、服务器回读核对不确定提交，不盲目重试409，不影响营业配置。草稿不是永久持久化，只在当前进程内保留并提示。地址保留表单，写确认即成功并释放输入，后台1次GET，不重复读取配送或自动跳转；写失败保留输入与原创建幂等键，列表失败与写失败区分。新增write/list/local-validation计时字段，仅测前端边界，未把合成2400/200ms当真实Render/Neon耗时。

新增frontend-interaction-state41项通过，联合既有前端/导航/预览/客服/配送验证共296通过、0失败/跳过；三目标实际纯编译、TS、依赖边界、产物、3份测试MJS语法及空白检查通过。测试工具初次失败：checkout提取器未去TS类型，已增加真实TypeScript去类型并补完整状态；旧delivery-rules模拟DB没返回clock_timestamp导致4项失败，已用固定DB时钟及严格SQL匹配修正，原断言保留；新增用例的初版多行import处理及数量合并请求期望错误也仅修正夹具/请求协调，未削弱业务断言。

本轮无后端Node/SQL/API路径变化，不需要迁移。未改Render/Neon、AppID、.local预览配置，无部署、数据库连接或真实地址写入、Git提交推送。正常phone-preview构建仍在固定产物目录替换时报EPERM；没有强删、绕过或手改产物。真实手机、冷启动延迟、后端/DB分层耗时仍待授权环境验收。详细文件、命令与手工验收见CART_HOME_DELIVERY_ADDRESS_UX.md。

## 购物车/首页实际渲染路径与过期预览包排查（2026-10-28，未提交）

实际HEAD503a930465bd94f0ae276bc57e8ac3519d8eee7b，起始工作区干净。读取实际源文件及现有预览JS，发现dist/phone-preview/cart.js仍在每次refreshCloud清空items、数量操作后再refresh；index.js仍在loadCloudHome清空商品。这是明确的旧产物调用路径，但未读取开发者工具当前打开的项目，不把它直接等同于用户当时的运行现场。

用git show提取基线真实页面函数纯内存复现另两条路径：同身份且有待解析scene时products由1变0；单次加号确认提交完整items。修复retained/context判定、按行字段差异提交、复用一份quote验证数量及价格、稳定同步提示高度、缺图设置失败保留已确认样式。新增默认关闭且仅devtools允许的生命周期/setData/请求追踪和真实原生组件attached/detached探针；日志仅别名，不记录token、URL、商品名/ID或正文。首页普通返回不自动导航，真实会话/API/店铺变化和401/403仍清除旧数据。

新增25项queued setData/视图模型动态回归及3项命名输出安全测试；联合实际执行324项，324通过、0失败/跳过/取消。保留原296项对应业务、安全、导航断言；夹具更新支持真实嵌套setData和单quote协议。TypeScript、边界、三目标纯编译/产物检查、8个MJS语法及git diff --check通过。模拟节点身份与组件回调不是微信渲染器或真实手机验收，不宣称闪烁已在微信中实证消除。

默认预览输出替换仍EPERM。保留旧目录，给同一构建器增加安全命名输出（限制dist下新phone-preview-*目录、拒绝覆盖/穿越、默认入口不变），实际成功执行 `npm run preview:phone -- --prepare ".local\phone-staging.json" --output phone-preview-trace`。新包Combined130模块/36页/266产物，CLOUD_ONLY及同一真实Staging配置；没有编辑旧编译文件、改变AppID或开发演示环境。新目录产物验证通过，用户须在开发者工具导入正确目录重新编译，采集节点探针/矩形/WXML树证据。

完整路径、剩余风险及采集步骤：[CART_HOME_RENDER_TRACE.md](CART_HOME_RENDER_TRACE.md)。本轮无外部API调用、数据库连接/迁移、Docker、部署、Git提交/推送；源码和档案保持未提交供审查，原数据库测试阻断不变。

## Staging模拟支付及订单流程源码准备（2026-10-28，未提交）

以503a930及现有购物车/首页/底栏未提交改动为基础，确认订单unpaid→后端payment_not_confirmed是正确门槛，不能放开所有未支付订单。新增021迁移草案和默认关闭的staging-payment GET/POST：服务端环境、实际数据库marker/UUID、真实微信会话、限时店铺测试授权、本人订单和有效预留联合校验；使用事务、订单锁、原库存提交及requestKey幂等。模拟paid标记独立来源/实例/审计，不构造网关交易号；付后取消仍不退款、不自动恢复committed库存。

顾客详情提供经后端授权的独立测试入口及确认/失败/重试；商家未付接单及批选禁用，独立待支付tab，new/工作台数量仅new+paid。普通刷新保留卡片、按字段更新；统计及导出显式标记模拟来源，真实收款保持0，模拟订单不能取得真实已购评价资格。没有新建演示订单或线上造数，原购物车修复未动。

新增38项真实后端路由+旧内存事务模型测试、12项真实页面/API动态测试及1项评价边界。联合实际452通过、0失败/跳过/取消（含345项前端/构建/配送、63项Phase7、38项新后端、6项评价，不与历史结果重复累加）。另查三份历史后端文件23项为13通过10失败，用git show HEAD原始checkout/orderWorkflow经只读加载钩子重跑，同样10失败，未改断言迁就；旧SQL/角色/凭证端点预期需要后续独立整理。若合并两组为475项465通过10失败，不能称全部后端回归通过。

TS、依赖边界、三目标纯编译/产物和16个相关MJS语法通过。按用户要求仅尝试默认phone-preview准备命令，在dist/phone-preview替换处EPERM，未强删或创建替代目录，尚不能预览本轮新代码。未连接Neon/PostgreSQL、未执行021、未部署Render、未设置环境变量或tester授权、未访问R2/真实网关、未Git提交推送。真实PG行锁/并发/故障恢复、角色权限、送达照片和手机完整流程未验证；现有Phase8仍封存001—020，后续需另行授权021及隔离验收。详见[STAGING_SIMULATED_PAYMENTS.md](../../backend/STAGING_SIMULATED_PAYMENTS.md)。

## 2026-10-28 Phase8 V2只读复核补充（未提交）

本轮保留起始54个已跟踪修改和27个未跟踪文件；无Docker/DB写入、镜像重建、凭据创建或Git提交推送。Engine只读查询可达，V2精确ID和创建时间匹配，仍created/从未启动；原attempt/failure/launch三项字节摘要及卷规格均匹配，未出现recovery attempt。Config/HostConfig/挂载集合与10月27日诊断摘要一致，但容器整体摘要不匹配原锚点，缺少原始完整规格，无法证明仅是顺序差异。恢复仍在claim/start之前阻断，不重置锚点或重试create-db。

本轮8文件离线联合回归：389项，375通过、3失败、11跳过、0取消；Node v24.16.0，日志`.local/phase8-readonly/offline.tap`。失败为B0清单、V2 artifact、business artifact封存检查，均由源码目录新增021触发；不与历史计数累加。001—020、bootstrap/ready/ACL、26项真实订单、021及11项真实支付PG均未运行。当前业务依赖021列及新增staging模块，旧runner不能执行当前工作区；现有11项loopback测试不能直接接无宿主端口V2。没有声称已经具备真实测试执行条件。

完整当前证据、最小恢复替代方案、同一V2的020→021分阶段计划、覆盖缺口及Neon/Render前置条件见[恢复说明](PHASE8_V2_RECOVERY.md)。下一步先解决原始身份基线缺失；如无法找回，须单独批准同一资源的追加身份核验/登记方案，不能直接批准启动。旧B0/B3失败现场、锚点、回执及历史20项manifest均未改。

## 2026-10-28 V2最小补缺实际修复（后续轮，未提交）

追溯到原始Node指纹生成命令（2026-10-27T14:56:07.085Z）：固定顶层字段后直接JSON.stringify，未排序嵌套键/Mounts，未保存完整容器原spec。规范已确认，历史资源等价仍未证明。新增独立v2规范化/回归，未接入旧恢复入口，原锚点、回执和Docker资源不改；仍需人工批准同一精确资源的追加身份核验/登记，不能启动恢复。

三个021测试冲突已通过显式版本机制解决：默认执行严格020；离线workspace021-baseline020核验全部21个摘要后只返回历史20；staging021离线包version2补齐staging三模块/配置/计划，51文件。旧version1的45文件/20迁移及拒绝未知/篡改断言仍有覆盖。021打包及离线核验完成，但host/grant/runner/SQL阶段执行适配未完成，实际运行器明确拒绝v2包；不能称11项支付PG已可执行。

9文件最终离线联合407项：396通过、0失败、11跳过、0取消，Node v24.16.0。日志`.local/phase8-readonly/repair-final.tap`；新增phase8-version-boundary18项，数量不与历史/中间验证相加。真实恢复、bootstrap、001—021迁移、ready、26业务和11支付PG均未运行。本轮无Docker、数据库、Neon、Render或Git命令，无镜像构建，全部既有未提交修改保留。证据生成命令来源、源码变更、021最小执行扩展与下一步授权见[恢复说明](PHASE8_V2_RECOVERY.md)本轮新增节。

## 2026-10-28 21:15 UTC+8：V2独立身份重新核验，登记因证据缺失停止

本轮实际只读inspect：原V2容器04d174ff…（2026-10-27T14:43:54.913235797Z）、网络e269447b…（14:43:50.847655525Z）、卷stall-phase8-r2-data（14:43:47Z）身份匹配，容器仍created/从未启动。PG/runner/Node实际固定ID、RepoDigest、平台和旧bundle标签核对通过；8项挂载、单网卡无端口、internal/isolated/IPv6关闭、单子网无gateway和空成员均通过。与历史诊断的Config/HostConfig/挂载集合及网络16字段相同，原容器整体摘要仍不同。

19项当前静态检查在PowerShell7只读ACL补充后全部通过（12对象ACL通过；原PowerShell5模块加载失败日志保留），不是业务测试数量。依据用户本轮第7条“证据缺失，停止登记”，没有生成新登记/锚点/created/recovery回执：原完整container spec仍不可得；已检查历史audit缺少bind bootstrap内容原始摘要，路径一致不证明历史内容一致。未发现可确认的实质篡改，也未证明原资源完全等价。

新观测摘要只记录未批准；原锚点文件SHA256仍6acc14a560334d28e84db95627b0d1fd9a9bf9cfa21c77a95ce4b477c4329b27，原attempt/failure/launch字节摘要匹配且保留。最终日志`.local/phase8-readonly/identity-decision-1793193311755.json`（SHA256 76b025472cb9520ba4c1dfd936aa8f9f299dbea01bfa64fa36bf55609e9b509c），结果blocked_evidence_incomplete，下一次恢复前置条件未满足。完整资源ID/创建时间、逐项依据及ACL补充日志见[恢复说明](PHASE8_V2_RECOVERY.md)本轮新增节。

021仍只有打包/离线封存适配；执行用途、角色、账本、21就绪阶段和固定真实PG用例接缝待实现。本轮无源码改动或测试重跑，前轮407项结果保持历史，不重复累加。没有Docker资源写入、启动/停止、bootstrap/SQL、Neon/Render或Git commit/push/reset；全部既有未提交修改保留。下一步需补原始证据，或由用户明确审查并接受历史不可证明项后改变登记条件，不能自动启动恢复。

## 2026-10-28 21:35 UTC+8：021固定运行器源码适配完成（真实PG未执行）

新增version2 grant与upgrade021/ready021/business021/payments021四个固定用途，显式授权、schema/计划/20基线/前置回执绑定；旧version1默认入口保持严格020。staging021源码封存54文件，需新镜像审核配对，原批准未改。原V2摘要本轮不再调查。

新增schema021原子升级、独立stage021账本/catalog基线和只读ready/schema/ACL验收；原20账本/marker/基线保留。未来独立DBA登记脚本为新authorizer角色和test_only锚点做准备，本轮未执行。固定无参授权函数在升级事务内处理必要schema USAGE，避免提前改变旧020 ACL；权限严格限定并核验函数来源。payments021仅该用途挂载app/migrator/authorizer三凭据，其他用途仍单角色。11支付场景提取成共享PAYMENT_CASES，原独立PG入口与runner复用同一断言；business021复用既有26项，无新测试框架。

最终10文件联合离线446项：435通过、0失败、11跳过、0取消；新增phase8-021.unit39项。Node v24.16.0，15个MJS语法通过；日志`.local/phase8-readonly/021-final.tap`，SHA256 50cca1db87e6ddfa42fcde813eff934ba5df101bca1f986f3f9cbbea7020bf79。不与历史407或中间验证累加。真实Docker恢复/创建/挂载、bootstrap、001—021迁移、ready、26+11 PG、Neon/Render均未运行，旧证据/回执和全部未提交修改保留；无Git操作。

A需明确接受历史缺口、追加登记并实现恢复协议，证据较弱且时间不确定。优先推荐B：保留旧现场，复用全部现有控制器/审核成果/26+11用例，仅补一个固定新资源配置及完整身份登记机制，再另行授权新实例创建和测试。当前名称固定、不能重名，B也尚未创建；这不是从零重建基础设施。完整源码范围、grant/权限/原子性、日志、中间失败、未运行清单和A/B比较见[恢复说明](PHASE8_V2_RECOVERY.md)本轮新增节。


## 2026-10-29 商品详情、商家主题与紧凑购物车（本轮 UI 验证）

本轮相关前端联合回归 **297 项，297 通过、0 失败、0 跳过**，不与前轮 140 或 Phase 8 的历史结果累加。执行集合为 frontend-*、customer-ui-redesign、detail-merchant-theme、review-purchase-boundary、staging-payments-ui、interaction-cloud-sync、build-navigation-isolation；命令及日志见 [改版交付](../CUSTOMER_UI_REDESIGN.md) 本轮追加节与 `.local/detail-ui-full-regression.log`。

新增详情/主题 19 项；保留并实际重跑购物车快速数量/慢请求/UI trace 节点身份、评价可信购买、未支付禁接单、模拟支付来源标识及商家权限隔离。修正旧测试夹具对上轮 catalog 工厂、普通订单路由和已选状态的假设；底栏 CSS 契约更新至 104rpx，原金额保护断言保留。初次针对性执行 158 项有 1 个旧高度契约失败；扩大集合后旧导航夹具产生 18 个适配失败；修正夹具后最终 297 项全通过，不能将中间执行次数累计为覆盖数量。

TypeScript、三目标依赖边界、Combined/Customer/Merchant 实际构建及输出清单通过。最新原 phone-preview：44 WXML、49 WXSS 经微信原生编译器通过。预检 0 错误、1 条生成 JS 项目无 TS 插件的提示。本轮改动范围 Git 空白检查通过；全量工作区仍有前轮 profile.wxss 末尾空行，未改动该文件。

19 个实际商家页面仅改 WXSS/导航配色；本轮开始时的 19 份 TS 与 19 份 WXML SHA-256 均匹配，全部页面原布局属性保留。商品详情无 SKU/标签 API，不显示虚假选项；收藏未开通；公共评价匿名显示，可信购买/审核/举报权限沿用既有 API。购物车底栏由 264rpx+安全区缩为固定 104rpx，价格确认和结算校验保留。

原预览目录常规重建遇到 EPERM，未删除/强杀/另建目录；校验后就地刷新生成文件并用原 phone-preview tsconfig 重编译，保留 cloud-only staging 配置、AppID 与域名校验，更新后产物/模板检查通过。没有上传、部署、数据库迁移或 Phase 8 V2 资源操作。真实微信/真机渲染、真实商品/配送/商家写入联调未验收；具体待验项见交付文档。本条仅更新 UI 状态，不改变其他 Phase 8 测试资源或数据库状态结论。
## 2026-10-29 分类图标选择器中断后续做（本次结果）

先核对 Git status、分类实现差异和可读账户额度，保留所有未提交修改，复用中断前已保存的选择器、40 个 SVG 资源、前后端 iconKey 映射与迁移提案；没有从头重做。

本次只运行分类相关测试：`node --test --test-name-pattern 'categor|icon' backend/tests/category-icons.test.mjs backend/tests/interaction-cloud-sync.test.mjs`，**41 项全部通过，0 失败、0 跳过**。日志 `.local/category-icons-resume-tests.log`。其中分类图标测试 18 项，含新增的保存确认精确匹配、确认缓存和新增后删除其他分类不丢图标。中断前 312 项日志仅为历史，不与本次结果累加。

TypeScript、三目标依赖边界、相关后端语法、Combined/Customer/Merchant 构建和输出清单通过。三目标源模块 135/81/90，页面 37/14/19，产物 319/195/201。仅就地更新原 `dist/phone-preview`，保留原 cloud-only 配置/AppID/域名校验；44 WXML、49 WXSS 原生编译通过，40 个图标资源齐全。

功能代码已完成：商家新增/编辑图标网格与即时预览；顾客首页、分类导航逐类显示，白色选中态；旧分类按真实名称与稳定规则回退。原分类增删改、拖动排序、版本冲突及身份隔离测试继续通过。

云端持久化尚未上线：迁移只准备在 `backend/migrations/proposals/category-icons.sql`，未执行、未注册自动入口；兼容后端也未部署。旧服务明确提示未启用图标保存，仍可管理名称、删除和排序；不能把图标草稿标记为保存成功。本地演示可保存并在重新进入时恢复。真实数据库、跨设备与微信真机验收未执行。

文件清单、20 个 key、字段兼容及后续授权事项见 [交付文档](../CUSTOMER_UI_REDESIGN.md) 最新分类图标节。未操作 Neon/Render/正式数据库，未部署、提交、推送或清理其他未提交修改。
