# 微信商城测试历史记录（补录）

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
