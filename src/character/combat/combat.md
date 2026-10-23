# 战斗运行时（character/combat/）模块约定

## 约定

- 伤害事件 `DamageEvent.damageType` 必填（武器固有：近战/远程直取当前武器、爆炸继承所属武器）；新增伤害路径漏填即编译报错。
- 防御力在 `applyDamage` 内、`damageModifiers` 之后按类别固定减免（`max(MIN_DAMAGE=1, 伤害 − defense[damageType])`，低于 1 点的原始伤害保持原值），**禁止在别处重复减伤**。
- 翻滚中段无敌帧由 `states/rolling.ts` 逐帧写 `combat.invincibleTimer`（`exit` 清零）；免疫判定统一走 `damage.ts` 的 `isDamageImmune(target)`（`applyDamage` 顶部短路，先于 modifier/防御，不触发任何受击回调）。

## 陷阱

- **新增伤害路径不得绕过 `isDamageImmune`**；三条命中路径也用它跳过击退与命中反馈——近战不写 `attackedTargets` / 不 `onHit`（无敌结束后同一命中窗口内仍可命中）、远程弹丸穿过无敌目标不消耗、爆炸跳过该目标。
- 翻滚与死亡的全身体根旋转都由 `world.ts` 合成，基础 clip 不写根关节自转（`rollingPose` 只表达抱团蜷缩），否则根原点在脚底会绕脚底划大圈/沉入地面。

## 冲击力与韧性

- **冲击力枚举**（`impact.ts`，唯一来源）：`IMPACT_LEVELS = ['light','medium','heavy','knockdown']`；`impactRank` / `downgradeImpact`（降一级，`light` 为下限，供盾格挡削弱来袭冲击）；`IMPACT_LABELS` 为本地化名键。
- `DamageEvent.impact` / `DamageEvent.poiseDamage` **必填**（与 `damageType` 同规）：新增伤害路径漏填即编译报错。两者与物理击退（`knockbackForce`）解耦——冲击力决定受击状态效果，击退决定位移。
- **受击效果分派**（`world.ts` 的 `onDamageTaken`，顺序即优先级）：先按 `poiseDamage` 扣韧并重置回充延迟（`poiseRegenDelayTimer = poiseRegenDelay`），再按 `health > 0` 分派——
    1. `knockdown` 级 **或** `poise <= 0` → `pendingKnockdown`（倒地，见状态机）；
    2. `heavy` 且未在 `flinchImmunityTimer` 内 → 累计 `flinchDuration = HEAVY_FLINCH_DURATION` + `pendingFlinch`（打断攻击）；
    3. `medium` 且未在免疫内 **且** 当前状态 `isWeakFlinchReceptive` → `flinchDuration = FLINCH_DURATION` + `pendingFlinch`（不打断攻击）；
    4. `light` → 无受击反应（仅扣韧）。
- **弱硬直可受状态**（`WEAK_FLINCH_RECEPTIVE_STATES = ['idle','walking','jumping','falling','interacting']`）：攻击 / 翻滚等承诺动作状态不受 `medium` 打断，但仍会被 `heavy` / 倒地打断。
- **韧性回充**（`world.ts` 主循环）：`poiseRegenDelayTimer` 递减到 0 后，`poise` 以 `poiseRegenPerSec` 每秒恢复至 `poiseMax`；`hitImmunityTimer`（倒地/起身无敌）在主循环递减兜底。
- **数值汇总**：`setCombatEquipment` 统一重算 `defense = baseDefense + 装备防御`、`attackBonus = baseAttack + 装备攻击加成`、`moveSpeedMultiplier = 装备移速乘数之积`、`poiseMax = basePoiseMax + equipmentPoiseOf(已解析装备)`（并 clamp `poise`）。`basePoiseMax` 由角色配置 `CharacterConfig.poiseMax` 传入（见 `character.md`）；`baseDefense` / `baseAttack` 由面板与存档传入。
- **面板状态 / 属性行公式**：面板只可编辑「当前值 / 基础值」输入框，结果 / 加值 / 乘区均为只读文本，按当前装备 / 武器选择实时计算，展示形态 `结果 | (基础值 + 逐项加值) × 逐项乘区`（状态类结果 = 最大值，置于 `当前值 / ` 之后；攻击行的加值含主手武器伤害）。「当前韧性」经 `CharacterEntitySystem.setPoise(id, value)` 写入，自动夹取到 `0..poiseMax`（受击扣除 / 延迟回充仍由战斗系统驱动）。
- 免疫判定 `isDamageImmune(target)` 同时查翻滚无敌 `invincibleTimer` 与倒地/起身无敌 `hitImmunityTimer`；倒地与起身期间**完全免疫**（含伤害与击退），状态机期间忽略 `pendingFlinch` / `pendingKnockdown`。

## 盾格挡资源（guard）

- `CombatComponent` 的盾格挡字段（`combat/types.ts`）：`block?: ShieldBlockConfig`（持盾武器必带，见 [`weapon.md`](../weapon/weapon.md)）、`guard`（当前格挡槽）、`blocking`（是否处于格挡态）、`blockHeld`（输入意图，每帧由 `machine.ts` 从 `stateMachine.setInput(..., block)` 同步）。
- `guardMaxOf(c)` = `c.block?.guardMax ?? 0`；`updateShieldBlock(c, holdMode?)` 解析**盾来源**（主手盾优先，其次副手盾）写入 `c.block` 并把 `guard` 夹到上限——**双手共持（`holdMode === 'two_handed'`）时副手武器挂背、副手盾不计入格挡**（其余模式计入）。装备 / 持握模式变更后必须调用，保证格挡状态与盾碰撞体读取到一致数据。`guard` 回充（未受击（`guardRegenDelayTimer <= 0`）时按 `guardRegenPerSec`）由 `world.ts` 主循环驱动，与韧性回充并列。
- 破防由状态机全局分支统一触发（`guard <= 0` → `guard_broken`，见 [`state_machine.md`](../state_machine/state_machine.md)），不在此模块。
- **格挡减免结算**（近战 / 子弹命中举盾目标）：`伤害 → damage × blockDamageMultiplier`、`impact` 非 `knockdown` 时降一级（`downgradeImpact`）、`削韧 → poiseDamage × poiseMultiplier`、`guard -= blockedDamage`、击退 `× blockKnockbackMultiplier`；`knockdown` 击穿格挡不降级。爆炸 / AOE **完全无视盾**。判定路径见 [`projectile.md`](../../entity/character/projectile/projectile.md) 与 [`melee` 执行器](../../entity/character/combat/melee_executor.ts)。

## 受击子块（hurt blocks）

- 领域模型 `character/hurt_blocks.ts`：`HurtShape`（盒 / 球 / 柱）、`HurtBlock`/`HurtBlockProfile`、`worldizeHurtBlock`。人形清单 12 块（`body_form/humanoid/hurt.ts`，id 对应骨骼）；挂在骨架预设上（为 wyvern / 马等非人形预留）。
- 运行时 `CharacterEntity.hurtProfile` / `hurtBlocks`：`world.ts` 每帧在动画 + 根姿态后，用关节上的视觉部件矩阵 + 几何尺寸世界化（随骨骼段长度与粗细对齐）。
- 命中检定统一改用受击子块（无子块时回退旧身体盒）：
  - 近战 `entity/character/combat/shapes.ts` 的 `obbIntersectsHurt`（武器 OBB × 任一子块，可同时命中多块）；
  - 远程 / 爆炸 `character/combat/shapes.ts` 的 `pointIntersectsHurt` / `sphereIntersectsHurt`。
- `DamageEvent.hitHurtBlocks` 记录被命中的子块 id 数组；`onDeath(sourceId, hitHurtBlocks)` 一并携带（范围伤害可命中多块）。
