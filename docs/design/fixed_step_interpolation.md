# 固定物理步 + 滞后一拍渲染插值 + 相机去平滑 设计

> 状态：**已实现**。本文档保留为设计决策与实施记录；实现细节以代码与模块文档（[`src/physics/physics.md`](../../src/physics/physics.md)、[`src/entity/character/physics/physics.md`](../../src/entity/character/physics/physics.md)、[`src/modes/play/play.md`](../../src/modes/play/play.md)）为准。
>
> 实施记录：
> - 复用 `MAX_SUB_STEPS = 3` 作为单渲染帧物理步上限，未新增常量。
> - `MAX_DT` 由 `0.033` 调整为 `0.05`，使 3 步上限真正可达。
> - 插值统一走 `src/physics/render_interpolation.ts`（`WeakMap` 历史 + 传送吸附 `SNAP_DISTANCE = 1m`）。
> - 角色朝向 / 四元数也参与插值（捕获对象姿态后 `slerp`）。
> - 运动平台按固定节点名（`platform` / `gate` / `door` / `doorLeft` / `doorRight` / `lid` / `lever` / `flame` / `glow` / `ring`）逐物理步捕获。
> - 掉落物浮动相位仍用 `performance.now()`（未改为 `simTime`），但浮动后的可视位姿已参与插值；自转相位改为实体内部累加（避免渲染插值写回污染）。
> - `flame` / `glow` 不参与插值：前者按 `+=` 累加旋转、后者只改缩放，写回会污染相位。
> - 血条锚点改用角色渲染位置；锁定瞄准点仍取物理真实位置（差一个物理步，已知可接受）。
> - 玩家相机保留「聚焦进出过渡 / 滚轮距离 / 锁定转向」平滑，仅移除跟随目标 EMA。
>
> 面向读者：物理步进 / 角色物理 / 渲染同步 / 操作方案 / 游玩模式 / 展示模式相关实现者。

## 1. 问题与症状

- 角色在**行走 + 移动**时整体位置跳动、滑动不平顺；**平地也复现**。
- 下落、游泳等其它移动状态存在同类问题。
- 运行环境：60Hz 显示器；抖动表现为「角色整体位置」而非肢体动画频率。

## 2. 根因分析

### 2.1 主因：步数可变，但每步仿真时间恒定

- `src/main.ts:368` 计算渲染帧 `delta`；`src/main.ts:383` 以
  `totalSteps = clamp(ceil(delta / FIXED_TIME_STEP), 1, MAX_SUB_STEPS)` 决定步数。
- 每次 `shared.world.step()` 推进的是 Rapier 内部 `world.timestep`（默认恒定 `1/60`）；全仓库没有任何地方设置 `world.timestep`。
- 因此**每帧仿真时间 = totalSteps / 60 秒，而真实时间 = delta**。60Hz 下 `delta` 在
  `16.667ms` 上下抖动：
    - `ceil(16.6 / 16.667) = 1` → 本帧位移约 6.7cm
    - `ceil(16.7 / 16.667) = 2` → 本帧位移约 13.3cm
- 步数在 **1 ↔ 2 反复翻转**，就是「角色整体位置跳动」的直接来源。平地最明显，因为没有地形与动画遮掩。
- 同一缺陷存在于 `src/physics/fixed_step.ts:31`（展示模式运行器）：它计算了 `subDt` 却**从未使用**。

### 2.2 伴生问题：仿真时间与游戏时间脱节

- 状态机、战斗计时器、动画播放当前使用渲染 `delta` 推进；物理按固定 `1/60` 推进。
- 当步数 ≠ `delta / (1/60)` 时，位移速度与动画/计时器速度不一致，产生滑步与计时漂移。

### 2.3 次因（非本次主诉，暂不处理）

- `src/entity/character/physics/world.ts:1421` 的 `horizontalSpeed` 取原始 `Math.hypot(linvel)`，直接驱动行走/游泳步频与 falling 腿部档位。
- `src/entity/character/appearance/constants.ts:72` 的 `HORIZONTAL_SPEED_SMOOTHING = 0.3` 已定义但全仓库未使用（注释即「抑制速度突变引起的动画频率抖动」）。
- 该问题影响肢体步频，与用户主诉的「整体位置」不同，列为后续可选清理项。

### 2.4 已知噪声（不属本次修复）

- Rapier 陡坡 trimesh 接触法线逐帧交替会产生亚毫米级 60Hz y 抖动（见 `src/entity/character/physics/slope_walk_matrix.test.ts` 的噪声阈值）。
- 本设计通过渲染插值与固定步消除的是**厘米级位置跳变**，不试图消除亚毫米接触噪声。

## 3. 术语

| 术语 | 定义 | 驱动方 | 时间 |
|---|---|---|---|
| 渲染帧（render frame） | 一次 `tick(time)`，即一次 `requestAnimationFrame` 回调 | 浏览器 / 显示器刷新 | `delta` 为真实流逝时间 |
| 物理步（physics step） | 一次 `world.step()` 及配套的每步游戏逻辑 | 累加器 | 固定 `1/60` 秒 |
| 渲染帧率 | 实际每秒执行的渲染帧数（可能低于刷新率） | 运行时负载 | 可变 |
| 刷新率 | 显示器物理刷新频率（60 / 144Hz 等） | 硬件 | 固定 |

- `MAX_STEPS_PER_FRAME` 中的 FRAME 指**渲染帧**：一个 `tick()` 内最多执行几个物理步。
- 「0 步帧」= 某渲染帧内累加器不足一步。
- 「单帧 delta」= 相邻两次 `tick()` 的真实时间差。

## 4. 决策记录

| 议题 | 结论 |
|---|---|
| 物理步长 | **固定 1/60 秒**（不采用 1/30） |
| 追赶策略 | **不追赶**：欠账超过上限直接丢弃（时间膨胀） |
| 单帧步数上限 | `MAX_STEPS_PER_FRAME = 3`（约等于把 20fps 作为实时下限） |
| 渲染插值 | **滞后一拍插值**（在两个物理状态之间按 `alpha` 插值） |
| 插值范围 | **全部动态实体**：角色 / 箱子 / 碎片 / 掉落物 / 运动平台 |
| 相机 | play 与 showcase **存在玩家时**，移除跟随目标 EMA 平滑 |
| 游戏时间轴 | 状态机 / 计时器 / 动画全部按物理步推进 |
| 主循环 | 仍保持单 RAF；渲染帧泵动物理步，但步数由累加器按真实时间决定 |

## 5. 目标架构

### 5.1 固定步时钟与累加器

新增共享时钟（建议置于 `src/physics/fixed_step.ts`，供 `main.ts` 与展示模式复用）：

```text
advance(delta) -> { steps, alpha }
    acc += min(delta, MAX_DT)
    steps = 0
    while (acc >= FIXED_TIME_STEP && steps < MAX_STEPS_PER_FRAME):
        acc -= FIXED_TIME_STEP
        steps += 1
    if (steps === MAX_STEPS_PER_FRAME):
        acc = 0                    // 丢欠账：不追赶，时间膨胀
    alpha = acc / FIXED_TIME_STEP  // [0, 1)
    return { steps, alpha }
```

- 「丢欠账」丢的是**时间**，不是输入与事件（输入边沿另行锁存，见 §5.6）。
- `MAX_DT` 当前为 `0.033`，最多只能凑出 2 步，`MAX_STEPS_PER_FRAME = 3` 永远触发不了。设计上建议把 `MAX_DT` 调到 `0.05`（≥3 步），并保持「单帧 delta 上限」语义。`MAX_DT` 目前仅被 `src/main.ts` 使用。
- 每步清力仍由 `shared.eventBus.onStepEnd(clearAllForces)` 内聚。

### 5.2 play 模式渲染帧时序

```text
const {steps, alpha} = clock.advance(delta)
playMode.sampleInput()                       // 每渲染帧一次：读取输入 -> setPlayerMove

for (let i = 0; i < steps; i++) {            // 每物理步
    interactables.update(FIXED_TIME_STEP)    // 运动学平台瞬移 + 速度注册
    characterSystem.applySupportCarry(FIXED_TIME_STEP)
    shared.world.step(shared.eventQueue)
    shared.eventBus.drain()
    characterSystem.clearEnvironments()
    for (system of systems, except interactables):
        system.preSync?.(FIXED_TIME_STEP, simTime)
    playMode.fixedUpdate(FIXED_TIME_STEP)    // 交互计时 / 消费锁存边沿（须早于状态机）
    characterSystem.syncTrueTransforms()     // 碰撞体同步所需的真实位置
    characterSystem.update(FIXED_TIME_STEP)  // 状态机 / AI / 计时器 / 动画 / 碰撞体 / 分离
    for (system of systems):
        system.captureRenderState?.()        // 记录本步 prev/curr
    simTime += FIXED_TIME_STEP
}

for (system of systems):
    system.syncPositions(alpha)              // 写插值后的渲染变换
playMode.renderUpdate(delta)                 // 相机 / HUD / 锁定标记 / 命中震动
```

关键点：

- `syncCollidersFromNodes`（`world.ts:1245`）必须吃到**真实**物理位置，所以每步先写真实位置；渲染帧再覆盖为插值位置，下一步开头会重新写回真实值，不会污染物理。
- `playerControl.move()` 每渲染帧只执行一次，保证输入边沿只采样一次。
- `interaction.update` 移入每物理步，确保交互计时与物理时间一致。

### 5.3 滞后一拍插值模型

每个需要平滑的渲染对象保存两份变换：

```text
captureRenderState()   // 每物理步末
    prev <- curr
    curr <- 当前真实变换

syncPositions(alpha)   // 每渲染帧
    render = lerp(prev, curr, alpha)
```

- `alpha ∈ [0, 1)`：`0` 表示刚好回到上一物理步，`1` 表示本步末。
- 由于渲染始终落后一个物理步，画面会比物理真实状态**滞后约 1/60 秒**；这是选定的「稳」优先方案。
- 旋转（朝向）第一版可选：角色朝向已按 `ROTATION_SPEED = 10` 逐帧插值，暂不对朝向做二次插值；箱子/碎片如需更平滑可对四元数做 `slerp`。

### 5.4 各系统插值落点

| 系统 | 渲染对象 | 说明 |
|---|---|---|
| 角色 | `entity.mesh` + `appearanceGroup`（= `model.group`） | 存物理中心；网格原点 Y = 中心 Y − `originToCenterY`；相机取物理中心 |
| 箱子 | `box.mesh` | 位置 + 四元数 |
| 碎片 | `f.mesh` | 位置 + 四元数；同步逻辑见 `syncFragmentToMesh` |
| 掉落物 | `e.mesh` | 物理体为 fixed sensor；视觉浮动当前用 `performance.now()`（见 §5.5） |
| 运动平台 | 交互物可视节点 | `syncPositions` 目前只刷新面板；平台视觉由 behavior 在 `update(dt)` 中维护，需逐物理步捕获实际可视节点变换 |
| 地形 / 建筑 / 区域 | 无 | 静态或纯视觉，保持 no-op |

角色额外暴露 `getPlayerRenderPosition()`（复用向量，禁止逐帧分配），供相机与 HUD 使用。

### 5.5 掉落物与运动平台的实现注意

- 掉落物物理体是 **fixed sensor**，自身不移动；`preSync` 用 `performance.now()` 做上下浮动与自转（`src/entity/item/physics/world.ts:116`）。它已经是「渲染时间驱动」，插值物理体没有意义。
    - 建议：把浮动相位改为基于 `simTime`，或明确保持现状并记录为「纯视觉、不参与物理插值」。
- 交互物的 `syncPositions` 只做 `rebuildPanelInfo()`（`src/entity/interactable/physics/world.ts:315`）；闸门/升降梯的可动部件由 behavior 直接改 group 与 body（`update(dt)`）。
    - 建议：在每物理步末捕获`实际可视节点`（含可动子节点）的变换，渲染帧插值；不要只捕获根 group，否则升降梯/闸门叶片仍会 60Hz 台阶。

### 5.6 输入边沿锁存

- 高刷新率下会出现 0 步帧；若此时 `input.getUpdater()` 已清除按下边沿，跳跃/翻滚/交互会丢输入。
- `setPlayerMove`（`world.ts:947`）对 `jump` / `roll` 改为**锁存 OR**，在 `characterSystem.update` 消费后清零。
- 交互边沿由 `interaction.sampleInput()` 每渲染帧锁存、`interaction.fixedUpdate()` 在**首个物理步消费一次**（攻击边沿仍由 `playerAttackPending` 锁存）。

### 5.7 相机去平滑

- `src/modes/control/player_control.ts` 中删除跟随目标 EMA（`smoothedTarget`，`:112`、`:289-295`），相机位置与视点直接使用目标点。
- **保留**：聚焦过渡、滚轮距离平滑、锁定转向平滑——这些不是跟随稳定器。
- 目标源改为插值后的角色位置：
    - `src/modes/play/index.ts:48-54`：`getTarget` 取 `getPlayerRenderPosition()`。
    - `src/modes/showcase/modules/interactables.ts:329-333`、`inventory.ts:300-304`：`followPoint` 取插值位置。
- 纯摄像机 `createCameraControl`（无玩家模块）不变。

### 5.8 展示模式

- `src/physics/fixed_step.ts` 的运行器改为累加器 + 返回 `alpha`；步进后调用 `syncPositions(alpha)`。
- `interactables.ts`、`inventory.ts`、`ai_terrain.ts` 统一按「sampleInput / fixedUpdate / renderUpdate」拆分，修掉当前「`step(dt)` 内同步、之后再 `characterSystem.update(dt)`」的时序错位。

### 5.9 编辑模式

- 「单步 / 暂停」语义保持不变：单步路径仍精确推进 1 步，`alpha = 1`，不做插值。
- 持续执行（`executing`）路径可复用同一累加器；改动以不破坏编辑基线（`steppedSinceBaseline`）为前提。

## 6. 文件级改动清单

| 文件 | 改动 |
|---|---|
| `src/physics/constants.ts` | 新增 `MAX_STEPS_PER_FRAME = 3`；评估 `MAX_DT` 调至 `0.05` |
| `src/physics/fixed_step.ts` | 重写为累加器时钟；运行器返回 `alpha`；`syncPositions(alpha)` |
| `src/main.ts` | play 分支改为累加器 + 每步游戏逻辑；拆分输入/固定步/渲染 |
| `src/types/physics.ts`、`src/entity/box/base/types/entity_info.ts` | `captureRenderState?()`；`syncPositions(alpha)` |
| `src/entity/character/physics/world.ts` | 拆分 `syncTrueTransforms` / `syncPositions(alpha)`；prev/curr；`getPlayerRenderPosition`；输入锁存 |
| `src/entity/box/physics/world.ts` | 捕获 / 插值箱子变换 |
| `src/entity/fragment/common/physics/world.ts` | 捕获 / 插值碎片变换 |
| `src/entity/item/physics/world.ts` | 明确掉落物视觉时间基准（建议用 `simTime`） |
| `src/entity/interactable/physics/world.ts` | 捕获 / 插值运动平台可视节点 |
| `src/modes/control/player_control.ts` | 移除跟随 EMA |
| `src/modes/play/index.ts` | 拆 `sampleInput` / `fixedUpdate` / `renderUpdate`；目标取插值位置 |
| `src/modes/showcase/modules/*.ts` | 走新运行器；玩家模块相机目标取插值位置 |

## 7. 测试计划

- `src/physics/fixed_step.test.ts`
    - 交替输入 `16.6ms / 16.7ms` 不再产生步数 1↔2 翻转。
    - 单帧 `delta > 3 × 1/60` 时步数封顶且欠账清零。
    - `alpha` 随余量线性变化。
- 角色插值单测
    - `captureRenderState` + `syncPositions(alpha)` 输出 `lerp(prev, curr, alpha)`。
    - `getPlayerRenderPosition` 与相机目标一致。
- `src/modes/control/player_control.test.ts`
    - 跟随目标一帧直达（无 EMA）；聚焦 / 缩放 / 锁定行为不变。
- `src/entity/character/physics/slope_walk_matrix.test.ts`
    - 移除 `PLAYER_CAMERA_SMOOTH_FACTOR` 镜像，改为插值/直接跟随模型，并复核位移与振荡阈值。
- 收尾验证（共享底层 + `main.ts` 链路，按 AGENTS 属「必须全量」）：
    - `pnpm type-check`
    - 定向 vitest
    - `pnpm test`
    - `pnpm test:e2e`
    - `pnpm build`

## 8. 风险与限制

- **性能**：每渲染帧最多 3 次 `characterSystem.update`（含 AI / 导航 / 分离），需实际 profiling；过重则下调 `MAX_STEPS_PER_FRAME` 至 2。
- **骨骼动画仍为 60Hz**：高刷新率显示器上肢体动作仍是 60Hz 台阶（位置已插值）。彻底解决需动画时间插值，属后续项。
- **输入延迟**：滞后一拍插值使画面比物理状态晚约 1/60 秒，加上输入到物理步的延迟；对动作游戏需实测手感。
- **时间膨胀**：持续低于约 20fps 时整体慢放（符合「不追赶」的预期）。
- **平台载客**：角色与平台必须使用同一插值时间基准，否则会出现「脚比平台晚一拍」的错位。
- **编辑模式回归**：单步 / 基线 / Execute 的行为必须保持不变。

## 9. 未决问题

1. 掉落物的浮动/自转相位是否改为 `simTime`（当前仍用 `performance.now()`）？
2. 运动平台可动子节点的捕获范围：当前为固定节点名列表，新增可动部件需同步登记。
3. `HORIZONTAL_SPEED_SMOOTHING`：仍未被使用，接线或删除待定（属肢体步频问题，与本设计主诉无关）。
4. 骨骼动画仍按 60Hz 物理步推进：高刷新率显示器上肢体动作会有 60Hz 台阶，需动画时间插值才能完全平滑。

## 10. 实施阶段

1. **阶段 A：共享时钟** — `physics/constants.ts` + `fixed_step.ts` 累加器与 `alpha`；补单测。
2. **阶段 B：play 主循环** — `main.ts` 时序拆分；输入锁存；状态机/计时器改为按物理步。
3. **阶段 C：角色插值 + 相机** — `syncTrueTransforms` / `syncPositions(alpha)` / `getPlayerRenderPosition`；`player_control.ts` 去 EMA；play 目标改插值位置。
4. **阶段 D：动态实体插值** — 箱子 / 碎片 / 掉落物 / 运动平台。
5. **阶段 E：展示模式** — 运行器与三个玩家/角色模块对齐。
6. **阶段 F：测试与文档** — 全量验证；更新模块文档与根 `AGENTS.md`。

## 11. 验收标准

- 60Hz 平地上持续行走，角色整体位置无逐帧跳动；帧时长在 `16.6/16.7ms` 间波动时行为稳定。
- 下落、游泳等移动状态位置平滑。
- 站上移动平台时，角色与平台无相对错位。
- 相机跟随无二次平滑导致的额外晃动或滞后感。
- 掉帧时游戏整体慢放而非跳帧/瞬移；单帧物理步数不超过上限。
- 编辑模式单步 / 暂停 / Execute 行为不变。
- `pnpm test`、`pnpm test:e2e`、`pnpm build` 全绿。
