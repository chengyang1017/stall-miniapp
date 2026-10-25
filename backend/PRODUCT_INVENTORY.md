# Phase 17 商品库存管理

本次交付源码及迁移文件，没有执行测试、数据库迁移、部署或 Git 写操作，没有生成备份。
默认业务地区为中国大陆，货币 CNY（人民币 ¥），库存记录展示为北京时间（Asia/Shanghai，UTC+8），数据库时间使用 timestamptz。

## 数据结构

按 001–007、008（草稿/定时上架）、009（库存）的顺序应用迁移。008 尚未执行，本次也没有执行 009。
`scripts/migrate-dev.mjs` 仅把文件序列识别更新到 009，未运行。不要在旧结构上直接启用新版服务。

009 为已有商品添加 `stock_mode=unlimited` 默认值，所以原有商品不会被视为零库存。
`stock_quantity` 表示可销售余量，**已经排除未支付订单预留数量**。范围为 0–1000000 的整数。
不限库存时数量字段不参与可售性判断。`low_stock_threshold` 默认 5，低库存提示为有限库存且 `0 < 数量 <= 阈值`；零库存单独显示缺货。
`inventory_version` 与商品内容 version 分开，避免订单扣库存让普通改图、改分类误覆盖库存。
更改库存设置必须校验库存版本；有预留时禁止切换库存模式，且余量加预留数量不能超过上限。

- `inventory_reservations`：订单和商品唯一的预留记录，状态 held / committed / released。
- `orders.inventory_state`、`inventory_expires_at`：订单的库存处理状态和 UTC 截止时间。
- `inventory_movements`：商品 ID、订单 ID、前后模式、前库存、增减量、后库存、原因、来源、操作者、UTC 时间和操作重试键。
  数据库触发器禁止修改或删除既有流水；商家接口仅提供读取和新增操作，没有修改历史接口。
  阈值或模式配置也会留记录；不限模式下数量归零是模式变更，不代表商品实际出货。

## 预留、扣减和释放

1. 创建有限库存订单时，锁住全部商品行，使用数据库商品价格和状态，检查数量后在同一事务里创建订单、预留、流水并减少可销售余量。
2. 订单仍是 unpaid，绝不视为收款成功。预留有效期为 **15 分钟**。
3. 已确认 paid 后，将 held 转为 committed，表示正式消耗。余量在预留时已经扣除，所以转正流水增减量为 0，不二次扣减。
4. 未支付订单取消，或预留到期，转为 released 并返还对应数量。订单锁、预留状态及流水唯一键避免重复释放。
5. 有限库存订单未付款时不能进入接单/备货/配送，避免到期释放后仍配送。此前不限库存演示流程不追加这种预留限制。
6. 已付款取消、已配送、已完成、配送异常或争议状态不自动加回库存。晚到付款落在已释放订单上时不能继续配送，必须人工核对；没有虚构退款。

`server.mjs` 启动真正的服务端释放循环：启动即扫描，平时约每 30 秒扫描，积压达到单批 100 单时连续分批处理。
使用数据库时间、事务及 `FOR UPDATE SKIP LOCKED`，多实例可同时运行。下单前还会做一次有界扫描。
不需要商家或顾客保持小程序在线。服务暂停时无法运行释放循环，但库存也不会被新订单购买；服务恢复后补扫。
需要运营持续运行 Node 服务并关注 `Inventory release worker failed` 日志。数据库故障或异常记录会拒绝相关操作，不会伪造释放成功。

**支付接入限制：** 当前项目仍没有真实微信支付回调。worker 仅消费服务端已有的可信 `payment_status=paid`，以及内部 `payment_events` 中 provider=wechat、event_type=payment_failed/payment_closed 的记录。
没有新增允许客户端伪造支付事件、付款、退款的接口。未来必须由验签、核对金额及订单归属后的支付后端写入这些记录；本次不声称真实付款失败回调已经接通。
在未接支付的当前环境，未支付预留由取消或超时释放；不要通过手改支付状态把演示视为真实收款。

## 并发和重试

所有商品按 ID 排序加 `FOR UPDATE` 行锁，扣库存另有非负条件更新。多个商品的检查、扣减、订单和流水一起提交或一起回滚。
库存不足返回 `insufficient_stock`，不会只扣部分商品。
订单沿用原有 Idempotency-Key 与订单指纹，重试不重复扣库存；已取消或已释放的旧重试结果不会假装生成新订单。
手动补货/扣减有独立重试键与库存版本，相同请求重试只确认旧操作，不重复执行；不同内容复用同一键返回冲突。
普通新增及复制商品的通用 POST 幂等问题仍没有解决，网络超时后仍需核对商品列表；没有扩大为自动重试创建。

## 售罄与其他功能

`sold_out` 仍专门表示商家手动售罄；`outOfStock` 由有限库存余量为零计算，不写回 sold_out。
补货、释放、付款转正都不解除手动售罄。批量“恢复有货”只清除手动标记，不增加库存。
公开商品查询保留已上架的零库存商品，顾客可看见缺货；加购、数量调整、结算和后端下单均校验库存。
购物车库存不足时保留条目并提示减少数量，不把库存不足悄悄当作购买成功。

- 草稿仅保存原始库存设置输入，可以暂不完整，不产生库存余额、预留或流水；正式发布时校验并初始化。
- 正式商品另存草稿不带原库存余额，发布前需要重新设置。
- 复制默认不限库存，不加载原库存余额或原流水；保存后如有初始化记录也是新商品自己的记录。
- 定时上架只改变有效上架状态，到期后仍受手动售罄和数量限制。
- 批量上下架、分类、图片及描述操作不修改库存；编辑商品时未改库存设置就不提交库存字段。
- 商品价格与订单历史快照不被库存操作改写；未添加任何 R2 图片删除。
- 库存商家 API 必须通过现有会话、店铺和 owner/manager 角色检查。

## 本地演示

沿用 stall_demo_v1，向后兼容添加 inventoryMovements、inventoryReservations、inventoryOrders。
新演示订单、预留、余额、流水共用一次本地存储写入，旧 stall_demo_orders_v1 仍可读取，原订单页面通过合并读取兼容。
取消新演示订单时同样在一个 store 写入中释放。老订单没有预留，不会凭空返库。
本地读取时按设备时间回收过期预留，不代表服务端可靠定时，更不是跨设备一致性保证。
当前无本地真实付款流程，有限库存演示订单仍是待支付，会在取消或到期后释放。

## 手动体验

微信开发者工具重新编译后，进入商品表单：开启有限库存、填写数量与阈值，保存后在商品列表查看低库存/缺货筛选。
重新编辑商品，在库存面板输入数量和原因，选择补货或扣减；确认后立即生效，可刷新查看最近 100 条流水。
把可销售余量调为零，顾客列表与详情会显示缺货且不可购买；补货后若仍手动售罄，仍不能购买。
以有限库存商品创建待支付订单后，余量减少，随后可在商家订单页面取消并看到释放记录；或等待 15 分钟后由云端 worker 释放（页面可能需刷新显示）。
本地模式需再次读取页面才能观察按设备时间回收的结果。
复制、草稿发布、批量恢复有货和定时上架可继续使用，但不能绕过库存检查。
云端体验需要后续另行授权执行 008、009 并运行新版后端，本次未做。

## 源码核对与范围

已做 backend `node --check` 静态语法检查和 TypeScript `--noEmit` 检查，不执行任何业务模块、测试或数据库 SQL。
未进行真实数据库并发、支付回调或微信开发者工具运行验证。流水界面当前只显示最近 100 条，数据库保留完整历史。

本地订单状态文件原有重复源码被嵌入字符串，导致无法解析。本次仅从本地现有有效片段重组为单个实现，保留 ETA、配送凭证上传/读取、顾客订单归属及权限校验，并接入库存取消释放；没有使用远程文件或备份覆盖。

新增文件：

- backend/sql/009_product_inventory.sql
- backend/src/inventory.mjs
- backend/src/inventoryRoute.mjs
- miniprogram/utils/inventory.ts
- backend/PRODUCT_INVENTORY.md（本文）

修改文件（均保留之前未提交代码）：

- backend/src/catalog.mjs
- backend/src/checkout.mjs
- backend/src/orderWorkflow.mjs
- backend/src/server.mjs
- backend/src/productDrafts.mjs
- backend/scripts/migrate-dev.mjs
- miniprogram/utils/store.ts
- miniprogram/utils/orders.ts
- miniprogram/utils/orderWorkflow.ts
- miniprogram/utils/cloudMerchantProducts.ts
- miniprogram/utils/authApi.ts
- miniprogram/utils/remoteApi.ts
- miniprogram/utils/cloudCart.ts
- miniprogram/utils/cart.ts
- miniprogram/utils/directPurchase.ts
- miniprogram/utils/cloudCheckout.ts
- miniprogram/pages/admin-product-form/admin-product-form.ts
- miniprogram/pages/admin-product-form/admin-product-form.wxml
- miniprogram/pages/admin-product-form/admin-product-form.wxss
- miniprogram/pages/admin-products/admin-products.ts
- miniprogram/pages/admin-products/admin-products.wxml
- miniprogram/pages/admin-orders/admin-orders.ts
- miniprogram/pages/index/index.ts
- miniprogram/pages/index/index.wxml
- miniprogram/pages/product-detail/product-detail.ts
- miniprogram/pages/product-detail/product-detail.wxml
- miniprogram/pages/cart/cart.wxml
- miniprogram/pages/checkout/checkout.ts
- miniprogram/pages/cloud-shop/cloud-shop.ts
- miniprogram/pages/cloud-shop/cloud-shop.wxml
