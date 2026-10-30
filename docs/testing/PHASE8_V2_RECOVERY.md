# V2 网络兼容与一次性继续首次启动

## 2026-10-28 只读复核：仍不得执行恢复

本节覆盖下方旧时点的“下一步”判断。HEAD `503a930465bd94f0ae276bc57e8ac3519d8eee7b`，起始54个已跟踪修改文件及27个未跟踪文件，全部保留。仅查询Docker、读取失败材料和源码、执行离线测试及更新文档；无容器启动/创建/删除、镜像构建/供应链重审、凭据创建、数据库连接、SQL、Neon/Render操作或Git提交推送。默认沙箱访问Docker被拒绝后，仅提升只读查询权限成功；没有启动Desktop。

### 当前现场与具体差异

- Engine ID `055d945d-b3f7-4a50-adaa-423c2cde2b60`、版本29.6.2与锚点一致。
- V2容器仍是 `04d174ff32ab69b3eae39ee5b067d309a26132f87185baabcfada5247d0b593f`；网络仍是 `e269447bc2094406480763cbfde870c32c2ccc298d756910daad21c13cce81d4`，专卷仍为 `stall-phase8-r2-data`。三者创建时间均匹配原锚点。
- Status=created、Running=false、Pid=0、RestartCount=0、StartedAt/FinishedAt均为零时间、Error为空。没有恢复attempt/failed/created回执；records只有原attempt、failed、launch和runner-build-metadata。现存清单没有V2 runner容器。
- 原attempt/failure/launch逐字节SHA均匹配锚点。没有读取secret正文，没有修改私人材料。这里只证明上述证据保存完整，不声称卷内部内容已验收。
- 卷规格摘要仍为 `7ca1ebffb8d9f1944506bdf0b8ffe7bdba31d2d16453cfde3688326f61928ca0`，与锚点一致。
- 本次容器规格摘要为 `52630d7d79fd3c7df44ce2b90e4b7249a69dfd83d4f1af1d83e93250b3438c1d`；原锚点为 `62953d3799d6e410eca4a36edce41c864ec14760030b33bec8aed5fe8e0f9c45`，不相等。
- Config摘要 `502033d92cfb49d49c6839788cba6a593ff217acd2bad5b8fd21e0e71d5ad09a`、HostConfig摘要 `9e542aa673c79a051c2c7250370d94740810adfe507480795f2ac5c44e32362d`、按Destination排序的Mounts摘要 `34f0e3b83eef133a5492a092fff344d2a135efded3f575e0e589a66e2e2e8ee0`，均与10月27日BOOTSTRAP_START_AUDIT的诊断值一致。这是与后续诊断快照相符，不能倒推与最初锚点的完整规格相符。
- 网络internal=true、IPv4=true、IPv6=false、isolated，成员为空。旧B0容器仍exited；没有操作旧现场。

准确阻断点仍是 `recoveryReceipt()` 的 `recovery_resource_changed`，位于claimRecovery/start之前。本轮没有调用实际恢复入口。已知JSON.stringify依赖对象键序及Mounts顺序，是实际指纹设计缺陷；但历史40320种挂载排列也未复现原摘要，不能据此排除其他差异。仓库锚点仅存整体摘要，已检查的审计材料缺少生成该摘要时的完整原始规格，无法从摘要逆推出具体不同字段。不能报告“只是Mounts顺序，已解决”。本轮保持算法、锚点及失败回执原样。

### 复用与最小补缺路径

直接复用B1固定PG/Node镜像审核、B2凭据/ACL准备成果、V2三资源、旧runner构建审计和现有恢复/任务协议。常规执行前身份/ACL核验仍必要，不能称为重做供应链或凭据初始化。现有runner镜像c3752474及a6d03ce3仍在清单中；approved只适用于各自封存输入，不是当前工作区获准运行。

首选继续寻找原锚点生成时的完整inspect字节/结构证据，离线逐字段比较；只有证明语义相同后才可设计版本化规范化（对象键排序、Mounts按唯一目标排序；Env/Cmd/Entrypoint保持顺序），保留原锚点并追加明确的转换证据和负例测试。当前不能安全实现一个能放行真实资源的修复。

若原始规格无法找回，替代方案是**单独授权对同一精确资源重新核验并登记追加身份审计**：原锚点、原failed不变，人工审查全部安全字段和差异不确定性后，另行批准新版本恢复协议。此授权不能隐含启动或数据库写入。用户未批准前不登记、不执行；不创建另一套环境，不运行create-db，也不重建现有资源。

### 001—020与021的版本兼容计划（设计，未实现）

1. 保留历史20项manifest及历史runner输入；在同一V2先完成恢复、bootstrap、initialize、ready、26业务用例，各固定任务分别保存真实回执。当前源码已读payment_source等021列且orderWorkflow新增stagingPayments导入；不能把当前工作区作为001—020兼容版本执行。先用已封存输入核对依赖闭包与历史业务行为，明确要验收的版本；若需测试当前版本，应显式增加兼容实现或021阶段，不能隐藏列缺失。
2. 021采用同一V2的后续升级阶段，先保存20项账本/catalog/ACL验收及26项结果，再以独立授权执行21项计划。既有ready只证明020基线，不能复用为021 ready。保存新的阶段回执，旧结果不改。不得把021加入历史manifest来消除拒绝。
3. 扩展现有固定runner/grant/用途协议来承载021和11项支付用例；复用run021、seed及真实连接/PID观察。需要明确角色/权限与staging_control测试锚点登记方案。目前V2没有授权管理角色，且现有支付测试只接受loopback专库和三个URL；V2无宿主端口。不能放开URL校验直连V2，不能通过发布端口或创建全新集群绕过；需先实现并离线验证身份绑定的runner适配，再单独审核发生变化的bundle。当前RUNTIME_FILES也未包含新增stagingPayments/stagingDeployment/stagingPermissions依赖，不可直接打包当前业务源码。
4. 021覆盖：CHECK=23514、复合FK=23503、UNIQUE=23505、最小列权限/拒绝策略字段写入、事务及账本/审计原子性；订单预留、不同PID锁等待、重复确认、取消及到期竞争、SQL失败回滚和提交未知均需真实PG结果。现有11项已包含多数业务场景，但未提供真实021迁移中途故障后DDL/ACL/账本/审计整体回滚的独立验收；须补齐该场景及请求键唯一冲突等覆盖，不能仅凭用例标题认定全部约束均已验证。

### 实际执行状态与日志

2026-10-28，Node v24.16.0；执行以下8文件联合离线回归（测试文件均默认不连接DB）：

`node --test --test-reporter=tap backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs backend/tests/phase8-v2.unit.test.mjs backend/tests/phase8-recovery.unit.test.mjs backend/tests/phase8-business.unit.test.mjs backend/tests/staging-deployment-safety.test.mjs backend/tests/staging-payments.test.mjs backend/tests/staging-postgres.integration.test.mjs`

实际389项：375通过、3失败、11跳过、0取消。日志在仓库本地 `.local/phase8-readonly/offline.tap`（未提交）。三失败分别是B0 actual001—020清单、V2 artifact allowlist、business artifact依赖封存检查，均停在021造成的严格迁移数量拒绝；第三项加入本轮范围后才显现，不与旧235项的2失败矛盾。未改断言/删除021凑通过。git diff --check通过（有既有CRLF提示）。这些数量不与历史通过数相加。

| 项目 | 当前状态 |
| --- | --- |
| B0/B1/B2历史准备、V2创建及镜像审核 | 历史已执行，可复用证据；本轮只核对身份 |
| 原V2创建的network_rejected | 已失败，原failed保留 |
| recover-created | 历史在claim前失败；本轮未重试，指纹阻断未解除 |
| initdb/bootstrap实际执行及SQL核验 | 未运行 |
| 001—020、账本、ready/schema/ACL | 未运行，受恢复及版本选择阻断 |
| 26项订单真实PG | 源码已准备，未运行，当前源码另有021兼容阻断 |
| 021 CHECK/FK/UNIQUE/权限/事务/账本原子性 | 计划及部分用例已准备，真实验证未运行，适配与覆盖仍需补齐 |
| 11项支付真实PG | 本轮11跳过；V2入口尚未适配，不能称准备即可执行 |
| 库存/重复确认/取消与过期并发 | 用例存在，真实PG未运行 |

下一次具体授权应是上述**同一资源的追加身份核验/登记方案**（仅在接受原始基线缺失的不确定性后），不是启动恢复。若找回原始规格并证明等价，可先在当前本地修复授权范围内实现规范化及离线负例，再申请一次recover-created和首次initdb/bootstrap写入授权。

即使本地恢复及全部真实PG通过，也不能直接部署：先另行授权只读核验Neon/Render实际service/branch/endpoint、三角色/owner/继承/PUBLIC ACL、账本及catalog；再审核部署档案、备份/维护窗口、身份登记和精确021计划，分别授权迁移、Render部署及限定用户端到端验收。详见现有STAGING_DEPLOYMENT_PREPARATION；本轮没有完成这些外部条件。

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

## 2026-10-28 最小补缺源码修复：离线完成，恢复与021执行仍关闭

本节是前述只读复核后的新增工作，不覆盖历史。用户本轮仅授权本地修复/离线测试/文档，未授权Docker或数据库写入；本轮未调用Docker、数据库、Neon、Render或Git命令，未构建镜像/准备上下文，保留全部已有未提交修改。原锚点、私人回执和资源身份未改。

### 原指纹追溯的新增证据

找到原生成命令的本机会话证据：`C:/Users/USER/.codex/sessions/2026/10/24/rollout-2026-10-24T21-57-42-01a16e33-f738-7f22-a18a-75483e2fae62.jsonl`第10700行，实际事件时间2026-10-27T14:56:07.085Z；工具input文本SHA256为`afcd72607586c328295bc1da4fdee531213ce71a9c9cc53cba07ff77e8ed004a`。这是本机会话来源，不作为外部签名证明，也不把会话中的旧授权当作本轮授权。

生成器直接调用Docker inspect并JSON.parse，然后按Id、Created、Image、Config、HostConfig、Mounts顺序构造spec，执行Node `sha256(JSON.stringify(spec))`；volume同样用固定顶层字段。没有PowerShell ConvertTo-Json、replacer、pretty-print或深层规范化，没有Mounts排序。只保存锚点及脱敏网络audit，没有保存完整容器原始spec。当前recovery.mjs和controller.mjs仍按这一算法比较。因此已解释生成规范及顺序敏感缺陷，但未找到足以逐字段重建原始容器规格的证据。前轮全部Mounts排列未复现的结论仍有效；不能宣称已证明仅有非语义差异，也不能重新计算历史摘要使其放行。

新增`resourceFingerprintV2`及`canonicalResource`仅用于未来独立身份登记：对象键按固定顺序，Mounts按唯一Destination排序；保留所有字段值、null与缺省区别、Env/Cmd等数组顺序；拒绝重复挂载目标及undefined/非有限数/稀疏数组等有损JSON输入。返回带version/encoding的完整snapshot及摘要，未来登记时必须在受限目录保存snapshot（含内部标记，不能公开）。旧recoveryReceipt和启动后的controller仍只认v1原摘要，未接入新函数，旧锚点不变。已用离线负例证明真正挂载变化及语义数组重排改变新摘要。

### 明确版本边界修复三个测试冲突

- `loadMigrations()`默认仍为`exact020`，当前21文件源码目录会被拒绝。新增显式离线`workspace021-baseline020`投影：21个文件必须与现有staging计划精确同名、同摘要，前20必须逐项等于历史manifest，021还固定本轮已审查摘要；全部真实文件逐一哈希后只返回历史20项和原manifestHash。没有把021混入历史执行器，也不忽略未知扩展。
- `sourceManifest()`默认仍为`baseline020`、version=1、45文件/20迁移；新增显式`staging021`产出version=2、51文件/21迁移。新增三个staging模块、部署配置JSON、21计划JSON；离线测试逐个检查相对import闭包及配置依赖。所有迁移先核实摘要，包/锁依赖仍核对。
- 新增`verifySourceArtifact`用于离线核对版本化封存及文件内容。实际`verifyArtifact`执行入口仍明确拒绝version=2。未知profile、错误bundle摘要、改过的业务文件、改过的001或021、额外022及不匹配计划均拒绝。
- B0实际源检查显式选离线20投影；两个artifact测试显式选staging021。历史version=1、45文件、20迁移、禁止服务入口的原断言保留在新增的独立精确020临时树用例，且执行真实verifyArtifact；默认工作区021拒绝也有负例。没有通过删迁移、改历史manifest或把默认执行范围变为21来凑通过。

### 021运行器适配程度与最小后续设计

**打包和离线封存适配完成；运行器执行适配尚未完成。**当前prepare脚本、host、runner、grant和SQL身份校验仍是v1/020协议，不会选用离线v2包。没有新增一个可隐式执行021的purpose。改变白名单源码也不会改变已批准镜像，旧批准仅针对旧封存输入。

下一段实现应继续扩展同一协议，先完成设计审查与离线验证：

1. 保持v1的bootstrap/initialize/ready/business用于已封存020版本，保留20账本、catalog基线及26项结果。当前工作区业务依赖021列，不能声称与020兼容；旧封存版本测试结果也不能替代当前源码验收。
2. 为同一V2增加独立schema版本/阶段和固定upgrade021、ready021、payments021用途，grant绑定精确计划、前置020验收回执和21源码bundle；不得借用旧ready作为21就绪。原phase8_control.migrations/schema_baseline不覆盖，增量登记必须保留旧证据。
3. 现有run021使用public.stall_schema_migrations及staging_control锚点，与V2账本布局不同；必须设计受控适配器，先核验20账本再同一事务执行021/最小ACL/新增阶段账本/审计，不直接运行现有loopback测试的初始化分支。角色亦需解决专用authorizationRole与现有V2四秘密的映射/登记，不能复用observer获得写权限。
4. 复用11项真实场景的业务函数、seed和PID/锁等待观察，改成固定身份注入接缝而非放宽loopback URL；不发布端口、不连接任意URL。补真实DDL/ACL/阶段账本/审计中途故障整体回滚及请求键UNIQUE负例。以上不是本轮已实现的执行能力。

### 本轮实际验证

Node v24.16.0。执行9文件：phase8-safety、phase8-remediation、phase8-v2、phase8-recovery、phase8-business、phase8-version-boundary、staging-deployment-safety、staging-payments、staging-postgres.integration。命令为`node --test --test-reporter=tap`后接上述`backend/tests/*.test.mjs`完整文件路径；精确命令沿用前节8文件并加入`backend/tests/phase8-version-boundary.unit.test.mjs`。日志`.local/phase8-readonly/repair-final.tap`。

**最终407项：396通过、0失败、11跳过、0取消。**新增版本/指纹回归18项通过，前节3项冲突已解决。11跳过仍是真实PG用例未运行。中间178项、16项及405项结果仅为同轮中间验证，不重复相加；最终结果不与历史通过数量累计。相关MJS语法检查通过。无真实恢复、bootstrap、迁移、ready、26业务或11支付PG执行。

### 下一步需要的授权

资源等价仍不能证明。下一次仅建议单独授权：在操作者独占窗口对**原精确ID的同一容器/卷/网络**重新核验完整安全字段、原失败材料/Engine/镜像身份，追加独立v2身份登记（固定原锚点摘要和全部完整snapshot摘要，wx/fsync新文件、保留原失败及旧锚点，人工审查剩余不确定性）。本轮未实施登记，也未启用新恢复协议。登记授权不包括启动、initdb、数据库连接或写入；后续绑定追加登记的恢复机制实现并离线验证后，再单独申请首次启动/引导授权。021执行入口仍需上述源码工作，不应现在批准数据库测试执行。

## 2026-10-28 21:15 UTC+8：同一V2只读重新核验，追加身份登记停止

本轮用户单独授权只读重新核验，且仅在全部强制条件和证据充分时追加身份；第7条明确要求“如果发现实质差异或证据缺失，停止登记”。实际核验时间2026-10-28T13:14:10.714Z，ACL补充13:14:37.4268510Z，最终判定13:15:11.743Z（Asia/Kuala_Lumpur UTC+8）。**没有创建新身份登记、created/recovery回执，没有启动或修改Docker资源。**

### 资源与依据逐项对照

| 项目 | 本轮真实只读结果 | 对照依据与结论 |
| --- | --- | --- |
| Engine | 055d945d-b3f7-4a50-adaa-423c2cde2b60 / 29.6.2 / Linux amd64；显式本地desktop-linux管道 | 与原锚点相同 |
| 容器 | 04d174ff32ab69b3eae39ee5b067d309a26132f87185baabcfada5247d0b593f；2026-10-27T14:43:54.913235797Z | ID/创建时间与原锚点相同；created、PID0、RestartCount0、零StartedAt/FinishedAt、无错误/paused/dead/restarting |
| 网络 | e269447bc2094406480763cbfde870c32c2ccc298d756910daad21c13cce81d4；2026-10-27T14:43:50.847655525Z | ID/创建时间相同；NETWORK_COMPATIBILITY_AUDIT中16个选定字段逐项规范化比较全部相同，包括IPAM/Options/Labels/成员 |
| 隔离配置 | bridge/internal/isolated、IPv4=true、IPv6=false；172.23.0.0/16单子网无gateway、无成员；无宿主端口、单网卡 | 独立调用现有纯topology检查通过；不是实际运行出站连通性测试 |
| 卷 | stall-phase8-r2-data；2026-10-27T14:43:47Z；local driver/scope、空options | 创建时间/标签/整体规格摘要与原锚点相同；未读取卷内部内容 |
| PG镜像 | postgres@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36 | 实际ID/RepoDigest及linux/amd64与既有批准一致；镜像Created=2026-10-21T22:57:10.664514874Z |
| runner镜像 | stall-phase8-r2-runner@sha256:c3752474aa41668d4e95400c38a2645957195fab3bf51031e6c65d6d6d210303 | 实际ID/RepoDigest/平台与批准一致；Created=2026-10-27T15:12:01.874173967Z；bundle标签6a040792d3c8f8a205dd578cb04cf5c4dc5ada98af00573b62b2ec59a4cc2a29匹配旧封存批准 |
| Node镜像 | node@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae | 实际ID/RepoDigest/平台一致；Created=2026-10-21T11:35:50.393702483Z；没有重复供应链审查或构建 |
| 挂载 | 8项：数据专卷RW；两个bootstrap脚本、launch及四secret均只读bind；精确路径/类型/集合核验通过 | 与BOOTSTRAP_START_AUDIT排序挂载集合摘要相同；文件regular/non-symlink/nlink=1，四secret均64字节；未读secret内容 |
| Config / HostConfig | 摘要502033d9… / 9e542aa6… | 与10月27日诊断摘要相同；不是与最初锚点原spec的逐字段证明 |
| 原容器整体摘要 | 当前52630d7d79fd3c7df44ce2b90e4b7249a69dfd83d4f1af1d83e93250b3438c1d；原62953d3799d6e410eca4a36edce41c864ec14760030b33bec8aed5fe8e0f9c45 | **不同且未解释**；不能因为其他摘要相同或新规范化稳定就认定原始完全等价 |
| 原失败材料 | attempt/failure/launch原字节摘要全部匹配；failure仍container/network_rejected | 原文件未改；records仍只有原三材料及runner-build-metadata；没有created/recovery回执 |
| 资源库存 | 精确3项本项目资源，无其他V2 runner容器 | recoveryInventory纯策略检查通过，不涉及创建/启动 |
| 私人ACL | 宿主PowerShell7.6.5查询12对象，owner、三主体FullControl、根禁继承及继承标志通过 | 首次嵌套Windows PowerShell5模块加载失败；改用宿主只读查询解决，未改ACL |

原锚点文件字节SHA256仍为`6acc14a560334d28e84db95627b0d1fd9a9bf9cfa21c77a95ce4b477c4329b27`，核验结束再次复查原证据摘要未变。本轮新规范化观测摘要`46ada2e50dc6083df6bd95a570eb27a578335e4be4546fbb5df1cb97cf17b05f`在三次inspect中相同，**仅是本轮观测，不是新安全锚点、批准身份或原资源等价证明**。

### 判定、日志和剩余限制

19项当前静态策略/身份检查，在独立ACL补充后全部通过；这是只读检查项数，**不是新增19项业务测试通过**。没有重跑前轮407项离线测试，不重复累计。原容器整体摘要不匹配及证据完整性判定另列为阻断，不能把19项通过写成总体登记通过。

依据第7条停止登记：原始完整container spec仍缺失，无法解释原摘要与当前摘要差异；已检查的历史仓库审计记录了挂载路径及inspect元数据摘要，但未找到两个bind bootstrap文件原始内容摘要，路径相同不证明文件内容历史相同。当前文件摘要已只读记录：bootstrap.sh=`4ff0995fa5538b4828b3cdba84b4207ca493fbd31d04900f119bf0f11a0534dc`；bootstrap-entrypoint.sh=`ed6f0a4a0553674307ba21e718c18f6e4751d14bbda0da4c1a36e88e87bbc02b`。这两项是历史可证明性缺口，不声称发现了实质配置篡改。

原始本轮核验日志（追加新文件，不改历史audit）：

- `.local/phase8-readonly/identity-audit-1793193250777.json`，SHA256=`2fe55dd0295a8fdadf0c419854a3690732aa9eaad51b624750be84571719dabb`；保留首次ACL查询失败，不能单看它断言ACL失败或成功。
- `.local/phase8-readonly/identity-acl-supplement.json`，SHA256=`1bc63da0b830e358e54f5a24c96830d05e5dc3515bfdbba9ab47955a79a5a816`；独立补充查询成功。
- `.local/phase8-readonly/identity-decision-1793193311755.json`，SHA256=`76b025472cb9520ba4c1dfd936aa8f9f299dbea01bfa64fa36bf55609e9b509c`；结果blocked_evidence_incomplete、registrationCreated=false、nextRecoveryPreconditionsMet=false。

没有保存含内部nonce的完整inspect到公开文档，也没有在私人目录写新登记。没有验证卷内部从未被外部写入、运行时出口隔离、SQL/bootstrap/角色；没有重新审核镜像字节供应链；当前源码仍不能视为旧批准runner中的源码。Docker管理员可变更资源，静态观测不证明之后持续不变。

**下一次恢复前置条件尚未满足。**优先寻找可验证的原完整规格及bind文件内容基线；如确实不可取得，需要用户明确改变“证据缺失即停止”的登记条件，审查并接受哪些不可还原的历史不确定性，再批准建立“仅证明当前安全配置”的独立基线。现授权没有被解释为接受未知差异；不能重复原授权就宣称缺失已补齐。即使建立独立登记，仍需实现/离线验证绑定新登记且保留旧失败的恢复机制，然后另行授权首次启动/引导；本轮不自动进入该阶段。

021适配状态未变：version2的51文件依赖封存/离线验证已完成；prepare/host/grant/runner/SQL仍需显式21阶段、upgrade021/ready021/payments021固定用途、21 bundle/plan与20前置回执绑定、授权管理角色、staging_control与phase8_control账本适配、独立schema基线/ready、11用例固定注入接缝及真实原子回滚/唯一键缺口覆盖。当前v1执行器继续拒绝v2包；无真实PG结果。本轮没有改这些源码。

本轮副作用仅本地只读核验脚本/脱敏观测日志与现有文档追加。未启动、停止、删除、重建任何容器；未修改网络/卷/镜像/历史失败；无bootstrap/SQL/数据库连接、Neon/Render操作或Git commit/push/reset。

## 2026-10-28 21:35 UTC+8：021固定运行器源码接通，真实执行未授权

本轮按用户指示停止追查旧容器摘要，仅进行必要本地源码修复、离线测试和现有文档追加。无Docker命令/启动/创建/删除/恢复，无数据库连接/迁移、Neon、Render、镜像构建或Git操作；所有既有未提交修改保留。原锚点、回执、资源和001—020 manifest未修改。

### 固定用途、grant与版本

新增用途独立存放在PURPOSES021，旧PURPOSES及version1 grant默认边界保留：

| 用途 | 唯一主角色 | scope | 额外授权 PHASE8_V2_021_AUTHORIZE | 前置结果 |
| --- | --- | --- | --- | --- |
| upgrade021 | migrator | upgrade-020-to-021 | UPGRADE_021_ATOMIC_ONCE | ready_verified（020） |
| ready021 | observer | schema-acl-021-select | VERIFY_021_READ_ONLY | schema021_initialized |
| business021 | app | business-consistency-021 | RUN_EXISTING_26_ON_021 | ready021_verified |
| payments021 | app | payments-021-eleven-cases | RUN_11_PAYMENT_CASES_ON_021 | ready021_verified |

仍需通用V2授权、独占窗口、精确实例、runId、固定镜像/资源/回执验证，以及PHASE8_V2_SCHEMA=EXPLICIT_021_ONLY。version2 grant额外固定schemaVersion=21、baselineManifestSha256、planSha256和prerequisiteSha256；manifestSha256必须等于planSha256。拒绝v1借用021、v2借用旧用途、错误scope/role/版本/计划、URL/命令/任意SQL字段。controller绑定同实例/DB前置回执，后置结果检查schemaVersion/plan及11或26个精确名称；失败结果先保存再拒绝成功，不能只凭通过数冒充完整用例。

镜像批准档案新增可选schemaProfile；旧档案缺省仍为baseline020。021必须使用单独审核的staging021镜像，当前原批准镜像没有这个身份，实际入口仍会拒绝；没有改写已有批准记录。prepare脚本仅在已有显式prepare授权下识别PHASE8_V2_BUILD_SCHEMA=staging021；默认仍baseline020。新封存为version2、54文件、21 SQL，含schema021/payments021/staging migration及完整依赖；verifyArtifact只有显式staging021参数才接受v2包，默认仍拒绝。

宿主在当前21 SQL工作区执行旧020任务，新增显式PHASE8_V2_BASELINE_SOURCE=VERIFIED_021_WORKSPACE_PROJECT_020可使用已验证的21源目录投影20账本（全部21同名/同摘要检查后返回原20项），并配对原baseline020批准镜像。该镜像运行时依然只有20 SQL和原grant。默认不设置此值时仍严格拒绝当前21文件目录；未知值也拒绝。没有改变旧默认入口或重写历史基线。

### 角色、原子升级与独立验收

新增schema021.mjs和未来DBA登记脚本enroll021.sql。登记脚本**本轮没有执行**，不由runner自动调用：只面向当前本机隔离库stall_test_phase8、bootstrap owner、ready/20账本、精确UUID；新增独立非特权stall_test_authorizer和test_only部署锚点，要求新authorizer.secret按已有受限材料规则准备。没有复用observer作写角色、创建超级用户或给API添加授权管理接口。

登记阶段不会修改原public/phase8_control的ACL（否则会破坏020封存）。仅在新的staging_control中创建一个DBA拥有的固定无参授权函数，拒绝非migrator session，仅授予authorizer两schema的USAGE。PUBLIC EXECUTE撤销；升级器逐字核验函数body、owner、SECURITY DEFINER和固定pg_catalog search_path后，在锁定并重新核验020基线的升级事务内调用。没有任意SQL/角色/目标参数。该辅助函数及DBA登记文件仍需未来实际审查和单独执行授权，不用于Neon或生产。

upgrade021由migrator连接执行单事务：超时、advisory锁、原账本SHARE/订单ACCESS EXCLUSIVE锁→在锁内重新验证实际020 catalog/ACL与原基线→核验测试锚点、四角色及只读控制权限→拒绝已有21阶段/公共迁移账本→建立公共账本并复制已验证的20记录→执行固定021 body→固定最小权限→记录021账本、迁移审计和phase8_control.stage021独立catalog基线→独立schema/ACL后验收→COMMIT。原phase8_control.instance、migrations和schema_baseline不更新、不覆盖。任一步失败整事务回滚；COMMIT应答异常标记schema021_commit_unknown并销毁连接，不自动重跑。宿主run attempt及失败证据照旧保留。

旧inspectCatalog要求控制表恰为3项，保持不变。新增inspectCatalog021要求精确4项（唯一新增stage021），验证其owner和应用/观察者只读权限后复用旧业务catalog检查；独立21基线覆盖新结构和ACL。ready021在REPEATABLE READ READ ONLY事务核验原20账本/原存储基线摘要仍完整、公共21账本、阶段实例/计划/状态、实际catalog摘要、021约束、原索引/触发器、迁移审计及有效权限。observer仍无表/列写权限。所有连接借出时验证实际数据库/角色/session_user/UUID/PG16及相应状态；authorizer走独立受限验证，不增加读取或改写旧控制表的权限。

payments021沿用现有runner硬化及受限挂载，只增加两份固定只读secret（migrator和authorizer），合计5个精确挂载；主secret为app。仅此用途允许三个内部固定角色连接池，不接受URL或自选角色，缺材料即拒绝。其他用途仍单角色/3挂载，并拒绝这些额外挂载。测试配置内的Neon形状地址是既有路由策略fixture字符串，仅注入业务函数；真正PG连接全部来自grant的隔离网络IPv4/5432/固定库，绝不连接这些fixture域名。

### 复用26与11项真实PG用例

已有11项支付场景提取到payments021.mjs的PAYMENT_CASES；原staging-postgres.integration.test.mjs与固定runner共同调用同一份断言，没有复制第二套测试。保留约束/权限、真实PID锁等待、并发确认幂等、取消与到期竞争、SQL回滚、真实提交后传输应答故障和终止自身app backend场景。原loopback入口仍保留独立隔离门槛，不放宽URL去接V2；V2使用已验证pool接缝。

business021直接复用已有runBusiness/BUSINESS_CASES的26项，通过已验证的21连接池运行，报告独立schemaVersion=21和用途；没有重复实现订单测试。旧business仍是020用途，配对旧封存版本。当前源码依赖021列，不能把21上的26项未来结果冒充旧020版本的新鲜执行结果。共享seed/真实多连接fixture保留。

### 本轮实际测试与限制

Node v24.16.0；2026-10-28T13:35:39.932Z（21:35 UTC+8）。命令：

`node --test --test-reporter=tap backend/tests/phase8-safety.unit.test.mjs backend/tests/phase8-remediation.unit.test.mjs backend/tests/phase8-v2.unit.test.mjs backend/tests/phase8-recovery.unit.test.mjs backend/tests/phase8-business.unit.test.mjs backend/tests/phase8-version-boundary.unit.test.mjs backend/tests/phase8-021.unit.test.mjs backend/tests/staging-deployment-safety.test.mjs backend/tests/staging-payments.test.mjs backend/tests/staging-postgres.integration.test.mjs`

最终**446项：435通过、0失败、11跳过、0取消**。新增phase8-021.unit为39项离线合成元数据/驱动边界测试；不是真实PG。15个相关MJS语法检查通过。日志`.local/phase8-readonly/021-final.tap`，SHA256=`50cca1db87e6ddfa42fcde813eff934ba5df101bca1f986f3f9cbbea7020bf79`。旧407和各轮中间结果不与446重复累计。

中间失败保留：首次旧artifact测试固定51文件，新增3模块后实际54，更新明确版本2清单断言；新增controller合成夹具最初把runner状态固定为停止而网络夹具仍含运行成员，正确触发network_members_rejected，已修正夹具状态一致性，未放宽策略。最终全部相关离线回归通过。包含真实迁移文件篡改/错误清单/额外SQL的拒绝，以及新版本、角色、实例、状态、catalog/ACL漂移、迁移DDL/账本失败回滚、成功提交/提交未知、额外挂载和失败报告保留。

| 工作 | 状态 |
| --- | --- |
| 021固定用途、grant、权限/账本/独立ready、26+11接入 | 源码完成，离线通过 |
| staging021运行器镜像构建、身份审核与新批准 | 未运行；旧批准不覆盖新源码 |
| 额外authorizer凭据、DBA角色/测试锚点登记 | 未运行 |
| 原V2登记/恢复/首次引导 | 本轮未调查、未执行；之前的阻断保持 |
| 001—020真实迁移及ready、原26项真实订单 | 未运行 |
| 021真实原子升级/schema/ACL、21上的26项订单及11项支付 | 未运行；支付11项本轮跳过 |
| Windows实际额外secret挂载、权限兼容和运行时出口隔离 | 未运行 |
| Neon/Render及手机端到端 | 未运行 |

源码接通不等于数据库执行准备全部完成。真实PG仍须检验DDL、权限、锁/事务和超时行为；本轮提交未知为离线transport边界回归，11场景中的真实提交后传输注入也不等同物理断网或Neon故障转移。迁移中途DDL/ACL/账本/审计整体原子回滚已覆盖离线流程，真实PG故障注入仍待验收，不能用离线结果替代。

### 后续A/B方案比较（均未执行）

| 方案 | 可复用成果 | 剩余工作及主要风险 | 判断 |
| --- | --- | --- | --- |
| A 原V2受控恢复 | 原容器/卷/网络、原凭据和已有镜像/代码审核 | 必须明确接受不可还原的历史证据缺口，追加当前身份登记并实现/离线验证绑定该登记的恢复协议；旧回执不改。随后另行批准启动/引导。仍不能证明原历史规格完全等价，原始争议可能继续影响验收 | 资源操作少，但证据链较弱，完成时间不确定 |
| B 保留原现场，创建新隔离实例 | 同一控制器、grant、镜像供应链材料、迁移器、26+11用例、封存工具与当前021适配全部复用 | 现有V2名称固定且拒绝重名，须先补一个明确版本化的新资源配置（新项目/容器/卷/网络/UUID/私人目录，与旧现场互斥），离线验证拒绝混用；新建前后保存完整inspect/spec及摘要。需授权新实例凭据准备、资源创建/引导和分阶段测试；只对变化bundle重新配对审核，不重做无变化供应链审查 | **优先推荐**：历史现场完整保留，新证据链可完整建立，路径可控 |

B不是从零建设测试框架，也不是当前代码已能在原名称下创建第二套资源；那项固定资源配置适配是明确、有限的下一步源码工作。当前用户没有授权创建，故没有实施。A也不会因本轮021源码完成而自动具备恢复条件。

建议下一步先选择B并授权**仅为新实例增加固定版本化资源配置与完整身份登记生成机制、完成离线验证**；审核具体资源名/UUID/文件清单后，再单独批准新实例的凭据准备、创建/首次引导，以及旧020→021各测试阶段。不要再调查旧摘要，也不要重写旧失败。后续Neon核验、迁移、Render部署仍需独立授权。

本轮最终补验时间2026-10-28T13:38:34.764Z（21:38 UTC+8）：补充拒绝toString等原型属性冒充purpose；最终仍446项/435通过/0失败/11跳过。上列日志SHA对应此次最终输出。
