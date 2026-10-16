# 盾牌（小 / 中 / 大）与格挡 + 冲击力与韧性系统设计

> 状态：**实施中**。第二部分（冲击 / 韧性）与第一部分第 1–3 步（类型常量 / 盾类模型 / 盾击动作 / `blocking`·`guard_broken` 状态 / 输入路由 + AI 反应式格挡）已落地，第 4–6 步（盾碰撞体 / 格挡减免 / HUD·面板·存档）进行中。本文档是完整的实施方案，实现时按「实施顺序」推进，并同步更新相关模块同名文档。
>
> 文档分两部分：**第一部分**（§1–§16）= 盾牌与格挡；**第二部分**（§17–§28）= 冲击力（受击效果）与韧性系统。两部分互相联动（见 §27），实现时建议先落第二部分（受击/韧性基础设施），再做第一部分（盾牌格挡按冲击力等级削减）。
>
> 面向读者：武器 / 战斗 / 状态机 / AI / 弹丸 / UI / 物理 / 存档 相关模块的实现者。

## 1. 目标

- 新增三档盾牌武器：小盾 / 中盾 / 大盾，装备于主手或副手（沿用现有主 / 副手与 `holdModes` 设计）。
- 盾牌作为**近战武器类**，具备轻 / 重攻击动作（轻 = 盾击、重 = 盾撞 / 盾推）。
- 新增**格挡**：持盾按键短按出招、长按举盾；对来袭的近战与子弹在遮挡范围内进行**部分减伤**（掉血 + 削韧），并消耗**格挡槽**；格挡槽耗尽触发**破防**。
- 爆炸 / AOE 伤害**无视盾牌**。
- AI 具备**反应式**最小格挡决策。

## 2. 决策记录

| 议题 | 结论 |
|---|---|
| 盾的武器建模 | 作为近战武器类（`type: 'melee'`），新增可选 `block` 能力，不改 `WeaponType` 联合类型 |
| 攻击手段 | 含盾击轻攻击；主手单击（短按）触发对应攻击动作 |
| 盾击 / 格挡区分 | 短按 = 盾击，长按 = 格挡（阈值 `holdThreshold`） |
| 格挡按键 | 主手盾 → 左键；副手盾 → 右键；重击键同样复用（哪只手持盾归哪只手） |
| 减免模型 | 部分减免（掉血 + 削韧），并引入**格挡槽 / 破防**机制 |
| 爆炸 | 不能格挡，完全无视盾 |
| AI | 反应式最小实现（威胁来临时举盾） |

## 3. 建模与数据

### 3.1 类型扩展

- `src/character/weapon/melee_weapon.ts`
  - `MeleeWeaponClassConfig` 新增可选字段 `block?: ShieldBlockConfig`。
  - `ShieldBlockConfig` 字段：
    - `guardMax`：格挡槽上限
    - `guardRegenPerSec`：未受击时每秒回复
    - `guardBreakDuration`：破防硬直时长（秒）
    - `blockDamageMultiplier`：被挡伤害对 HP 的系数
    - `blockKnockbackMultiplier`：被挡击退系数
    - `poiseMultiplier`：被挡削韧 / 硬直系数
    - `holdThreshold`：短按 / 长按分界（秒）
    - `cover`：遮挡体几何 `{ width, height, depth, offsetY, offsetZ }`（身体局部坐标，+Z = 朝向）
- 盾类沿用 `meleeClass` / `buildMeleeAttacks` 生成轻 / 重攻击链，**不存在空攻击链特判**。
- `WeaponConfig` 联合类型、`WeaponType` **不新增成员**；`createWeaponRuntime` / `weaponAttacksOf` 无需特判。

### 3.2 常量集中

所有 `ShieldBlockConfig` 数值必须集中到对应 `constants.ts`（禁止散落函数体）。

### 3.3 三档数据（初值，实现后可调）

| id | 名称 | 格挡半角 | 遮挡体 (w×h×d) | 移速系数 | 格挡上限 | 回复/秒 | 破防时长 | 伤害系数 | 击退系数 | 削韧系数 |
|---|---|---|---|---|---|---|---|---|---|---|
| `shield_small` | 小盾 | 70° | 0.4×0.5×0.10 | 0.95 | 40 | 20 | 0.6s | 0.25 | 0.3 | 0.3 |
| `shield_medium` | 中盾 | 60° | 0.6×0.9×0.12 | 0.80 | 70 | 18 | 0.9s | 0.20 | 0.25 | 0.25 |
| `shield_large` | 大盾 | 50° | 0.9×1.4×0.15 | 0.50 | 110 | 14 | 1.2s | 0.15 | 0.2 | 0.2 |

`holdThreshold` 统一初值 0.25s（若需要可按盾档区分）。

## 4. 盾击动作（禁止占位）

- `src/entity/character/appearance/pose_fns.ts`：新增盾击 / 盾撞的姿态采样函数（非占位、与基础轨道一致）。
- `src/entity/character/appearance/clips/`：新增盾击攻击 clip（轻 / 重各一套）。
- 段 id 由 `meleeSegmentId`（`melee_attacks.ts`）自动派生，引用上述新 pose key。
- 动作规范遵循 `docs/bone_animation/动作设计规范.md`。

## 5. 盾牌模型与挂载

- `src/entity/character/appearance/weapon_mesh.ts`
  - `WEAPON_MESH_IDS` 增 `shield_small` / `shield_medium` / `shield_large`。
  - 新增 `genShieldSmall` / `genShieldMedium` / `genShieldLarge`（圆盾 / 鸢盾 / 塔盾）。
  - `WEAPON_MESH_GRIPS` 增对应握持姿态。
  - 各 `gen` 显式声明 `WeaponLocalHitBox`（命中箱），该几何同时作为**遮挡体近似**。
- 挂载经 `rightWeaponMount` / `leftWeaponMount`（`appearance/model.ts` 的 weapon slot 机制）。

## 6. 格挡槽 / 破防机制

### 6.1 战斗组件状态

`src/character/combat/types.ts` 的 `CombatComponent` 新增：

- `guard: number`、`guardMax: number`、`guardRegenPerSec: number`
- `blocking: boolean`（当前是否举盾）
- `blockHeld: boolean`（本帧格挡输入，逐帧写入，供状态机守卫）
- `guardBrokenTimer: number`（> 0 = 破防中）
- 遮挡体几何缓存（由当前盾的 `ShieldBlockConfig.cover` 解析）

### 6.2 数值规则

- 未受击时按 `guardRegenPerSec` 回复，上限 `guardMax`。
- 被挡（遮挡区内）命中：
  - HP 伤害 `damage × blockDamageMultiplier`（可致死，若需下限另行调参）
  - 击退 `knockback × blockKnockbackMultiplier`
  - 硬直 / 削韧 `poise × poiseMultiplier`
  - `guard -= damage`（或按伤害映射）
- `guard <= 0` → 进入破防：
  - 禁用盾碰撞体与格挡、禁盾击
  - 新增状态 `guard_broken`（见 §7），持续 `guardBreakDuration`
  - 状态结束时 `guard` 回满（或回一定比例）

### 6.3 爆炸 / AOE

- 爆炸路径**不做任何盾判定**，按原逻辑全额结算（`combat/damage.ts` 既有 `applyDamage` 链路不变）。

## 7. 状态机

- `src/character/state_machine/types.ts`：`CHARACTER_STATES` 增 `'blocking'`、`'guard_broken'`。
- `src/character/state_machine/states/`：新增 `blocking.ts`、`guard_broken.ts`。
- `src/character/state_machine/machine.ts`：注册 `STATE_HANDLERS`。
- `src/entity/character/appearance/system.ts`：`CLIP_STATES` 增两项。
- 转换：
  - `idle / walking → blocking`：持盾且 `blockHeld` 且举盾时间到
  - `blocking → idle / walking`：松键
  - `blocking → rolling / dying / flinching`：既有转移接管（翻滚取消格挡并进入翻滚无敌帧）
  - `any → guard_broken`：`guard` 归零
  - `guard_broken → idle / walking`：计时结束
- 格挡期间水平移速 × 盾的移速系数（状态内直接操作 `entity.body`，沿用现状态机做法）。
- i18n：新增状态显示名文案键。

## 8. 判定路径

### 8.1 碰撞类别

- `src/physics/collision_category.ts`：`COLLISION_CATEGORY_VALUES` 增 `'shield'`（位 `1 << 14`）。
- `isBlockingGeometry` 对 `'shield'` 返回 true（非 `character`）→ 可被子弹形状扫描命中。

### 8.2 独立盾碰撞体

- 每个持盾角色创建一个**无父刚体的 parentless sensor 碰撞体**（`ColliderDesc.cuboid`）。
- `collisionGroups`：membership 仅含 `'shield'` 类别位，`mask = 0`（不参与任何物理碰撞，仅被查询）。
- 每帧 `setTranslation` / `setRotation` 按 `body 位置 + facingAngles` 写 world 位姿（body 锁旋转、朝向单独存储，故不挂父刚体以规避父子坐标换算）。
  - `cover` 偏移相对**角色原点（脚底）**：world 位置 = `body 中心 − originToCenterY(scale) + cover 偏移`；朝向按 yaw 绕 Y 旋转后叠加 `offsetZ`。
- 仅举盾（`blocking` 且未破防）时 `setEnabled(true)`，其余禁用。
- `remove()`（`world.ts`）清理碰撞体。

### 8.3 子弹

- `src/entity/character/projectile/system.ts`：在角色半径判定**之前**，对子弹做一次 `filterPredicate = 类别为 'shield'` 的 `castShape`（沿本帧位移 `prev → cur`）：
  - 命中 → 结算**减免后伤害**（§6.2）并消耗子弹，播放盾牌格挡视觉
  - 未命中 → 继续原角色半径判定
- **命中半径内补扫（修正顺序问题的关键）**：盾遮挡体位于角色原点前方（`cover.offsetZ` ≈ 0.32–0.36），远小于 `PROJECTILE_HIT_RADIUS`（1.2）的宽容半径；正面来弹在**跨入宽容半径的当帧**（子弹位置已进入半径、但尚未到达盾所在平面）就会被角色判定消耗，逐帧 `prev → cur` 扫描**扫不到盾**。
  - 故在角色命中分支内（目标举盾、未破防、非爆炸弹丸）沿「弹丸当前位置 → 目标身体中心」补做一次 `castShape`（`maxToi = 1`，速度向量 = 全段位移）；命中盾遮挡体即按格挡结算并消耗子弹，否则照常全额结算。
  - 效果：正面来弹被挡下；盾在**背后**（弹道在身体中心终止、未触及遮挡体）或未举盾时按正常伤害结算。
- 两条命中路径共用 `resolveShieldBlock` 结算：命中特效 + `applyDamage`（`damage × blockDamageMultiplier`、`impact` 非 `knockdown` 时降一级、`poiseDamage × poiseMultiplier`）+ `guard` 扣减 + 击退 `× blockKnockbackMultiplier`。


### 8.4 近战

- `src/entity/character/combat/melee_executor.ts`：在现有 `isDamageImmune` 检查之后：
  - 若目标 `blocking` 且武器世界 OBB 与目标盾遮挡体 OBB 相交（SAT）→ 减免结算（§6.2）
  - 计入 `attackedTargets` 防重复，触发格挡特效
- 遮挡体 OBB 由 `body 位置 + facingAngles + cover` 计算（与碰撞体同源）。

## 9. 输入（短按盾击 / 长按格挡）

- 复用既有攻击键，不新增输入动作。主手盾按左键、副手盾按右键；重击键同样复用（哪只手持盾归哪只手）。
- `world.ts`（`CharacterEntitySystem`）：
  - `beginPlayerAttackHold(key)`：若该手是盾 → 记录按下时刻、**不进入蓄力**。
  - `update`：长按超 `holdThreshold` 且未破防 → 进入 `blocking`（置 `combat.blockHeld = true`、启用盾碰撞体）。
  - `endPlayerAttackHold(key, dt)`：若该手已格挡 → 仅放下（不触发攻击）；否则走原 `setPlayerAttack` → 触发盾击。
  - `cancelPlayerAttackHold` 扩参为 `cancelPlayerAttackHold(key)`；同步 `src/modes/play/index.ts` 中两个 cancel 回调。
- `src/input`：`CharacterInput` 增 `block` 字段并扩展 `setInput`（供 AI 注入）。

## 10. AI 反应式格挡（最小实现）

- `src/entity/character/ai/combat/states/*`：新增判定 helper：
  - 自身主 / 副手持盾
  - 有敌意目标进入威胁范围
  - 目标正在起手 / 开火且朝向自己
  - → 在时间窗口内 `setInput(..., block = true)`
- 超时 / 受击 / 目标远离则解除。
- 可在 `attack` / `chase` / `kite` 复用同一 helper。
- 更新 `src/entity/character/ai/ai.md` 与配置表。

## 11. 外观 / UI

- `world.ts` 的 `syncWeaponAppearance`：放开「副手为盾」的展示；主手盾同样展示。
- `src/entity/character/ui/panel.ts`：
  - 武器下拉新增盾分组
  - 副手下拉允许盾（保持「主手远程禁用副手」的既有约束）
  - 双持仍仅限同类近战（盾类不参与双持）
- 游玩模式 HUD：新增**格挡槽条**（仅持盾时显示）；文案走 i18n，样式走 `--dc-*` / `.dc-*` 令牌（见 `docs/ui/ui_style_guide.md`）。
- 展示 / 骨骼编辑模式的下拉分组同步容纳盾（`modes/showcase`、`modes/bone_edit`）。

## 12. 存档

- 盾即武器 id，`updateCharacterConfig` / `validation` 经 `isKnownWeaponId` 容纳，未知 id 安全回退默认武器。
- `src/save_load/serialize.ts` 的 `weapon.type === 'melee' ? weapon.heavyCharge : weapon.charge` 对盾安全（盾为近战）。
- **预计无需版本号变更**（不新增存档字段）。若后续引入护盾槽持久化再评估版本。

## 13. 测试

- 单元测试：
  - ✅ 遮挡体 / 角度判定与 OBB 相交（`combat/melee_executor.test.ts` 的 `shieldCoverOBB` 用例）
  - ✅ 减免数值与 `guard` 归零破防（`combat/melee_executor.test.ts`、`state_machine/states/blocking.test.ts`）
  - ✅ 子弹 `castShape` 拦截（先于角色半径）（`projectile/system.test.ts` 正面 / 背后 2 用例）
  - ✅ 近战 OBB 格挡与 `attackedTargets` 防重复（`combat/melee_executor.test.ts`）
  - ✅ 短按 / 长按输入路由（盾击 vs 格挡）（`physics/shield_hold.test.ts`）
  - ✅ AI 触发格挡（`ai/combat/shield_block.test.ts`）
  - ✅ 副手盾装备与存档往返（`save_load/validation.test.ts`）
  - ✅ 盾类 / 模型注册表完整性（`character/weapon/melee_weapon.test.ts`，含攻击 clip 可解析）
  - ✅ 碰撞类别（`physics/collision_category.test.ts` 的 `'shield'`）
- 端到端：格挡与盾击在游玩模式下的交互（按 `AGENTS.md` 的增量验证策略）。

## 14. 文档同步清单

- `src/character/weapon/weapon.md`
- `src/character/combat/combat.md`
- `src/character/state_machine/state_machine.md`
- `src/modes/control/control.md`
- `src/entity/character/projectile/projectile.md`
- `src/entity/character/ai/ai.md`
- `src/ui/ui.md`
- `src/physics/physics.md`（新增碰撞类别）
- 根 `AGENTS.md`（结构 / 约定描述，若受影响）
- `docs/i18n.md`（新增文案键说明，如适用）

## 15. 实施顺序

1. ✅ 类型 / 常量 / 盾类与模型 / 盾击动作
2. ✅ `blocking` / `guard_broken` 状态 + 格挡槽数值 + 外观
3. ✅ 输入路由 + AI 注入
4. ✅ `'shield'` 碰撞类别与盾碰撞体同步
5. ✅ 近战 OBB 格挡 / 子弹 `castShape` 减免（含宽容半径内补扫）
6. ✅ HUD / 面板 / 存档 / 文档 / 测试

## 16. 风险与未决

- 盾碰撞体为 parentless sensor，逐帧写 world 位姿的开销需实测（角色数量少，预期可接受）。
- 子弹形状扫描与盾碰撞体的顺序改动需回归既有子弹命中行为。
- 破防硬直期间若再受击的处理（是否可被追击）需实现时定。
- `holdThreshold` 在低帧率下的手感需调参。
- 盾击动作属于新增美术资源，需按动作规范制作，禁止占位。

---

# 第二部分：冲击力（受击效果）与韧性系统

> 目标：把「武器削韧」抽象为**逐段冲击力 + 逐段削韧值**，配合角色**韧性资源**（有上界、受击后延迟回复），实现 light / medium / heavy / knockdown 四档受击效果，并在韧性归零时强制倒地。

## 17. 统一枚举：冲击力 / 受击效果

新增 `src/character/combat/impact.ts`：

```ts
const IMPACT_LEVELS = ['light', 'medium', 'heavy', 'knockdown'] as const
type ImpactLevel = typeof IMPACT_LEVELS[number]
```

同一枚举同时表达**攻击的冲击力**与**目标承受的受击效果**（二者同源）：

| 等级 | 语义 | 受击效果 |
|---|---|---|
| `light` 轻 | 最弱 | **无任何状态效果**，仅扣韧性 |
| `medium` 中 | 弱硬直 | **不打断攻击**；仅当目标处于 `idle / walking / jumping / falling / interacting` 时进入 `flinching`（弱硬直），其余状态无效果 |
| `heavy` 重 | 强硬直 | **打断当前攻击**（进 `flinching`），受保护窗口约束 |
| `knockdown` 倒地 | 最强 | **打断攻击与持盾** → 进 `knockdown` → `getting_up`；倒地/起身期间**完全免疫** |

附 i18n 名称键（HUD / 面板 / 调试标签用），常量与名称集中在 `impact.ts` / i18n，禁止硬编码文案。

## 18. 逐段数据（武器模组拥有）

- `AttackSegment`（`src/character/weapon/attack_chain.ts:72`）新增：
  - `impact: ImpactLevel`（该段的冲击力）
  - `poiseDamage: number`（该段的削韧值）
- `buildMeleeAttacks`（`src/character/weapon/melee_attacks.ts:160`）与 `buildRangedAttacks` 按**段模板键**写入默认值，武器类可**逐段覆盖**（新增类级 `segmentImpact?: Partial<Record<..., ImpactLevel>>` 与 `segmentPoise?: Partial<Record<..., number>>` 映射；`extraSegments` 自带字段）。
- 爆炸（远程武器类内联 `explosionRadius` 处）新增 `explosionImpact: ImpactLevel` + `explosionPoise: number`，供 `applyExplosionDamage`（`src/character/combat/explosion.ts`）使用。
- 与物理击退 `knockbackForce / knockbackY` **解耦**：冲击力决定状态效果，击退决定物理位移，两者并存。
- 门禁：`buildMeleeAttacks` / `buildRangedAttacks` 必须为每个生成的段写入 `impact` / `poiseDamage`（fail loudly，避免遗漏）。

### 18.1 参考默认（实现后可调）

| 段模板 | impact | poiseDamage |
|---|---|---|
| 轻击 `light_1..3` | `light` / `medium` | 1 |
| 重击 `heavy_1..2` | `heavy` | 4 |
| 空中 `air_1..2` | `medium` | 2 |
| 爆炸 | `knockdown`（大范围）/ `heavy`（小范围） | 6 |

## 19. 韧性资源与角色属性

### 19.1 战斗组件

`CombatComponent`（`src/character/combat/types.ts:23`）新增：

- `poise: number`、`poiseMax: number`
- `poiseRegenDelayTimer: number`、`poiseRegenDelay: number`、`poiseRegenPerSec: number`
- `hitImmunityTimer: number`（倒地 / 起身期间 > 0，完全免疫）
- `pendingKnockdown: boolean`（触发倒在的状态标志，由状态转换守卫消费）
- `pendingFlinch: boolean`（复用既有；弱 / 强硬直共用）

### 19.2 每角色可配属性

`CharacterConfig`（`src/character/types.ts:12`）与 `CharacterSaveConfig`（`src/save_load/types.ts:146`）新增（均可在面板编辑）：

| 字段 | 含义 | 默认 |
|---|---|---|
| `poiseMax` | 韧性上界**基础值** | 20 |
| `poiseRegenDelay` | 受击后延迟开始回充（秒） | 1.0 |
| `poiseRegenPerSec` | 回充速率（/秒） | 8 |
| `knockdownDuration` | 倒地时长（秒） | 0.7 |
| `getUpDuration` | 起身时长（秒） | 0.6 |

### 19.3 装备韧性

- `EquipPieceConfig`（`src/character/armor/types.ts:9`）新增 `poise: number`；各护甲 / 肢体预设补值（重甲高、轻甲低、肢体为 0）。
- `src/character/armor/catalog.ts` 新增 `totalPoiseOf(resolved, limbs?)`。
- `setCombatEquipment` 重算：`poiseMax = config.poiseMax（基础） + totalPoiseOf(...)`；写入 `combat.poiseMax`，并把 `poise` 夹到 `[0, poiseMax]`。

## 20. 伤害管线

- `DamageEvent`（`src/character/combat/damage.ts:6`）新增：`impact: ImpactLevel`、`poiseDamage: number`。
- 三条命中路径在构造事件时写入：
  - 近战 `src/entity/character/combat/melee_executor.ts`：取当前段 `segment.impact` / `segment.poiseDamage`。
  - 远程 `src/entity/character/projectile/system.ts`：弹丸携带其武器的段数据。
  - 爆炸 `src/character/combat/explosion.ts`：取武器 `explosionImpact` / `explosionPoise`（按距离衰减缩放 `poiseDamage`）。
- **受击结算集中**在 `world.ts` 的 `onDamageTaken`（`src/entity/character/physics/world.ts:557`）：
  1. `poise = max(0, poise - event.poiseDamage)`；`poiseRegenDelayTimer = poiseRegenDelay`。
  2. 依 `event.impact` + `entity.stateMachine.currentState` 决定反应（§17 表）。
  3. `poise <= 0` → `pendingKnockdown = true`（与 `knockdown` 冲击同效）。
- **完全免疫**：`isDamageImmune`（`damage.ts:31`）扩展为同时检查 `invincibleTimer` 与 `hitImmunityTimer`；三条路径已调用它 → 倒地 / 起身期间自动**免伤 + 免击退 + 免受击反馈**。

## 21. 状态机

- `src/character/state_machine/types.ts`：`CHARACTER_STATES` 增 `'knockdown'`、`'getting_up'`。
- 新增 `states/knockdown.ts`、`states/getting_up.ts`；`machine.ts` 注册 `STATE_HANDLERS`；`appearance/system.ts` 的 `CLIP_STATES`、`pose_fns.ts`、`clips/` 同步新增姿态（禁止占位）。
- 转换：
  - `any → knockdown`：`pendingKnockdown && health > 0`（dying 优先级最高）。
  - `knockdown → getting_up`：`stateTime >= config.knockdownDuration`。
  - `getting_up → idle / walking`：`stateTime >= config.getUpDuration`。
- `knockdown.enter`：清水平速度、置 `hitImmunityTimer = knockdownDuration + getUpDuration`、禁用攻击 / 格挡；期间忽略 `pendingFlinch / pendingKnockdown`。
- `getting_up.exit`：`hitImmunityTimer = 0`、`poise = poiseMax`（**起身结束回满**）。
- 弱 / 强硬直复用 `flinching`（`FLINCH_DURATION`）；如需区分时长可新增 `combat.flinchDuration`（实现时定）。
- 新增状态显示名 i18n 键。

## 22. 世界主循环

- 在 `world.ts:925` 附近的计时器区新增：
  - `hitImmunityTimer = max(0, hitImmunityTimer - dt)`
  - `poiseRegenDelayTimer = max(0, poiseRegenDelayTimer - dt)`；归零后 `poise = min(poiseMax, poise + poiseRegenPerSec * dt)`。
- `createCombatComponent` / `world.add` 用角色配置初始化 `poise*` 字段。

## 23. HUD / 面板 / i18n

- HUD：`src/modes/play/health_bar.ts` 敌人血条下叠加**韧性条**；`src/modes/play/player_hud.ts` 增玩家韧性条（玩家 + 敌人均显示）。文案 / 颜色走 i18n 与 `--dc-*` 令牌（`docs/ui/ui_style_guide.md`）。
- 角色面板（`src/entity/character/ui/panel.ts`）：新增 `poiseMax`（基础）/ `poiseRegenDelay` / `poiseRegenPerSec` / `knockdownDuration` / `getUpDuration` 字段。
- 武器面板：段级 `impact` / `poiseDamage` 为武器模组固有数据，**只读展示**（与 `damageType` 同性质，不进入 `AttackConfig` 覆写）。

## 24. 存档

- `SAVE_FORMAT_VERSION` 升级为 **9**（`src/save_load/types.ts:27`），`CharacterSaveConfig` 新增 §19.2 五个可选字段。
- `save_load/validation.ts`：缺失 / 非法值安全回退默认（不抛错）；未知字段忽略。
- `save_load/serialize.ts` 序列化新字段。

## 25. 测试

- 冲击力矩阵：`light` 无反应；`medium` 仅在 receptive 状态触发；`heavy` 打断攻击；`knockdown` 打断攻击与持盾。
- 韧性：扣减、延迟回充、归零 → `knockdown`、起身结束 `poise` 回满。
- 免疫：倒地 / 起身期间三路径（近战 / 远程 / 爆炸）完全免伤免击退。
- 三路径正确传递 `impact` / `poiseDamage`（含爆炸衰减）。
- 状态机新增状态与转移；旧档（v8→v9）回退默认。
- 同步更新测试替身字段：`src/entity/character/physics/harness.ts`、`src/entity/character/ai/ai.test.ts`、`src/entity/character/ai/nav/nav.test.ts`、`src/character/combat/damage.test.ts`。

## 26. 文档同步清单

- `src/character/combat/combat.md`（伤害事件、冲击力、韧性、免疫）
- `src/character/state_machine/state_machine.md`（`knockdown` / `getting_up`）
- `src/character/weapon/weapon.md`（逐段 `impact` / `poiseDamage`）
- `src/character/armor/armor.md`（装备 `poise` 与上界汇总）
- `src/save_load/save_load.md`（v9 字段与兼容）
- `src/modes/play/play.md`（HUD 韧性条）
- `src/entity/character/projectile/projectile.md`（弹丸冲击力 / 削韧）
- `src/entity/character/ai/ai.md`（如 AI 参考冲击力 / 韧性）
- `src/ui/ui.md`（面板新字段）
- 根 `AGENTS.md`（结构 / 约定描述，若受影响）

## 27. 与第一部分（盾牌）的联动与差异对齐

- **格挡削冲击力**：命中被盾遮挡时，`impact` **降一级**（`knockdown → heavy`、`heavy → medium`、`medium → light`、`light → light`），`poiseDamage × 盾的削韧系数`（第一部分 §3.3 的 `削韧系数`）。
- **倒地击穿格挡**：`knockdown` 级冲击**不被普通格挡降级**，直接触发 `knockdown`（呼应第一部分「打断攻击和持盾」）。
- **两套资源**：盾牌用**格挡槽 `guard`**（破防 → `guard_broken` 状态）；韧性用 `poise`（归零 → `knockdown` 状态）。二者独立，可先后触发。
- **第一部分 §6.2 的「硬直 / 削韧」** 统一改为：`event.poiseDamage`（削韧）与 `event.impact`（受击效果），不再单列 `poise × poiseMultiplier`。
- **爆炸无视盾**（第一部分 §6.3）保持不变：爆炸不触发盾格挡判定，但仍正常扣韧性 / 触发受击效果。

## 28. 实施顺序与风险（第二部分）

> 建议先行落地第二部分，再回到第一部分（盾牌按冲击力等级削减）。

1. 枚举 + 逐段 `impact` / `poiseDamage`（近战 / 远程 / 爆炸）
2. 韧性资源 + 角色属性 + 装备 `poise` 汇总
3. `DamageEvent` 扩展 + `onDamageTaken` 受击结算
4. `knockdown` / `getting_up` 状态与转移
5. `isDamageImmune` 完全免疫扩展 + 主循环回充
6. 盾牌联动（降级 + 削韧系数）
7. HUD / 面板 / 存档 v9 / 文档 / 测试

风险 / 未决：

- 空中（`jumping` / `falling`）进入 `flinching` 会清零水平速度，手感需调优（或在空中改轻微位移）。
- `light` / `medium` 是否调整物理击退幅度：当前与冲击力解耦，暂不改。
- 倒地 / 起身完全免疫期间 AI 可能「追空」，需在 AI 层评估（可提前锁定下一目标）。
- `medium` 弱硬直与既有 `FLINCH_IMMUNITY_DURATION` 保护窗口的叠加手感需实测。
