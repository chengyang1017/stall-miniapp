# 第八轮 B0：独立 PostgreSQL 集成测试基础设施与安全整改

> B3-R 当前使用限制（2026-10-26）：下面保留 B0 当时的实现/审核记录，不是当前启动指南。镜像已登记，但真实首次创建因 internal-only 网络未发布宿主端口而失败；现场和 failed 回执必须保留，first/restart 不能用于恢复。B4 阻塞。
>
> 新网络推荐 A（internal 内的运行器），涉及新拓扑/协议，本轮仅完成 [网络及恢复设计](PHASE8_NETWORK_RECOVERY_DESIGN.md)，未实施运行源码或操作 Docker/数据库。具体当前状态以 [测试状态](../docs/testing/TEST_STATUS.md) 为准，勿照早期“尚未准备材料”等描述重建或覆盖资源。

基线：`96e6a52442c8b4450249ad6e1546e69ecb4bca0b`。

本阶段仅修改 B0 基础设施、安全测试及本文档。没有执行 Docker 命令、连接数据库、运行迁移、创建密码、下载镜像、启动业务服务或 worker。离线安全测试不是 PostgreSQL 验收。

## 1. 七项整改

| 问题 | 源码措施 | 离线验证 |
| --- | --- | --- |
| P1-1 启动前资源独占 | `launch.mjs` 首次创建前枚举项目、容器、卷、网络；旧资源一律拒绝。`wx` 持久回执限制重复启动；创建各阶段重新枚举、核对 nonce；先 create 不启动，检查完整元数据后按不可变容器 ID start。重新启动单独授权与身份检查。entrypoint 拒绝首次非空 PGDATA | 假 Docker 操作轨迹检查：旧资源、缺授权、资源竞争均在下一创建/启动前拒绝，无自动清理 |
| P1-2 inspect 只读 | 独立 `stall_test_observer` 数据库角色，仅 CONNECT、schema USAGE、表 SELECT，无 DML/DDL/TEMP。公开 inspect 入口只返回核验结果，不暴露 Pool。test 必须 app + 写入授权，initialize 必须 migrator + 初始化授权 | 角色/用途错配、无写入授权拒绝；默认只读只是额外保护 |
| P2-1 引导变量 | 固定 PGDATA、SCRAM、5432、监听参数。拒绝额外 PG* 和明文密码环境变量。psql 明确本容器 Unix socket、端口、库、用户并清理 libpq 目标变量 | 合成容器环境拒绝 PGDATA、PGHOST、PGSERVICE、trust 等；shell 源码审查 |
| P2-2 Docker 环境一致 | 同一显式环境执行 context 检查和操作；不继承父进程 Docker/libpq 变量；每次重新核对 context，实际调用固定 `--host`。Compose 显式空 env 文件，禁止开发 .env 隐式注入 | 假 transport 捕获 executable、env、endpoint、顺序；context/端点变化拒绝 |
| P2-3 schema/权限漂移 | ready 同时核对迁移账本和实际 catalog。检查关键索引、外键/CHECK、触发器、表/函数所有者、列定义及列级/表级 ACL、控制表权限。初始化事务内写入 catalog 基线与 SHA-256，ready 更新必须恰好一行 | 独立构造 catalog 漂移、owner、DML、TRUNCATE、账本 ACL 及 rowCount 0/2 拒绝 |
| P2-4 异常连接 | 私有真实 Pool 仅通过 guarded lease 使用；超时、08 类连接异常、57 类取消/终止、40003 未知完成结果、ROLLBACK 失败立即 release(error) 销毁；其他 SQL 错误仅允许回滚，最终也销毁；禁止复用失效 lease | 假客户端精确断言释放参数/次数、原错误保留、回滚失败、重借新连接、关闭幂等 |
| P3-1 镜像不可变 | 审核文件绑定 repository + digest + image ID + 审核人/时间；容器 Image ID 和本地 RepoDigest 均核对。pull_policy never，无拉取路径 | 实际审核文件为 approved=false；在任何 Docker IO 前拒绝启动，不编造摘要 |

## 2. 文件与职责

原有 13 个文件全部保留：

- `POSTGRES_TEST_INFRASTRUCTURE.md`：使用边界和审计记录（已更新）。
- `compose.test.yml`：独立 PG16 资源、固定配置、四个只读 secret、启动回执挂载（已更新）。
- `scripts/init-test-db.mjs`：一次性初始化、schema+账本+基线原子提交（已更新）。
- `scripts/verify-test-env.mjs`：仅 observer 核验并返回元数据（已更新）。
- `testing/phase8/.gitattributes`：shell LF（保留）。
- `testing/phase8/bootstrap-entrypoint.sh`、`bootstrap.sh`：首次/重启数据目录保护、固定 libpq 目标和最小角色（已更新）。
- `testing/phase8/migration-manifest.json`、`migrations.mjs`：001—020 原始文件清单、SHA-256、事务审核（保留）。
- `testing/phase8/policy.mjs`、`postgres.mjs`：纯校验及实际连接边界（已更新）。
- `tests/helpers/phase8-postgres.mjs`：未来真实连接夹具（显式 app/test，不含 SQL 内存适配器）。
- `tests/phase8-safety.unit.test.mjs`：保留原 67 项，更新合成元数据，拒绝断言使用明确错误码。

新增 10 个文件：

- `scripts/start-test-db.mjs`：未来受控首次创建/重启 CLI；无参数只打印离线说明。
- `testing/phase8/launch.mjs`：可注入假 IO 的授权、独占检查、分阶段创建及复核控制器。
- `testing/phase8/docker.mjs`：固定本地端点、显式干净环境、操作白名单，无 pull/down/rm/stop。
- `testing/phase8/receipts.mjs`：仓库外持久回执与一次性启动锁，不创建目录、不自动清除回执。
- `testing/phase8/schema.mjs`：只读 catalog 检查与基线核对。
- `testing/phase8/leases.mjs`：异常连接隔离和销毁。
- `testing/phase8/image-approval.json`：待人工审核的关闭占位配置，不是已验证镜像。
- `testing/phase8/empty.env`：阻止 Compose 自动读取开发 .env。
- `tests/helpers/phase8-fixtures.mjs`：明确标记为合成的元数据/镜像审核夹具，仅离线单元测试使用。
- `tests/phase8-remediation.unit.test.mjs`：本轮新增的安全回归。

不修改商城业务源码、开发 Compose、原迁移或前七轮测试；不新增依赖。

## 3. 资源、角色和环境依赖

固定项目 `stall-phase8-b0`，容器 `stall-phase8-pg16`，卷 `stall-phase8-data`，internal bridge 网络 `stall-phase8-network`，服务 `phase8-postgres`。仅绑定 `127.0.0.1:55433` 到容器 5432；数据库 `stall_test_phase8`，PG16。

- bootstrap：仅首次容器 hook 使用的管理员，不接受其 URL 作为普通连接。
- migrator：非超级用户、无 CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS，初始化期间拥有必要 DDL 权限；不能作为 test 或 inspect 连接。
- app：无 schema/database CREATE，仅业务表 DML、序列使用、控制表 SELECT；必须额外授权测试写入。
- observer：无 DML/DDL、无角色成员关系，只读查询权限。即使关闭 default_transaction_read_only，仍无数据写入权限。其权限的实际 PostgreSQL 行为尚未运行验证。

四个不同的 64 位小写十六进制密码使用仓库外文件；不设默认密码、不输出密码/连接串。尚未创建任何密码文件。引导脚本使用受控 socket 和 PGPASSWORD，不把密码放 argv；禁用 SQL/错误参数日志。数据和脚本挂载必须与专用拓扑一致。

以下是未来获授权后才可向专用进程传入的变量，B0 不修改本机环境：

- `STALL_PHASE8_AUTHORIZE=LOCAL_PHASE8_DATABASE_ACCESS`、新的 v4 `STALL_PHASE8_INSTANCE_ID`。
- `STALL_PHASE8_DOCKER_EXE`：明确的绝对路径；当前 Docker context 必须是允许的本机端点，拒绝 DOCKER_HOST/DOCKER_CONTEXT/TLS 覆盖。
- `STALL_PHASE8_HOST_EXCLUSIVE=I_CONTROL_LOCAL_DOCKER`：确认 Docker 管理权限与私人回执目录由本机操作者独占控制。
- `STALL_PHASE8_RECEIPT_DIR`：预先由操作者创建并限制 Windows ACL 的仓库外私人目录；工具不会创建目录或自动处理旧回执。
- 首次创建：`STALL_PHASE8_START=CREATE_FIRST_ONLY` 及 `STALL_PHASE8_ADMIN_PASSWORD_FILE`、`MIGRATOR_PASSWORD_FILE`、`APP_PASSWORD_FILE`、`OBSERVER_PASSWORD_FILE`（均带 STALL_PHASE8_ 前缀）。
- 独立重启：`STALL_PHASE8_RESTART=RESTART_EXISTING_ONLY`，已验收的原始回执、原容器 ID、相同端点/UUID/镜像及 observer URL。
- inspect：`STALL_PHASE8_OBSERVER_URL`，准确的 observer 用户/本机端口/库名，无 URL 查询参数。
- 初始化：`STALL_PHASE8_MIGRATOR_URL` 及 `STALL_PHASE8_INITIALIZE=INITIALIZE_ONCE`。
- 测试：`STALL_PHASE8_APP_URL` 及 `STALL_PHASE8_TEST_WRITES=TEST_WRITES_ONLY`。

不读取 DATABASE_URL，不以开发/生产连接回退。各 URL 的密码格式及全部目标参数均强制校验。

## 4. 首次创建、重启与竞争边界

**直接 docker compose up/create 不属于受控入口，也不构成已核验环境。** 唯一受控入口是 `node backend/scripts/start-test-db.mjs --create-first`，当前因未审核镜像必然拒绝，不应执行。

首次创建顺序：授权/镜像审核 → 原子 wx 回执 → 固定 context → 本地已存在镜像摘要核对 → 枚举全部旧资源并拒绝 → 创建带随机 nonce 的卷/网络，每步前后复核 → Compose create（never pull、no-build、no-recreate，尚不执行 PG）→ 完整核对停止状态容器 → 再核对不可变 ID 与所有资源 → 按 ID start → 运行状态复核。没有删除或重建旧资源的流程。entrypoint 的 MODE=first 要求 PGDATA 目录为空且无 PG_VERSION，旧数据即使 UUID 看似正确也拒绝。

`--restart-verified` 使用独立授权与一次性 restart 回执；只接受原有停止容器和原资源/镜像/启动 nonce。不执行 Compose 重建。启动前核对 Docker 身份，启动后通过 observer 核对数据库 UUID、ready、账本与 schema。停止的服务无法在启动前进行 SQL 身份核验；这是明确的分阶段边界，不能宣称启动前已经证明磁盘内数据库内容正确。

任一步失败留下审计回执和资源供人工核对，**不自动停止、删除、修复、清空、重试初始化或解锁**。当前 restart 回执也只允许一次尝试，后续再次重启需人工审查，不是通用日常生命周期管理器。

资源检查与 Docker 操作不具备跨进程原子性。nonce、重复检查、容器 ID 和 PGDATA 保护缩小误复用风险，但不能防御同时具有 Docker 管理权限或能改源码/回执/secret 的另一操作者。回执目录 ACL 由操作者确认，工具不声称跨平台 ACL 已验证。该环境只能在权限独占的本机 Docker 上进行后续准备。不能把测试通过理解为绝对独占或防恶意管理员。

## 5. 数据库初始化与 ready 核验

首次 hook 验证 PostgreSQL 16、库名、管理员、public 无业务对象、无额外业务 schema、无控制 schema/测试角色。在事务内创建最小角色、权限和 bootstrap 标识；旧库不能补建标识变成可信测试库。

状态：bootstrap → initializing → ready；失败可能为 failed 或保留 initializing。初始化只接受 bootstrap。持久 initializing 声明覆盖进程中断；单连接 advisory try-lock 覆盖关键阶段。工具不补建已有业务库账本，不提供恢复/强制重跑开关。

001—020 事务审核：001—006、008—020 共 19 份有文件级 BEGIN/COMMIT；007 无显式事务。扫描器识别美元函数体、字符串、引用标识符、嵌套注释，只剥离经 manifest 审核的首尾事务语句。未发现顶层 VACUUM/CREATE INDEX CONCURRENTLY 等事务不兼容操作；实际 PG 执行尚未验证。

SHA-256 使用 UTF-8 内容、CRLF 规范为 LF，其余内容保持原样。固定文件名、摘要、事务模式均核对，不运行时更新 manifest。扫描器不是通用 PostgreSQL 解析器。

一次外层事务执行 20 份原始迁移、插入完整账本、授予权限、保存 catalog 基线和其摘要、条件更新 ready（必须一行），最后一次 COMMIT。不关闭 FK/CHECK/触发器，不拆开提交迁移与账本。SQL 错误或传输不确定时销毁连接；可能无法写 failed，但 initializing 仍阻止重入。COMMIT 成功但响应丢失不能靠盲目重跑处理，应独立只读核对状态。

ready 不只检查账本摘要：实际读取关键约束/索引/触发器、列定义、表/函数 owner、schema/表/列权限和控制表 ACL，验证后与首次事务保存的基线及 marker SHA-256 比较。没有自动修复漂移或更新基线。bootstrap 管理员及拥有 schema 的迁移者仍属可信初始化边界；无法抵御他们故意同时修改数据库与基线。

## 6. 真实数据库测试夹具边界

`openFixture` 仅接受 app/test + 写入授权，且先完成 Docker 回执、数据库身份/角色、ready/账本/schema 核验。连接池最多六连接；作用域借两个业务连接和一个用于观察的 app 连接（三个不同 PID），这里的 observer 参数名是测试用途，不是 inspect 模式的 observer 角色。无写入授权的 inspect 不通过此夹具。

夹具直接转发真实 SQL，不解析/模拟数据库逻辑。提供 runId、命名空间、屏障、真实 pg_blocking_pids 观察、SQLSTATE 断言、事务与最终状态查询。20ms 仅是锁观察采样，不是并发正确性证据。所有操作有界，作用域退出销毁连接，不清空数据或删除卷。

连接错误/超时后立即销毁或标记 tainted，只允许必要回滚，不正常回池。ROLLBACK 失败销毁且保留原始业务异常。已释放 lease、已关闭 Pool 不允许重用。bounded 等待超时不等于服务端取消，未来测试须销毁作用域连接并核对最终数据库状态。

真实业务函数内部可能 sweep 全库库存；runId 不能隔离这种行为。后续用例应顺序执行或独立实例，不能启动生产 worker。流水/历史数据不可删除，失败数据保留供审查。

## 7. 验证记录（本轮离线）

- 原 67 项安全测试保留，加入明确错误码断言与新版合成元数据。
- 首批 7 个整改用例在修复前为 0 通过/7 失败，复现 inspect 角色、引导变量和镜像审核缺口；修复后通过。
- 追加 SQLSTATE 57014、57P01、08006、40003 精确销毁断言：修复前 1 通过/3 失败，修复后全部通过。
- 最终两份 B0 单元测试共 111 项：111 通过、0 失败、0 跳过。它们执行真实安全函数和假 Docker/pg transport，不连接真实 Docker 或数据库。
- 15 个 MJS 文件 `node --check`、项目 TypeScript `--noEmit`、`git diff --check` 及全部未跟踪文件单独 `diff --no-index --check` 均通过；不能代替 shell、Compose 和 PostgreSQL 的运行验证。
- shell 文件 LF/无 BOM、固定 socket、数据目录和角色授权仅经源码与字节检查。已尝试本机 Git Bash `--noprofile --norc -n`，但 MSYS `NtCreateDirectoryObject` 报权限错误 `0xC0000022`，因此 shell 语法检查未能运行，不报告通过。
- 没有运行 Compose 配置解析、镜像检查/下载、容器启动、真实身份核验、bootstrap、迁移、约束、并发或故障恢复测试。前七轮回归本轮未重跑，不合并计入 PostgreSQL 验收。

可重复的离线命令：

```powershell
& 'C:\Program Files\nodejs\node.exe' --test backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs
& 'C:\Program Files\nodejs\node.exe' --check backend/scripts/start-test-db.mjs
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/lib/tsc.js --noEmit --pretty false
git diff --check
```

不要默认执行全部 backend 测试：既有 live/staging 文件可能有外部访问能力。默认 CLI 子进程仅无参数运行，无授权、无连接。

## 8. 下一步必须另行授权

1. 人工审阅新增启动/权限/漂移保护及测试，核实本机 Docker、Compose 版本、shell 和 Windows 只读 bind mount 行为。
2. 独立授权取得并审核 PG16 镜像摘要和实际 image ID，再修改 image-approval.json。当前 approved=false 阻止任何启动，不得填入模拟测试里的合成摘要。
3. 独立授权后在仓库外创建受限 ACL 的回执目录、四个不同密码文件和新 UUID；确认项目/容器/卷/网络/端口完全独占。B0 不执行这些操作。
4. 再授权受控首次启动；失败时保留全部资源，先人工审查。禁止直接 Compose up 冒充通过受控检查。
5. 容器实际核验后，单独授权一次性迁移初始化；其后以 observer 运行只读验收。
6. 最后再授权真实 PG 约束、事务、幂等、行锁/SKIP LOCKED、死锁和业务集成测试的数据写入范围与留存策略。

当前完成的是可审计安全源码，不是已验收的数据库环境。未审核镜像、未完成真实环境验证、未获得资源创建/迁移授权之前，继续禁止启动容器、连接/修改数据库及运行真实集成测试。
