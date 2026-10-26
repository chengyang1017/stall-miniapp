# Phase8 V2 — internal-runner-v1

本目录是独立协议，不是旧 B0 的恢复入口。旧资源、failed 回执、凭据、UUID 和端口断言保持原状。当前 runner 审核为未批准，所有真实创建/运行入口默认拒绝。

## 实现与边界

| 组件 | 文件 | 行为 |
| --- | --- | --- |
| 唯一宿主 CLI | `../../scripts/phase8-v2.mjs` | 无参数不操作；只接受 `--create-db` / `--run`，没有任意命令或清理入口 |
| 宿主控制器 | `controller.mjs`, `host.mjs`, `docker.mjs` | 授权、镜像、资源独占、ACL、身份核验；逐步创建前后复核；失败保留现场 |
| 独立拓扑 | `../../compose.test-v2.yml` | r2 项目/容器/卷/网络，internal + isolated，禁 IPv6，无宿主端口 |
| 纯策略/授权 | `policy.mjs`, `grants.mjs` | 绑定数据库/运行器 ID、镜像、网络、UUID、nonce、用途、范围、摘要和期限 |
| 固定运行器 | `runner.mjs`, `sql.mjs`, `initialize.mjs` | bootstrap、initialize、ready、fixture 四种固定任务；不会启动商城或 worker |
| 真实 pg 接缝 | `fixture.mjs` | 两个业务连接和一个 READ ONLY 事务观察连接、独立 PID、阻塞关系查询、最终状态快照 |
| 可审计构建 | `artifact.mjs`, `Dockerfile.runner`, `../../scripts/prepare-phase8-v2-context.mjs` | 显式文件清单，锁文件、源码摘要、离线依赖构建；不复制完整仓库 |

`fixture` 的第三连接使用 app 身份，在 READ ONLY 事务内观察；数据库权限审计另走只持 observer 凭据的任务，不能把该连接称为 observer 角色。`fixture` 固定任务目前只检查三个独立 PID，未运行下单、库存或故障恢复场景。工具接口可向真实业务函数注入连接池，但业务场景套件不属于本次执行结果。

## 镜像与供应链（下一步，尚未执行）

PG 继续精确使用 B0 已审核的 `postgres:16-alpine` 渠道及其 canonical digest，不能使用浮动标签。运行器独立审核记录是 `runner-image-approval.json`，目前 `approved=false`。

后续须另行授权：审核官方 Node >=20、linux/amd64 的完整固定 `node@sha256:...` 来源；准备受控构建目录和完整离线 npm cache；以固定 base、`BUNDLE_SHA256` 构建；审查镜像实际 ID、RepoDigest、平台、标签、依赖供应链及文件清单，然后人工登记 runner 的 digest、imageId、baseReference、bundleSha256、reviewedBy、reviewedAt。不能编造摘要或仅凭标签批准。

普通本地 build 的 Image ID 不等于可解析的仓库 RepoDigest。后续必须通过另行审核的 OCI 导入或受控镜像分发流程建立真实 `stall-phase8-r2-runner@sha256:...` 本地引用；只有 Image ID 或手工 tag 不足以通过当前策略。缓存中也不得混入认证配置或私有凭据。本轮未选择或执行上述供应链操作。

构建上下文准备脚本只有在 `--prepare`、`PHASE8_V2_BUILD_CONTEXT_AUTHORIZE=PREPARE_NEW_CONTEXT_ONLY` 和仓库外全新 `PHASE8_V2_BUILD_CONTEXT` 同时给出时才写文件。它只复制显式清单并返回 bundle 摘要，不下载缓存、不构建镜像。Dockerfile 只在构建期执行 `npm ci --offline --ignore-scripts --omit=dev`，缓存不足即失败；运行时不安装依赖。不要将密码、回执或完整源码树放进上下文。**本轮没有运行上下文准备、构建或安装。**

## 未来宿主入口与材料

以下是已实现入口的契约说明，不是当前操作授权。

所有实际操作需要：

- `PHASE8_V2_PROFILE=internal-runner-v1`
- `PHASE8_V2_AUTHORIZE=ISOLATED_V2_ONLY`
- `PHASE8_V2_HOST_EXCLUSIVE=I_CONTROL_LOCAL_DOCKER`：须由操作者确认独占管理窗口，程序不能证明其他管理员不操作。
- `PHASE8_V2_INSTANCE`：新 UUID v4，明确拒绝旧 B2 UUID。
- `PHASE8_V2_DOCKER_EXE`：Docker 绝对路径；只接受本机 desktop-linux/Linux Engine，固定显式端点，每次命令前复核。
- `PHASE8_V2_PRIVATE_ROOT`：严格等于当前用户目录下 `StallPhase8-R2-<新UUID>`，不是旧 B2 目录。

私人根目录及 `secrets/`、`records/`、`runs/` 必须预先准备，当前用户为 owner，根 ACL 禁继承，仅当前用户/SYSTEM/Administrators 三项 FullControl，子目录与文件不得出现其他主体。四个 `secrets/<admin|migrator|app|observer>.secret` 是不同的 64 字符小写十六进制，无换行。程序不生成身份或密码，不读取旧 B0 密码；创建阶段核验四份新材料，运行阶段仅读取对应角色文件。

首次创建用 `PHASE8_V2_ACTION=create-db` 和 `node backend/scripts/phase8-v2.mjs --create-db`。拒绝现存 r2 项目/名称/资源，先核验两个镜像，再预留一次性 attempt，创建专卷/专网/停止态 DB，严格复核后仅启动精确 ID。不 pull、不清理、不复用、不自动重试。首次 initdb/bootstrap 是数据库写入，必须另行授权。资源验收结果 `created_verified` **不代表健康、bootstrap 核验或 ready**。

运行任务用 `PHASE8_V2_ACTION=run`、全新 `PHASE8_V2_RUN_ID`（UUID v4）、`PHASE8_V2_PURPOSE` 和 `node backend/scripts/phase8-v2.mjs --run`：

| purpose | 唯一凭据 | 固定执行范围 | 前置回执 / 额外授权 | 成功状态 |
| --- | --- | --- | --- | --- |
| bootstrap | observer | 只读 SQL：版本、角色、marker、bootstrap、ACL、没有业务对象 | V2 db.created.json | bootstrap_verified，ready=false |
| initialize | migrator | 原始 001—020 + 同事务账本/基线，持久化尝试状态与互斥 | bootstrap 结果；`PHASE8_V2_MIGRATE=INITIALIZE_NEW_V2_ONCE` | schema_initialized，ready=false |
| ready | observer | 只读账本、实际 catalog/约束/触发器/ACL 对比 | initialize 结果 | ready_verified |
| fixture | app | 三个真实连接/PID诊断，不包含实际业务场景 | ready 结果；`PHASE8_V2_TEST=V2_FIXTURE_ONLY` | fixture_connected |

后面三项还要求 `PHASE8_V2_PREREQUISITE=<前一任务runId>`，从受限目录读取对应不可覆盖结果，不能接受旧 failed 回执。初始化失败、COMMIT 不确定或 ready 核验失败都必须保留现场并人工分析，不提供 resume/repair/清库入口。

## 一次性运行器协议

宿主创建停止态运行器，核实精确 ID/镜像/单网卡/无宿主端口/加固/挂载，才写只读 grant。grant 有 60 秒启动期限、最多 5 分钟执行期限；绑定运行器、数据库、角色、固定用途和 manifest/bundle/receipt 摘要，不接受任意 URL、命令、参数或脚本路径。运行器 hostname 必须对应被审核 ID。

运行器以 UID/GID 1000、只读根、cap-drop ALL、no-new-privileges、有界 CPU/内存/PID、noexec tmpfs 运行。仅挂 grant 只读目录、该角色 secret 只读文件、持久化消费标记目录三个 bind；没有仓库、Docker socket、admin、旧 B0 凭据或第二网络。消费标记用 `wx` + fsync，重启/重放拒绝；失败后不删除它。Windows bind 下 UID/ACL 的实际读写兼容尚待验收。

实际连接为目标专网 IPv4 + 5432，不接受 DATABASE_URL/libpq 覆盖。连接前验证 grant，借出每条连接时验证数据库、角色、PostgreSQL16、UUID marker 和状态。observer 的只读来自数据库 ACL 核验及只读事务双重约束，不向外返回可写池。连接异常、未知事务状态、ROLLBACK 失败沿用 guardedPool 销毁连接。超时退出断开连接，不自动停止/删除容器。

## 还未证明的运行条件

- 本轮只有合成 Docker/PG transport、真实临时文件 claim 及 Compose 纯解析；没有真实 V2 镜像、网络、挂载、ACL 或 PostgreSQL 验收。
- internal/isolated/no gateway 是严格验收条件，不是已经实测的出口隔离证明。后续须实测宿主/外网/跨项目访问被拒绝；不支持 isolated 时失败关闭，不降级 NAT。
- Docker 管理员可改变网络/挂载。检查与创建存在竞争窗口，只通过独占管理窗口与创建前后复核约束；没有声称跨 Docker/文件系统原子锁或抵御恶意宿主管理员。
- grant 完成前后复核不等于全时网络监控；任务期间禁止其他管理员改资源。失败/残留运行器保留，不自动清理。
- SQL 是真实 pg 接缝，但本轮没有执行真实锁/事务/回滚/死锁/COMMIT 不确定性测试。不能将 001—020 文件哈希检查称为迁移成功。

## 离线回归

`node --test backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs backend/tests/phase8-v2.unit.test.mjs`

三份文件均不连接真实 Docker/数据库。V2 使用实际策略、宿主控制器、编译 Docker transport、固定 runner 和 SQL 接缝，外部响应是合成元数据，不是内存数据库验收。
