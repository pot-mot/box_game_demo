# 状态机（character/state_machine/）模块约定

## 约定

- 每个状态一个独立文件，导出 `StateHandler`（`enter` / `update` / `exit` / `transitions`）；转换规则由各状态 `transitions[]` 声明，`machine.ts` 统一检查 guard 并派发 `onStateChange`。
- 状态持有 `CharacterEntity`，可直接操作 `body` / `mesh`；依赖方向 `entity/character/` → `character/state_machine/` → `character/types.ts`。
- 攻击连段由 `states/attacking/` 的段子状态机表达：`attacking` meta-state 负责调度，段定义（含自身声明的 `next` 转换）由武器模组拥有（见 `src/character/weapon/weapon.md`），**禁止在角色侧重建槽位/连段索引**。

## 陷阱

- 新增状态：写 `states/*.ts` → 在 `machine.ts` 的 `STATE_HANDLERS` 注册 → 在 `types.ts` 的 `CHARACTER_STATES` 添加。攻击**阶段**子状态（`attacking_{segmentId}_{phaseName}`）经 `states/attacking/index.ts` 的 `registerPhaseHandler` 注册（未注册走默认行为）；攻击**段**子状态由武器模组段定义驱动。
- **远程 AI 的站定/攻击需要移动清零也能进入 attacking**——`walking.ts` 的 `to:'attacking'` 必须排在 `to:'idle'` 之前，否则移动清零那一帧会先转 idle 而漏掉攻击。
- 死亡动画保持直立（`pose_fns.ts` 的 `dyingPose` 不旋转根关节）：倒地方向由 `states/dying.ts` 取最后受击冲击方向（`DamageEvent.dirX/dirZ` → `combat.lastHitDirX/Z`，无记录默认向后倒）决定，`world.ts` 绕「上 × 倒向」轴把 `dyingFallAngle`（0→90°，0.3s）合成到模型根旋转；**新增伤害路径须携带方向**。
- **空中攻击 `air_attacking`**（`states/air_attacking.ts`）：跳跃/下落中按攻击键进入，起手固定走武器 `air` 链（`machine.ts` 起手解析把该状态归一为 `'air'` 键），与地面 `attacking` 共用 `states/attacking/segment.ts` 的段调度。**不得加 `→ jumping` 转换**（`jumping.enter` 会重置向上速度 → 二段跳）；播完只回 `walking`/`idle`（有支撑）或 `falling`。转换守卫用 `canStartAirAttack`；`air` 段不可蓄力。

## 文档

- [bone_animation/待机.md](./bone_animation/待机.md)、[bone_animation/受击硬直.md](./bone_animation/受击硬直.md)
