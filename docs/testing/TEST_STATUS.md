# 微信商城测试状态

维护日期：2026-10-26，北京时间（Asia/Shanghai，UTC+8）。
本次 B2 执行基线：`edbf0a703940aa75acf97fd7541088773f184ef9`，分支 `main`。既有测试与镜像登记提交为 `b18a5d22974bf52205b542c71d3065d85a8a330e`。

## 当前结论

**第八轮 B2 本地凭据、私人回执目录及实例身份准备已完成；首次创建仍需另行授权，尚未执行。**
官方 PostgreSQL 固定镜像已登记，但这不是独立测试数据库已经创建或商城可以上线的证明。真实 PostgreSQL 迁移、并发、行锁、事务、死锁和故障恢复验收均未完成。

此前档案建立仅调查 Git、源码和文档。本次 B2 实际进行了 Docker/端口只读检查、仓库外凭据创建及 Windows ACL 核验；只更新本文和历史档案。**未重新执行功能测试、安全测试、构建或类型检查**，未连接数据库、微信或 R2。下表的测试通过数量仍均为历史运行报告。

## 证据分类

| 标记 | 含义 | 能证明什么 |
| --- | --- | --- |
| GIT | 本次读取本地 Git 对象及提交 Diff | 文件、改动范围、提交关联；不能证明命令曾通过 |
| SRC | 本次阅读实际源码 | 测试对象、断言、参数化定义、权限和执行边界；不能证明运行通过 |
| HISTORY | 用户提供的执行结果、既有报告或先前执行记录 | 某次历史运行的报告，不是本轮复测或当前环境证明 |
| DOC-CHECK | 本次文档文件、引用、统计和 Git 范围核对 | 档案一致性，不是商城业务验收 |
| LOCAL-PREP | B2 实际执行的本地元数据、文件及 Windows ACL 核验 | 此时点的凭据准备与隔离状态，不是 PostgreSQL 运行验收 |

未取得原始 TAP/CI 日志、运行时间或环境凭据时，不补造这些信息。历史报告与源码有出入时同时记载，不能用报告覆盖实际实现。

## 最近结果与提交

| 范围 | 历史运行报告 | 源码/Git 依据 | 当前边界 |
| --- | --- | --- | --- |
| 第一至六轮前端 | 88 通过；修复 6 项订单列表问题 | 六份 `frontend-navigation*.test.mjs`；`2529b627f22882473cdbc62fff7422d0614e8087` | 静态契约与 VM 页面函数模拟混合；无微信真机 |
| 第七轮 | 63 通过；与上述 88、既有 14 合并报告为 165 通过 | [第七轮报告](../../backend/PHASE7_BUSINESS_TEST_REPORT.md)；`96e6a52442c8b4450249ad6e1546e69ecb4bca0b` | 61 项实际业务模块模拟、2 项适配器自检；不是 PG 集成 |
| 第八轮 B0 | 111 通过、0 失败、0 跳过 | `1289713649d72379905bd6759b683e12372ba53a` | 23 个新文件、1530 行由 Git 确认；通过结果为 HISTORY |
| B1 登记中间状态 | 110 通过、1 失败、0 跳过 | 真实审核记录改为批准后，旧用例硬编码未批准 | 已解决的历史失败，不能继续标为当前失败 |
| B1 修复完成 | 124 通过、0 失败、0 跳过 | `b18a5d22974bf52205b542c71d3065d85a8a330e` | 67 项原安全测试 + 57 项整改测试；离线假 transport |

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
- 创建前 HEAD 与在线远程 main 均为上述基线，工作区干净。只读快照 `2026-10-26T11:23:15.895Z`：context `desktop-linux`，端点 `npipe:////./pipe/dockerDesktopLinuxEngine`，Engine 29.6.2/Linux；检查 10 个容器、10 个卷、7 个网络，无 Phase8 名称/标签/挂载/项目冲突，固定镜像身份核验通过；55433 无监听且不在 IPv4/IPv6 排除端口范围内。

下一阶段启动入口需要的环境变量**名称**（本次未持久设置或开启）：`STALL_PHASE8_AUTHORIZE`、`STALL_PHASE8_HOST_EXCLUSIVE`、`STALL_PHASE8_START`、`STALL_PHASE8_INSTANCE_ID`、`STALL_PHASE8_DOCKER_EXE`、`STALL_PHASE8_RECEIPT_DIR`、`STALL_PHASE8_ADMIN_PASSWORD_FILE`、`STALL_PHASE8_MIGRATOR_PASSWORD_FILE`、`STALL_PHASE8_APP_PASSWORD_FILE`、`STALL_PHASE8_OBSERVER_PASSWORD_FILE`。不得在档案中写入密码或完整连接串；初始化及数据库测试授权不包含在 B2 中。

B2 不等于首次创建：本次未创建、启动、停止或删除任何 Docker 资源，未下载镜像、连接数据库或执行迁移。实际创建前仍须单独授权，并重新核验 context、固定镜像引用、旧资源、端口、ACL 和回执，确认本机 Docker 管理权限独占。当前资源快照不能消除检查与创建之间的竞争窗口。

## 尚未完成的验收

- 专用实例首次创建、真实 bootstrap/角色 ACL、001—020 迁移及 ready/schema 验收。
- 真实 PG 多连接事务、幂等、最后库存竞争、SKIP LOCKED、死锁和未知 COMMIT 结果恢复。
- 微信登录/权限、R2 私有对象、顾客与商家全链路、三种构建和真机验收。
- 客户负责的支付/退款模块、可信通知及对账联调。
- 数据库与图片实体协调备份、隔离恢复演练、生产部署和交付签收。

详见 [覆盖矩阵](TEST_COVERAGE.md)、[问题与风险](KNOWN_ISSUES.md)、[发布验收清单](RELEASE_CHECKLIST.md)。这三份文件保留 B1 档案建立时的快照；本轮授权仅更新状态与历史两份文档，B2 准备进度以本文及 [B2 实际记录](TEST_HISTORY.md#6-第八轮-b2实际离线凭据准备) 为准。

## 持续维护规则

每次实际运行后更新状态和历史，附命令、源码 SHA、环境、通过/失败/跳过、原始日志或 CI 链接及副作用范围；功能变更同步调整覆盖和问题清单。修复问题须追加闭环证据，不抹去曾经的失败。本文档不启动自动测试或定时任务。文档自身的提交 SHA 以 Git 历史为准，不预填尚未产生的提交。
