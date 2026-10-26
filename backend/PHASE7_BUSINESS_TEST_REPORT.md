# 第七轮：商城核心业务一致性与并发测试

日期：2026-10-26。测试环境：本机 Node.js v24.16.0；未启动后端。

本文件已随第七轮复核整改更新：保留原49项覆盖，新增14项，共63项；P7-31经授权重设计，P7-29/30增加精确事件断言。整改开始时原三个未跟踪文件完整保留。

## 1. 基线、安全范围和结果

- 开始时 HEAD 为 `2529b627f22882473cdbc62fff7422d0614e8087`，工作区为空；本地 `origin/main` 也指向该提交。
- origin 为 `https://github.com/chengyang1017/stall-miniapp.git`。只读 `git ls-remote --exit-code origin refs/heads/main` 尝试失败：`getaddrinfo() thread failed to start`。因此**没有确认在线远程 HEAD**，不能用本地远程引用代替在线核对。
- 未提供 `STALL_AUDIT_CONFIRM`、`STALL_AUDIT_DATABASE_URL`，没有可确认的隔离数据库。未读取真实数据库连接串、未连接任何数据库。
- 第七轮原49/49通过；整改新增断言后，未修业务/适配器前 **63项：54通过、9失败**；修复后 **63通过、0失败、0跳过、0取消**。其中2项验证适配器自身，61项执行实际业务模块。
- 前六轮前端导航回归仍为 **88/88**。另运行现有后端下单8项、状态交接6项，**14/14**。整改最终合并运行 **165/165**；只按前六轮加当前第七轮计为151项。
- 已复现并修复付款门槛缺口和事件备注模型错误，重设计无效的锁候选场景。退款、真实支付、真实数据库并发仍未验证，不计为通过，也没有用skip占位来增加测试数。
- 业务修改仅`src/orderWorkflow.mjs`的统一付款校验；同时更新支付契约、本报告及第七轮测试/适配器。配置、迁移、前六轮和其他旧测试均未修改。没有提交、推送、迁移、部署、生产API、R2、备份/恢复/清理操作。

## 2. 真实实现与覆盖缺口分析

本轮先阅读真实源码、迁移、既有测试和支付契约，再编写测试，没有复制业务算法作为被测对象。

| 源码证据 | 实际实现与本轮关注点 |
| --- | --- |
| `src/checkout.mjs` / `checkoutRoute` | `POST /v1/stores/:slug/orders`。实际authenticate、请求校验、参数化SQL、幂等指纹、事务级advisory锁、商品UUID顺序行锁、服务器价格快照、多商品写入、有限库存条件扣减、预留和流水，提交后才响应 |
| `src/inventory.mjs` / `recordMovement`、`resolveOrderInventory`、`sweepInventory` | 下单预留可售库存15分钟，仍为unpaid；paid预留转committed，不再次扣减；合资格未支付取消/过期/支付失败释放；后台任务锁订单并SKIP LOCKED。实际调用sweep函数，不启动定时worker |
| `src/orderWorkflow.mjs` / `orderWorkflowRoute` | 商家授权店铺和owner/manager写权限；订单FOR UPDATE；既有状态机；状态、库存解析和事件同事务；普通status接口不能替代带凭证的送达完成接口 |
| `src/auth.mjs` / `authenticate`、`permittedStore` | 实际Bearer格式校验、令牌SHA-256查会话、按subject和slug查商家成员。只在测试内存中提供会话和成员，不替换认证函数 |
| `src/deliveryRules.mjs` / `verifyDelivery` | 实际营业和配送校验、北京时间日期、服务器时钟；商品锁读取后再次核对营业边界 |
| `sql/003_checkout.sql` | `(store_id, customer_subject, checkout_key)`条件唯一索引，订单幂等指纹、地址和时段快照 |
| `sql/009_product_inventory.sql` | 库存范围和流水算术CHECK；预留主键；店铺/订单/商品复合外键；流水操作键唯一；流水append-only触发器。只读源码，**没有在数据库执行/验证这些约束** |
| `sql/001_init.sql`、`sql/005_order_workflow.sql` | 订单、明细、支付事件和履约事件结构；订单商品成交价格快照。支付事件唯一约束不代表支付验签已实现 |
| `miniprogram/utils/cloudCheckout.ts` / `createCloudOrder` | 按身份/店铺缓存相同请求的重试键，成功后移除；更换购物车内容会生成新键。本轮后端测试通过显式相同键重放；未新增该客户端函数的动态测试 |
| `miniprogram/pages/checkout/checkout.ts` / `submitCloudOrder` | 已有提交中标志及身份约束；不把创建订单当作付款成功。本轮保持全部前端回归 |

既有测试选择与缺口：

- `merchant-customer-catalog-checkout.test.mjs` 8项：服务器价格、折扣变化/过期、上下架/售罄、有限库存、同键重放。其库存/配送/认证依赖有替换，单客户端模型不模拟回滚或锁竞争。
- `merchant-customer-status-handoff.test.mjs` 6项：状态交接、非法/重复转换、取消原因、客户读取和商家写权限。没有有限库存真实解析或并发事务模型。
- 六个`frontend-navigation*.test.mjs`共88项：页面调用、导航、生命周期、订单分页与身份切换等；不代替后端事务测试。
- 源码检查发现部分旧夹具已过时：`checkout-transactions.test.mjs`仍用不合法手机号、缺少note和旧SQL匹配；`order-state-transitions.test.mjs`匹配旧的订单SELECT；`order-status-safety.test.mjs`部分断言仍期待普通status处理送达。**未执行或修改这些旧文件，也未将其算作本轮通过项**。需要另行授权维护夹具；不能把夹具不匹配当业务缺陷。
- `live-db-integrity.test.mjs`、`live-db-row-locking.test.mjs`需要明确确认的隔离库；`staging-api-live.test.mjs`涉及外部环境。本轮不运行这些文件，不盲目执行`backend/tests/*.test.mjs`。

## 3. 测试方法与证据边界

新增测试直接import实际checkout、orderWorkflow、inventory模块及其实际认证、配送依赖。未import `server.mjs`，避免启动服务或库存后台任务。`http://unit.invalid/...`仅作为内存URL传给路由，未发送HTTP请求。

`tests/helpers/business-phase7-db.mjs`是严格的**测试专用SQL协议适配器**：

- 不识别的SQL直接抛错；关键SQL检查权限谓词、店铺范围、FOR UPDATE、条件更新和稳定锁顺序。
- 每连接独立写集合，COMMIT才写入模型最终状态；ROLLBACK丢弃本事务变更。记录实际业务代码发出的事务、SQL、参数和连接释放。
- FIFO互斥模型模拟订单/商品锁和幂等advisory锁。测试显式等待锁持有、排队屏障后放行，**没有用固定sleep猜测并发顺序**。8秒timeout仅用于发现测试悬挂。
- 故障注入在指定实际SQL调用处抛错，包括第二条明细、第二条流水、提交前、状态审计；然后比较商品、订单、明细、预留、流水、事件的完整最终状态。
- 响应丢失用res.end在COMMIT后抛错模拟；这是业务函数级模拟，不是真实TCP断连或数据库连接中断。
- worker候选由测试明确提供，适配器**不执行worker的WHERE、支付事件EXISTS、时间表达式和PostgreSQL查询计划**；仅验证实际worker对已选候选的解析、提交/回滚及互斥处理。到期边界的商家接口测试执行了实际分支。
- paid/payment_failed为内存夹具分支输入，不是支付验签、伪造真实交易或改写任何真实订单。
- 不执行PostgreSQL SQL；没有证明真实数据库的MVCC、行锁、唯一约束/外键/触发器、死锁、实际worker候选选择正确。适配器的锁与提交行为是测试前提，不能拿通过结果反过来证明这些数据库机制。
- 事件INSERT现在按实际六列VALUES解析字符串常量（含逗号、转义单引号及原始空格）、参数位置和NULL，不再按system身份猜参数位置；未知表达式或缺少参数明确报错。仍不是通用SQL解释器。
- 独立复核指出适配器部分查询会自行按参数施加过滤，不能据此证明实际SQL隔离条件永远正确；本次没有扩大改造SQL适配器，相关负向数据库断言留待隔离PostgreSQL集成。

## 4. 新增测试逐项清单

测试编号与文件中的名称一一对应；带后缀的参数化展开各计1项。以下共63项均通过，失败0、跳过0。`P7-01`和`P7-48`是夹具自检，其余61项为模拟API/事务业务测试。

| 编号 | 实际断言行为 |
| --- | --- |
| P7-01 | 未提交写入对模型外部不可见，未知SQL报错，ROLLBACK还原模型；连接和锁清理 |
| P7-02 | 忽略客户端价格/库存，服务器总价2400分；保存明细快照；unpaid、15分钟held、预留关联和库存流水10→8 |
| P7-03 | 连续相同键重试3次都返回同一订单，订单、库存、明细和流水不变 |
| P7-04 | COMMIT后响应丢失，同键重试返回已提交订单，不再次扣库存 |
| P7-05 | 相同键更改数量返回409 idempotency_key_reused，完整最终状态不变 |
| P7-06 | 两个同键请求在advisory锁排队；201/200，同一订单，只预留一次 |
| P7-07 | 两个同键不同购物车并发请求，后者409，只有首单和一次扣减 |
| P7-08 | 同键可分别属于不同顾客或店铺，生成各自订单，无跨身份重放 |
| P7-09 | 不同幂等键创建两个独立订单；明确不存在按购物车全局去重保证 |
| P7-10 | 两顾客竞争最后1件，模型商品锁排队后201/409，1单1预留，最终库存0 |
| P7-11 | 五顾客竞争2件，2成功3库存不足，2单2预留，最终库存0 |
| P7-12 | 请求数量超过库存，409且所有持久模型状态保持不变 |
| P7-13/active | 实际商品读取前已下架，409 product_unavailable，无订单/扣减 |
| P7-13/sold_out | 实际商品读取前被手动售罄，409 product_unavailable，无订单/扣减 |
| P7-14 | 读取前商家数据变更，采用最新2300分/库存3/版本8；忽略客户端旧价旧版本；保存成交价并扣至2 |
| P7-15 | 多商品中第二件无货，整个订单拒绝，第一件不被部分扣减 |
| P7-16/second line insert | 第二条明细插入故障，订单及所有明细、库存、预留、流水均回滚 |
| P7-16/second stock movement | 第二条库存流水故障，已处理的第一商品和第二商品均回滚 |
| P7-16/commit before durable apply | checkout提交写集合前故障，整单回滚；不声称模拟未知提交结果 |
| P7-17 | 库存流水故障回滚后用同键重试，正常创建一次，首次失败不残留数据 |
| P7-18 | 甲店下单提交乙店商品ID，拒绝，双方库存和所有订单数据不变 |
| P7-19 | 缺少Bearer认证，401，无事务或写入 |
| P7-20 | owner/manager并发接同一已支付夹具订单，只有一次成功/事件/库存提交，另一请求正常409冲突 |
| P7-21 | 已接单后再次接单409，不追加事件、不改库存 |
| P7-22/cancelled->accepted | 已取消订单不能接单，完整状态不变 |
| P7-22/delivered->preparing | 已送达订单不能回退备货，完整状态不变 |
| P7-22/delivered->cancelled | 已送达订单不能普通取消，完整状态不变 |
| P7-22/new->delivering | 新订单不能跳过接单/备货，完整状态不变 |
| P7-23 | held未支付拒绝接单；paid夹具接单后转committed，仅追加delta=0流水，不重复扣库存 |
| P7-24 | 其他店铺owner、顾客、非管理角色不能操作；乙店合法owner通过乙店路径操作甲店订单404，数据不变 |
| P7-25 | 其他顾客或错误店铺路径用已知ID读取，404，无状态修改 |
| P7-26 | 接单审计插入失败，已处理的支付库存转正和订单状态整体回滚 |
| P7-27 | 未支付订单取消，库存9→10、预留released；重复取消409，不重复加回 |
| P7-28 | 取消审计失败，库存恢复、预留释放和订单取消全部回滚 |
| P7-29 | 实际sweep处理明确提供的过期候选，取消并释放一次；精确校验参数备注、actor及状态；重复运行0条 |
| P7-30 | 时钟恰等于到期时间时接单，409 inventory_reservation_expired，取消释放；精确核对SQL常量事件备注和归属 |
| P7-31 | 重设计为已到期unpaid/new/held订单；取消先持模型订单锁，sweep模型排除；取消返回原有到期409并完成释放；后续不再释放、事件备注准确。不是PostgreSQL SKIP LOCKED验收 |
| P7-32 | sweep先持订单锁，取消等待后409；最终只释放一次、仅1个取消事件 |
| P7-33 | 多商品取消的第二条恢复流水失败，第一件已恢复的库存和所有流水也回滚 |
| P7-34 | paid/committed订单普通取消仍保持paid，库存不加回；没有宣称退款成功 |
| P7-35 | 取消缺少原因400；普通status标记送达409，不能绕过凭证完成接口 |
| P7-36 | 正确顾客可读取订单/明细ID和原成交快照；商品改名改价下架不改历史；错误顾客仍404，作为隔离正向对照 |
| P7-37 | 混合有限/不限库存购物车按UUID顺序查询/锁定；仅有限商品预留和扣减；总额和两条快照正确 |
| P7-38 | 缺失、空、太短、太长、含空格的幂等键均400，不开启事务 |
| P7-39 | 商品读取等待期间营业时钟到闭店边界，再次真实verifyDelivery拒绝，无订单/扣减 |
| P7-40 | 取消恢复数量时不清除商家手动sold_out |
| P7-41 | sweep过期释放的审计插入故障整体回滚；重试仅恢复一次 |
| P7-42 | 实际sweep将明确提供的paid候选转committed，delta=0，不再次扣减；重复运行0条 |
| P7-43 | 实际sweep对明确提供的payment_failed未支付候选释放并记录正确来源，只释放一次；不验证支付事件查询或提供方 |
| P7-44/finite和unlimited，各3项 | 新建真实订单或遗留状态夹具下，unpaid不能new→accepted、accepted→preparing、preparing→delivering；6项逐项核对409及全状态不变 |
| P7-45/finite和unlimited，各1项 | paid分支夹具保留接单→备货→配送→异常四个合法步骤，精确核对事件、备注、库存不重复扣减；共2项 |
| P7-46 | 不限库存未支付new及遗留accepted/preparing保留合法取消、原始付款状态和原因，不创建预留或流水 |
| P7-47/refunded和partially_refunded，各1项 | 非paid状态不能作为不限库存接单授权，409且完整状态不变；2项，仅夹具分支，不代表退款实现 |
| P7-48 | 适配器单元自检：字符串常量含逗号、转义引号和双空格，参数映射及NULL都精确保留 |
| P7-49/finite和unlimited，各1项 | 遗留unpaid/delivering订单不能因库存模式不同进入abnormal；paid异常由P7-45正向验证；共2项 |

## 5. 已知缺口与尚未验证的风险

### 已确认的新缺陷

复核整改已获授权修复三项问题；未发现除此之外的新业务缺陷。测试先增加再修实现，失败断言均保留，未删除或跳过用例。并发重复接单、重复取消、库存不足、幂等内容冲突的409仍是预期业务冲突。

| 修复前失败 | 根因 | 修复 |
| --- | --- | --- |
| P7-44/unlimited的3项、P7-47的2项、P7-49/unlimited，共6项 | 只有held分支检查付款，none允许非paid推进 | 现有状态/授权/到期处理后，库存解析前统一检查：非取消履约变更必须paid，返回409 payment_not_confirmed；不写支付状态 |
| P7-30、重设计P7-31、P7-48，共3项 | system事件一律从args[2]取备注，丢失SQL常量；其他常量状态/NULL同样误映射 | 按真实INSERT VALUES常量/参数解析；增加精确备注及事件字段断言 |

P7-31旧场景尚未到期，取消未提交时不符合真实worker筛选条件。现以真实已到期条件建模；因到期分支按既有业务返回409而非普通取消200，相关断言随授权重设计调整，不是弱化。仍然没有验证PostgreSQL实际行锁、SKIP LOCKED或候选查询。

### 源码已有的边界，不算本轮修复/验证完成

1. **支付/退款仍属客户外部模块**。`PAYMENT_INTEGRATION_CONTRACT.md`明确不存在真实支付和退款完整链路；支付关闭/失败事件来源和可信性、退款幂等、晚到付款与释放竞争均未通过真实支付/数据库验证。P7-34只确认“没有伪造退款/自动加库存”。
2. 统一paid履约门槛本次已修；new待接单统计仍含未支付订单，列表出现不代表允许接单。队列是否只收已支付仍需客户支付协议确认。合法取消、到期释放、已支付正常操作及异常操作保留；没有接入支付验签。
3. 服务端幂等范围是店铺+顾客+相同键；不同键是独立创建。同一购物车生成新键仍会创建另一单，这是边界，不是全局防重复保证。客户端网络失败应保留同键；本轮未新增客户端下单函数重试动态测试。
4. 无隔离PostgreSQL，未验证真实最后库存竞争、advisory hash锁、唯一约束冲突、复合FK/触发器、SQL条件和投影、数据库死锁/断连、COMMIT结果未知、多进程worker/取消竞争。不得将模型最终状态描述为真实数据库最终状态。
5. 未验证实际后台定时worker启动/调度；只调用真实单次sweep函数，候选选择由夹具提供。没有运行后台服务。
6. `publishedSql`的定时上架SQL、独立草稿表、真实库存管理并发版本、金额数据库类型转换未做真实SQL集成验证。本轮改变模型读取数据来覆盖当前价格/状态分支，不模拟完整PostgreSQL表达式执行器。
7. 未验证微信真机、真实网络重试/TCP断连、真实送达凭证、R2和内容存储；已保留相关访问限制，不声明这些功能通过端到端验收。
8. 部分旧后端测试夹具需单独维护；本轮没有通过删除、跳过或弱化旧断言取得绿色结果，也没有宣称整个backend/tests目录全部通过。

## 6. 实际命令与静态检查

均在项目根目录执行，Node为本机已有路径，未安装依赖：

```powershell
& 'C:\Program Files\nodejs\node.exe' --test backend/tests/business-consistency-phase7.test.mjs
& 'C:\Program Files\nodejs\node.exe' --test backend/tests/frontend-navigation*.test.mjs backend/tests/merchant-customer-catalog-checkout.test.mjs backend/tests/merchant-customer-status-handoff.test.mjs
& 'C:\Program Files\nodejs\node.exe' --test backend/tests/business-consistency-phase7.test.mjs backend/tests/frontend-navigation*.test.mjs backend/tests/merchant-customer-catalog-checkout.test.mjs backend/tests/merchant-customer-status-handoff.test.mjs
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/lib/tsc.js --noEmit --pretty false
git diff --check
```

- 修复前新增断言运行63项，54通过9失败；修复后第七轮单独63/63，最终合并165/165（63+88+14）。
- TypeScript静态检查exit0。
- 对`backend/src/*.mjs`全部29个文件及新增两个测试文件逐个执行`node --check`，共31个文件，exit0。这不会启动服务。
- `git diff --check`通过；新增未跟踪文件另以`git -c core.autocrlf=false diff --no-index --check -- /dev/null <文件>`检查，无错误输出。no-index的exit1表示存在新增差异，不是空白错误；最初检查脚本误将其当失败，已纠正判读并核对全部3个文件；未改变仓库配置。
- Node原有前端夹具的`stripTypeScriptTypes`产生ExperimentalWarning，所有断言通过。

## 7. 交付与工作区

本轮保留并更新的文件：

1. `backend/src/orderWorkflow.mjs`：库存模式无关的统一付款门槛。
2. `backend/PAYMENT_INTEGRATION_CONTRACT.md`：明确合法未支付操作、非取消履约门槛和仍未接入的支付边界。
3. `backend/tests/business-consistency-phase7.test.mjs`：原49项基础上新增14项、强化事件断言、重设计P7-31。
4. `backend/tests/helpers/business-phase7-db.mjs`：修复事件SQL常量/参数/NULL的映射。
5. `backend/PHASE7_BUSINESS_TEST_REPORT.md`：本报告，保留原覆盖并更新复现、整改、最终结果及边界。

最终HEAD未变化。两个已跟踪文件修改、原三个未跟踪文件保留更新，无暂存。具体Diff行数见本次交付摘要。测试仅在内存模拟数据库写入；原第七轮曾尝试只读Git远程核对且失败，本次整改没有外部网络请求或数据库/R2操作。

后续数据库验收需先确认专用隔离测试库及可写数据范围，再单独授权数据库夹具与真实并发测试。最低覆盖真实多连接事务回滚、最后库存竞争、同键并发/未知提交重试、死锁受害事务整体回滚、worker合资格候选锁竞争、跨店铺查询及复合外键、流水触发器。本轮不创建数据库、不执行迁移、不连接未知环境；完成整改后停止等待人工审查。
