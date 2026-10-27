# 逐页验收清单

2026-10-27｜FE-01｜zh。下面的页面归属取自当前 apps/build-targets.json，静态构建证明不等于 UI 已运行。所有人工操作/截图均待微信开发者工具安装后补齐。无设备型号、平台模式或实际账号权限可登记。

| 页面路径（pages/） | 归属目标 | DEMO | CLOUD-STAGING | WECHAT-DEVTOOLS | REAL-DEVICE | PRODUCTION |
| --- | --- | --- | --- | --- | --- | --- |
| index/index | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| cloud-shop/cloud-shop | Combined | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| cloud-catalog/cloud-catalog | Combined | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-backup/admin-backup | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin/admin | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| merchant-login/merchant-login | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| cart/cart | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| checkout/checkout | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-billing/admin-billing | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-analytics/admin-analytics | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| delivery/delivery | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| addresses/addresses | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| orders/orders | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-orders/admin-orders | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| product-detail/product-detail | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-products/admin-products | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-categories/admin-categories | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-placeholders/admin-placeholders | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-product-form/admin-product-form | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| store-hours/store-hours | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| delivery-proof/delivery-proof | Combined | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| order-detail/order-detail | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| profile/profile | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| customer-settings/customer-settings | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| admin-note-tags/admin-note-tags | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| support-chat/support-chat | Combined | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| support-inbox/support-inbox | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| store-code/store-code | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| customer-support-chat/customer-support-chat | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| customer-delivery-proof/customer-delivery-proof | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| merchant-support-chat/merchant-support-chat | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| merchant-delivery-proof/merchant-delivery-proof | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| customer-tracking/customer-tracking | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| merchant-tracking/merchant-tracking | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| customer-reviews/customer-reviews | Combined/Customer | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |
| merchant-reviews/merchant-reviews | Combined/Merchant | NOT RUN | NOT RUN | BLOCKED | NOT RUN | NOT RUN |

## 静态抽查证据（不是动态验收）

- index / product-detail：云端失败显示错误/不可购买，没有静默填入演示商品；扫码通过可信配置的 store-entry 解析，不能从分享链接指定 API。
- cart / checkout：区分本地和云端，云端提交有 orderSubmitting 防重复；服务器定价与结果标为待支付。
- orders / order-detail：云端分页、隐藏清理/失效保护及凭证签名链接错误路径存在；部分逻辑已用离线 mock 回归。
- profile / merchant-login：角色适配器隔离跨端入口，Combined 权限由授权请求确认；登录失败/退出提示存在。
- admin / admin-product-form / admin-billing：保存中禁重复、账号店铺变化提示、云账单失败不回退演示；可信实收保持0并注明未核验。
- 其余页：本轮只核验注册、角色归属和构建依赖，未逐项执行业务；客服/上传/配送/GPS/评价不得标记已验收。

## FE-02 各页需执行的状态矩阵

每页补充空数据、首次加载、超时/断网/重试、旧缓存、重复点击、身份与店铺切换、返回/分享、新设备扫码；商家另含只读/无权限、并发更新及上传失败。DEMO 与 staging 各自独立记录。详情/结算需库存和服务端价格变更；支付待协议；GPS/评价待首版范围确认。截图路径在实际产生后追加，不预填成功。

## 2026-10-27｜FE-02 当前平台验收责任

上表是 FE-01 的历史 NOT RUN/BLOCKED 记录。现按远程协作修正：所有 WECHAT-DEVTOOLS / REAL-DEVICE 验收统一 WAITING_FOR_OWNER_PREVIEW，由项目负责人另一台电脑执行；本前端开发者继续构建和离线状态测试，不安装/登录/运行微信工具。尚无任何平台或设备回传证据。staging 和生产仍未运行。

## 2026-10-27｜FE-04 当前补充

checkout/orders在Combined/Customer新增26个实际编译DEMO回归（内存wx，不是模拟器截图），覆盖建单/unpaid/库存/购物车/Tab、一次性提示及确认竞态；最终全前端169项离线测试通过。上方页面UI人工验收依然WAITING_FOR_OWNER_PREVIEW，无平台截图或设备证据。完整18项现状见STATUS_AUDIT.md；商家经营/上传/客服等不能因本轮通过而改成已验收。
