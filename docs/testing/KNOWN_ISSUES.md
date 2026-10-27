# 已知问题、修复记录与剩余风险

更新日期：2026-10-27；本次Engine/构建前只读审计基线 `80114f191668a8c9adb1da6b4de81a4a7ffadfef`。前轮供应链基线为 `dd83d09d51797c05aff8a5a0db8e3793d49c54cd`；B3-R历史设计基线为 `70145de43af8d649f43883dd6254af639cba8cac`，既有记录仍以各历史提交为准。
上述为B3-R历史设计时点。最新B3-V2基线 `083f67548d044c29ad4a9e0497d791e4348fd5f8`：已实现独立运行器源码，原138项加新97项共235项离线通过；未实际运行Docker资源或SQL、未恢复旧现场。已修复表示源码/指定离线范围成立，不表示真实业务环境已验收。

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
| B3-IMAGE | 带标签审核渠道拼入固定摘要引用，本机无法解析 | `85cceff85b8053cc5973a5f58b2f4964c5bf1f80` 改为 postgres@digest，审核渠道/摘要/ID检查保留 | 当时138项离线测试及真实只读镜像检查通过；与后续网络故障分开 |

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
| R-01 | 准备完成，持续保护 | B2 四份仓库外凭据/受限目录/UUID 已准备，B3 创建前复核；实际创建后回执非空，不再符合 first 重跑条件。不得覆盖、删除或公开密码/nonce |
| R-02 | 部分创建，受阻 | Phase8 容器 running/healthy，bootstrap有完成日志，但资源验收失败/回执failed；未独立 SQL 身份/角色核验，001—020迁移、ready/结构/约束未执行，不得进入B4 |
| R-03 | 未验证 | 真实多连接库存竞争、advisory/行锁、唯一约束等待、SKIP LOCKED、死锁40P01、未知COMMIT及最终状态；内存锁不能替代 |
| R-04 | 引用兼容已修复，历史保留 | 固定引用已改为 postgres@digest，原登记信息未变；早期 tag+digest 间歇行为仍不编造根因，不能把新网络故障误报为镜像失败 |
| R-05 | 受阻 | 可信支付、退款、通知及对账由客户负责。new队列仍可能包含unpaid，不能据此接单；队列口径与支付协议待确认；paid分支测试不证明收款 |
| R-06 | 未验证 | 老夹具可能与当前协议不兼容：checkout-transactions 的旧手机号/缺失note、order-state-transitions 的旧SQL匹配、order-status-safety 的旧送达断言；既有P7报告已提示，本次未执行，不报告具体失败数 |
| R-07 | 未验证 | 旧 live-db 探针隔离检查弱于 B0，仅有 test/dev 名称条件等；不能当作 B0 写入/环境验收入口；迁移和真实测试须复用新安全边界 |
| R-08 | 受阻 | [server.mjs](../../backend/src/server.mjs) 启动监听自动运行库存及定位保留任务；文档或单元测试不得随意 import/启动服务 |
| R-09 | 未验证 | 原开发迁移器存在 SQL 与账本分开记录的中断窗口；B0 新库初始化原子方案并未改造生产迁移系统。中断必须停止核对，禁止盲目重跑 |
| R-10 | 未验证 | [备份说明](../../backend/scripts/README.md) 指出校验摘要、pg_restore索引不等于恢复成功；DB JSON引用不包含R2实体；协调快照/隔离恢复尚无验收 |
| R-11 | 受阻 | 微信 AppID、合法域名、会话、定位隐私与类目权限、评价UGC审核、私有桶及R2访问需各自配置和真实验收 |
| R-12 | 未验证 | 历史通过记录缺少集中原始TAP/CI日志；本档案保留报告来源，不伪造日志。今后每轮记录精确SHA、命令、环境、日志与副作用 |
| R-13 | 已记录 | 历史 backend 文档仍保留早期017/018迁移、未批准镜像或MSYS失败等时点描述；当前迁移清单为020、镜像已登记，不能机械照旧文启用。本任务不修改那些原文件 |
| R-14 | 已定位设计冲突，未修复 | internal-only bridge + host loopback发布在当前 Engine未产生实际映射；请求保存在HostConfig、运行态Ports空、docker port空、Windows无监听，policy正确拒绝。匹配Engine GitCommit源码，非纯JSON差异；禁止放宽规则冒充通过 |
| R-15 | bridge变化已有解释，影响证据有限 | 本机持久日志证明Engine在12:02:36—43重新初始化，旧bridge缓存随后注销、新ID登记，早于12:03:29首次创建命令。当前无默认bridge成员/配置依赖，未见数据损坏证据；原先停止/唤醒触发原因及历史应用全链路影响未验证 |
| R-16 | 恢复入口缺失，受阻 | B0 first不可重跑；restart拒绝failed、要求停止容器及ready，不支持当前运行且仅bootstrap的实例。须另行设计绑定身份、保留原失败回执、独立追加审计和bootstrap只读验收的恢复流程；严禁改回执为成功、清空卷或删除容器探路 |
| R-17 | V2源码及97项离线回归完成，真实环境受阻 | A方案已实现独立internal-runner-v1控制器/运行器/授权协议；runner镜像未批准，无Docker socket/运行时安装；实际isolated/宿主/出口隔离与Windows挂载必须另行验收，不能凭标志通过 |
| R-18 | 旧实例不可直接接管写测试 | 原HostConfig仍含发布请求，原网络不是新A的isolated规范；保留原ID/UUID/nonce/failed审计，无损只读识别有条件可设计。默认另建独立V2实例，不复用旧卷/材料，不静默豁免旧端口校验 |
| R-19 | 本轮复核仍受阻：Engine未恢复可达 | 客户端29.6.2、Compose5.3.1、Buildx0.35.0可用；desktop-linux本机管道仍不存在/不可达。已停止依赖Engine的镜像/store/builder/旧资源查询，未启动Docker。不得把未知写成镜像缺失或containerd不可用 |
| R-20 | 固定runner引用需真实产物验证 | 首选containerd image store + image exporter的canonical name，必须实际image inspect固定引用/RepoDigest/ID/平台/label；普通build或load不能无条件保证。私有registry带地址前缀不符合现有精确repo规则，禁止去前缀或伪造digest绕过 |
| R-21 | 41项内容完整性已核验；专用cache/Linux安装仍未验证 | 本轮41/41真实SHA512、包名版本、索引校验与归档依赖字段匹配，未发现指定敏感形态/危险归档路径；这是内容一致性证据，不是恶意代码/漏洞全审计。全局7150桶仅选41，不读其余7109桶内容，禁止整库复制；仍须独立精选/封存及Linux npm ci验收 |
| R-22 | 已有完整候选输入审计；物理context/产物尚未生成 | 新增PHASE8_V2_BUILD_INPUT_AUDIT.json列34源码的LF及raw hash、41依赖真实SRI/SHA256、Dockerfile/base/计划参数和工具状态；源bundle、审计清单摘要、正式context、OCI和Image ID严格区分，后两类不能预填。未证明逐字节重复构建 |

风险表中的“未验证”不是已证实业务缺陷；“已修复”也不是正式交付验收。发现新失败先保留原始断言及日志，确认夹具还是业务问题，未经授权不改生产规则。

R-14—16 的精确本地日志位置、时间线、匹配版本源码链接、三个网络设计选择及其授权前置条件见 [历史第10节](TEST_HISTORY.md#10-第八轮-b3首次创建失败的只读诊断)。本次只完成诊断，B4仍禁止；没有执行网络变更、数据库连接/SQL、迁移、修复或重启。

B3-R补充见 [详细网络/恢复设计](../../backend/PHASE8_NETWORK_RECOVERY_DESIGN.md) 与历史第11节。A/B/C比较、旧实例六问、只读probe、只追加恢复审计及新实例分阶段授权均已写明，但没有实现新运行入口或执行操作。原138项通过不关闭R-14/R-16/R-17/R-18；B3仍失败，B4继续阻塞。

## 关闭规则

B3-V2 增补：原R-14/R-16/R-18继续开放；原失败实例没有改动或接管。V2实施不关闭旧B3失败、不解锁B4。新门槛包括：固定Node base与runner镜像/离线依赖来源审核、新材料和UUID、独占Docker管理窗口、真实网络/UID/ACL挂载、bootstrap独立只读验收。检查/创建不是跨资源原子操作，不能抵御宿主管理员并行篡改；grant只消费一次，失败不会自动恢复或清理。真实事务/并发/回滚/死锁/连接故障仍未执行。完整限制见 [V2 README](../../backend/testing/phase8-v2/README.md)。

每项记录由项目维护方按职责处理，不虚构具名负责人。关闭时填写修复提交、实际复现/复测命令、环境、结果和日志；外部依赖由客户/运维提供确认。不能删除历史失败、用跳过替代通过，或将旧通过结果覆盖新失败。
