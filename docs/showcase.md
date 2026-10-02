# 攻击动作展示场景（展示模式）

入口：主页 http://localhost:5173/（`pnpm dev`）启动屏第三个按钮"展示模式"；不再有独立 URL。退出走右上角设置菜单「🏠 返回主页面」（`setupSettingsPanel` 的 `onReturnHome` 覆写为优雅退出：释放面板/监听/场景资源后重现启动屏）。

## 展示清单（27 角色，每角色循环播放）

- 清单条目按**武器 id + 持握模式**（`SHOWCASE_ROSTER`）：近战 6 武器 × 3 模式 = 18 + 远程 9，武器参数与攻击链经 `weaponPresetOrDefault(id)` + `weaponAttacksOf(weapon, holdMode)` 取自武器模组。
- **近战按持握模式分三排**（单持 → 双手共持 → 双持，由前到后），每排 6 把武器；远程 9 单独最后一排。
- 近战演示：按该武器该模式的段展示顺序连播（如巨剑双手 轻击一段 → 轻击二段 → 轻击三段 → 重击一段 → 重击二段）→ 停顿 0.6s（模拟松开攻击键）→ 重链 → 收尾待机 → 循环。每个**重击段播放前**先定格**满蓄力姿势**（前置时长 = 该武器模板的最长蓄力时间 `maxChargeTime`，`charging` 前置表现，镜像玩家按住重击键的满蓄力状态）再出招，便于观察蓄力动作与「蓄力→出招」衔接。每段 tilt 为段固有值（确定性，非轮转）。
- 副手展示：单持行不装备副手（单持即主手单手使用）；双持行左手握同类武器；双手共持行副手挂背（`backWeaponMount`）且双手 IK 贴合主手武器。
- 远程武器为单段开火动作（draw → aim → release 等阶段由该武器段定义；不发射弹丸）。

## 面板与控制

- 左侧信息面板：武器名 + **持握模式列**（单持 / 双手共持 / 双持；远程显示其默认模式）、当前段号（第 n 击 / 共 m 段）、阶段名与进度条、衔接方式（首次起手/段内推进/重新起手）。
- 聚焦详情卡：标题为「武器 · 持握模式」；除阶段/总进度外，展示与 play HUD 同规则的段计时区块——每段一行（段名用 `segmentDisplayName`），同行动作/恢复/冷却三个计时格（颜色、填充方向、文本格式与 play 一致）；行顺序 = 段展示顺序。
- 按钮：暂停/继续（或空格，防按住 auto-repeat）、单步（暂停时逐帧）、速度 0.1/0.25/0.5/1×；退出经右上角设置菜单（见上文入口说明）。
- 点击角色或下拉聚焦（Esc 取消），其余角色变暗（含刀光）。
- 相机：左键旋转 / 右键平移 / **滚轮缩放仅自由视角生效，聚焦期间（含过渡）锁定，退出后回归进入前的视角距离**。

## 与生产代码的镜像关系

- 连段时序镜像 `src/character/state_machine/states/attacking/`（段子状态机）：阶段推进、**段末推进**（最终阶段 recovery 完整播完后消费缓冲切换下一段，不出 attacking 状态）。
- 攻击数据镜像武器模组：展示角色直接持有 `WeaponConfig` + 持握模式，脚本 = `orderedSegments(weaponAttacksOf(weapon, holdMode))`，段时长/阶段/伤害倍率全部来自武器段定义（与生产同一份数据），不再有技能槽装配与展示顺序重排。
- 动画注入镜像 `src/entity/character/physics/world.ts`：按同名同语义字段构造 `AnimationContext`（含 `attackSegment` 与 `holdMode`）交给 `createAppearanceSystem()`；段切换触发动画键（`attacking:{段 id}`）变化走快照混合，衔接平滑。
- 展示角色放大 `ACTOR_SCALE = 1.3`：双手 IK 目标经 `rootObject: model.group` 换算回骨架（未缩放）空间，臂展与目标同空间，双手贴合与 play 模式相对姿态一致（见 `two_handed_ik.ts` 的 `computeTwoHandGripTarget`）。
- 冷却计时镜像生产：段触发（起手/段末推进）即挂自身段冷却、逐帧递减，供详情卡计时格展示（仅展示不阻断脚本推进）。
- 装配遵循 modes 约定：`src/modes/showcase/index.ts` 返回 updater 由主页单 RAF 调度，复用共享渲染器、自建独立 Three 场景。

## 刻意差异（均已在代码注释标注）

- 站立攻击：`horizontalSpeed` / `horizontalTravel` 恒 0（生产为物理体实时速度）；物理世界冻结不步进。
- 缓冲恒有值：演示中假设玩家持续按键，段末自动推进；链间停顿模拟松键。
- 省略 hitbox/hitstop/命中执行器 —— 展示场景仅播动作时序；冷却计时仅镜像展示，不阻断推进。

## 验证

- 单元测试：`src/character/weapon/attack_chain.test.ts` 锁定段清单顺序（`orderedSegments` 为 轻击一段 → 轻击二段 → 重击一段 → 重击二段）、段转换（`next` 守卫变体优先）与武器运行时数值覆写；`hold_mode.test.ts` 锁定三模式与双持可用性。
- e2e：`e2e/showcase.spec.ts`（信息面板 27 行、持握模式列、聚焦近战/双持角色后段计时行顺序、经设置菜单返回主页面）。
