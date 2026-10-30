# Staging 模拟支付：三个 P1 整改与启用审查

2026-10-28；基于 HEAD `503a930465bd94f0ae276bc57e8ac3519d8eee7b` 和现有未提交源码。**源码整改不是 Neon/Render 已启用、真实支付完成或正式上线验收。** 未修改 Render、Neon、微信配置；未迁移、部署或提交 Git。旧购物车、首页和结算栏修复保留。

## 一、环境身份（P1）

`src/stagingDeployment.mjs` 将 Node 运行模式与业务部署身份分开：允许 `NODE_ENV=production`，但仅 `APP_ENV=staging` 远远不够。模拟支付及模拟订单履约还必须满足：

1. 固定源码路径 `config/staging-deployments.json` 中有唯一、人工批准且字段有效的部署档案。目前档案为空，没有替任何真实服务作批准。
2. `STAGING_DEPLOYMENT_ID`、`STAGING_PAYMENT_INSTANCE_ID`、Render 平台提供的 `RENDER=true` / `RENDER_SERVICE_ID` 与审核档案逐项一致，明确开关为 `STAGING_SIMULATED_PAYMENTS=ENABLED_FOR_TESTING_ONLY`。
3. 数据库地址、数据库名、应用角色与审核档案相符，TLS 校验证书；拒绝额外连接参数和 libpq 环境覆盖。运行连接使用单独 pg 参数，避免 URI 重新解释关闭 TLS。迁移使用独立的 direct endpoint 和迁移角色，禁止应用连接串回退。
4. 独立 `staging_control.deployment_identity` 具有正确部署 UUID、实例 UUID、Neon branch ID、实际数据库名、staging 标记。普通应用不能写这个锚点。
5. 021 的环境记录启用且实例/数据库相符；当前真实微信会话未过期/撤销，指定店铺/微信身份的测试授权仍在有效期。owner 身份不自动产生测试授权。
6. 服务端重查订单归属、未付/new、支付窗口、预留完整性；客户端不能指定支付金额、来源或确认结果。模拟确认不代表实际收款，也不生成退款。

`APP_ENV=production`、审核缺失、错误 service/host/database/role/branch/instance 默认拒绝。复制模拟 paid 订单到未获准部署，也不能推动履约。无效部署在模拟路由 DB I/O 前返回 404；权限不足返回可诊断 503；数据库锚点不符拒绝，不静默采用其他实例。

**信任边界：Render 的环境变量和数据库 marker 不是硬件证明，也不是 Neon Control API 对分支的独立证明。** 可以修改代码、整套环境和数据库的管理员仍能伪装。必须采用独立 Staging Render service、独立 Neon branch/endpoint/角色、独立秘密和受控审核/发布权限；生产不部署测试批准档案，不配置测试开关，生产运行角色不得读写测试授权表。不能宣称应用代码提供绝对的生产/测试隔离。

审核档案字段见 `validProfile()`：version=1；deploymentId、instanceId、environment、renderServiceId、branchId、applicationHost、migrationHost、database、applicationRole、migratorRole、authorizationRole、pre021CatalogSha256、approved、reviewedBy、reviewedAt。需要先读取真实非秘密元数据，不得照抄测试夹具。**当前 Neon 角色名称、owner/继承关系、账本及实际 catalog 均未知。**

## 二、权限（P1）

`src/stagingPermissions.mjs` 提供可审查 SQL 计划与有效权限探测：

| 身份 | 必要用途 | 明确禁止/限制 |
| --- | --- | --- |
| DBA/身份登记者 | 单独核验分支后建立只读部署锚点，审核真实角色、所有权、PUBLIC ACL | 不作为 API 连接；无自动建角色或授权入口 |
| migratorRole | 现有 public 表/账本的迁移所有者或经核验的 DDL 权限；执行 021、授权、记录账本 | 非 SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS；不用应用凭据 |
| applicationRole | 既有业务权限；新增环境/测试授权 SELECT、确认审计 SELECT/INSERT、所需订单列/库存列 UPDATE、事件/流水 INSERT | 不拥有表；不能 CREATE schema；不能继承 migrator/授权管理角色；不能建立/修改测试授权或部署锚点 |
| authorizationRole | 后台受控运维流程 SELECT/INSERT 测试人员，UPDATE expires_at/revoked_at | 无公开授权管理 API；不使用应用连接池，不授予表级 ALL |

PostgreSQL `FOR SHARE` 需要 UPDATE 权限，单纯 SELECT 不足。021 的环境/测试授权表新增 `lock_key boolean CHECK(lock_key)`：应用仅获该常量列 UPDATE，而非可以更改 enabled、instance_id、expires_at 等策略列。会话及店铺的锁复用已有 `revoked_at` / `name` 列的必要业务权限。数据库会阻止 lock_key=false。FK 检查不要求给应用 REFERENCES 管理权限；新增主键使用 UUID/文本，没有新增序列授权需求。

计划是模拟支付的增量授权，不声称覆盖整个商城既有 ACL。应用已有 checkout、订单事件、触发器及库存权限仍需核对。实际有效权限（包括继承/PUBLIC/列级权限）不合规会拒绝；工具不会自动撤销整个项目的旧权限来强行通过。新表 REVOKE PUBLIC；应用无迁移审计表写权限。没有 GRANT ALL、超级用户方案或授权管理 HTTP 接口。

## 三、原子迁移（P1）

工具：`node backend/scripts/migrate-staging.mjs --plan`。**默认仅离线读取，当前可安全审查；不连接数据库。** `--apply` 不是本轮授权。

`testing/staging/migration-plan.json` 固定 001—021 文件名和 LF 规范化内容 SHA-256。加载时重新计算真实内容；001—020 账本只兼容同一文本的 LF/CRLF 两种已确定摘要，不任意接受不同历史。既有 Phase8 manifest 保留 001—020，不冒充已批准 021。

复用已有 dollar-quote-aware SQL 解析器：001—006、008—021 只剥离确定的最外层 BEGIN/COMMIT，007 原本无包装；拒绝额外顶层事务控制/CONCURRENTLY。函数体内部 BEGIN/END 不被当成顶层事务。`search_path=public, pg_catalog` 保证未限定建表落在 public。未关闭外键、CHECK 或触发器。

授权 apply 后的单事务顺序：

1. BEGIN；事务局部 lock_timeout=3s、statement_timeout=30s、idle_in_transaction_session_timeout=30s。
2. 核验 DB 锚点、current_database/current_user、三专用角色；取得共享迁移 advisory 事务锁，拿不到立即拒绝。
3. 要求已存在 `public.stall_schema_migrations`，锁账本并锁 orders；不在已有业务库自动创建/补齐账本。
4. 核对 001—020 全部账本摘要、关键约束/索引/启用触发器，并将实际 catalog（列、默认值、FK/CHECK、索引、触发器、函数、所有者、ACL）摘要与事先人工批准的 pre021CatalogSha256 比较。
5. 执行剥包装后的 021、增量权限计划、有效权限复核、后置 catalog 摘要、参数化账本 INSERT 和身份/前后摘要审计 INSERT；两次影响行数必须恰好 1；最后 COMMIT。
6. 任一失败整事务回滚。COMMIT 应答异常标为未知，销毁连接，不自动重跑。后续另行授权核对账本/审计/实际结构：已提交则只作一致性验收，不重复 DDL；漂移则拒绝。

独占维护窗口仍是前置条件：advisory lock 不能阻止任意外部 DBA 执行不遵守协议的 DDL。事务锁/超时会有正常等待和冲突，不能说没有竞争。旧 migrate-dev 不用于 Neon，未将其改造成远端迁移器。

`--apply` 还需以下本进程授权值，不能放入普通 Render API 环境：

```
APP_ENV=staging
STAGING_DEPLOYMENT_ID=<已审查档案ID>
STAGING_MIGRATION_AUTHORIZE=APPLY_021_STAGING_ONLY
STAGING_MIGRATION_EXCLUSIVE=CONFIRMED_NO_OTHER_DDL
STAGING_MIGRATION_EXPECTED_BRANCH_ID=<实际已核实分支>
STAGING_MIGRATION_PLAN_SHA256=<本次--plan输出>
STAGING_MIGRATION_DATABASE_URL=<秘密管理提供的direct endpoint迁移连接>
```

不得把上述示例当作已获得授权。DBA 建立 `testing/staging/identity-bootstrap.sql` 中的独立锚点也需要单独授权；该脚本不会登记真实值，迁移器不会调用它。migrator 对控制 schema 的 USAGE 和锚点 SELECT 需有相应 grant option，才可向 app 授予读取；不得授予 app 控制锚点写权限。若现有账本非 001—020 或 SHA 不同，应停止并调查，不补记为“已成功”。

## 四、真实 PostgreSQL 验证与现有测试修复

本轮 Docker desktop-linux Engine 命名管道不可达；没有已核实、已授权的隔离 DB 连接目标。未启动 Docker、未连接 psql/Neon、未运行任何 SQL。新增真实 pg 文件 `tests/staging-postgres.integration.test.mjs` 默认跳过，不将跳过当通过。

11 个待执行场景：001—021 和触发器；最小权限与 row lock；CHECK/复合 FK/unique；不同 backend PID 的并发确认幂等；先取消后确认；真实锁等待下支付/取消竞争；等待中到期；到期后原释放路径；真实 SQL 错误回滚；真实 COMMIT 后丢应答；仅终止自身隔离应用 backend 的连接异常回滚。

测试复用 V2 连接/PID/阻塞观察夹具与 seed，调用真实业务函数并查最终数据库，不使用 Phase7 内存 SQL 效果代替 PG。COMMIT 丢应答用真实提交后的传输故障注入，不能当物理断网完整验收。未覆盖真实 Neon failover、全部 40P01/连接故障矩阵、R2 送达、生产角色和手机。

仅另行授权全新 loopback 集群、三角色、DBA-enrolled test_only marker 后才可执行。目标必须为 `stall_payment_it_<UUID去连字符>`，三 URL 必须相同 loopback/db 且角色各不相同；拒绝 stall_dev、stall_restore_20261027、stall_test_phase8、Neon 或默认 DATABASE_URL。环境名见 `testing/staging/postgres-target.mjs`：STALL_STAGING_PG_TEST_INSTANCE_ID，STALL_STAGING_PG_TEST_MIGRATOR_URL / APP_URL / AUTHORIZER_URL；运行开关 STALL_STAGING_PG_TEST_AUTHORIZE=ISOLATED_001_021_TESTS_ONLY，首次空库初始化另需 STALL_STAGING_PG_TEST_INITIALIZE=APPLY_001_021_ONLY。不自动创建集群、删库、清表或删除数据；每例独立 UUID 数据保留调查。**历史 Phase8 资源不能直接复用。**

旧 10 项失败逐项整改（未修改正常支付/送达规则）：

| 原失败测试 | 原因与保留的验证 |
| --- | --- |
| checkout GET | checkout 不承接 GET；改为验证委托真实订单读路由，并断言未认证 401、无 DB 写入 |
| security unpaid delivering→delivered | owner 角色夹具缺失且 generic delivered 已退役；补身份夹具，断言 409 且未开写事务 |
| new→accepted | 旧 SELECT 模板不匹配实际锁单语句；调用真实模块，准确模拟 SQL，确认 COMMIT/状态事件 |
| stale action | 同上；断言原状态未变、ROLLBACK |
| repeated accepted | 同上；首次成功后第二次 409 |
| cancellation reason | 同上；缺原因拒绝、合法取消、送达后拒绝 |
| state unpaid delivered proof | 普通 status 不承接送达；断言转专用凭证接口且无更新 |
| failed event rollback | 旧 Mock 提前出错未触及事件；修正事务暂存，确认真实事件故障注入、ROLLBACK、无 COMMIT、状态未推进 |
| safety missing proof | 正确为 409/要求验证凭证 complete 接口，而非过时 400 |
| safety unpaid plausible proof | 正确为 409/专用接口，保留绝不修改状态断言 |

新增四条未支付 accepted/preparing/delivering/abnormal 拒绝用例；专用 complete 的无有效凭证拒绝仍在既有 Phase7 回归中。旧三文件共 27 项通过；不是把通用 delivered 接口恢复成接受任意 proofKey。

## 五、本轮文件范围与启用顺序

本轮新增：`config/staging-deployments.json`；`src/stagingDeployment.mjs`、`src/stagingPermissions.mjs`；`scripts/migrate-staging.mjs`；`testing/staging/{migration-plan.json,migration.mjs,identity-bootstrap.sql,postgres-target.mjs}`；`tests/helpers/staging-profile.mjs`；`tests/staging-deployment-safety.test.mjs`、`tests/staging-postgres.integration.test.mjs`；本文。

本轮修改：`src/{stagingPayments,orderWorkflow,server}.mjs`；未执行的 `sql/021_staging_payment.sql`；`.env.example`；`tests/staging-payments.test.mjs`；`tests/helpers/business-phase7-db.mjs`；三份旧 order-security/order-state-transitions/order-status-safety 测试；`testing/phase8-v2/business.mjs` 仅导出复用 seed 并允许指定顾客；支付说明/契约和 TEST_STATUS/TEST_HISTORY。修改 V2 白名单内源文件意味着既有 runner bundle 已不匹配，若以后选择容器运行，必须重新审核/构建，不能用旧镜像执行新代码。本轮没有构建或批准 runner。

已有未提交的初版模拟支付前端、报表、购物车/首页/底栏文件均保留；不等于本轮重新改动它们。正式部署文件范围须在独立审查中整体核对这些尚未提交的源码，不能只发布单个 stagingPayments 文件。

严格启用次序：

1. **现在：**审查本轮 diff、离线计划和权限计划；授权准备全新隔离 PG，实际执行 11 场景以及 001—021 后验收。当前不允许部署。
2. **另行授权只读 Neon/Render 元数据：**实际 service/branch/endpoint、DB名、三角色、继承/owner/PUBLIC ACL、001—020 账本/实际 catalog；不暴露凭据。
3. **另行授权身份登记与迁移：**确认备份/维护窗口与同意的精确 plan SHA；DBA建立独立锚点和必要角色权限；由受控工具原子执行 021 并验收。当前这些均未执行。
4. **另行授权 Render 配置/部署：**保持 NODE_ENV=production；审核部署档案；设置 APP_ENV=staging、两个身份 ID、精确测试开关、应用角色 DB 连接；平台 service ID 必须匹配；迁移角色/管理角色秘密不进入 API。先关闭功能部署，再对限定测试用户限时授权、启用，验证真实接口/库存/报表；生产仍禁用。
5. **微信预览：**前后端配套后，另行重新编译既有 phone-preview，确认模拟标签与确认提示；不新增预览项目。现有默认预览 EPERM 占用需先解除。本轮未重新生成预览，不宣称真机通过。

实际测试数量和静态结果以 TEST_STATUS/TEST_HISTORY 本轮记录为准；上线仍需要真实 PG、Staging 端到端、R2 凭证、真机与客户真实支付模块验收。

## 2026-10-28 V2复用计划更正（只读复核）

上文“必须另建全新隔离集群”是初版loopback测试入口的限制，不是本轮继续建设新环境的建议。当前用户要求复用既有V2，未授权任何Docker/DB写入。既有V2仍created，恢复被原容器规格摘要不匹配阻断；没有重新初始化或重建。

后续优先同一V2完成历史001—020和26项验收，再明确授权021升级及新阶段回执，保留旧基线/ready证据。现有11项默认跳过；其loopback/三角色入口尚不能在V2执行，需要扩展现有固定runner用途/grant/角色和测试身份适配，不放宽URL隔离、不发布端口、不创建平行框架。当前源码读021列且新增staging模块未在旧runner闭包中，不能直接重打包执行020测试。021迁移中途失败的真实DDL/ACL/账本/审计整体回滚等覆盖仍待补齐。

准确差异、版本衔接、389项离线结果（375通过/3失败/11跳过）、恢复授权前置条件和外部部署步骤见[现有恢复说明](../docs/testing/PHASE8_V2_RECOVERY.md)。本轮无Neon/Render操作；本地测试通过后仍须单独完成真实元数据核验、身份登记/迁移及部署授权。

## 2026-10-28 21:35 UTC+8：021固定运行器源码已接通，尚未运行

新增upgrade021/ready021/business021/payments021及version2严格grant，staging021独立镜像版本；54文件封存，默认020边界不变。schema021实现原子增量账本/审计/独立catalog基线，保留历史20基线；payments021仅固定三角色凭据、5挂载，复用共享11场景，business021复用已有26项。未来DBA登记脚本enroll021.sql不由runner自动执行，本轮未登记角色/锚点，也未构建/批准镜像或执行SQL。

最终离线446项，435通过/0失败/11跳过；真实PG均未运行。部署/Neon仍禁止，当前镜像批准不覆盖新源码。A旧现场恢复仍须接受证据缺口及绑定追加登记的恢复机制；优先B保留旧现场、复用现有全部测试代码与审核成果，补固定新资源配置和完整登记，再单独授权创建/测试。详细契约、权限、日志和风险比较见[恢复说明](../docs/testing/PHASE8_V2_RECOVERY.md)最新节。
