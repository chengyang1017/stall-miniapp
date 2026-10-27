# V2 网络兼容与一次性继续首次启动

2026-10-27（UTC+8）。本次只读诊断、源码整改和离线验证；**没有启动容器、写入私人回执、连接数据库、迁移或运行26项真实业务测试**。原有未提交修改保留。

## 实际证据与结论

Engine29.6.2/Linux amd64，Desktop4.85.0，Compose5.3.1，desktop-linux指向本机命名管道。目标网络ID为e269447bc2094406480763cbfde870c32c2ccc298d756910daad21c13cce81d4，internal=true、EnableIPv4=true、EnableIPv6=false、gateway_mode_ipv4=isolated，单一IPv4子网、无gateway、无成员。

纯Compose解析确认：`enable_ipv6: false` 和重复的 `com.docker.network.enable_ipv6: "false"` 都存在；没有宿主端口。Engine inspect不再返回重复driver option，但仍明确返回实际布尔值EnableIPv6=false。这是**元数据表示不兼容**，不是有证据的IPv6开启，也没有发现需要改变实际网络属性的理由。因此保留Compose配置和所有真实资源，仅修正读取策略。

必须区分：

| 层次 | 已知情况 | 安全判断 |
| --- | --- | --- |
| Compose意图 | 已通过纯解析确认显式IPv6关闭 | 只是请求意图，不能单独证明实际状态 |
| Engine全局默认 | 没有读取/修改daemon配置，也不从目标网络推断全局值 | 不作为本修复的授权或安全依据 |
| 目标网络实际状态 | inspect显式布尔值EnableIPv6=false | 仍须与internal/isolated/无端口/单网卡/无IPv6端点等同时满足 |

官方[Compose网络说明](https://docs.docker.com/reference/compose-file/networks/)将enable_ipv6定义为IPv6地址分配开关；[Docker端口及隔离网络说明](https://docs.docker.com/engine/network/port-publishing/)描述internal网络上的isolated模式。文档与现场支持按实际字段判断；没有以“重复选项缺失”推定开启或关闭，也不宣称尚未执行的出站连通性测试已经通过。

脱敏现场证据：[PHASE8_V2_NETWORK_COMPATIBILITY_AUDIT.json](PHASE8_V2_NETWORK_COMPATIBILITY_AUDIT.json)。原始inspect曾在工具输出中包含内部启动标记；后续不再回显，不复制到仓库。审计文件对该值脱敏，身份锚点仅保存其SHA-256，不保存密码、nonce原文或连接串。

## 修复前后

- 修复前：实际EnableIPv6必须为false，且重复driver option必须精确为字符串false；现场缺少后者，报network_rejected。
- 修复后：实际EnableIPv6**仍必须明确等于布尔值false**，缺失/null/字符串/0/true都拒绝。重复option可不存在；如存在则必须精确为字符串false，true、布尔false、null、undefined及其他值都拒绝。
- 保留bridge、internal、isolated、网络名称、标签/UUID/nonce、精确成员集合、端口、单网卡、固定镜像、挂载及权限检查；额外拒绝IPv6Gateway。未知网络选项仍拒绝。
- 同一真实现场的新networkIsolation、完整topology及只读recoveryReceipt核验已通过；这不是运行恢复或网络出站测试。

## 恢复入口的源码边界

新增固定命令：`node backend/scripts/phase8-v2.mjs --recover-created`。本轮**没有执行**该命令，也没有设置真实执行的恢复授权开关。

未来运行除原V2通用授权/独占窗口/受限材料检查外，还必须设置：

```text
PHASE8_V2_ACTION=recover-created
PHASE8_V2_RECOVER_CREATED=START_PINNED_CREATED_ONCE
PHASE8_V2_INSTANCE=b986df49-4ffc-4b26-bfe4-13e97e1e30ef
```

不接受命令行资源ID、任意锚点路径、任意SQL或恢复脚本。实际宿主只读取仓库固定的`backend/testing/phase8-v2/recovery-anchor.json`：

- 容器04d174ff32ab69b3eae39ee5b067d309a26132f87185baabcfada5247d0b593f及创建时间。
- 网络e269447bc2094406480763cbfde870c32c2ccc298d756910daad21c13cce81d4及创建时间。
- 专卷stall-phase8-r2-data及创建时间、driver/scope/options/标签摘要。
- Engine实例ID与版本、PG固定镜像、原始attempt/failure/launch三个文件的字节摘要和原nonce摘要。
- 完整容器Config/HostConfig/Mounts摘要，避免只核对容器名称。

入口要求容器Status=created、从未启动的零StartedAt/FinishedAt、PID=0、RestartCount=0、无Error、无Paused/Dead/Restarting；退出或运行过的容器一律拒绝。原始failure必须恰为container阶段的network_rejected，launch必须仍是MODE=first。必须恰有本轮三项V2资源；额外运行器即使停止也拒绝。旧B0、其他店铺库、其他UUID或重建同名资源不能通过。

## 一次性与失败保留

1. 完成授权、ACL、镜像、Engine、元数据、挂载及原始证据验证后，以wx和fsync写入新的`records/db.recovery.attempt.json`；文件已存在就拒绝，永不自动删除。
2. 启动前再次核验上下文、镜像、资源、文件摘要与归属，再仅启动锚点的精确容器ID。不调用Compose up/create、网络/卷命令或迁移。
3. 启动后再次检查拓扑、Engine、归属和原始证据；成功才新建`db.created.json`，附recovery协议、anchor摘要与原failure摘要。**原db.failed.json及原attempt/launch不修改**。
4. 任何已占用尝试后的失败写入独立`db.recovery.failed.json`；不自动重试/重启/清理。若启动成功但回执写入失败，保留不确定现场并拒绝下一次自动执行。
5. 结果仅为created_verified，bootstrapVerified=false、ready=false。健康、bootstrap、001—020迁移及业务测试仍是独立步骤与授权。

wx是单机文件系统排他门槛，Docker/文件系统之间不存在原子事务；管理员可以改变资源，因此还需要操作者独占Docker窗口和前后重复核验。本机制不抵御恶意宿主管理员、也不把源码锚点当作外部签名证明。

## 验证与下一步授权

- 新增phase8-recovery.unit.test.mjs：50项通过；原249项也通过，联合299通过、0失败、0跳过。包含真实临时文件竞争的排他claim检查，其余为实际纯策略/控制器加合成Docker元数据，非真实容器恢复。
- 首次47项中额外网卡负例期望了错误错误码，实际正确拒绝为network_mode_rejected；修正精确期望，没有改变拒绝断言或生产策略迁就测试。
- 7个相关MJS语法、TypeScript与依赖边界检查通过；Compose纯解析通过。不修改商城业务源码、SQL或正式微信配置，不做Git写操作。
- 本轮policy属于运行器白名单，修改后**当前源码bundle已不同于已批准旧镜像**。没有重建镜像或改写其审核记录；旧批准只代表旧封存输入。后续运行器任务必须先审定版本配对/重新构建审核，不能把本轮源码当作已在旧镜像内。

下一次实际操作需明确授权：重新预检及独占窗口、仅恢复锚点容器并允许首次initdb/bootstrap写入、保存新的恢复回执；是否只读核验bootstrap、重新构建运行器、执行测试迁移或业务用例必须明确列出。**本轮没有这些执行授权，也没有执行。**
