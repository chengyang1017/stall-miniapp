# Shared 包边界（Phase 30）

唯一源码位于 miniprogram/modules/shared/，不在此复制业务。三目标构建器按静态依赖闭包将需要的模块编译进各自 miniprogram/modules/shared/，无需 npm workspace 或新增依赖。

- domain：商品、订单、金额、时间、草稿、配送规则、聊天和凭证类型与纯函数；不依赖 wx 或任一角色。
- runtime/api：中性身份、会话失效、公开读取及共用传输协议；不授予商家权限。
- demo：共享演示存储接口与读取规则，沿用原 storage key。角色写入业务由 Merchant/Customer 端口负责，不互相导入实现。
- components/proof-image：仅图片展示/事件，不含上传、权限或订单操作。

模块边界由 scripts/check-boundaries.mjs 强制检查。共享可复用页面算法位于 modules/features，注入固定角色端口，不导入任一角色控制器。详见 apps/BUILDING.md。
