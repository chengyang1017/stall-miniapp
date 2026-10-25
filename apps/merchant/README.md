# Merchant 应用构建入口

运行 `npm run build:merchant` 生成 dist/merchant/project.config.json 与独立 miniprogram/app.json。首页为商家工作台，沿用工作台导航，不含顾客结算、购物车、收货地址和本人订单页。

真实目标清单由 ../build-targets.json 管理；app.plan.json 是可追溯的角色边界说明，不直接作为微信清单。AppID 可通过 STALL_MERCHANT_APPID 传入，未传入使用 touristappid，不具备正式登录能力。当前后端仍是单 AppID 登录，独立发布前需完善多 AppID 身份接入。

构建和验证范围见 ../BUILDING.md 与 ../../backend/APP_SEPARATION_READINESS.md。
