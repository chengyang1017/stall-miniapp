# 在本机浏览小程序效果

当前路径：C:\project development\stall-miniapp。分支 zh。浏览器不能直接运行原生微信小程序。

1. 安装官方微信开发者工具（普通微信不是开发者工具），用自己的微信登录。
2. 选择“导入项目”，目录选 C:\project development\stall-miniapp\dist\combined。选这个目录，不是其 source 子目录，也不是 PocketCollector。
3. 使用自己有权使用的 AppID / 测试号；无权限时尝试工具提供的游客模式，并记录实际限制。不需要朋友的微信账号或 AppSecret。
4. 导入后执行工具里的“编译”，查看左侧模拟器。首页、购物车、订单、我的可从底部 Tab 切换。该步骤尚未在本机实测。
5. 要看商家演示，可在工具中新增编译模式，启动页面选 pages/admin/admin；Combined 内“进入顾客端”可返回顾客首页。也可单独导入 dist/merchant（默认 touristappid，无顾客 Tab）。Customer 目录仅含顾客页面。
6. 手机效果需开发者工具“预览”二维码，并满足实际账号/设备权限；当前未验证，不等于直接上线。

目前 PUBLIC_API_BASE / DEFAULT_STORE_SLUG 为空。干净存储默认走本地 DEMO；不要填未经授权的共享后端。云端登录、真实支付、跨设备同步未验证。演示若出现营业/起送或配送限制，先在商家演示配置核对，不把限制当作云端错误。不在截图中使用真实手机号/地址。

修改源码后，在仓库根目录重新运行 npm run build:combined，再在工具内编译；顾客/商家独立目标分别运行 npm run build:customer / npm run build:merchant。不要只修改 dist，重建会覆盖。

目前三个构建均成功；微信平台编译、游客模式能力、截图和真机预览均 NOT RUN。遇错保留报错和模式，追加 TEST_LOG.md。
