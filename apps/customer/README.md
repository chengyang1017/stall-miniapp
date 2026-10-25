# Customer 应用构建入口

运行 `npm run build:customer` 生成 dist/customer/project.config.json 与独立 miniprogram/app.json。首页为店铺首页，保留四个顾客 Tab；不包含商家管理页面、上传凭证控制器或商家经营 API。

真实目标清单由 ../build-targets.json 管理；app.plan.json 是可追溯的角色边界说明，不直接作为微信清单。AppID 可通过 STALL_CUSTOMER_APPID 传入；当前后端仍是单 AppID 登录，独立发布前需完善多 AppID 身份接入。

构建和验证范围见 ../BUILDING.md 与 ../../backend/APP_SEPARATION_READINESS.md。
