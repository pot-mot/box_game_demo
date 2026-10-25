# 弹丸系统（`entity/character/projectile/`）

> 远程武器的弹丸物理、视觉与命中特效。**开火时机与朝向**由 `combat/ranged_executor.ts` 决定，
> 其余全部归本分包。范围伤害的命中结算仍走 `character/combat/explosion.ts` 的通用爆炸伤害。

## 约定

- 弹丸物理 / 视觉 / 特效统一归本分包，`ranged_executor` 只做开火门控与方向/散布。
- 视觉由 `RangedWeaponClassConfig.projectile` 声明，新增武器/外观只改数据与 `mesh.ts` 的对应 `gen`。

## 陷阱

- **远程弹丸在 `release` 阶段开始发射**：动画 t=0 即起手瞄准位（枪口 / 箭向 / 杖头朝目标），释放帧朝向与弹道一致；`hitbox_on/off` 事件对远程只是遗留数据。
- **降低重力用逐弹 `RigidBodyDesc.setGravityScale`（`RangedWeaponConfig.projectileGravityScale`，不可存档覆写），禁止改世界重力 `GRAVITY`**；依赖滞空时间的弹道测试改重力后须复核（纯「地面阻挡」类用例已显式固定 `projectileGravityScale`）。
- 弹丸记录 / 视觉 / 刚体 / 特效全部对象池化：空闲刚体以 `setEnabled(false)` 留在世界中复用，因此识别「在飞弹丸」必须只统计**启用中**的 sensor（`clear_bullets.test.ts` / `ranged_aim.test.ts` 为此改写）。

## 一、分层与数据流

```
player/AI 输入 → attacking 状态机（release 阶段）
  → combat/ranged_executor.ts        判定「是否开火 / 朝哪 / 几发散布」
  → projectile/system.ts             生成弹丸（刚体 + 视觉）→ 每帧 update
      ├─ 生命期 / 制导 / 角色宽容半径命中 / castShape 位移扫描
      ├─ 命中 / 引爆 → character/combat/damage.ts · explosion.ts
      ├─ 视觉：projectile/mesh.ts 构建器 + projectile/trail.ts 轨迹
      └─ 特效：projectile/impact_effect.ts 火光 / 碎片 / 魔法爆散
```

`ranged_executor` 对外仍是原有接口（`type:'ranged'` 的 `SkillExecutor` + `updateBullets` / `getBulletCount` / `clear`），
`physics/world.ts` 与 `main.ts` 的调用点无需改动。

## 二、分包结构

| 文件 | 职责 |
|------|------|
| `constants.ts` | 半径 / 质量 / 命中半径 / 池容量 / 轨迹与特效参数（本分包 magic number 集中；重力缺省值在武器域 `ranged_weapon.ts`） |
| `types.ts` | `ProjectileVisual` / `Projectile` / `ProjectileSpawn` / `ProjectileSystem` |
| `pool.ts` | 通用对象池 `createObjectPool(factory, onRelease, onDispose, max)` |
| `mesh.ts` | **独立视觉 build 模块**：每种 `kind` 一个 `gen` + 按签名的视觉池（挂 / 摘场景） |
| `trail.ts` | 魔法球轨迹 ribbon（环形缓冲、加色混合） |
| `impact_effect.ts` | 命中闪光与爆炸特效（火光 / 碎片 / 魔法爆散），槽位池化 |
| `system.ts` | `createProjectileSystem(shared, scene)`：生成 / 更新 / 命中 / 引爆 / 清理 |

## 三、弹丸视觉映射

视觉规格由远程武器类声明（`character/weapon/projectile_visual.ts` 的 `ProjectileVisualSpec`，
写入 `RangedWeaponClassConfig.projectile`）：

| 武器类 | `kind` | 外观 | 轨迹 | 爆炸特效 |
|--------|--------|------|------|----------|
| longbow | `arrow` | 箭矢（杆 + 箭头 + 尾羽），沿速度朝向 | — | — |
| crossbow | `bolt` | 弩矢（短粗杆 + 金属箭头 + 尾翼） | — | — |
| shotgun | `bullet` | 弹头（6 颗霰弹） | — | — |
| staff | `magic_orb` | 发光魔法球（取模型 `orbColor`）+ 光晕脉冲 | ✅ | `magic` |
| magic_wand | `magic_orb` | 发光魔法球（取模型 `gemColor`）+ 光晕脉冲，带制导 | ✅ | — |
| throwing_axe / throwing_dart | `thrown_weapon` | **复用武器模型** + 自旋翻滚 | — | — |
| grenade | `thrown_weapon` | 复用武器模型 + 自旋 | — | `frag`（火光 + 碎片） |
| molotov | `thrown_weapon` | 复用武器模型 + 自旋 | — | `fire`（火光 + 烟团） |

- `thrown_weapon` 经 `createWeaponMesh(weapon.mesh)` 建一次并池化复用。
- `arrow` / `bolt` / `bullet` 的几何与材质为**模块级单例**（颜色固定，全实例共享）。
- 朝向：`velocity`（沿速度，箭 / 弩矢）、`physics`（跟随刚体旋转，投掷物）、`none`（弹头 / 魔法球）。

## 四、弹道缩放（降低重力 + 蓄力）

- 逐弹用 `RigidBodyDesc.setGravityScale(scale)`，**不改世界重力**；`scale` 取 `RangedWeaponConfig.projectileGravityScale`（可选），缺省 `DEFAULT_PROJECTILE_GRAVITY_SCALE = 0.15`（`character/weapon/ranged_weapon.ts`）。
- 直线弹（弓 0.08 / 弩 0.02 / 枪 0.04 / 法杖 0.05 / 魔杖 0）近乎水平；投掷物（飞镖 0.2 / 飞斧 0.45 / 燃烧瓶 0.5 / 手雷 0.55）保留可读弧线。
- 与伤害类别一样是**武器类固有属性**，不可被存档 / 面板覆写。
- 调整重力后需同步复核依赖滞空时间的弹道测试；纯「地面阻挡」类用例已显式固定 `projectileGravityScale`，不随生产默认值漂移。
- **蓄力缩放**：`ProjectileSpawn.charge`（0~1，仅玩家提供）——**伤害**按武器 `charge.maxChargeMultiplier` 一次函数缩放（0 → 100%，满蓄力 → `maxChargeMultiplier%`），**初速 / 生命期**按 `ProjectileChargeCurve` 的 min/max 区间缩放（控制射程·投掷远近）。蓄力时长取 `charge.maxChargeTime`。缺省（AI 或非蓄力武器）= 不缩放，用武器预设值。蓄力调参来源：武器模板默认 → 单武器（`WeaponModelConfig.charge`）→ 角色面板（`AttackConfig.charge`）逐层覆盖。<br>蓄力值由状态机在 `chargeable` 阶段按住期间累积（见 [`weapon.md`](../../../character/weapon/weapon.md) §3.3）。

## 五、对象池

三类对象全部池化（`pool.ts`），避免每次开火的 wasm / Three.js 分配：

1. **弹丸记录 + 刚体**：空闲刚体以 `setEnabled(false)` 留在世界里，复用时 `setEnabled(true)` + 重置位移 / 速度 / 重力缩放 / 旋转。
2. **视觉实例**：按签名（`arrow` / `weapon:<mesh 参数>` / `orb:<color>`）分桶；`acquire` 挂场景、`release` 摘场景并重置轨迹；`dispose` 连同**借出中**的实例一并摘场景 + 释放资源。
   - 投掷物签名包含完整 mesh 参数，同 model id 的不同参数不会复用错误几何。
3. **特效槽位**：每槽位一套网格（火球 / 冲击环 / 碎片 / 烟团），存活期结束归还池。

> 池化注意：`clear_bullets.test.ts` / `ranged_aim.test.ts` 以「**启用中**的 sensor 刚体」识别在飞弹丸，
> 空闲刚体虽仍在世界中但处于禁用态，不计入。

## 六、命中与范围伤害特效

- 角色命中 = 宽容半径判定（`PROJECTILE_HIT_RADIUS`）；场景几何命中 = `castShape` 位移扫描（`maxToi = 1`），高速弹不穿薄墙。
- 非爆炸命中生成小闪光（魔法球取自身颜色，物理弹取暖金火星）：角色命中时沿「目标 → 弹丸」方向贴到目标表面（最多偏移 `EFFECT_IMPACT_SURFACE_OFFSET`），场景命中时取扫描命中点。
- 爆炸（`explosionRadius > 0`）在**命中点**生成特效并结算范围伤害：
  - `fire`：橙色火球 + 烟团；
  - `frag`：亮闪 + 受重力抛撒的碎片 + 烟团；
  - `magic`：武器色扩散球 + 冲击环。
- 特效全部在 `system.update` 中随帧推进，更新路径不创建 DOM / 几何。
- **冲击力 / 削韧随弹丸携带**：`ProjectileSpawn` / `Projectile` 携带 `impact` / `poiseDamage`（由 `ranged_executor` 从当前段取值，远程段默认 `medium` / 2），命中角色结算时透传进 `DamageEvent`；爆炸弹丸另带 `explosionImpact` / `explosionPoise`（缺省 `knockdown` / 6），由 `detonateAt` 传给 `applyExplosionDamage`。受击效果语义见 [`combat.md`](../../../character/combat/combat.md)。
- **盾格挡拦截**（`getShieldOwner?: (colliderHandle) => number | undefined`，由 `ranged_executor` 从 `world.ts` 的 `shieldOwnerByHandle` 透传）：
  - 顺序在角色宽容半径判定**之前**：沿本帧位移 `prev → cur` 做 `filterPredicate = 类别为 'shield'` 的 `castShape`；命中 → `resolveShieldBlock` 结算（`damage × blockDamageMultiplier`、`impact` 非 `knockdown` 时降一级、`poiseDamage × poiseMultiplier`、`guard` 扣减、击退 `× blockKnockbackMultiplier`）并消耗子弹。
  - **宽容半径内补扫**：盾遮挡体在角色原点前方 `~0.34`、远小于 `PROJECTILE_HIT_RADIUS`（1.2），正面来弹在跨入半径的当帧未必扫到盾；故角色命中分支内对举盾目标沿「弹丸 → 身体中心」补做一次盾 `castShape`，命中即按格挡结算，否则正常结算（盾在背后或未举盾 → 全额）。爆炸弹丸（`explosionRadius > 0`）不做盾判定（爆炸无视盾）。

## 七、扩展指南

**新增远程武器**：在 `character/weapon/ranged_weapon.ts` 的 `RANGED_WEAPON_CLASSES` 添加类，填写
`projectile`（视觉规格）与 `projectileGravityScale`，并在 `ranged_attacks.ts` 补段规格（见 `weapon.md` §8.5）。

**新增弹丸视觉 kind**：
1. 在 `character/weapon/projectile_visual.ts` 的 `PROJECTILE_VISUAL_KINDS` 加名字；
2. 在 `projectile/mesh.ts` 的 `buildVisual` 补一个 `gen`（共享几何 / 材质优先），必要时补 `visualSignature` 分支；
3. 在 `mesh.test.ts` 补构建与朝向断言。

**新增爆炸风格**：在 `EXPLOSION_STYLES` 加名字 → `impact_effect.ts` 的 `STYLE_COLORS` 与 `activate` 分支补行为。

## 八、测试

| 文件 | 覆盖 |
|------|------|
| `projectile/pool.test.ts` | 复用 / 容量上限 / dispose |
| `projectile/mesh.test.ts` | 5 种 kind 构建、朝向、魔法球颜色与轨迹、池化复用与场景挂摘 |
| `projectile/system.test.ts` | 生成与飞行、降低重力（对比全额重力）、刚体池复用、clear 清理 |
| `projectile/impact_effect.test.ts` | 爆炸 / 命中生命期、多特效并行、`clear` 立即回收、池化不泄漏、dispose |
| `combat/ranged_executor.test.ts` | 开火门控 / 方向 / 散布 + 可穿过类别 / 命中 / 爆炸伤害端到端 |
| `physics/clear_bullets.test.ts` / `ranged_aim.test.ts` | 世界清理、瞄准朝向（启用中 sensor 计数） |
| `character/weapon/ranged_weapon.test.ts` | 预设完整性 + 弹丸视觉 / 重力约束 |

## 九、与其它模块的关系

- `character/weapon/`：声明玩法数值（伤害 / 弹速 / 生命期 / 可穿过类别 / 重力 / 视觉）。
- `character/combat/`：`damage.ts` / `explosion.ts` 提供命中与范围伤害结算。
- `physics/collision_category.ts`：弹丸命中「可穿过类别」判定。
- `entity/character/appearance/weapon_mesh.ts`：投掷物复用武器模型。

## 调试攻击箱

- **展示模式**：`modes/showcase/projectile.ts` 为每颗在飞弹丸维护一个攻击箱线框（半径 = `PROJECTILE_RADIUS`），随展示角色「攻击箱」开关显隐。
- **编辑模式**：`world.ts` 的调试线框在选中远程角色时，于武器附近显示同尺寸的子弹攻击箱预览（暂停态也可观察）。
- 该线框只表示弹丸命中体积，不参与真实伤害结算；远程武器自身的枪口攻击箱另由武器 `attackBoxes` 提供。
