# 远程预览说明

2026-10-27 起职责修正：本前端开发者不安装、不登录、不运行微信开发者工具。实际平台编译、界面预览及真机测试由项目负责人在另一台电脑完成，当前状态 WAITING_FOR_OWNER_PREVIEW。

负责人操作入口统一在 [PREVIEW_HANDOFF.md](PREVIEW_HANDOFF.md)：先核对 zh 的具体提交 SHA，npm ci 后运行 npm run verify:frontend，再将本机生成的 dist/combined 导入其已有微信开发者工具。需检查 Merchant/Customer 隔离时另导入 dist/merchant / dist/customer。

不要把源码仓库或 source 子目录当作编译后的项目目录。不要上传构建产物、测试会话或私密配置到 Git。云端配置当前为空，只能先检查本地 DEMO；跨设备同步、微信登录、真实支付与真机均不可从离线构建推断成功。

旧版“让本开发者安装工具”的分工已被替代；历史未运行记录留在 TEST_LOG.md，不删除原失败证据。修改源码后需重建对应 dist 目标，不直接修改 dist。
