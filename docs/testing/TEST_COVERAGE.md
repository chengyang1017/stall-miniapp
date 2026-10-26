# 微信商城测试覆盖矩阵

审查日期：2026-10-26；源码基线 `b18a5d22974bf52205b542c71d3065d85a8a330e`。
本次仅做源码和 Git 盘点，没有运行下述测试。证据分类及最近历史结果见 [TEST_STATUS](TEST_STATUS.md)。

## 状态含义

- **已验证**：仅对明确注明环境、运行及范围的事实适用，不代表模块整体通过。
- **部分验证**：只有历史离线/模拟/契约覆盖，仍缺真实环境或完整链路。
- **失败**：有未闭环的实际失败记录；不能把未执行当失败。
- **未验证**：无足够运行证据，源码或脚本存在也不算通过。
- **受阻**：有明确的环境、授权或外部模块前置条件。

当前不将任何整个业务模块标为全面已验证。B1 的旧断言失败已修复，不能再列为当前失败；最新 124/124 仍是历史报告。

## 功能矩阵

下表测试文件均位于 `backend/tests/`，除另有说明。SRC 表示已查看定义，HISTORY 只覆盖实际报告的子集。

| 模块 | 状态 | 实际覆盖与源码证据 | 仍缺的验收 |
| --- | --- | --- | --- |
| 顾客端 | 部分验证 | `frontend-navigation*.test.mjs`：页面注册、导航、VM 真实页面函数、订单分页及身份切换；88 项 HISTORY | 微信渲染、登录、真机和完整购物链路 |
| 商家端 | 部分验证 | navigation runtime、`merchant-entry-contract.test.mjs`、跨角色 handoff：授权入口、导航、局部路由 | 商家全部页面、多设备配置与真实角色授权 |
| 商品管理 | 部分验证 | `catalog-security.test.mjs`、`product-discount.test.mjs`、`merchant-customer-catalog-checkout.test.mjs`：权限、价格、折扣、上架状态；后者 8 项 HISTORY | 新建/复制幂等、草稿、计划、库存编辑、组合搜索/批量的真实 PG 和 UI |
| 商品图片 | 部分验证 | `product-image-upload.test.mjs` 为替换 auth/S3 的路由模拟；`proof-r2-contract.test.mjs` 为源码契约；[图片生命周期](../../backend/src/imageLifecycle.mjs) | 真实 R2 上传、引用共享、替换失败、归档保护、清理审批与并发 |
| 购物车 | 部分验证 | navigation guards：云端/本机空车、门槛、加载错误和合法结算入口；8 项 HISTORY | 真实商品更新、缺货、多设备和微信交互 |
| 结算 | 部分验证 | P7 实际 `checkoutRoute` + SQL 适配器；catalog-checkout 手动注入部分依赖；服务器价格及快照 | 真实 PG 原子性、营业/区域/时段变化、网络中断重试 |
| 订单生命周期 | 部分验证 | P7、status-handoff、navigation lifecycle/phase6；商家动作、取消、异常、顾客读取和过期响应 | 真实 DB 多连接冲突、照片完成链路、微信端联调 |
| 支付状态守卫 | 部分验证 | P7-44—49：有限/不限库存的 paid/unpaid 分支；[统一门槛](../../backend/src/orderWorkflow.mjs) | paid 仅为夹具分支输入，不能证明真实收款 |
| 真实支付、退款与对账 | 受阻 | [支付契约](../../backend/PAYMENT_INTEGRATION_CONTRACT.md) 明确由客户负责；`review-purchase-boundary.test.mjs` 拒绝把 paid 标签当可信评价凭据 | 客户接口、验签/金额/AppID 校验、通知幂等、退款和晚到付款策略 |
| 库存一致性 | 部分验证 | P7：预留、到期/取消释放、售罄保留、多商品故障、单次释放；实际函数在内存 SQL 模型执行 | PG CHECK/FK/流水触发器、真实竞争、库存与支付协调 |
| 数据库事务 | 未验证 | P7 写集合模型；B0 原始 SQL/账本事务方案；`live-db-integrity.test.mjs` 脚本存在 | 实际迁移、回滚、原子提交、连接终止及最终持久状态 |
| 并发及行锁 | 未验证 | P7 FIFO 锁是测试假设；P7-31 不证明 SKIP LOCKED；`live-db-row-locking.test.mjs` 为未执行真实 PG 探针 | FOR UPDATE、唯一索引等待、SKIP LOCKED、40P01、锁顺序及超时 |
| 权限与安全 | 部分验证 | auth/catalog/order/proof 单元或契约；P7 店铺/身份模拟；B1 124 项 HISTORY 验证基础设施决策 | 真实数据库 ACL、跨店铺 SQL 最终状态、微信会话、HTTPS和运维权限 |
| 营业、配送与地址 | 部分验证 | `delivery-rules.test.mjs`、P7 闭店边界；实际模块含规则、版本及地址归属；前端已有导航覆盖 | 区域/时段组合、配置冲突、地址 CRUD、服务端联调 |
| 客服消息 | 部分验证 | `merchant-customer-support-handoff.test.mjs`：真实路由文本加替换依赖，独立会话/幂等/未读；本轮未运行 | 真 PG、多设备分页/轮询、异常恢复及权限 |
| GPS 追踪 | 部分验证 | `merchant-customer-tracking-read.test.mjs` 和角色契约：顾客读取归属、位置过期、禁止写入；本轮未运行 | 真机主动授权、节流、暂停/结束、服务端保留周期及隐私 |
| 商品评价 | 部分验证 | `review-purchase-boundary.test.mjs`：已送达/paid 仍不足以证明可信购买，审核未配置保持 pending | 客户可信付款、真实 PG、内容审核、私有图片及真机 |
| 数据导出、备份与恢复 | 未验证 | [备份说明](../../backend/scripts/README.md)、archive/backup/verify 源码；没有专门灾难恢复通过记录 | 真实导出权限/CSV、DB+图片一致性、异地副本和隔离恢复演练 |
| 构建与预览 | 部分验证 | build-role、combined-delivery、preview audit/guard 为静态或工具模拟；[三目标脚本](../../package.json) 存在 | 本基线三目标纯构建、微信开发工具编译、正式 AppID 配置 |
| 微信小程序真机 | 未验证 | VM 的 wx mock 不是真机；没有本轮或可追溯整体验收日志 | iOS/Android、登录、域名、图片、定位隐私及网络切换 |
| 正式部署与交付 | 受阻 | [集成准备](../../backend/INTEGRATION_READINESS.md) 明确不能据源码直接上线 | 支付、真实 DB、备份恢复、生产配置、回滚及双方签收 |

## 测试清单与数量口径

本次用 `git ls-files` 盘点到 **40 个已跟踪测试文件：backend/tests 下 39 个，tests 下 1 个**。所谓“前端测试”主要也放在 backend/tests；不是再加一个重复目录。

### 与历史数量明确关联的测试组

| 文件/范围 | 当前源码参数化展开口径 | 历史运行证据 |
| --- | --- | --- |
| [frontend-navigation.test.mjs](../../backend/tests/frontend-navigation.test.mjs) | 10 | 前五轮合计中的部分，不另宣称本轮运行 |
| [frontend-navigation-runtime.test.mjs](../../backend/tests/frontend-navigation-runtime.test.mjs) | 9 | 同上 |
| [frontend-navigation-flows.test.mjs](../../backend/tests/frontend-navigation-flows.test.mjs) | 11 | 同上 |
| [frontend-navigation-lifecycle.test.mjs](../../backend/tests/frontend-navigation-lifecycle.test.mjs) | 11 | 同上 |
| [frontend-navigation-guards.test.mjs](../../backend/tests/frontend-navigation-guards.test.mjs) | 8 | 前五份合计 49；不是五轮各自的日志映射 |
| [frontend-navigation-orders-phase6.test.mjs](../../backend/tests/frontend-navigation-orders-phase6.test.mjs) | 39：24 普通定义 + 4 隐藏/卸载 + 7 无效响应 + 4 finally 竞态 | 第一至六轮最终 88 = 49 + 39 |
| [business-consistency-phase7.test.mjs](../../backend/tests/business-consistency-phase7.test.mjs) | 49 个命名注册位置，参数化后 63；其中 2 个模型自检 | 第七轮 63，通过口径不是 63 个数据库集成测试 |
| [merchant-customer-catalog-checkout.test.mjs](../../backend/tests/merchant-customer-catalog-checkout.test.mjs) + [status-handoff](../../backend/tests/merchant-customer-status-handoff.test.mjs) | 8 + 6 = 14 | 第七轮 165 合并运行中的既有子集；其依赖替换范围不同于 P7 |
| [phase8-safety.unit.test.mjs](../../backend/tests/phase8-safety.unit.test.mjs) | 67 | B0/B1 的同一原安全组 |
| [phase8-remediation.unit.test.mjs](../../backend/tests/phase8-remediation.unit.test.mjs) | 当前 57；B0 时 44 | B1 共 124 = 67 + 57；替代先前 111，不叠加 |

此处数量根据实际定义和参数数组核对，是源码清点，不是本轮 node:test 的运行时登记或通过结果。普通 `test(`/`run(` 文本位置数不等于展开用例数。

### 其余已存在文件（本次只读，未给予新的通过结论）

下列 29 个文件加上前表的 11 个文件，构成上述 40 个文件清单：

| 测试文件 | 类型与关注点 |
| --- | --- |
| `auth-sessions.test.mjs`、`wechat-login.test.mjs` | 实际认证函数 + DB/HTTP stub；非微信真实登录 |
| `catalog-security.test.mjs`、`product-discount.test.mjs` | 商品权限及折扣函数/路由单元 |
| `product-image-upload.test.mjs` | auth/S3 替换后的上传路由 |
| `checkout-validation.test.mjs`、`checkout-transactions.test.mjs` | checkout + 模拟 DB；后者存在旧夹具兼容风险 |
| `checkout-mutation-audit.test.mjs` | 产生临时变异源码并跑子进程；不是此次允许的文档检查 |
| `order-security.test.mjs`、`order-state-transitions.test.mjs`、`order-status-safety.test.mjs` | 权限/状态及模拟 SQL；旧匹配规则需维护 |
| `delivery-rules.test.mjs` | 营业配送校验函数 |
| `merchant-customer-order-handoff.test.mjs` | ETA/内部备注/顾客读取及局部路由模拟 |
| `merchant-customer-support-handoff.test.mjs` | 会话、回复、未读和隔离的路由模拟 |
| `merchant-customer-tracking-read.test.mjs` | 定位读取权限及状态模拟 |
| `proof-access-safety.test.mjs`、`proof-r2-behavior.test.mjs`、`proof-r2-contract.test.mjs` | 凭证权限、照片完成及签名读取；混合模拟/契约 |
| `review-purchase-boundary.test.mjs` | 购买凭据与审核边界 |
| `build-role-contracts.test.mjs`、`cross-role-contracts.test.mjs`、`combined-delivery-contract.test.mjs`、`merchant-entry-contract.test.mjs` | 模块/页面注册/路由的静态契约 |
| `miniapp-preview-audit.test.mjs`、`miniapp-preview-build-guard.test.mjs` | 预览扫描和构建工具保护，不是微信真机 |
| `live-db-integrity.test.mjs`、`live-db-row-locking.test.mjs` | 真实 pg 入口，有外部访问能力，未执行 |
| `staging-api-live.test.mjs` | 真实 HTTPS staging 查询，未执行 |
| [tests/phase13_local_rules.test.cjs](../../tests/phase13_local_rules.test.cjs) | 本机 TS 函数 + VM/wx storage mock，Node 24 类型剥离器；旧路径兼容性未复测 |

## 安全运行与证据补齐

- 不默认运行 `node --test backend/tests/*.test.mjs`：会包含真实 PG/staging 入口和临时源码变异测试。
- 文档中的离线白名单仅指历史明确审查过的文件；运行前仍需阅读当前版本、确认授权及环境。
- 旧 live-db 探针不等于 B0 安全夹具，不能因库名含 test/dev 就视为隔离充分证据。
- 真 PG 必须在另行授权的新实例上通过 B0 环境/身份核验；验证最终数据库状态，不用内存模型自证数据库约束。
- 新增业务或修改测试后，同步更新此矩阵和历史；没有原始日志的“通过”一直保留 HISTORY 标签。
