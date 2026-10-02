# 近战三持握模组改造计划（单持 / 双手共持 / 双持）

> 状态：**已实施完成**。本文档既是改造设计稿，也是验收清单；下方「实施结果」记录最终落地形态。
> 相关文档：[攻击系统](attack_system.md)、[骨骼动画系统](bone_animation_system.md)、[动作设计规范](bone_animation/动作设计规范.md)、[展示模式](showcase.md)、[装备与防御系统](equipment_system.md)。

## 0. 实施结果（最终形态）

- **武器类 / 模型分层**：`character/weapon/weapon_class.ts` 定义 `WeaponModelConfig`；近战/远程各有 `*_WEAPON_CLASSES`（玩法 + `attacks`）与 `*_WEAPON_MODELS`（id / classId / 名称 / 网格），`resolveMeleeWeapon` / `resolveRangedWeapon` 合并为运行时统一使用的武器配置（新增 `classId`）。
- **三模式连段**：全部 6 把近战 `holdModes = ['one_handed','two_handed','dual_wield']`，默认单持；段 id 统一 `{classId}_{holdMode}_{key}`（远程单模式沿用 `{classId}_{动作}`）。18 条链、83 条攻击段动画数据（含远程 9）全部落地。
- **副手装备槽**：`CombatComponent.offhand` + 存档 `CharacterSaveConfig.offhand`（`SAVE_FORMAT_VERSION = 6`）；单持 / 双持握左手、双手共持挂背（`backWeaponMount` 视觉挂点 + `CharacterModel.setOffhandStowed`，只换父节点不重建几何）。
- **双持判定**：`catalog.ts` 的 `sameWeaponClass` / `isDualWieldPair` / `availableHoldModes`（双持需副手同类近战）；`setHoldMode` 不可用时回退默认并返回 false。
- **副手伤害**：`melee_executor` 按槽取武器结算（副手命中用副手武器伤害 / 击退 / 类别），主副手命中窗口由 clip 事件 `params.weapon` 分槽。
- **play 切换**：输入动作 `cycle_hold_mode`（默认 Ctrl，被 Ctrl+S / Ctrl+O 最长组合遮蔽）；`CharacterEntitySystem.cyclePlayerHoldMode` 按可用模式环切；HUD 显示当前武器与持握。
- **edit 面板**：装备区新增副手武器下拉与持握模式下拉（按可用性生成选项）；Apply 后显式 `setHoldMode`。
- **展示模式**：近战按模式分三排（6 武器 × 3 模式 = 18）+ 远程 9 = 27 角色；面板行带持握模式列；单持行不装备副手、双持行左手握同类武器、双手行副手挂背。
- **动画来源**：每条链按武器选择动作原型（下劈 / 前刺 / 上挑 / 横扫 / 斜劈 / 枪刺 / 锤砸 / 斧劈）并以 per-weapon patch 精修右臂幅度、武器骨骼朝向与躯干拧转；左手按模式分别生成（单持平衡 / 双手副手支撑 / 双持滞后镜像 + 逐武器握向），显式关键帧入库。命中窗口 on ≈ 0.5×动作、off ≈ 0.95×动作，双持副手窗口延后 0.133s；重兵器单持/双持采用**外侧挥砍**（肩外展、手臂不横穿躯干），长枪三模式采用**侧身枪架**（根关节侧转 + 下肢错步）消除穿模；逐武器动作轨迹见 `docs/bone_animation/持握模式动作.md`。
- **验收**：`pnpm test`（1090 用例）、`pnpm test:e2e`（36 用例）、`pnpm build` 全绿。

## 1. 背景与目标

需求：为每类近战武器补充**单持 / 双手共持 / 双持**三种模组，每种模组有**独立连段**；角色持久化持握状态；play 模式可切换；edit 面板可选择；展示模式分开展示；存档记录。

角色语义：

- **单持**：右手（主手）持握与触发攻击，左手（副手）可装备另一件任意类别（近战 / 远程）武器；攻击模组完全为主手武器单手使用。
- **双手共持**：左右手共同持握主手武器；副手若有武器则挂在背上；攻击模组为主手武器双手使用。
- **双持**：单持形式的派生；左右手持握**同一武器类**武器时可用，主/副手交替攻击，各自独立命中窗口与伤害。

## 2. 现状（改造前）

已存在、无需重做：

- `HoldMode` 三态常量与中文名（`character/weapon/hold_mode.ts`）。
- `CharacterEntity.holdMode` 持久化字段；存档 `CharacterSaveConfig.holdMode` 与旧档安全回退；`setHoldMode`（武器不支持时回退默认并返回 `false`）。
- 双手 IK（`entity/character/appearance/two_handed_ik.ts` + `appearance/system.ts`）与 `supportGripOffset`（每武器副握距）。
- 双持主/副手命中槽（`melee_executor.ts` 的 `setHitWindow(active, weapon)`）与 clip 事件 `params.weapon`、按槽命中窗口。
- 基础状态 clip 的三模式预组合（`appearance/clips/base_clips.ts`）。

缺口：

1. 每个武器只注入「首个模式」一条链（`meleePreset` 只写 `attacks[holdModes[0]]`），除长剑外无多模式武器；长剑双手也只是回退单持链。
2. 无「武器类 / 模型」分层：双持同类型无法表达，未来同模组模型变体无位置。
3. 无副手装备槽（`offhandMesh` 只是双斧固有网格）、无背挂点与挂背逻辑。
4. play 无持握切换输入；edit 面板无持握 / 副手控件；展示模式无模式维度；存档无副手字段。

## 3. 已确认决策

| 议题 | 决策 |
|---|---|
| 双持配对 | 现有 weapon 上升为 **weapon class**，现有 weapon + 模型作为该 class 的**默认 weapon（模型）**；双持要求主/副手 `classId` 相同且均为近战。未来同 class 不同模型自动兼容 |
| 副手槽范围 | 完整装备槽：存档 `offhand` + edit 面板可选 + 展示模式使用；副手可为任意类别武器；仅主手为近战时启用副手与持握切换 |
| 展示模式 | 近战按模式分三排（每排 6 把 = 18 角色）+ 远程排；面板增加「持握」列 |
| 推进方式 | 分期：先架构 + 长剑三模式打样，验收后按武器批量补全 |
| 默认模式 | 全部 6 把近战 `holdModes = ['one_handed','two_handed','dual_wield']`，**默认单持**；落地到哪把武器，哪把才把首项切为 `one_handed`（避免半成品链被 AI / 展示引用） |

## 4. 目标架构

### 4.1 武器类分层（`character/weapon/weapon_class.ts`）

```ts
interface WeaponClassConfig {
    readonly id: string                 // class id（约等于现有武器 id）
    readonly name: string
    readonly type: 'melee' | 'ranged'
    // 玩法数值：damage / damageType / knockback... / detectBox / detectionRange / 远程固有弹道
    readonly holdModes: readonly HoldMode[]
    readonly attacks: HoldModeAttacks   // 持握模式 → 攻击链
    readonly defaultModelId: string
}

interface WeaponModelConfig {
    readonly id: string                 // 模型 id（存档记录、武器下拉显示）
    readonly classId: string
    readonly name: string
    readonly mesh: WeaponMeshConfig
}
```

- 15 个现有武器 id 原样成为各自 class 的默认模型 id（段 id / 存档 id 兼容）。
- `catalog.ts`：新增 `weaponClassOf(id)`、`sameWeaponClass(a, b)`、`availableHoldModes(class, offhand?)`；`weaponAttacksOf` 按 class 解析；`weaponPresetOrDefault` 保留为「模型 id → 合并 class 玩法 + model 外观」的解析（返回值增加 `classId`）。
- `offhandMesh` 字段删除（双斧改用副手槽 + 同类默认模型）。

### 4.2 段 id 与链编排

- `buildMeleeAttacks(classId, holdMode, options)`，段 id 统一 `{classId}_{holdMode}_{key}`（现有 26 段做一次批量迁移重命名）。
- `meleeClass` 接受 `Record<HoldMode, BuildMeleeAttacksOptions>`；每模式独立链编排（轻 2~3 段 + 重 2 段）；各模式**重击段统一声明为可蓄力**（`heavyCharge` → `chargeFullTime` / `chargePoseId` 等，见 `docs/attack_system.md` §8.3）。
- `HoldModeAttacks` 三键齐全后才把该武器 `holdModes[0]` 切为 `one_handed`。

### 4.3 副手与挂背

- 骨架新增视觉挂点 `backWeaponMount`（parent `spine`，背后斜挂；不进 `CHARACTER_JOINT_IDS`，无 clip 轨道）。
- `CharacterModel.equipWeapon({main, offhand, offhandStowed})` + `setOffhandStowed(bool)`：在 `leftWeaponMount` / `backWeaponMount` 间换父节点，不重建几何。
- 模式语义：单持 = 副手挂左手；双手 = 副手挂背、双手 IK 恒生效（判定由 `offhandWeaponGroup === null` 改为 `holdMode === 'two_handed'`）；双持 = 左手握副手武器、不走共享 IK。
- `CombatComponent.offhand?: WeaponRuntime` + `setCombatOffhand`；`melee_executor` 按槽取各自武器的伤害 / 类别 / 击退。
- `setHoldMode` 增加可用性校验（class 支持 + dual_wield 需副手同类近战），不支持回退默认并返回 `false`。

### 4.4 存档（v6）

- `CharacterSaveConfig.offhand?: AttackConfig`（武器 id + 数值覆写）；`SAVE_FORMAT_VERSION = 5`。
- `validation.ts`：`offhand` 复用 attack schema，`.optional().catch(undefined)`；未知武器 id → 丢弃（安全回退无副手）；`holdMode` 校验改引 `HOLD_MODES`（消除硬编码重复）。
- `serialize.ts` 写副手与持握；`world.add` 解析副手 → 装配 → `setHoldMode`。

## 5. 分阶段实施与验收

### 阶段 1 · 武器类分层（行为不变）

迁移 class/model、catalog API、段 id 重命名（含 `attack_clip_data.ts` / `attack_pose_edits.ts` 键与全部测试 / 文档引用）。

验收：`pnpm type-check` + `pnpm vitest run src/character/weapon src/save_load`，行为与改造前一致。

### 阶段 2 · 副手槽与持握运行时

背挂点、`setOffhandStowed`、`CombatComponent.offhand`、执行器分槽伤害、`setHoldMode` 可用性、存档 v5、`world.ts` 装配链路。

测试：分槽伤害、可用性回退、换父节点、validation 旧档兼容。

### 阶段 3 · 输入 / play / edit 面板

- `input`：新增动作 `cycle_hold_mode`（默认 `ControlLeft` / `ControlRight`，中文「切换持握模式」，归入「角色」组），同步 `registry.test.ts` 的 `EXPECTED_DEFAULTS`。
- `play/keyboard.ts`：`wasActionPressed('cycle_hold_mode') && isActionActive('cycle_hold_mode')`（后者利用最长组合遮蔽，规避 Ctrl+S / Ctrl+O 误触）→ 按 `availableHoldModes` 环切 → `setHoldMode`；HUD 增加当前持握文案。
- `ui/panel.ts` 装备区：新增「副手」下拉（含「无」）与「持握」下拉（按 class 支持 + 副手可用性生成）；Apply 顺序 = 主手 / 副手配置 → `setHoldMode`；`refreshFullConfig` 回显；换主手后重建持握选项。
- e2e：`character_equipment.spec.ts`（持握 / 副手）、`operations_panel.spec.ts`（新默认键位）。

### 阶段 4 · 长剑三模式打样（参考实现）

三条链：单持（现有 4 段迁移）、双手（新 4 段）、双持（新 4 段，主 / 副手事件轨分槽、副手伤害取副手武器）。

新段数据：`attack_clip_data.ts` 完整 clip 行（14 关节 3 关键帧 + `eventTracks`）+ `attack_pose_edits.ts` 三段式修订（t=0 起手 → 中帧打击 → 末帧 READY：肩 -0.45 / 肘 -0.85 / 挂点 1.7；肘 rx<0；武器骨骼承担打击朝向）。

文档：`docs/bone_animation/长剑-双手共持.md`、`长剑-双持.md`。

验收：`system.test.ts` 双手 IK 残差契约按显式 `two_handed` 模式覆盖；双持分槽命中测试；showcase / play 实机确认。

### 阶段 5 · 展示模式三排 + 持握列

- `showcase/constants.ts`：roster 条目改 `{weaponId, holdMode, kind}`，近战 18 条 + 远程 9 条，新增三排 Z 间距常量。
- `index.ts`：近战按模式排三排；`actor.ts` 注入 holdMode 并按模式装配副手（单持 / 双手行配同类副手以展示「左手持 / 挂背」，双持行左右各一）；`panel.ts` 行加「持握」列；标签含模式名。
- e2e `showcase.spec.ts` 行数 15→27、模式与计时行断言；`docs/showcase.md` 更新。

### 阶段 6 · 批量补齐其余 5 武器（逐武器交付）

顺序：短剑 → 战锤 → 双斧 → 巨剑 → 长枪。每把：链编排、新段动画数据、文档、对应测试；落地即把该武器默认切为单持。每批收尾只跑相关单测。

### 阶段 7 · 收尾

全量 `pnpm test` + `pnpm test:e2e` + `pnpm build`；同步 `AGENTS.md`、`docs/attack_system.md` §9、`docs/bone_animation/动作设计规范.md`（§5/§7 旧 `twoHanded` / `offhandMesh` 描述）、`docs/showcase.md`。

## 6. 批量动画生产规范（每模式约定）

- **单持**：右臂主导，左臂平衡 / 护身关键帧；命中窗仅 `main`；on ≈ 0.5×动作、off ≈ 0.95×动作。
- **双手共持**：右臂驱动 + 左臂关键帧靠近副握点，运行时 IK 收敛；每个关键帧及插值路径满足左肩→副握点 ≤ ~0.34m；命中窗仅 `main`。
- **双持**：主 / 副手相位错开，副手窗落在副手动作段；事件轨 `params.weapon: 'main' | 'offhand'` 分槽；副手伤害 / 击退取副手武器。
- 所有段：t=0 起手、中帧打击、末帧 READY；肘 `rx < 0`；武器骨骼承担打击朝向。
- 数据生产：用临时脚本把可读关键帧表展开为 `ClipJSON` 行并做批量 id 迁移，产出显式数据入库；禁止运行时程序化动画。

## 7. 风险与陷阱

- `attack_clip_data.ts` 单行 4~6KB（Read 工具截断）→ 用脚本 / 行首锚点编辑，不整行手改。
- Ctrl 与 Ctrl+S / Ctrl+O 冲突 → 用 winning-action 守卫（`isActionActive` 过滤被更长组合遮蔽的动作）。
- 默认切单持影响 AI 与既有 fixture / 测试基线 → 按武器分批切换并同步回归。
- 双手 IK 残差测试原只覆盖默认双手武器 → 改为显式模式后覆盖全部双手链。
- 展示 e2e 行数 / 标签全变；存档 v5 旧档回退与未知副手安全丢弃需测试锁定。
- 主手为远程时：副手与持握控件隐藏、副手模型不展示（存档字段保留，切回近战恢复）。

## 8. 关键文件索引

| 领域 | 文件 |
|---|---|
| 武器类 / 模型 / 目录 | `src/character/weapon/weapon_class.ts`、`catalog.ts`、`melee_weapon.ts`、`ranged_weapon.ts` |
| 动作文档 | `docs/bone_animation/持握模式动作.md`（三模式连段总表）、`docs/bone_animation/动作设计规范.md` §7 |
| 攻击链 | `src/character/weapon/attack_chain.ts`、`melee_attacks.ts`、`weapon_runtime.ts` |
| 攻击动画数据 | `src/character/weapon/attack_clip_data.ts`、`attack_pose_edits.ts` |
| 角色实体 / 战斗 | `src/character/types.ts`、`src/character/combat/types.ts` |
| 外观 / 骨架 | `src/entity/character/appearance/model.ts`、`types.ts`、`system.ts`、`skeleton/preset.ts` |
| 世界运行时 | `src/entity/character/physics/world.ts` |
| 战斗执行器 | `src/entity/character/combat/melee_executor.ts` |
| 存档 | `src/save_load/types.ts`、`validation.ts`、`serialize.ts` |
| 输入 / 模式 / UI | `src/input/types.ts`、`constants.ts`、`modes/play/keyboard.ts`、`modes/play/index.ts`、`modes/showcase/*`、`src/entity/character/ui/panel.ts` |
