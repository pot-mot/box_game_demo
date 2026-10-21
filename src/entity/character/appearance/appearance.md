# 方块人外观（entity/character/appearance/）模块约定

## 约定

- **统一模型构建器**：骨架定义 `skeleton/preset.ts` 的 `buildCharacterSkeletonDefinition()` 为唯一真相源；`model.ts` 的 `createCharacterModel`（游玩/展示）与 `modes/bone_edit`（编辑器）都经 `skeleton/render/joint_hierarchy.ts` 的 `createJointHierarchy` 建 Group 层级、再用 `assemble.ts` 的 `assembleCharacterAppearance` 装配部件（**含手部模型**）。
- **程序化网格构建器**：`mesh_builder.ts` 的 `createMeshBuilder()` 提供几何/材质工厂（`box` / `cylinder` / `sphere` / `cone` / **`frustum`（低多面体棱台）** / `material` / **`materialById`**）与 `add`（可指定父节点）/ `faceBox`，统一登记并 `dispose`。武器 / 护甲 / 种族肢体与生物部件都经它构建：**低多面体风格**由 `frustum` + 低分段 `cylinder`/`cone`/`sphere` + 统一材质库 `materialById`（`render/character_materials.ts`，默认 `flatShading`）表达。`weapon_mesh`、`armor_mesh` 的每个模型是独立参数化 `gen` 函数，派发表只做 id → gen 映射；护甲尺寸来自 `PRESET_PART_SIZES`，武器 gen 参数来自自身 `WeaponMeshConfig`。**新增/修改外观只改对应 gen**。
- **惯用手（handedness）**：`character/handedness.ts` 定义 `Handedness`（`'right'` 默认 / `'left'`，`mainHandSide` / `offHandSide`）；`AnimationContext.handedness` 由 `world.ts` 每帧装配。canonical 骨架与动作数据是右撇子（主手 = 解剖右 = `-X`）。左撇子**不额外烘焙**：clip 取用时经 `skeleton/anim/mirror.ts` 的 `mirrorClip` 镜像（左右轨互换 + 反射共轭；缓存键含 handedness）、槽位（`mainSlot()` / `offSlot()`）与非对称网格镜像随之切换。详见下文专节。
- **倒地 / 起身姿势**：`pose_fns.ts` 的 `knockdownPose` / `gettingUpPose` 只负责四肢，根旋转由 `world.ts` 按受击方向合成。关键帧中**肘恒为前屈（`rx <= 0`）、膝恒为后屈（`rx >= 0`）**，禁止对整条手臂 / 腿取反（会把肘 / 膝折成反关节）。倒地末帧与起身首帧共用同一套**完全伏地姿势**（与倒地朝向无关，倒地朝向由根旋转与起身前置翻身处理），保证状态切换零跳变；倒地后段保持该帧静止。起身前置翻身阶段（`getUpTurnDuration`）动画停在伏地首帧，之后才按「双手撑地 → 蹬手收腿推起 → 站直」三段关键帧推进，阶段比例与 `states/getting_up.ts` 的根旋转曲线共用 `character/combat/constants.ts` 的 `GET_UP_PLANT_END` / `GET_UP_PUSH_END`（调整时序须同时改两处，避免手脚与身体脱节）。`stateDuration`（`getUpDuration`）仅用于定位爬起段，角色属性改起身时长后动作仍与根旋转同拍。
- **格挡 / 蓄力下半身行走叠加**：每个状态由播放器（`system.ts`）驱动，按关节集叠加**互不重叠**的层（`skeleton/anim/composition.ts` 的 `applyComposedPose`，未被层覆盖的关节保留当前姿态）。**格挡中或蓄力攻击中（`attacking` + `attackHolding`）且水平移动时**，在播放器写完（含双手 IK）之后用 `base_clips.ts` 的 `getWalkLegsClip(handedness)`（仅 `WALK_LEG_JOINTS` 双腿关节）覆盖下半身，使脚步随速度摆动、**上半身（举盾 / 拉弓 / 后引）姿态不变**；相位 `engagedWalkPhase` 按 `walkSpeedScale(horizontalSpeed)` 累积，水平速度低于 `ENGAGED_WALK_MIN_SPEED` 视为原地不动（腿保持静态姿态）。蓄力时播放器定格（`seekProgress` 不推进），故该叠加层独立推进相位。

## 陷阱

- **躯干 / 头部护甲顶端不得与身体顶面共面**（`armor_mesh.ts` 的 `genVest` / `genRobe` / `genCap` / `genHood`）：顶缘与身体部件顶面对齐会 z-fighting / 穿模，必须**高出至少 `ARMOR_TOP_OVERLAP`（= `ARMOR_PAD`）**；宽度也须 ≥ 身体对应尺寸（上收窄会让身体从衣身上缘穿出）。
- 手部 `rightHandPivot` / `leftHandPivot` 与武器挂点 `rightWeaponMount` / `leftWeaponMount` 是**不同关节**：手部模型挂手部关节，武器模型直接挂腕下的武器挂点；`backWeaponMount` 为背部视觉挂点（双手共持时副手武器挂背，无 clip 轨道）。自定义骨架缺关节时自动回退同名手腕关节。
- **武器骨骼握持角（持械恒为 `WEAPON_GRIP_FLEX`）**：`pose_fns.ts` 的基础状态下，只要 `ctx.weaponHeld`，武器骨骼即用 `GRIP_BONE_POSE`（含待机 / 行走 + 跳跃 / 下落 / 死亡 / 受击 / 交互 / 破防等瞬态；攻击态由攻击 clip 覆盖）。**未播放动画的静止默认姿态**（装备预览 `modes/play/equipment_ui/preview.ts` 等）亦由 `model.ts` 的 `equipSlot` 在装配时把武器挂点本地 X 旋转设为 `WEAPON_GRIP_FLEX`、`clearSlot` 复位为 0；否则武器会贴合前臂穿模。
- **主手 = 解剖右 = `rightWeaponMount`、副手 = 解剖左 = `leftWeaponMount`**（canonical 为右撇子）。`handedness='left'` 时武器实际位置由 clip 镜像 + `model.setHandedness`（槽位互换 + 网格 `scale.x=-1`）决定，**勿在装配期另行手写左右映射**。
- 非对称武器 / 护甲 / 肢体网格在副手或左撇子下须 `scale.x=-1` 镜像；Three.js 按矩阵行列式自动翻绕序、法线由法线矩阵保持，无需手动改朝向。**基础方块部件为对称盒，无需镜像**。
- `CharacterModel.equipWeapon` 对同一网格配置引用跳过重建（换模式只做挂背/回手换父节点），`setOffhandStowed` 不重建几何；**副手盾挂背时 `setOffhandStowed` 额外叠加绕武器本地 X 的 `SHIELD_STOW_TILT_X`**，使盾面法线水平、盾面竖直贴背（其余武器沿用固有握持角）。
- **盾面朝向校正**：盾面法线为武器本地 +Y。基础状态各关节仅绕 X 旋转，`pose_fns.ts` 的 `orientShieldArms` 把持盾臂的武器骨骼 X 转角反解为「净转角 = `SHIELD_FACE_NET_X`（π/2）」，使盾面竖直平行于身体（在 `base_clips.ts` 烘焙进基础 clip；由 `AnimationContext.shieldHands` 决定哪只臂持盾，覆盖待机 / 行走 / 格挡及瞬态）。格挡姿态另经 `AnimationContext.shieldHands` + `handedness` 决定举盾臂。盾面法线水平指向角色前方（+Z）。
- 护甲近全包件可用 `ArmorMeshConfig.hideBodyParts`（`ARMOR_BODY_PARTS` 语义部位名，映射 `ARMOR_BODY_PART_JOINTS`）隐藏被顶替的基础身体部件；**肢体默认 replace**——`model.ts` 的 `LIMB_SLOT_HIDDEN_PARTS` 按槽位顶替对应人类部位；`equipArmor` / `equipLimbs` 共用 `refreshHiddenBodyParts`（先整体还原再统一隐藏，两套装备互不干扰，同一部件只备份一次）；护甲 / 肢体领域数据不得写死关节 id。
- 肢体外观 `createLimbMesh` 复用护甲关节基座与 `mesh_builder`：种族基色 `LimbMeshConfig.color`，披挂/束带/发色取自阵营调色板 `BoxPartPalette`，因此**换阵营时 `model.recolor` 会用新调色板重建已装备肢体**（并非每帧）；例外：精灵金发 `ELF_GOLDEN_HAIR_COLOR` 为种族固有、不随阵营。`LimbMeshConfig` 无 `hideBodyParts`（replace 恒开启）；肢体高度严格对齐被顶替的人类部件、粗壮度只体现在宽深。
- 种族造型（`genLimb*` + `drawRaceFaceCanvas`）：**骷髅**真实空洞（暗腔底板 + 前置骨质框，眼窝/鼻腔/口腔，`SKELETON_HOLLOW_COLOR`）、独立下颌、空心胸腔、细骨干加粗骨节；**精灵**金发/后掠尖耳/`frustumStack` 真棱台沙漏躯干与锥形四肢/柔美脸（`ELF_BLUSH_COLOR`）。跨模块共用颜色集中在 `render/constants.ts`；脸部贴图材质与 CanvasTexture 必须 `trackMaterial` + `trackTexture` 登记。
- **阵营 → 涂色唯一入口** `constants.ts` 的 `factionColorOf(faction)`（`faction % 6`；`SELECT_PALETTE().bodyColor` 即它）；人类身体、肢体披挂/束带、面板色点、展示台一律复用，禁止另写映射；展示台种族/套装条目与人类行共用同一阵营编号。
- 角色材质表面效果（受击闪红 / 翻滚无敌半透明白）统一走 `combat_vfx/material_effects.ts`，禁止在别处直接改角色模型材质颜色/透明度。

## 惯用手（handedness）

角色属性 `handedness`（`character/handedness.ts`，`'right'` 默认 / `'left'`；`CharacterConfig.handedness?` 随存档持久化，缺失安全回退 `'right'`）决定主/副手落到解剖哪一侧。**canonical 骨架与全部动作数据（含存档中的姿势）恒为右撇子**，左撇子是运行时镜像视图，不写回数据：

- **主 / 副手槽位**：`CharacterModel` 暴露 `mainSlot()` / `offSlot()`；`equipSlot` 把主手武器挂 `mainHandSide(handedness)` 对应的挂点（右撇子 = `rightWeaponMount`，左撇子 = `leftWeaponMount`），副手同理。非对称网格按 `mirrorScale()` 设 `scale.x`（**仅左撇子 = `-1`**，右撇子含其副手 = `1`；主/副手两侧的差异由挂点决定，不靠缩放），护甲 / 肢体同理。
- **切换入口 `setHandedness(handedness)`**：互换主/副手槽内容（`swapSlotContents`）并重挂网格；`world.ts` 的 `updateCharacterConfig` 调用它，切换后需重解析 clip 与刷新外观。
- **clip 镜像**：`appearance/clips/attack_clips.ts`（`getAttackClipById(id, handedness)`）与 `base_clips.ts`（`getBaseClip(..., handedness)`）按键含 handedness 惰性缓存；`'left'` 时对 canonical clip 施加 `skeleton/anim/mirror.ts` 的 `mirrorClip`（左右关节 id 互换 + 四元数/欧拉共轭 + 位置 `x→-x`；对任意欧拉顺序成立）。逐帧零开销。
- **双手共持不再逐帧求解支撑手 IK**：`clips/support_hand_bake.ts` 在攻击 clip 首次解析时，按 30fps 采样主武器副握点并求解支撑手臂链，把左肩 / 左肘写成显式关键帧（含原关键帧时刻），随后 `mirrorClip` 派生左撇子版本；播放时只做普通 clip 采样。基础状态（idle / walking / jumping 等）在 `getBaseClipForHoldMode` 收到当前武器副握点时同样烘焙，并按武器挂点 uuid 在换武器时重建 clip。编辑器仍可给末端节点配置节点 IK（CCD / FABRIK + 父级段数）做手动调整。
- **bone_edit 预览**：编辑器用同一镜像路径——`timeline.ts` 的 `previewClip`（`'left'` 时 `mirrorClip`）驱动播放器与洋葱皮；`weapon_control.ts` 的 `setHandedness` 切主手挂点并重载武器；采集关键帧时由 `mirror_capture.ts` 把镜像姿势反射回 canonical 轨道写入（轨道列表 / 选择仍为 canonical）。

## 游泳 / 漂浮姿态与碰撞节点

- 状态 → 姿态：`pose_fns.ts` 新增 `floatingPose`（直立踩水）/ `swimmingPose`（划水打腿，俯卧由 `world.ts` 根姿态合成）；登记于 `BASE_POSE_SAMPLERS` / `BASE_CLIP_META`，并纳入 `system.ts` 的 `CLIP_STATES` / `ClipState`（**非**Compiler 强制，漏加即无动画）。游泳与行走一样按水平速度变速（`player.setSpeed(walkSpeedScale)`）。
- 碰撞节点：`jointGroups` 暴露全部关节 Group（含 `lowerBodyCollider` / `upperBodyCollider` 两个物理碰撞节点）；`assembleCharacterAppearance` 在两节点组上挂半胶囊可视化 mesh（`colliderMeshes`，edit 模式显示、play 隐藏），并随 `cleanup` 释放。
- `CharacterModel` 暴露 `jointGroups` / `jointParts`（受击子块按部件尺寸对齐）/ `colliderMeshes`。
