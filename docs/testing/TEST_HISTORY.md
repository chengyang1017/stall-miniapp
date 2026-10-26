# 微信商城测试历史记录（补录）

> 项目：`chengyang1017/stall-miniapp`
> 仓库位置：`docs/testing/TEST_HISTORY.md`
> 原补录日期：2026-10-26；本次维护统一使用北京时间（Asia/Shanghai，UTC+8）。
> 性质：此前轮次根据开发与执行报告补录，**不是本次重新执行测试的结果**；第 6 节保留 B2 实际准备证据，第 7 节记录本次 B3 只读复核及离线复测。缺少原始测试日志、运行时间或提交关联的项目，标为“未独立复核”，不得当作新鲜测试证据。

## 0. 本次维护的证据范围

原档案源码基线为 `b18a5d22974bf52205b542c71d3065d85a8a330e`；本次 B2 执行基线为 `edbf0a703940aa75acf97fd7541088773f184ef9`。原档案建立没有环境操作，本次 B2 则实际执行只读 Docker/端口检查及仓库外凭据/ACL 准备，未重跑测试。原补录有用内容及 B1 中间失败保留，具体边界见第 6 节。

B2 记录已提交为 `3051359520a8cb997908d4c000d65cfb6318061a`，也是本次 B3 基线，初查开始时工作区干净。B3 初查仅做只读复核并保留两份未提交档案；随后用户另行授权固定引用兼容修复。第 7 节保留初查失败，第 8 节记录最小修复及实际验证；均未修改凭据、ACL或镜像审核，未创建实例。

上述镜像兼容修复已提交为 `85cceff85b8053cc5973a5f58b2f4964c5bf1f80`。本次用户明确授权一次受控首次创建；以该 SHA、干净 main 开始，第 9 节记录实际创建和启动后验收失败。此前“未创建”属于当时快照，不能覆盖当前部分创建现场。

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

## 10. 当前阻塞与下一步

1. **已完成：B1过时断言修复**。真实文件不再永久绑定未批准状态，安全拒绝断言保留；124/0/0为历史报告。
2. **已完成：B1审核登记与修复提交**。Git确认提交 `b18a5d22974bf52205b542c71d3065d85a8a330e`；本轮档案提交前仍要核对远程没有意外推进。
3. **已完成：B2离线凭据准备**：本次实际创建四份凭据、受限回执目录及新的 v4 UUID，独立回读核验通过。具体非秘密证据见第 6 节；严禁将密码或完整连接串提交仓库。
4. **已解除：B3 固定引用兼容阻塞**：最小修复已获授权并验证，使用标准 postgres@digest，审核渠道、Image ID、完整 digest 和 ensureImage 身份核验仍保留。未批准浮动标签回退或镜像升级。
5. **本次首次创建部分成功但验收失败**：仅一次受控执行，容器 healthy、bootstrap 有完成日志，但运行态端口拒绝，回执 failed；默认 bridge ID 变化待查。先人工审查现场，不得重试、清理、自动修复或进入 B4；不把 healthy 当作 created_verified/ready。
6. **迁移及真实数据库测试另行授权**：执行 20 份迁移和只读 schema/身份检查后，才能验证业务并发、锁、约束、订单/库存一致性。
7. **最终上线验收**：支付/收款流程、商家/顾客端真机测试、备份恢复、生产部署、安全与权限等均需独立验收；不能因测试设施准备完毕直接交付商家。

## 11. 后续每轮记录规范

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
