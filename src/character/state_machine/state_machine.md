# 状态机（character/state_machine/）模块约定

## 约定

- 每个状态一个独立文件，导出 `StateHandler`（`enter` / `update` / `exit` / `transitions`）；转换规则由各状态 `transitions[]` 声明，`machine.ts` 统一检查 guard 并派发 `onStateChange`。
- 状态持有 `CharacterEntity`，可直接操作 `body` / `mesh`；依赖方向 `entity/character/` → `character/state_machine/` → `character/types.ts`。
- 攻击连段由 `states/attacking/` 的段子状态机表达：`attacking` meta-state 负责调度，段定义（含自身声明的 `next` 转换）由武器模组拥有（见 `src/character/weapon/weapon.md`），**禁止在角色侧重建槽位/连段索引**。
- **蓄力与预输入规则**（`attacking` 与 `air_attacking` 共用）：蓄力保持只在未「松手结束」时生效——一旦「按住 → 松开」（`attackCharge > 0`）即置位 `combat.chargeCommitted`，动作阶段再按住不再冻结 / 续蓄，`enterAttackSegment` 与状态 `exit` 清零；连段预输入**只在后摇窗口**写入缓冲（`combat/attack_runtime.ts` 的 `inRecoveryWindow`：当前阶段 `name === 'recovery'`），抬手 / 挥斩阶段的攻击键一律忽略。见 `weapon.md` §3.3 / §3.5 / §8.3。

## 陷阱

- 新增状态：写 `states/*.ts` → 在 `machine.ts` 的 `STATE_HANDLERS` 注册 → 在 `types.ts` 的 `CHARACTER_STATES` 添加 → 在 `entity/character/body_form/humanoid/skeleton_animation/system.ts` 补齐状态接入、在 `skeleton_animation/pose_fns.ts` 的 `BASE_POSE_SAMPLERS` 补齐姿态、在 `body_form/humanoid/state/form_state.ts` 的 `HUMANOID_CLIP_STATE_META`（`pose_fns.ts` 以 `BASE_CLIP_META` 再导出，`clips/` 由此自动生成）补齐时长（**禁止占位**）→ 补 i18n 显示名（`entity.state.*` / `bone_edit.state.*`）。攻击**阶段**子状态（`attacking_{segmentId}_{phaseName}`）经 `states/attacking/index.ts` 的 `registerPhaseHandler` 注册（未注册走默认行为）；攻击**段**子状态由武器模组段定义驱动。
- **倒地 / 起身**（`states/knockdown.ts` / `states/getting_up.ts`）：`any → knockdown` 由 `machine.ts` 的**全局分支**统一处理——任何非 `dying`/`knockdown`/`getting_up` 状态在 `combat.pendingKnockdown && health > 0` 时强制切入（`pendingKnockdown` 由 `world.ts` 的受击结算在韧性归零 / `knockdown` 级冲击时置位；`dying` 优先级最高）。`knockdown` 期间清水平速度、挂 `hitImmunityTimer = knockdownDuration + getUpTurnDuration + getUpDuration` 全程完全免疫、忽略 `pendingFlinch/pendingKnockdown`；倒向取最后受击冲击方向（同死亡倒地），`world.ts` 按 `knockdownFallAngle` 合成根旋转。倒地总时长 `knockdownDuration` 的前 `KNOCKDOWN_FALL_RATIO`（50%）完成 0→90° 倒下，**后半段保持完全倒地的最后一帧静止不动**（明确的倒地停顿）；`stateTime >= knockdownDuration` → `getting_up`；`stateTime >= getUpTurnDuration + getUpDuration` → `idle`/`walking`/`falling`。`getting_up.exit` 清免疫并回满韧性。倒地末帧与起身首帧使用同一套完全伏地姿势，保证状态切换零跳变。`getting_up` 分两段：**前置翻身**（身体保持伏地，水平朝向按固定角速度转到倒向 / 正面朝下；转角按 `combat/constants.ts` 的 `GET_UP_TURN_SPEED` 换算，180° = `GET_UP_TURN_180_DURATION` = 0.25s，`getUpTurnDuration` 在进入起身首帧按实际面朝重算）+ **爬起**（撑地段几乎保持伏地 → 蹬手收腿推起段快速回正 → 收尾站直，进度按 `stateTime − getUpTurnDuration` 推进）。爬起阶段比例与 `skeleton_animation/pose_fns.ts` 的起身姿势共用 `GET_UP_PLANT_END` / `GET_UP_PUSH_END`；倒地段与翻身结束后的爬起段均锁定朝向，避免躺地时被 AI / 输入带着原地打转。
- **格挡 / 破防**（`states/blocking.ts` / `states/guard_broken.ts`）：`blocking` 由 `idle`/`walking` 在 `combat.blockHeld && combat.block !== undefined && guard > 0` 时进入（守卫按键与 AI 注入逐帧写入 `blockHeld`，见 `world.ts` 输入路由）；期间按盾的 `moveSpeedMultiplier` 限速移动、`combat.blocking = true`，松开按键回 `idle`/`walking`，可被翻滚 / 受击 / 坠落中断。`any → guard_broken` 由 `machine.ts` 的**全局分支**处理（`combat.block !== undefined && guard <= 0 && health > 0`，倒地 / 起身 / 死亡优先级更高）：`guard_broken` 原地硬直、锁死水平位移，`stateTime >= block.guardBreakDuration` 后回 `idle`/`walking`，`exit` 回满格挡槽（`guard = guardMax`）。举盾姿态由 `skeleton_animation/pose_fns.ts` 的 `blockingPose` 依据 `AnimationContext.shieldHands`（主手盾优先）决定抬臂侧。格挡期间水平移动时下半身叠加行走步态（仅覆盖双腿，见 [`appearance.md`](../../entity/character/appearance/appearance.md)）。
- **攻击阶段移速**（`states/attacking/index.ts` 默认阶段行为）：有移动输入时按阶段 `moveSpeedMultiplier` 缩放 `entity.config.speed`；若玩家蓄力保持（`attackHolding`）且阶段声明 `chargeMoveSpeedMultiplier`，则改用后者（近战重击 windup = 0.5，远程沿用自身 `moveSpeedMultiplier`）。未注册阶段 handler 时一律走此默认行为；同一条件下外观叠加下半身行走步态。
- **远程 AI 的站定/攻击需要移动清零也能进入 attacking**——`walking.ts` 的 `to:'attacking'` 必须排在 `to:'idle'` 之前，否则移动清零那一帧会先转 idle 而漏掉攻击。
- 死亡动画保持直立（`skeleton_animation/pose_fns.ts` 的 `dyingPose` 不旋转根关节）：倒地方向由 `states/dying.ts` 取最后受击冲击方向（`DamageEvent.dirX/dirZ` → `combat.lastHitDirX/Z`，无记录默认向后倒）决定，`world.ts` 绕「上 × 倒向」轴把 `dyingFallAngle`（0→90°，0.3s）合成到模型根旋转；**新增伤害路径须携带方向**。
- **空中攻击 `air_attacking`**（`states/air_attacking.ts`）：跳跃/下落中按攻击键进入，起手固定走武器 `air` 链（`machine.ts` 起手解析把该状态归一为 `'air'` 键），与地面 `attacking` 共用 `states/attacking/segment.ts` 的段调度。**不得加 `→ jumping` 转换**（`jumping.enter` 会重置向上速度 → 二段跳）；播完只回 `walking`/`idle`（有支撑）或 `falling`。转换守卫用 `canStartAirAttack`；`air` 段不可蓄力。自身冲击（战锤砸地等）由段数据 `AttackSegment.impulses` 在段内时刻施加（`combat/attack_impulses.ts` 的 `fireSegmentImpulses`，`impulsesFired` 每段只消费一次），与阶段时间线同一时钟；**不得**挪回状态 `enter`（见 `weapon.md` §3.9）。

## 文档

- [bone_animation/待机.md](./bone_animation/待机.md)、[bone_animation/受击硬直.md](./bone_animation/受击硬直.md)

## 水（游泳 / 漂浮）

- 新增状态 `swimming`（对应 walking）/ `floating`（对应 idle），由 `entity.environment.fluidFraction`（area 的 `float` 场逐帧写入）滞回判定：`SWIM_ENTER_FLUID` 进、`SWIM_EXIT_FLUID` 出。`idle`/`walking`/`jumping`/`falling` 的转换守卫**置顶**入水转换（有输入→swimming，无→floating），彻底消除水体中因流体拖拽悬空而永续 `falling`。
- `floating`：水平阻尼趋零、**竖直保留**（由浮力场 / 拖拽决定上浮 / 下潜 / 悬浮，与 AI 一致）。`swimming`：水平沿输入以 `SWIM_SPEED_MULTIPLIER × moveSpeedOf` 游动；竖直取镜头俯仰意图 `swimLift`（玩家，经 `setPlayerMove`/`CharacterInput` 透传）或跳跃蹬水冲量，AI 传 0（回退浮力）。
- 俯卧视觉由 `entity/character/physics/world.ts` 的根姿态分支合成（绕本地 X 轴前倾 `SWIM_PRONE_PITCH`，绕身体中心补偿），并同步让上/下半身碰撞节点前倾 → 半胶囊碰撞箱随之俯卧。
- 水中禁战斗 / 翻滚（swimming/floating 无 attack/roll 转换）。动画：`skeleton_animation/pose_fns.ts` 的 `floatingPose`（直立踩水）/ `swimmingPose`（俯卧划水）+ `BASE_CLIP_STATES`/`CHARACTER_STATES` + i18n。
