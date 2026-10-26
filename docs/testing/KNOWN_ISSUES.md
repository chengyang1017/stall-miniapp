# 已知问题、修复记录与剩余风险

更新日期：2026-10-26；源码基线 `b18a5d22974bf52205b542c71d3065d85a8a330e`。
本次未重跑测试。已修复表示 Git/SRC 可确认修复存在，相关“通过”均为历史运行报告，不表示真实环境已验收。

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
| R-01 | 受阻 | B2 尚未执行。四份不同的仓库外密码、私人回执目录及全新 UUID 须单独授权准备；不将 secret 或完整连接串写入档案 |
| R-02 | 未验证 | Phase8 专用数据库尚未创建（按用户历史报告，本次未查询环境）；bootstrap、001—020迁移、实际 ACL、结构及约束尚无通过证据 |
| R-03 | 未验证 | 真实多连接库存竞争、advisory/行锁、唯一约束等待、SKIP LOCKED、死锁40P01、未知COMMIT及最终状态；内存锁不能替代 |
| R-04 | 待复核／部分验证 | 固定 tag+digest 引用曾失败、后续 ensureImage 通过；[登记备注](../../backend/testing/phase8/image-approval.json) 明确原因未确定。不是已修复的稳定性缺陷，首次创建前重新核验 |
| R-05 | 受阻 | 可信支付、退款、通知及对账由客户负责。new队列仍可能包含unpaid，不能据此接单；队列口径与支付协议待确认；paid分支测试不证明收款 |
| R-06 | 未验证 | 老夹具可能与当前协议不兼容：checkout-transactions 的旧手机号/缺失note、order-state-transitions 的旧SQL匹配、order-status-safety 的旧送达断言；既有P7报告已提示，本次未执行，不报告具体失败数 |
| R-07 | 未验证 | 旧 live-db 探针隔离检查弱于 B0，仅有 test/dev 名称条件等；不能当作 B0 写入/环境验收入口；迁移和真实测试须复用新安全边界 |
| R-08 | 受阻 | [server.mjs](../../backend/src/server.mjs) 启动监听自动运行库存及定位保留任务；文档或单元测试不得随意 import/启动服务 |
| R-09 | 未验证 | 原开发迁移器存在 SQL 与账本分开记录的中断窗口；B0 新库初始化原子方案并未改造生产迁移系统。中断必须停止核对，禁止盲目重跑 |
| R-10 | 未验证 | [备份说明](../../backend/scripts/README.md) 指出校验摘要、pg_restore索引不等于恢复成功；DB JSON引用不包含R2实体；协调快照/隔离恢复尚无验收 |
| R-11 | 受阻 | 微信 AppID、合法域名、会话、定位隐私与类目权限、评价UGC审核、私有桶及R2访问需各自配置和真实验收 |
| R-12 | 未验证 | 历史通过记录缺少集中原始TAP/CI日志；本档案保留报告来源，不伪造日志。今后每轮记录精确SHA、命令、环境、日志与副作用 |
| R-13 | 已记录 | 历史 backend 文档仍保留早期017/018迁移、未批准镜像或MSYS失败等时点描述；当前迁移清单为020、镜像已登记，不能机械照旧文启用。本任务不修改那些原文件 |

风险表中的“未验证”不是已证实业务缺陷；“已修复”也不是正式交付验收。发现新失败先保留原始断言及日志，确认夹具还是业务问题，未经授权不改生产规则。

## 关闭规则

每项记录由项目维护方按职责处理，不虚构具名负责人。关闭时填写修复提交、实际复现/复测命令、环境、结果和日志；外部依赖由客户/运维提供确认。不能删除历史失败、用跳过替代通过，或将旧通过结果覆盖新失败。
