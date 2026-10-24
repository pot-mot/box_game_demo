# 角色领域（character/）模块约定

## 约定

- 阵营定义在 `faction.ts`（涂色入口为 `entity/character/appearance/constants.ts` 的 `factionColorOf`，见对应模块文档）。
- 角色原型配置在 `archetypes.ts`。
- 锁定点领域定义在 `lock_point.ts`。
- 惯用手领域定义在 `handedness.ts`：`HANDEDNESS = ['right', 'left']`、`Handedness`、`DEFAULT_HANDEDNESS = 'right'`、`HANDEDNESS_LABELS`、`isHandedness`、`mainHandSide(handedness)` / `offHandSide(handedness)`。canonical 骨架与动作数据恒为右撇子，左撇子为**取用时镜像**视图（见根 AGENTS.md「架构规则」7 与 [`weapon.md`](weapon/weapon.md) / [`appearance.md`](../entity/character/appearance/appearance.md)）。

## 陷阱

- **角色锁定点**：默认锁定点恒为身体最中心（`body.translation()`，不落数组），额外点 = 关节 id + **关节本地**偏移（`CharacterState.lockPoints`）。关节解析先 `updateWorldMatrix(true, false)` 再 `localToWorld`（动画刚写入 Group、`matrixWorld` 可能滞后），找不到关节的点跳过，锁定期间点被移除即自动解除。

## 韧性 / 倒地属性

- `CharacterConfig` 新增 5 个**可选**韧性字段（供面板 / 存档覆写，缺省走 `combat/constants.ts` 默认值）：`poiseMax`（上界基础值，叠加护甲/肢体 `poise`）、`poiseRegenDelay`、`poiseRegenPerSec`、`knockdownDuration`、`getUpDuration`；经 `spawnEntity` 汇总进 `CombatComponent`（`basePoiseMax` 等），受击结算与状态机语义见 [`combat/combat.md`](combat/combat.md) 与 [`state_machine.md`](state_machine/state_machine.md)。
- 倒地数据在 `state.timers`：`knockdownFallDirX/Z`（倒向水平单位向量，进入 `knockdown` 时按 `combat.lastHitDirX/Z` 写入，无记录则向后倒）与 `knockdownFallAngle`（缓动角度，`world.ts` 据此合成根旋转，与死亡倒地同模式）。

## 行为原点策略 / 追击半径

- 原点策略领域定义在 `ai_strategy/`：`types.ts` 的 `ORIGIN_SUB_STRATEGIES = ['resident', 'fighter', 'hunter', 'roamer']` / `OriginSubStrategy` / `OriginConfig` / `isOriginSubStrategy`；默认配置在 `origin.ts` 的 `DEFAULT_ORIGIN_CONFIGS`（`roamer.interval = DEFAULT_ROAMER_INTERVAL = 20`，其余 0）。
- AI 数据在 `state.ai`：`originStrategy`（默认 `resident`）、`originInterval`（漫游者原点更新间隔，秒，默认 20）、`chaseLeashRadius`（追击活动半径，m，默认 20）、`aiBlockDuration`（AI 反应式举盾窗口，秒，默认 0.4）、`aiBlockCooldown`（AI 反应式举盾冷却，秒，默认 1.2）。
- 运行时语义（原点迁移、消费者、击杀钩子、复位规则）见 [`../entity/character/ai/ai.md`](../entity/character/ai/ai.md)；设计背景见 [`../../docs/design/ai_origin_strategy.md`](../../docs/design/ai_origin_strategy.md)。
