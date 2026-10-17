# 方块人外观（entity/character/appearance/）模块约定

## 约定

- **统一模型构建器**：骨架定义 `skeleton/preset.ts` 的 `buildCharacterSkeletonDefinition()` 为唯一真相源；`model.ts` 的 `createCharacterModel`（游玩/展示）与 `modes/bone_edit`（编辑器）都经 `skeleton/render/joint_hierarchy.ts` 的 `createJointHierarchy` 建 Group 层级、再用 `assemble.ts` 的 `assembleCharacterAppearance` 装配部件（**含手部模型**）。
- **程序化网格构建器**：`mesh_builder.ts` 的 `createMeshBuilder()` 提供几何/材质工厂（`box` / `cylinder` / `sphere` / `cone` / `material`）与 `add` / `faceBox`，统一登记并 `dispose`。`weapon_mesh` 与 `armor_mesh` 的每个模型是独立参数化 `gen` 函数，派发表只做 id → gen 映射；护甲 gen 尺寸来自 `PRESET_PART_SIZES`，武器 gen 参数来自自身 `WeaponMeshConfig`。**新增/修改武器或护甲外观只改对应 gen**。
- **惯用手（handedness）**：`character/handedness.ts` 定义 `Handedness`（`'right'` 默认 / `'left'`，`mainHandSide` / `offHandSide`）；`AnimationContext.handedness` 由 `world.ts` 每帧装配。canonical 骨架与动作数据是右撇子（主手 = 解剖右 = `-X`）。左撇子**不额外烘焙**：clip 取用时经 `skeleton/anim/mirror.ts` 的 `mirrorClip` 镜像（左右轨互换 + 反射共轭；缓存键含 handedness）、槽位（`mainSlot()` / `offSlot()`）与非对称网格镜像随之切换。详见下文专节。

## 陷阱

- 手部 `rightHandPivot` / `leftHandPivot` 与武器挂点 `rightWeaponMount` / `leftWeaponMount` 是**不同关节**：手部模型挂手部关节，武器模型直接挂腕下的武器挂点；`backWeaponMount` 为背部视觉挂点（双手共持时副手武器挂背，无 clip 轨道）。自定义骨架缺关节时自动回退同名手腕关节。
- **主手 = 解剖右 = `rightWeaponMount`、副手 = 解剖左 = `leftWeaponMount`**（canonical 为右撇子）。`handedness='left'` 时武器实际位置由 clip 镜像 + `model.setHandedness`（槽位互换 + 网格 `scale.x=-1`）决定，**勿在装配期另行手写左右映射**。
- 非对称武器 / 护甲 / 肢体网格在副手或左撇子下须 `scale.x=-1` 镜像；Three.js 按矩阵行列式自动翻绕序、法线由法线矩阵保持，无需手动改朝向。**基础方块部件为对称盒，无需镜像**。
- `CharacterModel.equipWeapon` 对同一网格配置引用跳过重建（换模式只做挂背/回手换父节点），`setOffhandStowed` 不重建几何。
- 护甲近全包件可用 `ArmorMeshConfig.hideBodyParts`（`ARMOR_BODY_PARTS` 语义部位名，映射 `ARMOR_BODY_PART_JOINTS`）隐藏被顶替的基础身体部件；**肢体默认 replace**——`model.ts` 的 `LIMB_SLOT_HIDDEN_PARTS` 按槽位顶替对应人类部位；`equipArmor` / `equipLimbs` 共用 `refreshHiddenBodyParts`（先整体还原再统一隐藏，两套装备互不干扰，同一部件只备份一次）；护甲 / 肢体领域数据不得写死关节 id。
- 肢体外观 `createLimbMesh` 复用护甲关节基座与 `mesh_builder`：种族基色 `LimbMeshConfig.color`，披挂/束带/发色取自阵营调色板 `BoxPartPalette`，因此**换阵营时 `model.recolor` 会用新调色板重建已装备肢体**（并非每帧）；例外：精灵金发 `ELF_GOLDEN_HAIR_COLOR` 为种族固有、不随阵营。`LimbMeshConfig` 无 `hideBodyParts`（replace 恒开启）；肢体高度严格对齐被顶替的人类部件、粗壮度只体现在宽深。
- 种族造型（`genLimb*` + `drawRaceFaceCanvas`）：**骷髅**真实空洞（暗腔底板 + 前置骨质框，眼窝/鼻腔/口腔，`SKELETON_HOLLOW_COLOR`）、独立下颌、空心胸腔、细骨干加粗骨节；**精灵**金发/后掠尖耳/`frustumStack` 真棱台沙漏躯干与锥形四肢/柔美脸（`ELF_BLUSH_COLOR`）。跨模块共用颜色集中在 `render/constants.ts`；脸部贴图材质与 CanvasTexture 必须 `trackMaterial` + `trackTexture` 登记。
- **阵营 → 涂色唯一入口** `constants.ts` 的 `factionColorOf(faction)`（`faction % 6`；`SELECT_PALETTE().bodyColor` 即它）；人类身体、肢体披挂/束带、面板色点、展示台一律复用，禁止另写映射；展示台种族/套装条目与人类行共用同一阵营编号。
- 角色材质表面效果（受击闪红 / 翻滚无敌半透明白）统一走 `combat_vfx/material_effects.ts`，禁止在别处直接改角色模型材质颜色/透明度。

## 惯用手（handedness）

角色属性 `handedness`（`character/handedness.ts`，`'right'` 默认 / `'left'`；`CharacterConfig.handedness?` 随存档持久化，缺失安全回退 `'right'`）决定主/副手落到解剖哪一侧。**canonical 骨架与全部动作数据（含存档中的姿势）恒为右撇子**，左撇子是运行时镜像视图，不写回数据：

- **主 / 副手槽位**：`CharacterModel` 暴露 `mainSlot()` / `offSlot()`；`equipSlot` 把主手武器挂 `mainHandSide(handedness)` 对应的挂点（右撇子 = `rightWeaponMount`，左撇子 = `leftWeaponMount`），副手同理。非对称网格按 `mirrorScale()` 设 `scale.x`（**仅左撇子 = `-1`**，右撇子含其副手 = `1`；主/副手两侧的差异由挂点决定，不靠缩放），护甲 / 肢体同理。
- **切换入口 `setHandedness(handedness)`**：互换主/副手槽内容（`swapSlotContents`）并重挂网格；`world.ts` 的 `updateCharacterConfig` 调用它，切换后需重解析 clip 与刷新外观。
- **clip 镜像**：`appearance/clips/attack_clips.ts`（`getAttackClipById(id, handedness)` / `getChargeClipById`）与 `base_clips.ts`（`getBaseClip(..., handedness)`）按键含 handedness 惰性缓存；`'left'` 时对 canonical clip 施加 `skeleton/anim/mirror.ts` 的 `mirrorClip`（左右关节 id 互换 + 四元数/欧拉共轭 + 位置 `x→-x`；对任意欧拉顺序成立）。逐帧零开销。
- **双手 IK 支撑侧**：`system.ts` 双手共持时 IK 根 = `offHandSide(handedness)` 的肩（右撇子左肩、左撇子右肩），`two_handed_ik.ts` 的 `gripJointId(skeleton, side)` 取该侧腕关节。
- **bone_edit 预览**：编辑器用同一镜像路径——`timeline.ts` 的 `previewClip`（`'left'` 时 `mirrorClip`）驱动播放器与洋葱皮；`weapon_control.ts` 的 `setHandedness` 切挂点 / 支撑侧并重载武器；采集关键帧时由 `mirror_capture.ts` 把镜像姿势反射回 canonical 轨道写入（轨道列表 / 选择仍为 canonical）。
