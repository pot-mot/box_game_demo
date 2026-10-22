# 攻击系统（武器 / 攻击链 / 动画数据）

> 状态：当前实现。
> 动作关节/朝向/调优提示词见 [`动作设计规范.md`](../../../docs/bone_animation/动作设计规范.md)。
> 伤害、防御、无敌帧见 [`combat.md`](../combat/combat.md)；状态机与段子状态见 [`state_machine.md`](../state_machine/state_machine.md)；模型/握点/支撑手烘焙见 [`appearance.md`](../../entity/character/appearance/appearance.md)。

## 约定

- **武器类 / 模型分层**：玩法数据在 `character/weapon/`，模型与网格数据在 `forms/<form>/weapons.ts`。每个武器只属于一种体形（`WeaponModelConfig.formId`），切体形一律落到新体形 `defaultWeaponId`。
- **段 id**：`{classId}_{holdMode}_{模板键}`；远程单模式沿用 `{classId}_{动作}`。
- **持握模式**：`HoldMode = 'one_handed' | 'two_handed' | 'dual_wield'`，武器以 `holdModes` 声明支持能力，每模式独立连段。
- **攻击动画真相源**：作者数据在 `character/weapon/attack_clips/`（按武器拆分），经 `compileAttackClip` 编译为 `ClipJSON`；支撑手双轨来自离线生成数据。**不再有**基础轨道 + 姿势补丁双源。
- **支撑手离线烘焙**：攻击段与基础状态均预烘焙支撑手（左肩/左肘），生产运行时零 IK；修改 `pose_fns` / 武器网格 / 基础状态时长后必须运行 `pnpm bake:support-hands`。
- **惯用手**：canonical 数据恒为右撇子；左撇子由 `mirrorClip` 派生，不写专有数据。
- **命中窗口**：攻击 clip 事件轨 `hitbox_on` / `hitbox_off`，双持带 `params.weapon: 'main' | 'offhand'` 分槽。

## 一、整体架构

```text
武器模组层（character/weapon/）
└─ WeaponAttacks
   ├─ chains: {light, heavy}          起手候选 entries + 主干段 steps
   └─ segments: Record<string, AttackSegment>
        ├─ duration / recovery / cooldown
        ├─ phases: AttackPhase[]      仅时序 / 移速 / 可中断
        ├─ damageMultiplier / impact / poiseDamage
        └─ next: AttackTransition[]   连段唯一来源

动画数据（character/weapon/attack_clips/）
└─ 段 id → AuthoredAttackClip（times + 每关节欧拉角列 + 事件）
   + forms/humanoid/clips/generated/support_hand_attacks.ts（支撑手双轨）

状态机（character/state_machine/）
└─ attacking / air_attacking 段子状态机
   ├─ 起手解析 resolveEntrySegment
   ├─ 段推进 / 后摇窗口缓冲
   └─ 段末 next 转换

表现层（entity/character/forms/humanoid/clips/）
└─ getAttackClipById：编译作者数据 → 合并支撑手 → 镜像惯用手 → 缓存
```

**关键**：段定义（时长 / 恢复 / 阶段 / 伤害 / 冷却 / next）由武器模组声明；动画是段 id 对应的显式关键帧作者数据，无 per-phase animator、无参数化生成器。

## 二、阶段与时间模型

`attack_phases.ts`：

```ts
export const ATTACK_PHASES = ['windup', 'strike', 'recovery', 'spin', 'draw', 'aim', 'release'] as const
```

- `duration`：动作时间（不含后摇）；`recovery`：后摇；`cooldown`：冷却（普通攻击 = 0）。
- `phaseDurationOf`：`recovery` 阶段取段 `recovery`，其余按 `durationRatio` 分摊 `duration`。
- 未声明 `phases` 时回退单阶段 `strike`（ratio 1，移速 0.3，不可中断）。
- 蓄力锚点：`chargeable` 阶段 + 段 `chargeFullTime`；玩家按住时冻结在锚点起始帧，松开后续播。
- 远程在 `release` 阶段发射；AI 不蓄力。

## 三、攻击链与输入

### 3.1 连段模型

- 每段声明 `next: AttackTransition[]`，按声明顺序求值，首个守卫通过者胜出。
- 起手候选 `entries` 声明顺序 = 优先级（守卫变体在前、兜底在后）。
- `resolveEntrySegment` 负责起手（守卫 + 冷却），`resolveNextSegment` 负责段末转换。
- 普通近战段默认两段循环（轻1↔轻2、重1↔重2）；远程单段。

### 3.2 输入缓冲

- 仅 `recovery` 阶段接受连段输入（`inRecoveryWindow`）。
- 动作阶段按键忽略；段末消费缓冲，不退出 `attacking`。
- 同键走本段 `next`；异键走该键起手解析。

### 3.3 蓄力

- 近战重击：按下重击键即蓄力，冻结在 `windup` 起始帧；松开后从已蓄力进度续播。
- 远程：`chargeable` 阶段冻结并累积 `attackCharge`，`release` 发射。
- 蓄力伤害：`1 + attackCharge × chargeDamageBonus`；蓄力值 > 0 时按 `chargeCooldown` 挂冷却。
- 调参覆盖链：武器模板默认 → 单武器 `WeaponModelConfig.charge` → 角色面板 `AttackConfig.charge`。

## 四、动画数据与支撑手

### 4.1 作者数据

`attack_clips/types.ts`：

```ts
interface AuthoredAttackClip {
    duration: number
    times: readonly number[]                         // clip 级时间栅格
    joints: Record<string, readonly AuthoredEuler[]> // 每关节欧拉角列
    positions?: Record<string, readonly Vec3[]>      // 仅位移关节（如 spine）
    events?: AuthoredAttackEvent[]
}
```

- 未声明关节由编译器补恒等轨道（全关节覆盖）。
- Euler 使用关节局部 XYZ（弧度）；编译期转四元数。
- 事件 `hitbox_on` / `hitbox_off`，双持通过 `weapon: 'main' | 'offhand'` 分槽。

### 4.2 支撑手

- 攻击段支撑手数据：`forms/humanoid/clips/generated/support_hand_attacks.ts`。
- 基础状态支撑手数据：`generated/support_hand_base.ts`（10 把双手武器 × 14 基础状态）。
- 生成器：`scripts/bake_support_hands.mjs`；命令 `pnpm bake:support-hands`。
- 生成文件带 fingerprint；`support_hand_data.test.ts` 校验 fingerprint 与矩阵完整。
- 生成文件禁止手改。基础状态只预烘焙支撑手双轨，身体动作仍由 `pose_fns` 生成。

### 4.3 解析与缓存

`forms/humanoid/clips/attack_clips.ts`：

1. `ATTACK_CLIPS[clipId]` 作者数据；
2. `compileAttackClip` 编译；
3. `applySupportHandTracks` 合并支撑手；
4. 左撇子 `mirrorClip`；
5. 按段 id + handedness 缓存。

## 五、持握、惯用手与盾

- 三模式语义、副手挂背、双持命中分槽见 [`动作设计规范.md`](../../../docs/bone_animation/动作设计规范.md) §7。
- 双手共持不再逐帧求解 IK；支撑手在生成期烘焙。
- 惯用手只切换视图：武器挂点、非对称网格镜像、`mirrorClip`；存档只存语义。
- 盾牌是近战武器类，`block` 字段声明格挡；判定与盾槽见 [`combat.md`](../combat/combat.md) 与 [`docs/design/shield_block.md`](../../../docs/design/shield_block.md)。

## 六、调参指南

| 想改什么 | 改哪里 |
|---|---|
| 基础状态姿态 | `forms/humanoid/pose_fns.ts`；跑 `pnpm bake:support-hands` |
| 攻击段骨骼动作 | `character/weapon/attack_clips/<weapon>.ts` |
| 段时长 / 恢复 / 阶段 / 伤害 / next | `melee_attacks.ts` / `ranged_attacks.ts` |
| 命中窗口 | 作者数据 `events`（或生成器脚本中的窗口推导） |
| 持握模式 | `forms/<form>/weapons.ts` 的 `holdModes` + `attacks` |
| 武器模型握点 / 副握距 | `forms/<form>/weapons.ts` 的 `mesh.supportGripOffset` + `weapon_mesh.ts` 握持表 |
| 惯用手 | `character/handedness.ts` + 存档字段 |
| 盾牌 / 格挡 | `melee_weapon.ts` 的 `block` + `combat` 判定 |
| 预览 / 精修动作 | `modes/bone_edit/` |

## 七、文件索引

| 文件 | 内容 |
|---|---|
| `attack_chain.ts` | 段 / 链 / 守卫 / 起手与转换解析 / `orderedSegments` |
| `melee_attacks.ts` | 近战段模板与链编排、段时长常量、重击蓄力默认 |
| `ranged_attacks.ts` | 远程段规格与蓄力字段注入 |
| `attack_clips/` | 按武器拆分的作者数据（地面 / 空中 / 盾 / 远程） |
| `catalog.ts` | 武器目录注册与查询（体形装配时填充） |
| `weapon_runtime.ts` | 数值覆写 → 运行时武器配置 |
| `melee_weapon.ts` / `ranged_weapon.ts` | 武器类 / 模型类型与构建器 |
| `forms/humanoid/clips/attack_clips.ts` | 作者数据编译 → 支撑手合并 → 镜像 → 缓存 |
| `forms/humanoid/clips/attack_clip_build.ts` | 作者格式 → `ClipJSON` |
| `forms/humanoid/clips/support_hand_merge.ts` | 支撑手双轨合并 |
| `forms/humanoid/clips/generated/` | 支撑手离线生成数据（禁止手改） |
| `character/combat/attack_phases.ts` | 阶段名 / 时序 / 蓄力锚点 |
| `character/state_machine/states/attacking/` | 段子状态调度与缓冲 |

## 八、关键回归测试

- `character/weapon/attack_chain.test.ts`：链结构、守卫、起手/转换。
- `character/weapon/melee_weapon.test.ts` / `ranged_weapon.test.ts`：武器预设与数值约束。
- `forms/humanoid/clips/attack_data.test.ts`：作者数据与武器段一一对应、时间/时长/事件。
- `forms/humanoid/clips/support_hand_data.test.ts`：支撑手矩阵与 fingerprint。
- `forms/humanoid/clips/support_hand_bake.test.ts`：支撑手残差。
- `forms/humanoid/system.test.ts`：动画调度、蓄力、基础状态。
- `character/state_machine/machine.test.ts`：段推进、缓冲、受击/翻滚。

## 九、陷阱

- 肘 `rx < 0`（前折）、膝 `rx > 0`（后折）；禁止照抄。
- `right*` = 解剖右 = `-X`；`left*` = 解剖左 = `+X`。
- 武器朝向由武器骨骼控制；持械非攻击状态保持 `WEAPON_GRIP_FLEX`。
- 攻击作者数据修改后重启 `pnpm dev`（解析缓存）；支撑手相关修改后运行 `pnpm bake:support-hands`。
- 左撇子不写数据，只走镜像。
- 远程 t=0 即起手瞄准位，`release` 帧朝向必须指向目标；远程武器不生成 `WeaponLocalHitBox`（`weaponHitBox = null`），只有近战 / 天然武器有攻击箱。
- 状态切换有 `STATE_BLEND_DURATION` 快照混合，调参时不要把过渡帧当目标姿态。
