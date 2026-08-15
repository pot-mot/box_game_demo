# 攻击动作展示场景（展示模式）

入口：主页 http://localhost:5173/（`pnpm dev`）启动屏第三个按钮"展示模式"；不再有独立 URL。面板"⏻ 返回启动屏"可退出并重进其他模式（退出即释放面板/监听/场景资源）。

## 展示清单（15 技能，每技能一个角色循环播放）

- 近战 6（前排）：短剑挥斩 / 长剑挥斩 / 巨剑重劈 / 长枪突刺 / 双斧旋斩 / 战锤猛砸
- 远程 9（后排）：长弓射击 / 弩箭速射 / 霰弹轰击 / 法杖能量球 / 魔杖追踪弹 / 飞斧投掷 / 手雷投掷 / 燃烧瓶投掷 / 飞镖疾掷
- 近战按 `COMBO_TILT_TABLE`（attacking.ts 导出）4 个倾斜角逐击演示连段；远程播 draw → aim → release（不发射弹丸）。

## 面板与控制

- 左侧信息面板：技能/武器名、当前击号、阶段名与进度条、衔接方式（首次起手/段内推进/重新起手）。
- 按钮：暂停/继续（或空格，防按住 auto-repeat）、单步（暂停时逐帧）、速度 0.1/0.25/0.5/1×、返回启动屏。
- 点击角色或下拉聚焦（Esc 取消），其余角色变暗（含刀光）。
- 相机：左键旋转 / 右键平移 / **滚轮缩放仅自由视角生效，聚焦期间（含过渡）锁定，退出后回归进入前的视角距离**。

## 与生产代码的镜像关系

- 连段时序镜像 `src/character/state_machine/states/attacking.ts`：阶段推进、cancellable + COMBO_WINDOW 内推进、tilt 轮转。
- 动画注入镜像 `src/entity/character/physics/world.ts`：按同名同语义字段构造 `AnimationContext` 交给 `createAppearanceSystem()`；阶段数据直接取技能预设 `phases`（绕开生产装配 attackToSkillSlots 丢 phases 的缺陷）。
- 装配遵循 modes 约定：`src/modes/showcase/index.ts` 返回 updater 由主页单 RAF 调度，复用共享渲染器、自建独立 Three 场景。

## 刻意差异（均已在代码注释标注）

- 站立攻击：`horizontalSpeed` / `horizontalTravel` 恒 0（生产为物理体实时速度）；物理世界冻结不步进。
- 单武器连段：等价于 comboChain 指向自身技能的推进分支。
- **连段推进时的单帧姿态跳变（startPose 取 NEUTRAL）是生产已知 bug 的原样复现，用于人工确认，非展示场景缺陷。**
