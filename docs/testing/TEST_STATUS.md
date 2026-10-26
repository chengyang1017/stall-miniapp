# 微信商城测试状态

维护日期：2026-10-26，北京时间（Asia/Shanghai，UTC+8）。
本次 B3 检查与兼容修复基线：`3051359520a8cb997908d4c000d65cfb6318061a`，分支 `main`；最初检查时干净，兼容修复开始时仅存在两份未提交 B3 档案，已保留整合。B2 执行基线为 `edbf0a703940aa75acf97fd7541088773f184ef9`，准备记录已提交于上述 B3 基线。既有测试与镜像登记提交为 `b18a5d22974bf52205b542c71d3065d85a8a330e`。

## 当前结论

**B3 首次创建前的镜像引用阻塞已通过最小兼容修复解除：审核渠道仍严格为 postgres:16-alpine，运行使用 postgres@sha256:完整摘要。真实 Docker 只读复核通过；尚未创建实例，首次创建仍须单独授权。**
官方 PostgreSQL 固定镜像已登记，但这不是独立测试数据库已经创建或商城可以上线的证明。真实 PostgreSQL 迁移、并发、行锁、事务、死锁和故障恢复验收均未完成。

此前档案建立仅调查 Git、源码和文档；B2 实际准备了仓库外材料。B3 初查仅做只读检查并记录失败；随后获授权最小修复 policy、引导脚本及对应测试/夹具，更新本文和历史档案。未改动凭据、ACL、镜像审核、商城业务源码，未连接数据库、微信或 R2，未运行商城功能测试、构建或类型检查。下表区分初查与修复后复测，其他测试数量仍为历史运行报告。

## 证据分类

| 标记 | 含义 | 能证明什么 |
| --- | --- | --- |
| GIT | 本次读取本地 Git 对象及提交 Diff | 文件、改动范围、提交关联；不能证明命令曾通过 |
| SRC | 本次阅读实际源码 | 测试对象、断言、参数化定义、权限和执行边界；不能证明运行通过 |
| HISTORY | 用户提供的执行结果、既有报告或先前执行记录 | 某次历史运行的报告，不是本轮复测或当前环境证明 |
| DOC-CHECK | 本次文档文件、引用、统计和 Git 范围核对 | 档案一致性，不是商城业务验收 |
| LOCAL-PREP | B2 实际执行的本地元数据、文件及 Windows ACL 核验 | 此时点的凭据准备与隔离状态，不是 PostgreSQL 运行验收 |
| B3-CHECK | B3 本次只读环境复核及指定离线检查 | 固定引用的实际阻塞、离线测试结果；不是启动、bootstrap 或迁移成功 |

未取得原始 TAP/CI 日志、运行时间或环境凭据时，不补造这些信息。历史报告与源码有出入时同时记载，不能用报告覆盖实际实现。

## 最近结果与提交

| 范围 | 运行结果及证据类别 | 源码/Git 依据 | 当前边界 |
| --- | --- | --- | --- |
| 第一至六轮前端 | 88 通过；修复 6 项订单列表问题 | 六份 `frontend-navigation*.test.mjs`；`2529b627f22882473cdbc62fff7422d0614e8087` | 静态契约与 VM 页面函数模拟混合；无微信真机 |
| 第七轮 | 63 通过；与上述 88、既有 14 合并报告为 165 通过 | [第七轮报告](../../backend/PHASE7_BUSINESS_TEST_REPORT.md)；`96e6a52442c8b4450249ad6e1546e69ecb4bca0b` | 61 项实际业务模块模拟、2 项适配器自检；不是 PG 集成 |
| 第八轮 B0 | 111 通过、0 失败、0 跳过 | `1289713649d72379905bd6759b683e12372ba53a` | 23 个新文件、1530 行由 Git 确认；通过结果为 HISTORY |
| B1 登记中间状态 | 110 通过、1 失败、0 跳过 | 真实审核记录改为批准后，旧用例硬编码未批准 | 已解决的历史失败，不能继续标为当前失败 |
| B1 修复完成 | 124 通过、0 失败、0 跳过 | `b18a5d22974bf52205b542c71d3065d85a8a330e` | 67 项原安全测试 + 57 项整改测试；离线假 transport |
| B3 初查复测 | 124 通过、0 失败、0 跳过（B3-CHECK） | 基线的两份 Phase8 安全测试，Node 原生测试运行器 | 离线假 Docker/PG transport；当时真实 Docker 固定引用检查失败 |
| B3 兼容修复后复测 | 138 通过、0 失败、0 跳过（B3-CHECK） | 同两份测试，新增 14 项；原用例保留 | 真实受控 ensureImage 连续 3 次只读核验也通过；仍不代表数据库集成通过 |

**不计算全仓唯一测试总数。**165 包含前端 88；124 是原 111 项演进后的测试集，而不是再新增 124 项。不能把这些不同时间、不同子集的数字相加。

## 当前可确认的源码事实

- [镜像登记](../../backend/testing/phase8/image-approval.json) 为 `approved=true`，repository 为 `postgres:16-alpine`，登记时间 `2026-10-26T10:33:23.210Z`。
- 固定索引摘要和本机默认 Image ID 均为 `sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36`。二者相同不是独立来源证明；完整来源核验过程见 [历史档案](TEST_HISTORY.md)。
- [整改用例](../../backend/tests/phase8-remediation.unit.test.mjs) 使用合成未批准对象检查启动 IO 前拒绝；真实审核记录检查不再要求永久未批准。安全策略没有因测试而放宽。
- [订单工作流](../../backend/src/orderWorkflow.mjs) 对合法的非取消履约变更统一要求 paid，不再让不限库存通过 `inventory_state=none` 绕过付款门槛；支付可信核验链仍是外部依赖。
- 当前有 001—020 共 20 份 SQL 迁移及 B0 摘要清单。文件存在不等于目标实例已执行。
- [server.mjs](../../backend/src/server.mjs) 启动监听后会启动库存 worker 和定位保留任务；不能为收集测试证据随意启动或 import 它。

## B2 实际准备结果（LOCAL-PREP）

完成时间：`2026-10-26T11:25:52.4300694Z`（北京时间 2026-10-26 19:25:52）；独立回读与 `icacls /verify /T` 随后通过。

- 实例 UUID v4：`43805bf5-1391-4d3f-b8ce-e3bfa9448d48`。
- 仓库外独占目录：`C:\Users\USER\StallPhase8-Test-43805bf5-1391-4d3f-b8ce-e3bfa9448d48`。
- 凭据子目录：上述目录下的 `secrets`；文件名为 `admin.secret`、`migrator.secret`、`app.secret`、`observer.secret`，admin 对应 bootstrap 身份。
- 私人回执子目录：上述目录下的 `receipts`，当前为空，未预造任何启动/初始化回执。
- 四份密码由 .NET `RandomNumberGenerator` 各生成 32 字节，编码为 64 位小写十六进制；私下回读确认长度、字符集、非空及四者不同。文件无 BOM、无换行；不记录密码或其摘要。
- 新目录使用带显式安全描述符的独占创建；密码文件使用 `CreateNew` 及显式 ACL 创建，已有对象不会被覆盖或复用。七个对象均为非重解析点、当前用户所有、禁用 ACL 继承，仅当前用户、SYSTEM、BUILTIN Administrators 三个主体拥有 FullControl；独立回读及 ACL 规范性检查通过。管理员权限仍可访问，不能将此描述为抵御本机管理员。
- B2 创建材料前 HEAD 与在线远程 main 均为 `edbf0a703940aa75acf97fd7541088773f184ef9`，工作区干净。B2 只读快照 `2026-10-26T11:23:15.895Z`：context `desktop-linux`，端点 `npipe:////./pipe/dockerDesktopLinuxEngine`，Engine 29.6.2/Linux；检查 10 个容器、10 个卷、7 个网络，无 Phase8 名称/标签/挂载/项目冲突，固定镜像身份当时报告核验通过；55433 无监听且不在 IPv4/IPv6 排除端口范围内。B3 本次发现的固定引用失败见下节，不以旧快照覆盖新结果。

下一阶段启动入口需要的环境变量**名称**（本次未持久设置或开启）：`STALL_PHASE8_AUTHORIZE`、`STALL_PHASE8_HOST_EXCLUSIVE`、`STALL_PHASE8_START`、`STALL_PHASE8_INSTANCE_ID`、`STALL_PHASE8_DOCKER_EXE`、`STALL_PHASE8_RECEIPT_DIR`、`STALL_PHASE8_ADMIN_PASSWORD_FILE`、`STALL_PHASE8_MIGRATOR_PASSWORD_FILE`、`STALL_PHASE8_APP_PASSWORD_FILE`、`STALL_PHASE8_OBSERVER_PASSWORD_FILE`。不得在档案中写入密码或完整连接串；初始化及数据库测试授权不包含在 B2 中。

B2 不等于首次创建：本次未创建、启动、停止或删除任何 Docker 资源，未下载镜像、连接数据库或执行迁移。实际创建前仍须单独授权，并重新核验 context、固定镜像引用、旧资源、端口、ACL 和回执，确认本机 Docker 管理权限独占。当前资源快照不能消除检查与创建之间的竞争窗口。

## B3 首次创建前初查：历史阻塞（已由下节修复）

- 只读快照 `2026-10-26T11:41:30.242Z`（北京时间 19:41:30）：Engine 29.6.2/Linux，Compose 5.3.1，context `desktop-linux`，端点仍为 `npipe:////./pipe/dockerDesktopLinuxEngine`。Docker 可执行文件为 `C:\Users\USER\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`。
- 枚举包括已停止项的 10 个容器、10 个卷、7 个网络以及 Compose 项目/标签/挂载，无 `stall-phase8-b0`、`stall-phase8-pg16`、`stall-phase8-data`、`stall-phase8-network` 或相关身份冲突。商城开发卷 `backend_stall_dev_pgdata` 仍属 `/backend-postgres-1`，不与 Phase8 目标共享；Glyphora 等现有项目保留。55433 无 TCP 占用，也不在 IPv4/IPv6 排除端口范围。
- B2 四份文件仍为 64 字节小写十六进制且彼此不同；UUID、外部目录、七个对象的所有者与受限 ACL 均符合 B2，`icacls /verify /T` 通过；回执目录仍为空，无材料改写。
- **阻塞**：`approved=true` 未变，标签 `postgres:16-alpine` 的 Image ID 仍为批准值，平台 `linux/amd64`；但当前代码生成的 `postgres:16-alpine@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` 在受控 `ensureImage()` 中重复失败，错误码 `phase8_docker_command_failed`。直接只读 inspect 同一固定引用返回 `No such image`，退出码 1。标准仓库引用 `postgres@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` 的只读 inspect 则成功，Image ID 与平台相符；这不能自动替代启动代码当前要求的引用，也不构成多份独立来源证明。具体解析差异原因未确定，未重标记、拉取或修改安全策略。
- 源码位置：`backend/testing/phase8/policy.mjs:12` 拼接引用；`docker.mjs:52` 按该引用 inspect；`launch.mjs:32` 在 Docker 创建前执行核验。当前不应尝试真实 `--create-first` 来验证失败：该入口在镜像检查前已申请 `wx` 私人回执，失败可能留下空回执，需要人工审查，不能自动覆盖重跑。本轮没有调用此入口。
- 启动边界审查：受控入口逐阶段核验独占资源/nonce/不可变容器 ID，固定端点、never pull、no-build/no-recreate；专用卷及 internal 网络，仅 127.0.0.1:55433；没有停止/删除旧资源、连接开发/其他项目数据库或启动商城/worker 的代码路径。
- 首次 start 会经官方 entrypoint 执行 initdb、创建测试库，并由 `bootstrap.sh` 使用本容器 socket 创建角色、权限及 `phase8_control.instance` 标识。这是**必要的真实数据库内部写入**，不是无写入启动；001—020 业务迁移是后续独立授权入口。首次 launcher 的 `created_verified` 只核对容器运行元数据，不等待 bootstrap/健康检查完成，也不等同数据库 ready 验收。
- 本次离线检查：两份安全测试 **124 通过、0 失败、0 跳过**；15 个 MJS 的 `node --check`、两份 JSON 解析、Ubuntu 两份脚本 `bash --noprofile --norc -n` 均通过。Compose `config --format json` 纯解析通过，核对实际四份外部 secret/脚本路径及只读映射；解析使用合成令牌，启动回执路径预留但未创建。配置解析不验证镜像可解析、容器挂载或真实 PostgreSQL 行为。
- **初查结论（历史）：暂不允许进入首次创建授权执行。**当时两份档案保留未提交；随后用户明确授权兼容修复及验证后的提交/普通推送，结果见下节。原失败记录保留，不以新结果抹去。

## B3 镜像兼容修复：镜像阻塞解除，未创建

- 根因：`approvedImage()` 将已审核渠道名 `postgres:16-alpine` 直接拼成 tag+digest 引用，但本机已存储的 RepoDigest 为 `postgres@sha256:…`；前者不能稳定完成本地 inspect。这是运行引用兼容问题，不是本次批准摘要或 Image ID 发生变化；B1/B2 先前成功与当前失败的 Docker 内部差异仍未独立证明，不将其编造为已知平台缺陷。
- 最小变更：policy 继续精确校验 approved、repository=`postgres:16-alpine`、完整 digest/Image ID、审核人/时间，仅将返回的运行引用改为 `postgres@` + 完整 digest。bootstrap-entrypoint 的引用格式守卫同步修改；不接受浮动标签或其他仓库。Docker 身份核验、launch、Compose、assertResources 和回执均沿用同一个经过审核的固定引用，不增加回退路径；审核文件及摘要未修改。
- 新旧引用分别为 `postgres:16-alpine@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36` → `postgres@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36`。[Docker 官方文档](https://docs.docker.com/reference/cli/docker/image/pull/) 提供 NAME@DIGEST 形式；本轮只读查询文档，没有执行 pull。
- 新增 14 项离线回归，覆盖额外 repository 拒绝、不能用附加字段覆盖引用、真实 ensureImage 函数的固定查询与 ID/RepoDigest 校验、镜像缺失不回退、容器/环境引用严格一致、launch 审计传递及 Compose/引导守卫。原未批准、非法摘要/ID、缺审核信息等拒绝测试保留，仅同步协议期望及独立合成夹具。
- 两份 Phase8 安全测试本次 **138 通过、0 失败、0 跳过、0 取消**；15 个 MJS 语法检查、Ubuntu 两份脚本 bash -n 通过。没有把模拟 transport 当作真实 PostgreSQL 行为。
- 真实只读检查 `2026-10-26T11:52:34.112Z`：desktop-linux、本机端点、Engine 29.6.2/Linux；修复后的受控 ensureImage 连续 3 次通过，同时核对原批准 Image ID、RepoDigest、linux/amd64。Compose 纯解析通过，服务 image 与 STALL_PHASE8_IMAGE 均为新固定引用，pull_policy=never；四份 secret 源路径保持原值，receipts 仍为空，解析使用合成令牌。
- **仅镜像阻塞已解除**：可在重新确认资源、端口、材料/ACL及本机 Docker 管理权限独占后，申请下一次受控首次创建授权；本轮不执行。首次 bootstrap 有真实库内写入、首次 created_verified 不等于 ready、迁移单独授权等边界继续有效。现有空回执无需兼容转换，不修改任何私人材料。

## 尚未完成的验收

- 首次创建前重新确认资源/端口/材料及明确 Docker 管理权限独占；镜像兼容阻塞已解除，不代表已消除检查/创建竞争窗口或获得创建授权。
- 专用实例首次创建、真实 bootstrap/角色 ACL、001—020 迁移及 ready/schema 验收。
- 真实 PG 多连接事务、幂等、最后库存竞争、SKIP LOCKED、死锁和未知 COMMIT 结果恢复。
- 微信登录/权限、R2 私有对象、顾客与商家全链路、三种构建和真机验收。
- 客户负责的支付/退款模块、可信通知及对账联调。
- 数据库与图片实体协调备份、隔离恢复演练、生产部署和交付签收。

详见 [覆盖矩阵](TEST_COVERAGE.md)、[问题与风险](KNOWN_ISSUES.md)、[发布验收清单](RELEASE_CHECKLIST.md)。这三份文件保留 B1 档案建立时的快照；本轮授权仅更新状态与历史两份文档，最新进度以本文及历史中的 B2/B3 实际记录为准。

## 持续维护规则

每次实际运行后更新状态和历史，附命令、源码 SHA、环境、通过/失败/跳过、原始日志或 CI 链接及副作用范围；功能变更同步调整覆盖和问题清单。修复问题须追加闭环证据，不抹去曾经的失败。本文档不启动自动测试或定时任务。文档自身的提交 SHA 以 Git 历史为准，不预填尚未产生的提交。
