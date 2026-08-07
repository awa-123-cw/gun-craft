# 枪械工艺 · PS5 DualSense 深度体验设计文档
> 版本：v1.0（2026-08-07）
> 目标：震动、自适应扳机、内置扬声器三重沉浸；手感极佳、体验舒适、沉浸感强；浏览器双通道实现，自动降级。

## 一、体验原则
1. **克制**：震动是信息的载体，不是噪声。单发干脆、连发绵密、重武器沉重，每把枪“一摸就知道”。
2. **不疲劳**：所有重事件强度上限 0.9；同帧多事件合并，只发最强效果。
3. **可关闭**：震动强度、自适应扳机、扬声器、瞬身冷却提示震动均有独立开关。
4. **沉浸**：受击方向、瞬身方向、Boss 阶段等大事件用手柄本体“演”出来；扬声器只放短促机械音，音量低。

## 二、浏览器能力矩阵（已实测确认）
| 能力 | 标准 Gamepad API | WebHID 直连（输出报告 0x02/0x31） | DualSense USB 音频端点 |
|---|---|---|---|
| 双马达震动 | ✅ `dual-rumble` | ✅ 字节 2/3 | ⚠️ 与马达冲突，**不采用** |
| 扳机震动 | ✅ Chrome 126+ `trigger-rumble` | ✅ Vibration 模式 0x26 | ⚠️ 不采用 |
| 扳机阻力/两段扳机 | ❌ | ✅ Feedback 0x21 / Weapon 0x25 | ❌ |
| 内置扬声器 | ❌ | 仅音量/路由标志 | ✅ 4 声道音频端点 |
| 高保真触觉 | ❌ | ✅ 马达字节 | ⚠️ 与马达冲突，不采用 |
| 支持浏览器 | 全部 | Chrome / Edge / Opera | Chrome / Edge / Opera |

**降级链**（按可用性自动选择）：
1. WebHID 已授权且已连接 → 完整体验（马达 + 自适应扳机 + 扬声器音量控制）。
2. WebHID 不存在/未授权/失败 → 标准 Gamepad API：`dual-rumble` + Chrome 126+ 的 `trigger-rumble`（仅扳机振动，无阻力）。
3. 均不可用 → 无触觉，UI 明示当前通道。

**注意**：DualSense 的马达震动与 USB 音频触觉（声道 0/1）互斥——本设计**只用 HID 马达震动**，USB 音频端点**只用于扬声器声道（声道 2/3）**，两者天然不冲突。

## 三、总体架构
在 index.html 的 `<script id="game-script">` 内新增三个模块（全部封装进 `createGame` 返回的 `Game`，测试可直接调用）：

### 3.1 `dualsense` —— WebHID 驱动（核心）
- 设备过滤：`{vendorId:0x054c, productId:0x0ce6}`（DualSense）、`{vendorId:0x054c, productId:0x0df2}`（DualSense Edge）。
- 连接：优先 `navigator.hid.getDevices()`（刷新后自动重连），其次 `requestDevice`（需用户手势，由“连接手柄”按钮触发）。
- 监听 `navigator.hid.addEventListener('disconnect')`：标记断开，若有授权设备则自动重新 open。
- 输出报告（USB，`sendReport(0x02, data)`，data 不含报告 ID）：
  ```
  data[0]  = 0xFF              // flags1（全开）
  data[1]  = 0x57              // flags2（马达+扳机+音频）
  data[2]  = rumbleA（强/高频马达，0-255）
  data[3]  = rumbleB（弱/低频马达，0-255）
  data[4]  = 耳机音量（0x00-0x7F，置 0）
  data[5]  = 扬声器音量（0x00-0x64）
  data[6]  = 麦克风音量（置 0）
  data[7]  = 音频路由标志
  data[8]  = 麦克风 LED
  data[9]  = 麦克风静音标志
  data[10..20] = R2 扳机效果块（11 字节）
  data[21..31] = L2 扳机效果块（11 字节）
  data[36] = 扬声器前级增益（0-7，Bit4=beamforming）
  data[38] = LED 选项；data[41]=脉冲；data[42]=亮度；data[43]=玩家灯
  data[44..46] = 灯条 RGB
  ```
- 蓝牙（0x31，78 字节）：`[0]=0x31, [1]=0x02`，随后布局整体右移 2（flags 在 2/3，马达 4/5，R2 块 12..22，L2 块 23..33），最后 4 字节 CRC32（poly 0xEADA2D49，覆盖含报告 ID 的 0..73）。蓝牙为 best-effort：写入失败立即降级到标准 Gamepad API 通道。
- 写节流：≤60Hz；**仅当报告字节变化时才发送**；页面不可见（`visibilitychange`）时全部暂停并归零。
- 若 `typeof navigator.hid === 'undefined'` → 直接进入降级通道。

### 3.2 `haptics` —— 事件震动管理器
- 调度模型：`haptics.rumble(strong, weak, durationMs, opts)`，内部维护“当前目标强度 + 每帧衰减 + 到期归零”，60Hz 同步到马达字节。
- 优先级：同帧多事件只发优先级最高者（击杀 > 受击 > 命中 > 拾取）。
- 低血量心跳：独立 ticker，0.9Hz 双搏，最长持续 3 秒，强度随血量降低增强。
- 连发持续震动（冲锋/加特林/钻头）：由“持续源”管理，开火期间持续输出，松键/停火后 120ms 内淡出。

### 3.3 `speakerSfx` —— 内置扬声器
- 检测：`navigator.mediaDevices.enumerateDevices()`（先请求一次 getUserMedia 权限以解锁设备名），找 `kind==='audiooutput'` 且 label 含 “Wireless Controller” 的设备。
- 路由：`new AudioContext({ sinkId: deviceId })`；`destination.channelCount = 4; channelCountMode='explicit'; channelInterpretation='discrete'`；SFX 总线接到扬声器声道（按 nondebug 参考实现的声道映射）。
- 音量：HID 设置 `data[5]=0x00-0x64`、`data[36]=preamp`、`data[7]=audio flags`。
- **失败静默降级**：扬声器不可用时相关 SFX 一律不播，绝不落到电脑扬声器。
- 扬声器 SFX 清单（全部短促、低音量 gain≤0.14）：
  | 时机 | 音色 | 时长 |
  |---|---|---|
  | 换弹开始 | 弹匣咔哒 | 40ms |
  | 换弹完成 | 上膛咔嗒 | 60ms |
  | 空枪击发 | 轻“咔” | 30ms |
  | 瞬身 | 嗖（噪声扫频） | 120ms |
  | 击杀 | 短促“叮” | 80ms |
  | 低血量 | 低频双心跳 | 各 90ms |
  | Boss 警报 | 低短鸣 | 150ms |

## 四、连接 / 授权 / 重连流程
1. 开始界面/暂停菜单出现“连接 PS5 手柄（增强触觉）”按钮（仅 WebHID 可用时显示；已连接则显示“已连接”）。
2. 点击 → `requestDevice` → 用户选择手柄 → open → 发送一条测试报告。
3. 成功：播放确认震动（0.2s）+ 扬声器“咔哒”；状态显示“增强模式（自适应扳机已启用）”。
4. 失败/取消/无 WebHID：自动切到标准 Gamepad API 通道，状态显示“标准震动”。
5. `disconnect`：自动尝试 `getDevices()` 重连；失败则回到标准通道；游戏不中断。
6. 偏好设置持久化：`localStorage['guncraft_haptics']`（震动强度/扳机/扬声器/冷却提示）。

## 五、震动事件表
强度为 0~1，最终输出 = 事件强度 × 主强度滑条（默认 0.85），上限 0.9。
A=强/高频马达（data[2]），B=弱/低频马达（data[3]）。

| 事件 | A | B | 时长 | 说明 |
|---|---|---|---|---|
| 命中敌人 | 0.25 | 0.10 | 60ms | 轻点 |
| 暴击 | 0.50 | 0.30 | 120ms | 双响（间隔 60ms）|
| 击杀 | 0.70 | 0.50 | 200ms | 双击+衰减 |
| 玩家受击 | 0.80 | 0.60 | 350ms | 按受击方向偏置 A/B 比例 |
| 换弹开始 | 0.15 | 0.00 | 50ms | 咔哒 |
| 换弹完成 | 0.40 | 0.25 | 160ms | 确认脉冲 |
| 瞬身 | 0.50 | 0.30 | 200ms | 按位移方向偏置 |
| 瞬身冷却完成 | 0.10 | 0.00 | 40ms | 可关 |
| 低血量 | 心跳节奏 | — | 循环≤3s | 强度随血量降低增强 |
| Boss 警报/阶段 | 0.90 | 0.70 | 600ms | 低吼 |
| 金币拾取 | 0.08 | 0.05 | 40ms | 高频滴 |
| 购买/开箱 | 0.35 | 0.20 | 200ms | 确认 |
| 切枪 | 0.12 | 0.00 | 60ms | 软咔哒 |
| 波次倒计时结束/敌人警觉 | 0.40 | 0.20 | 150ms | 双短脉冲 |
| 胜利 | 0.50→0.60→0.70 | 0.30→0.40→0.50 | 900ms | 上行三连 |
| 死亡 | 0.90 | 0.80 | 800ms | 下行 |
| 初始房 NPC 挑战 | 0.90 | 0.70 | 500ms | 变身体验 |

**受击/瞬身方向偏置**：计算事件方向相对当前准星方向的夹角；来自左侧 → A 马达更多，来自右侧 → B 马达更多。若实机发现左右反了，交换 data[2]/data[3] 即可（代码注释注明）。

## 六、自适应扳机设计（核心）
### 6.1 官方 11 字节效果块编码
```
block[0] = mode
block[1] = activeZones 低字节
block[2] = activeZones 高字节
block[3..6] = strengthZones（每区 3bit）
block[7..8] = 0
block[9] = frequency（仅 Vibration）
block[10] = 0
```
- `Off=0x05`：全零。
- `Feedback(position, strength)`：zones i=position..9 置 active；`strengthZones |= ((strength-1)&7)<<(3*i)`。position 0-9，strength 1-8。
- `Weapon(start, end, strength)`：`activeZones=(1<<start)|(1<<end)`，`block[3]=strength-1`。start 2-7，end start+1..8。
- `Vibration(position, amplitude, frequency)`：同 Feedback 的区编码（amplitude-1），`block[9]=frequency`。amplitude 1-8，frequency 1-255Hz。

### 6.2 每帧动态阻力
每帧读取 `gp.buttons[7].value`（0..1 → 区 0..9）：
- 两段扳机枪（狙击/手炮等）：按 pull 深度切换效果块（阈值以下轻阻、以上重阻），实现“二段扳机”。
- 蓄力枪（高斯）：pull 越大阻力越强（分段阶梯）。
- 全自动枪（冲锋/加特林/钻头）：开火时切 Vibration 持续扳机振动。
- **块字节不变则不写**；扳机松开 → Off 块。

### 6.3 15 种枪身 R2 手感表
| 枪身 | 常驻扳机（R2） | 开火反馈 | 开火马达 | 手感关键词 |
|---|---|---|---|---|
| 标准枪身 | Feedback pos1 str7 | 开火=自动扳机 16Hz/amp6 | A0.30 B0.15 80ms | 干脆轻快 |
| 冲锋枪身 | Feedback pos0 str6；开火=自动扳机 28Hz/amp6 | Vibration 短促 | A0.25 B0.30 120ms 持续 | 绵密压制 |
| 霰弹枪身 | Weapon 2→7 str8；开火=自动扳机 12Hz/amp8 | Feedback pos2 str8 | A0.85 B0.70 350ms | 沉重后坐 |
| 狙击枪身 | 二段：pull<45% Feedback pos0 str4；≥45% Feedback pos1 str8；开火=自动扳机 8Hz/amp8 | Feedback pos1 str8 | A0.90 B0.75 450ms | 精密二段 |
| 重型枪身 | Feedback pos0 str7；开火=自动扳机 14Hz/amp7 | 双脉冲 Feedback pos2 str7（90ms 间隔） | A0.60 B0.50 250ms | 厚重压制 |
| 三点火枪身 | Feedback pos2 str6；开火=自动扳机 18Hz/amp6 | 三连脉冲 Feedback pos2 str6（60ms 间隔） | A0.35×3 各 50ms | 三连节拍 |
| 左轮枪身 | Feedback pos0 str8；开火=自动扳机 10Hz/amp8 | Feedback pos2 str8 短 | A0.60 B0.40 130ms；暴击×1.5 | 硬朗重扣 |
| 高斯枪身 | 动态蓄力：Feedback pos0 str4 → pos2 str7 → pos4 str8；开火=自动扳机 20Hz/amp8 | Vibration pos2 amp5 freq60 短 | A0.90 B0.80 400ms | 蓄能释放 |
| 齐射枪身 | Weapon 2→5 str8；开火=自动扳机 14Hz/amp8 | Feedback pos2 str8 | A0.70 B0.60 300ms | 齐射轰鸣 |
| 加特林枪身 | Feedback pos0 str5；开火=自动扳机 45Hz/amp7 | 持续扳机振动 | A0.20 B0.50 交替持续 | 转管咆哮 |
| 二连冲枪身 | Feedback pos1 str5；开火=自动扳机 22Hz/amp6 | 双脉冲 Feedback pos2 str5（70ms 间隔） | A0.30×2 各 60ms | 双连点射 |
| 手炮枪身 | Feedback pos2 str8；开火=自动扳机 10Hz/amp8 | Feedback pos2 str8 + Vibration amp4 freq20 300ms | A0.90 B0.85 500ms | 重炮轰鸣 |
| 等离子枪身 | Vibration pos0 amp4 freq22（能量嗡嗡）；开火=自动扳机 30Hz/amp7 | Vibration amp4 freq30 短 | A0.40 B0.30 150ms | 能量束 |
| 泵动枪身 | Feedback pos1 str6；开火=自动扳机 8Hz/amp8 | Feedback pos2 str6 快；上膛时 Weapon 2→6 str7 | A0.50 B0.35 120ms | 泵动机械感 |
| 钻头枪身 | Vibration pos0 amp4 freq24；开火=自动扳机 36Hz/amp7 | 持续中频；穿透命中加强脉冲 | A0.45 B0.40 持续 | 钻头撕扯 |

**L2（可选增强，建议实现）**：长按 L2 = 慢动作瞄准（与空格一致的新手柄映射）；按住时 L2 阻力 Feedback pos4 str2 轻柔阻尼。若实现中发现与现有操作冲突，回退为仅保留阻力反馈。

### 6.4 标准通道降级（无 WebHID 时）
- 开火：`vibrationActuator.playEffect('dual-rumble', {duration, strongMagnitude, weakMagnitude})`。
- 扳机：Chrome 126+ 尝试 `playEffect('trigger-rumble', {duration, leftTrigger, rightTrigger})`（按枪型给 R2 强度 0.3-1.0、时长 60-300ms）；失败静默跳过。
- 持续震动（加特林等）：每 400ms 重发一次，停火后立即发 0。

## 七、接入点（游戏内挂接）
| 游戏事件 | 函数（现有） | 动作 |
|---|---|---|
| 开火 | `fireOnce(g)` | 按 `g.parts.body.id` 触发扳机脉冲 + 马达 + 扬声器空枪声 |
| 命中 | `damageEnemy` 的 `hit` 分支 | 轻震；暴击双响 |
| 击杀 | `killEnemy` | 击杀震动 + 扬声器叮；Boss 特殊 |
| 受击 | `damagePlayer` / `applyRawDamage` | 方向偏置强震 |
| 换弹开始/完成/自动换弹 | `updateGun` | 咔哒/确认 + 扬声器 |
| 空枪 | `updateGun`（mag==0 点击） | 轻“咔”+ 极轻震 |
| 瞬身 | dash 触发处 | 方向脉冲 + 扬声器嗖 |
| 瞬身冷却完成 | dash.cd 归零帧 | 可选轻震 |
| 低血量 | 现有 30% 检测处 | 心跳循环 |
| 金币拾取 | pickup 处理处 | 高频滴 |
| 开箱/购买 | chest/shop 处理处 | 确认脉冲 |
| 切枪 | wheel/按键切换处 | 软咔哒 + 更新 R2 手感 |
| 波次 | waveState 倒计时结束 | 双短脉冲 |
| Boss 阶段/击败 | killEnemy(boss)/阶段切换 | 低吼震动 |
| 胜利/死亡 | setScreen('win'/'dead') | 上行/下行序列 |
| 每帧 | update() 末尾 | 按当前枪 + R2 pull 更新扳机块；心跳/持续震动调度 |

## 八、设置面板
暂停菜单新增“手柄”按钮 → 面板：
- 设备状态 + 通道（增强 / 标准 / 无）+ “连接手柄”按钮
- 震动强度滑条 0-100（默认 85）
- 自适应扳机开关（默认开）
- 手柄扬声器开关（默认开）
- 瞬身冷却提示震动开关（默认开）
- 所有设置写 localStorage，重启生效

## 九、性能与舒适度约束
- HID 写 ≤60Hz、字节变化才写、visibilitychange 暂停。
- 事件上限 0.9；同帧合并取最强；持续效果淡出 ≤120ms。
- 触觉时钟独立于游戏 slow-mo（不受减速影响）。
- 所有失败路径静默降级，绝不抛出到游戏循环（try/catch 包裹每个 HID 写）。

## 十、测试计划（tests/smoke.test.js 追加）
1. WebHID mock（HIDDevice：`open/close/sendReport` 捕获 + `addEventListener`）。
2. 15 种枪身开火 → 断言 R2 效果块字节（mode + zones 编码正确）。
3. 扳机松开 → Off 块（0x05 全零）。
4. 事件表 → 马达字节正确（受击方向偏置、击杀双击）。
5. 无 WebHID → 走 `vibrationActuator.playEffect`（mock 断言调用）。
6. 节流：一帧内连续触发 100 次，写次数 ≤ 61。
7. 断线重连：`disconnect` 事件 → 自动 open。
8. L2 慢动作：手柄 L2 按下 → 等效 Space 慢动作。
9. 现有 123 条测试全部保持通过（`node --test tests/smoke.test.js`）。

## 十一、实施顺序（子代理任务）
按 3.1 → 3.2 → 3.3 → 接入点 → 设置面板 → 测试 的顺序实现；每完成一层跑一次 `node --test tests/smoke.test.js`。

## 十二、实机修复记录 v1.1（2026-08-08）
- USB 输出报告 payload 修正为 47 字节（HID 描述符 95 2f）。Windows 的 WebHID 会拒绝超过报告最大长度的数据，原 64 字节导致 sendReport 抛错并降级到标准通道，自适应扳机完全不生效。
- 蓝牙报告：payload 去掉报告 ID 字节（0x31 描述符 77 字节）；CRC 算法修正为 DualSense 专用校验（init 0xEADA2D49 + 标准 CRC32 表 0xEDB88320，无最终异或，覆盖含报告 ID 的前 74 字节）。
- 扳机效果块力度位打包修正为 uint32 跨字节累加（与 dualsense-ts 官方编码一致）：原实现按字节直接位移，力度≥2 时多数区被清零，等于无阻力。
- 标准枪身/冲锋枪身常驻阻力由强度 2 提到 3（二连冲保持 3/2 以维持 15 枪 rest 块唯一），确保首次上手即可明确感知。

## 十三、实机修复记录 v1.2（2026-08-08）
- 手柄背包界面新增"方键=丢弃选中部件"（与鼠标红叉同规则，已装备同类仍拒绝），选中行红叉高亮 + 底部提示条；叉键装备、圈键关闭不变。
- 手柄设置面板新增"扳机自检"：依次发送 阻力(feedback 0/8) → 段落(weapon 2-8/8) → 扳机振动(vibration 0/8/30Hz)，各 1.2s，可直接验证硬件链路。
- 降级诊断：WebHID 通道若写入失败，面板显示具体降级原因（USB/蓝牙初始报告或写入失败信息）。
- 默认手感强化：标准枪身 Feedback 4/3→4/5、冲锋 3/3→3/4、霰弹 Weapon 3→7/3→2→8/4，确保首次上手即可明确感知阻力和段落。

## 十四、实机修复记录 v1.3（2026-08-08）
- 阻力起点整体提前：多数枪由区 3~5（30%~50%）提前到区 1~2（10%~20%），其中手炮/泵动/重型 10% 起阻，狙击第一段 10% 起、二段 20% 强力（str8）。
- 段落感强化：霰弹 Weapon 2→7 str8、齐射 Weapon 2→6 str7（强力双段+释放回弹），高斯三段阶梯更分明（0/3/6 → 3/6/8），开火脉冲同步加重（标准 2/7、左轮 2/8、重型双段 2/7 等）。
- 修复 weaponBlock 官方编码：start/end 位需合成一个 16 位掩码再拆高低字节；原实现把 end 位单独放进高字节，导致段落结束点被固件读成 zone 8（段落感错位/偏弱）。

## 十五、实机修复记录 v1.4（2026-08-08）
- 阻力起点再次提前：多数枪起阻区 0~1（0%~10%），强度普遍 6~8（接近最大）；霰弹/齐射保持 Weapon 最短起点区 2、强度 8。
- 开枪时自适应扳机切换为"自动扳机"模式（Vibration 0x26）：每把枪独立频率/振幅（标准 16Hz/amp6、加特林 45Hz/amp7、霰弹 12Hz/amp8、钻头 36Hz/amp7 等），从 0 区起振，按住即强烈循环振动；松开回 Off，非开火保持各自阻力/段落。
- 修复连按扳机偶发完全线性：HID 写队列串行化（sendNow 链式排队），lastPayload 仅在顺序完成后更新，消除异步乱序完成导致"控制器已处于 Off 而游戏以为已发阻力"的竞态。
- 开火事件、自检、自动扳机切换各加回归测试（138 → 140）。
