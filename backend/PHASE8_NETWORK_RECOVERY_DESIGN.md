# Phase8 B3-R：网络与失败实例处置设计

日期：2026-10-26。审查基线：`70145de43af8d649f43883dd6254af639cba8cac`。

**B3-R历史设计保留；B3-V2已实现独立运行源码和离线安全回归，但真实环境未创建/验收；旧B3仍失败，B4仍阻塞。**最新实现基线 `083f67548d044c29ad4a9e0497d791e4348fd5f8`。本轮不操作实际Docker资源、不连接数据库、不读取旧凭据或改UUID/回执；下方1—7节保留原设计审查时点，第8节记录当前实现，不能把历史“待实现”或当前“源码完成”误当环境成功。

## 1. 决策

推荐 A：**专用 internal 网络内运行真实 pg 测试运行器，不发布数据库宿主端口**。新实例优先采用 internal + IPv4 isolated gateway mode、禁用 IPv6；是否满足预期必须做另行授权的真实验证，不支持时拒绝启动，不回退到普通 bridge。

本轮不直接改 `compose.test.yml`、TARGET、accessConfig 或 assertResources。推荐方案需要新运行器、拓扑和协议，按本轮边界只提交设计，不交付一个会让旧现场误通过的半成品入口。保留所有旧摘要、权限、身份和端口断言；旧协议下端口失败仍然失败。

**默认处置选择：保留旧实例为审计现场，为正式可写测试另建互不共享资源的 V2 实例。**旧实例不是数据被判定损坏，而是无法满足严格新规范且未独立验收；其无损只读识别可另行设计，不将日志推断当作验收成功。

## 2. A/B/C 完整比较

| 维度 | A：internal 内的运行器（推荐） | B：普通专用 bridge + 出口控制 | C：internal DB + 受限代理 |
| --- | --- | --- | --- |
| 真实事务/并发 | 同一 Node 进程使用真实 pg，至少两业务连接及一观察连接；位置改变不改变 PG 锁语义 | 宿主 Node/pg 可继续使用，连接真实性相同 | 经 TCP 代理仍可真实测试，但 COMMIT/断连归因多一层 |
| 防误连开发/生产 | 专网资源身份 + 目标 endpoint/IP/端口白名单 + SQL UUID/角色验证，写入前完成；不以库名作为充分证明 | 同等应用身份门槛仍必需；localhost 可能是错误进程，不能只验 URL | 同时核对 DB 和代理身份/固定上游，否则可转发到错误数据库 |
| 对外访问 | 无默认路由；internal 默认模式仍可能访问宿主桥地址服务，不能承诺绝对阻断。选 isolated、禁 IPv6、最小权限并实测宿主/外网拒绝 | 普通 bridge 默认可向外 NAT，localhost 只限制入站。必须在 Desktop VM/实际转发层落实并验证出口/跨项目规则，复杂且易影响其他项目 | DB 保持内网；代理的非 internal 接口有外网能力，必须限制上游与出口、禁止通用代理/路由 |
| Windows Desktop | 容器间 TCP，避免宿主发布/WSL 转发；isolated 与挂载/ACL 实际兼容待验 | 依赖 Desktop 发布及宿主/VM 防火墙组合，不仅是 Windows 一条规则 | 仍依赖 Desktop 发布，但发布者是专用入口代理，双网卡边界增加 |
| 新镜像/组件 | 一个经审核、固定摘要的 Node >=20 测试运行器镜像；复用已批准 PG 镜像，不引入服务平台 | 不必新增运行器镜像，但需可审计的出口控制基础设施及授权 | 至少一个经审核的最小代理镜像、固定配置及额外入口网络 |
| 凭据/权限 | 各用途运行器只挂相应角色 secret，永不挂 admin 或 Docker socket；新实例使用单独材料 | 原三角色分离，额外防火墙管理权限要严格约束 | 代理不需要 PG 管理密码；测试端仍用原角色分离，代理不得持 Docker 权限 |
| 夹具改动 | 中等：拆分宿主 Docker 验证与容器 SQL 验证，新增显式 transport；真实 SQL/屏障/连接作用域可复用 | 较小的连接层改动，较大的网络 attestation/防火墙验证改动 | 原 URL 使用方式接近现状，但增加代理拓扑、健康及回执校验 |
| 自动回归 | 单一固定镜像/代码清单/网络配置，适合重复运行；禁止运行时下载依赖 | 需记录规则集并证明未影响其他项目，重复性较弱 | 要覆盖代理故障、重连/缓冲及服务端最终状态，故障矩阵最大 |
| 故障恢复 | runner 与数据独立；runner 失败只保留证据，不自动处理 DB。运行器生命周期仍须明确授权 | 网络策略漂移可能使旧实例有额外出口；恢复需同时证明防火墙 | DB 原 ID 可保留，代理单独审计；双网卡与代理配置漂移要分别处理 |

选择依据：A 不要求 Node 测试有互联网访问，不需要共享 Docker 管理 socket或修改全局防火墙，容易在明确边界内重复执行。A 仍需实际验证，不把“internal=true”当作足够隔离证据。若业务坚持宿主 127.0.0.1:55433 是不可变需求，应重新审批 B/C，而非偷偷启用 A。

[Docker 官方端口文档](https://docs.docker.com/engine/network/port-publishing/) 区分入站 loopback 与出口，并说明 isolated 模式去除桥设备地址；[bridge 文档](https://docs.docker.com/engine/network/drivers/bridge/) 说明成员间访问边界。这些是设计依据，不是本机 V2 验证结果。

### 2.1 对实际源码的影响映射

| 当前文件/函数 | 已确认的限制 | 后续实施接缝（本轮未改） |
| --- | --- | --- |
| compose.test.yml | 唯一 DB 服务、internal 网络，却要求宿主发布；没有运行器 | 新独立 V2 配置，不把历史 Compose 改成默认可执行新架构 |
| policy.mjs / accessConfig、assertResources | 固定127.0.0.1:55433、单成员网络和host发布校验 | 旧协议原样；独立显式V2 profile及精确新拓扑/target验证 |
| launch.mjs / controlledLaunch | first/restart授权、wx、分阶段核验、失败留现场 | V2 控制器复用拒绝/复核原则，不误用现有恢复路径 |
| docker.mjs / createDocker | Windows端点固定、操作白名单、不允许exec或任意拓扑命令 | 宿主控制器有限操作，runner无Docker控制能力；不得泛化白名单为任意命令 |
| receipts.mjs / readReceipt、claimReceipt | failed不被接纳、首次不可覆盖；restart先创建尝试记录 | 新格式调查/恢复审计独立追加，旧回执无状态转换 |
| postgres.mjs / attestResources、openChecked | 同进程先Docker验身份再创建真实Pool；inspect只支持ready | 宿主/runner两段显式验证；独立observer bootstrap查询，不暴露可写Pool |
| helpers/phase8-postgres.mjs / openFixture | 真实pg三连接，池最多6，事务/观察工具已存在 | 仅修改显式授权接缝，保留真实SQL/锁图/释放行为 |
| scripts/init-test-db.mjs | bootstrap后声明initializing、原SQL+账本+ready原子提交 | 仅在新环境验收且独立授权后复用，不能为设计验证而调用 |

## 3. A 的严格 V2 协议设计

### 3.1 资源与新旧协议分离

- 待批准的新命名空间：项目 `stall-phase8-r2`、DB 容器 `stall-phase8-r2-pg16`、数据卷 `stall-phase8-r2-data`、网络 `stall-phase8-r2-network`；运行器使用该前缀加独立 runId。创建前检查任何同名资源，一律拒绝旧资源；不先行占用这些名称。
- **本轮没有生成新 UUID、密码或任何资源。**新实例需要下一次明确授权准备全新 UUID、独立的四份 secret 和私人回执目录，绝不复用/重新生成旧 B2 材料。若候选名字已存在，停止，不清理或自动换名避开审核。
- 可在物理隔离的新 PostgreSQL 集群内沿用数据库名 stall_test_phase8 和四个角色名；相同名称不证明同一实例，授权必须绑定新 UUID、不可变容器/卷/网络身份、镜像摘要和 SQL marker，不能由客户端任选数据库。
- 旧 B0 的 host transport 和端口要求保持原样。V2 必须显式选择 `internal-runner-v1` 版本，采用独立严格校验器，不通过新分支放宽旧实例的 assertResources，不自动检测 URL 后降级。
- 新 V2 数据库必须无 HostConfig.PortBindings/PublishAllPorts、无实际宿主发布，且只有批准专网；Config.ExposedPorts 中正常的 5432/tcp 声明不是发布。网络需 Internal=true、driver=bridge、批准的 isolated IPv4 选项、IPv6 禁用，无额外配置/host 接口。
- 唯一允许网络成员为已验收 DB 及当前一次运行的批准 runner；未知容器、额外网络/路由/端口、共享卷、privileged、host network、Docker socket、非白名单 bind 全部拒绝。不是只把当前“成员数1”断言改成任意数量。

### 3.2 运行器供应链与控制平面

1. 使用 Node >=20，按实际存在的 backend/package-lock.json 构建固定依赖工件；锁与package.json不一致或缓存不足时先停下补审计，不在隔离运行中联网 npm install。镜像审核记录绑定真实摘要和 Image ID，不填合成摘要冒充批准。
2. 构建采用明确源文件/测试白名单，排除 .env、Git、凭据、备份、开发配置、live/staging 测试、server.mjs 和自动 worker 启动入口。运行期不挂整个仓库/用户目录，不启动 npm start。
3. 宿主控制器先验证实际 Docker endpoint、原始/新回执、镜像、资源身份、网络和挂载，创建但不启动 runner；核对不可变 runner ID 后重新验证 DB。runner 非 root、只读根文件系统、cap_drop ALL、no-new-privileges、有限 tmpfs/资源/时间，无 Docker socket或管理 URL。
4. 只向单用途 runner 挂一份 observer、migrator 或 app secret；不挂 admin，不把密码放 env/argv/日志。同一镜像可运行三种固定白名单用途，不能把任意 shell/JS 命令当作授权入口。
5. 宿主为每次运行在**独立私人目录**创建一次性授权 grant，绑定 runId、用途、失效时刻、DB/runner/network 不可变 ID、实例 UUID、批准镜像和代码清单；目录 read-only 挂给 runner。创建 runner 时目录可为空，拿到 ID 后使用 wx 写入 grant 并 fsync，避免先绑定旧文件 inode 再原子替换的陷阱；该目录不能暴露旧回执或其他 secret。
6. 宿主控制器重新核验后才启动一次 runner，监督时限/外部资源漂移并保留结果；不能只凭 runner 自报 Docker 身份。grant 是私有受限文件，不是客户端任意自签授权；信任边界仍包含宿主管理者和审核后的运行器代码，不防恶意 Docker 管理员。
7. runner 只允许连接授权 DB endpoint 的精确 IP/5432（宿主从已验收网络元数据取得），不取 DATABASE_URL/PGHOST 兜底，不接受 DNS/URL 任意重定向；真实 pg 登录后先验证库/角色/SQL marker，再开放该用途的操作。
8. 容器内无法执行现有 createDocker/attestResources；不得给它 socket 来迁就原流程。把实际 Docker 验证留在宿主，SQL 验证留在 runner；通过显式 V2 transport 组合，两边验证不可相互替代。短时 grant、启动前后复核缩小但不消灭 TOCTOU。

### 3.3 SQL 真实性、角色及迁移门槛

- 复用真实业务函数与 pg 8，至少两个业务连接加一个观察连接、各自 PID 不同，使用屏障和 pg_blocking_pids 等实际数据库证据；不把 Phase7 内存适配器带入 PG 验收。
- `tests/helpers/phase8-postgres.mjs` 的 transaction、bounded、SQLSTATE、连接作用域和最终状态查询可复用；openFixture/openVerifiedPool 的连接授权接缝要支持 V2，不能把 IP 改掉就跳过 attestation。
- 现有夹具第三个观察连接是 app 角色，不是只读 observer；数据库身份检查使用独立 observer 用途，不借 app/migrator 代替只读权限。保持无 SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS 和异常连接销毁规则。
- 业务套件文件默认顺序执行；每个对抗用例内部使用多个真实连接。现有订单函数可能 sweep 全库，runId 不能隔离它，因此同集群不要并行互不协调的测试批次。
- 001—020 原 SQL 和 SHA-256 清单不变，迁移器事务、账本/catalog、ready 状态机不得削弱。迁移必须在新资源身份、bootstrap SQL 独立验收和单独授权之后；本轮与下一次容器准备都不自动授予迁移权限。

## 4. 旧失败实例的六个回答

| 问题 | 结论与限制 |
| --- | --- |
| 不删数据能否验身份 | **有条件可以设计只读核验**：另行批准专用 observer probe 加入原 internal 网络，宿主先验原 failed 回执/容器/卷/网络/标签，probe 只 SELECT 身份/角色/marker。尚未实现或运行，日志不是独立 SQL 验收 |
| 修改网络必须重建吗 | 增加同网 runner/代理可不改 DB 容器；Docker 自定义网络可连接/断开，但本轮禁做。网络 Internal/driver 配置不能当作原地开关，发布端口配置变化通常需新容器或代理。不能保证任一设计都保留 ID |
| 四种身份能否都保留 | DB 不重建时可保留容器 ID、UUID、原 nonce 和回执；**failed 必须仍是 failed**。重建必然产生新容器 ID，不能谎称完整原身份；如继续用原卷，UUID与新容器的关联需新恢复协议而非伪造原回执 |
| 如何独立只读核验 bootstrap | 按下一节设计单独 probe，只挂 observer secret，不使用管理员；权限层只读，不返回 Pool，BEGIN READ ONLY 是附加保护，不代替权限验证 |
| 是否已有恢复入口 | **没有**。first 的 wx/旧资源/非空 PGDATA 防护不可重跑；restart 先申请回执再读原状态、拒绝 failed、要求停止容器及最终 ready，不适合运行且只有 bootstrap 的现场。不能试调用探路 |
| 无法直接复用时怎么办 | 保留旧容器、数据卷、网络、回执和日志；另建独立 V2 名称/UUID/凭据/卷。无损保留不是自动把旧数据迁入新实例；旧数据任何迁移/归档/释放均另行授权 |

**严格 A 与当前旧容器不直接兼容**：旧 HostConfig 仍含 127.0.0.1:55433 发布请求，原网络也不是 isolated。当前 Engine 虽没实现映射，后续行为可能变化；这不满足新 A“无发布请求且无宿主桥地址”的干净基线。不能新增一个宽松分支把旧现场认作可写 V2。默认选新 V2 可写实例，旧实例只作审计/只读探针；若坚持恢复旧实例用于写测试，需单独评审明确的 legacy profile 或 C，不能本轮保证安全。

## 5. 显式只读探针与后续恢复的协议设计

以下是未来入口行为要求，**不是本轮新增的可执行 CLI**。

1. 分开授权“旧实例只读调查”和“建立新 V2 环境”，不得复用首次创建/重启授权值。先验证运行计划和来源审核，再做任何文件或容器动作。
2. 只读调查绑定确切旧 UUID/容器ID/镜像/卷/网络/endpoint/标签，以及原 failed 回执内容摘要；核对当前用户/private ACL。接纳 failed 仅用于调查，不授予初始化、测试写入或通用 Pool，不把旧 B0 端口失败判为成功。
3. 恢复/调查记录使用新的 wx 文件、独立格式版本和 runId，关联原失败回执摘要，追加结果；原 JSON/.launch 的字节、mtime、nonce 和状态不改。重复授权、过期 grant、任一资源身份变化都在下一外部动作前拒绝，失败保留现场，无隐式清理/重试。
4. 若 probe 加入旧网络，必须显式授权该唯一新成员，精确校验 probe ID/镜像/只读挂载；不改变全局“只允许 DB 一个成员”的旧断言。该例外仅产出调查报告，旧 first/restart/initialize/test 路径仍拒绝。
5. SQL 专用白名单：server_version/current_database/current_user/session_user/inet_server_port；instance 单行 UUID/schema_state/两个摘要；角色标志、成员关系、PUBLIC/database/schema/control-table 的有效权限；public 业务表/函数/自定义类型与非预期 schema 数量。期望 bootstrap，manifest_sha256 和 schema_sha256 均 NULL，无 migrations/schema_baseline 或业务对象，owner及角色准确；不匹配只报告并拒绝，不自动补齐 marker/角色/账本。
6. 用 observer 数据库权限层和单独 READ ONLY 事务读取，不执行 DDL/DML、不用迁移角色、不读取密码系统表。报告只有核验结论/计数/非敏感身份，不输出 pg 凭据、消息正文或完整回执；连接超时/结果未知销毁连接。
7. 只读成功只追加 `bootstrap_inspected` 调查结果（拟定名称），**不是 created_verified/ready**，不能被现有迁移器接受。写测试恢复需再审查资源与网络设计、专门授权、独立验收记录和身份转换；未实现则保持阻塞。

## 6. 新实例、验证与授权顺序

1. **先源码实现审查**：实现 V2 明确配置、host controller/runner、bootstrap 只读入口、不可覆盖的 grant/audit、版本化 attestation、封闭依赖清单；新增合成回归。不操作 Docker/数据库。
2. **供应链准备授权**：分别审核需要的 Node runner 工件/镜像完整 digest 与 ID，确认离线依赖可用；如需构建/下载，必须单独授权，不自动拉取。PG 镜像复用批准内容但仍重新核验。
3. **新材料准备授权**：仓库外全新 V2 UUID/四份不同 secret、受限目录与回执，独立于旧 B2。不能提前在本轮生成。
4. **新 V2 资源准备授权**：仅项目/容器/卷/网络及 runner 白名单资源；internal+isolated、无 host published ports，不挂旧卷。允许必要的新库 bootstrap，但不含001—020。每步前后核对，未知/旧资源拒绝，失败保留，不自动删卷或停止旧现场。
5. **网络验收授权**：metadata + 实际受控探针，两连接可达批准 DB；外部网络/宿主 canary/其他项目地址不可达。只能针对另行批准的本地可控 canary，不访问生产数据库或公网服务，不以固定 sleep 为证据。无法证明隔离则停止，不能仅靠声明无默认路由通过。
6. **只读 bootstrap 验收授权**：按 observer 白名单证明身份/角色/marker/空业务 schema。旧实例 probe 为可选独立请求，需明确仅允许向旧网络加入一个批准只读 runner，不能夹带改网/重启。
7. **B3-R 实际环境审查通过后，才申请 B4**：001—020 迁移与真实数据库业务测试分别授权；目前尚不能开始。

当前原项目/卷/容器不在任何未来自动清理计划内。需要释放旧现场时另有人工保留/处置审批，不能在新实例流程中隐式 stop/rm/down。

## 7. 待实现的最低回归与真实验收

| 层次 | 必须覆盖 | 本轮状态 |
| --- | --- | --- |
| 现有离线安全测试 | 原授权/摘要/端口/角色/回滚/失败拒绝能力 | 138/138 实际重跑通过；不是新网络验收 |
| V2 合成策略 | 错 profile、任意URL、其他店铺/DB、额外网卡/成员/宿主端口、错误gateway模式/IPv6、socket/privileged/任意挂载、错镜像ID/digest、过期/错用途/错runner grant均拒绝 | 未编写；不能把设计条目当作测试通过 |
| 恢复合成回归 | failed只能调查；旧回执不可覆写；first/restart不误用；资源竞争、空/多marker、非空业务库、错误ACL、只读角色错配、未知COMMIT/回滚故障拒绝 | 未编写；后续实际实现时测试真实新函数，不复制业务算法 |
| 真实 Docker | 每步不可变ID/摘要/网络/挂载、无发布、isolated与宿主/出口阻断、其他项目快照不变、runner失败留证 | 未运行；Windows挂载/网络功能必须实测 |
| 真实 PostgreSQL | observer只读、三个独立PID、行锁/SKIP LOCKED、事务原子性/死锁/幂等/COMMIT不确定与最终状态 | 未运行；不是内存适配器结论 |

本轮新增测试数为 **0**，未修改运行源码或测试。原因是所有候选网络修复都需要新拓扑/组件；不为未实现设计制造“通过”的测试或放松旧断言。已完成的是可执行后续实施的设计与现有离线回归，非环境修复或恢复成功。

## 8. B3-V2 实施记录（2026-10-26）

实现方案A，独立 `backend/compose.test-v2.yml` 和 `backend/testing/phase8-v2/`，入口 `backend/scripts/phase8-v2.mjs`。协议 `internal-runner-v1`；项目、容器、卷、网络严格使用本设计r2名称。原B0 Compose、策略、端口断言、启动器、failed回执、旧资源及材料保持不变。新实例必须另行准备UUID/密码，明确拒绝旧UUID和材料目录。

已实现：宿主独占窗口声明、镜像审核与固定ID/摘要、创建前后拓扑校验、internal/isolated/禁IPv6/无宿主端口；非root只读root/ALL capabilities移除/NNP/资源上限/三个最小挂载；持久化一次性grant及时间上限；observer专用bootstrap只读SQL；原001—020哈希和事务初始化接缝；ready实际catalog/账本/ACL核验；真实pg三连接/PID/阻塞/最终状态夹具。没有任意命令、任意URL、API/worker启动或清理入口。

运行器固定任务为bootstrap/initialize/ready/fixture。fixture目前只诊断三连接，不执行真实业务场景；第三观察连接是app身份的READ ONLY事务，observer凭据只在独立只读任务中使用，二者不混挂。grant绑定容器/数据库/网络/UUID/nonce/镜像/manifest/bundle/回执摘要，60秒内启动，最多5分钟执行；消费标记wx+fsync，不能重放。迁移必须另外授权，失败保留状态，不提供盲目恢复。

构建只复制审计清单和20份SQL，使用锁文件与离线缓存，运行期不安装。`runner-image-approval.json` 仍未批准，未填写虚构digest；审批未完成时在任何Docker IO及材料读取前拒绝。Node base来源、缓存、镜像实际ID/RepoDigest和bundle仍需独立供应链审核。

本轮验证：新增97项V2真实函数离线回归，保留原138项，共235通过、0失败、0跳过；14个新增MJS语法、TypeScript静态检查和Compose config纯解析通过。合成Docker/PG transport不证明真实网络或数据库正确；未创建构建目录/镜像/凭据/UUID/容器/卷/网络，未连接PG或运行迁移。旧现场本轮未重新查询，不宣称重新验证其健康或数据状态。

下一步可进入**镜像审核准备**，随后新材料、创建、实际网络隔离和bootstrap验收分别授权。Windows/Linux挂载权限、isolated出口阻断、真实锁/事务/死锁/不确定COMMIT均未验证。管理员并行操作的TOCTOU窗口只能通过独占管理窗口和前后复核约束，未声称绝对原子。详见 [V2操作契约](testing/phase8-v2/README.md)。
