/**
 * 实体面板 / 交互物 / 建筑 / 地形文案域。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `entityZh`、英文表 `entityEn` 必须结构一致。
 */
export type EntityLocale = {
    /* ── 实体面板 ── */
    'entity.box_control': string
    'entity.destructible_box': string
    'entity.burning_box': string
    'entity.magnet': string
    'entity.water_area': string
    'entity.area_control': string
    'entity.diorama_control': string
    'entity.slope_block_title': string
    'entity.slope_axis': string
    'entity.field_float': string
    'entity.field_wind': string
    'entity.field_gravity': string
    'entity.terrain_control': string
    'entity.fragment': string
    'entity.building_generator': string
    'entity.mass': string
    'entity.remaining': string
    'entity.interactable_title': string
    'entity.item_title': string
    'entity.kind': string
    'entity.name': string
    'entity.channel': string
    'entity.pos_yaw': string
    'entity.params': string
    'entity.yaw': string
    'entity.travel': string
    'entity.speed': string
    'entity.switch_mode': string
    'entity.mode.toggle': string
    'entity.mode.momentary': string
    'entity.breakable_by': string
    'entity.trigger': string
    'entity.player_prefix': string
    'entity.skeleton_name': (n: string) => string
    'entity.def_phys_short': string
    'entity.def_magic_short': string
    'entity.state.idle': string
    'entity.state.walking': string
    'entity.state.sprinting': string
    'entity.state.jumping': string
    'entity.state.falling': string
    'entity.state.flying': string
    'entity.state.swimming': string
    'entity.state.floating': string
    'entity.state.attacking': string
    'entity.state.air_attacking': string
    'entity.state.dying': string
    'entity.state.rolling': string
    'entity.state.flinching': string
    'entity.state.interacting': string
    'entity.state.knockdown': string
    'entity.state.getting_up': string
    'entity.state.blocking': string
    'entity.state.guard_broken': string
    'entity.state.dead': string
    'entity.ai.peace': string
    'entity.ai.combat': string
    'entity.ai.peace.patrol': string
    'entity.ai.peace.build': string
    'entity.ai.combat.chase': string
    'entity.ai.combat.approach': string
    'entity.ai.combat.volley': string
    'entity.ai.combat.kite': string
    'entity.ai.combat.attack': string
    'entity.ai.combat.flee': string
    'entity.ai.combat.inactive': string
    'entity.no_props': string
    'entity.replace': string
    'entity.brush_title': string
    'entity.brush_tool': string
    'entity.brush_material': string
    'entity.brush_prop': string
    'entity.brush_enable': string
    'entity.brush.place': string
    'entity.brush.erase': string
    'entity.brush.prop': string
    'entity.brush.fill': string
    'entity.brush.replace': string
    'entity.brush.stamp': string
    'entity.terrain_sculpt_title': string
    'entity.terrain_sculpt_enable': string

    /* ── 骨架面板 ── */
    'skeleton.joint_title': (name: string, id: string) => string
    'skeleton.bone_title': (name: string, id: string) => string
    'skeleton.pos': string
    'skeleton.rot_euler': string
    'skeleton.cascade': string
    'skeleton.cascade_children': string
    'skeleton.depth': string
    'skeleton.cascade_hint': string
    'skeleton.ik': string
    'skeleton.ik_none': string
    'skeleton.ik_ccd': string
    'skeleton.ik_fabrik': string
    'skeleton.ik_depth': string
    'skeleton.ik_hint': string
    'skeleton.add_child': string
    'skeleton.new_joint_name': string
    'skeleton.length': string
    'skeleton.roll': string
    'skeleton.l': string
    'skeleton.r': string
    'skeleton.no_entity': string
    'skeleton.no_selection': string
    'skeleton.joint.root': string
    'skeleton.joint.spine': string
    'skeleton.joint.headNeck': string
    'skeleton.joint.headTop': string
    'skeleton.joint.rightArmShoulder': string
    'skeleton.joint.rightArmElbow': string
    'skeleton.joint.rightHandPivot': string
    'skeleton.joint.rightWristPivot': string
    'skeleton.joint.rightWeaponMount': string
    'skeleton.joint.leftArmShoulder': string
    'skeleton.joint.leftArmElbow': string
    'skeleton.joint.leftHandPivot': string
    'skeleton.joint.leftWristPivot': string
    'skeleton.joint.leftWeaponMount': string
    'skeleton.joint.backWeaponMount': string
    'skeleton.joint.rightLegHip': string
    'skeleton.joint.rightLegKnee': string
    'skeleton.joint.rightFoot': string
    'skeleton.joint.leftLegHip': string
    'skeleton.joint.leftLegKnee': string
    'skeleton.joint.leftFoot': string
    'skeleton.joint.lowerBodyCollider': string
    'skeleton.joint.upperBodyCollider': string

    /* ── 交互物类型 / 破坏来源 / 提示 ── */
    'interactable.save_point': string
    'interactable.teleport': string
    'interactable.switch': string
    'interactable.push_door_single': string
    'interactable.push_door_double': string
    'interactable.gate': string
    'interactable.chest': string
    'interactable.elevator': string
    'interactable.breakable': string
    'breakable_source.melee': string
    'breakable_source.ranged': string
    'breakable_source.explosion': string
    'breakable_source.roll': string
    'interact.prompt.save_point_lit': string
    'interact.prompt.save_point_light': string
    'interact.prompt.teleport': string
    'interact.prompt.switch_off': string
    'interact.prompt.switch_on': string
    'interact.prompt.door_close': string
    'interact.prompt.door_open': string
    'interact.prompt.gate_close': string
    'interact.prompt.gate_open': string
    'interact.prompt.chest_open': string
    'interact.prompt.elevator_down': string
    'interact.prompt.elevator_up': string
    'interact.prompt.elevator_stop': string
    'interact.prompt.elevator_run': string
    'interact.prompt.pickup': (name: string) => string

    /* ── 建筑材质 / 道具 / 配方 ── */
    'material.rock': string
    'material.soil': string
    'material.brick': string
    'material.wood': string
    'material.rusty_iron': string
    'material.tile': string
    'material.cloth': string
    'material.area_water': string
    'material.area_air': string
    'material.area_force_field': string
    'prop.door': string
    'prop.window': string
    'prop.fence': string
    'prop.lantern': string
    'recipe.house': string
    'recipe.tower': string
    'recipe.wall': string
    'recipe.platform': string
    'recipe.ruin': string
    'recipe.tree': string
    'recipe.stairs': string
    'recipe.spiral_stairs': string
    'recipe.bridge': string
    'recipe.great_hall': string
    'recipe.keep': string
    'recipe.dungeon': string

    /* ── 地形生成器 ── */
    'terrain_gen.fbm': string
    'terrain_gen.flat': string
    'terrain_gen.sine': string
    'terrain_gen.steps': string
}

export const entityZh: EntityLocale = {
    /* ── 实体面板 ── */
    'entity.box_control': '方块控制',
    'entity.destructible_box': '可破坏方块',
    'entity.burning_box': '燃烧方块',
    'entity.magnet': '磁力方块',
    'entity.water_area': '水体控制',
    'entity.area_control': '区域控制',
    'entity.diorama_control': '箱庭',
    'entity.slope_block_title': '斜面块',
    'entity.slope_axis': '坡向轴',
    'entity.field_float': '浮力场',
    'entity.field_wind': '风场',
    'entity.field_gravity': '重力场',
    'entity.terrain_control': '地形控制',
    'entity.fragment': '碎片',
    'entity.building_generator': '建筑生成器',
    'entity.mass': '质量',
    'entity.remaining': '剩余',
    'entity.interactable_title': '交互物',
    'entity.item_title': '掉落物',
    'entity.kind': '类型',
    'entity.name': '名称',
    'entity.channel': '通道',
    'entity.pos_yaw': '位置 / 朝向',
    'entity.params': '参数',
    'entity.yaw': '偏航(°)',
    'entity.travel': '行程',
    'entity.speed': '速度',
    'entity.switch_mode': '开关模式',
    'entity.mode.toggle': '切换',
    'entity.mode.momentary': '瞬时',
    'entity.breakable_by': '可破坏来源',
    'entity.trigger': '触发交互',
    'entity.player_prefix': '玩家：',
    'entity.skeleton_name': (n) => `骨架${n}`,
    'entity.def_phys_short': '物',
    'entity.def_magic_short': '魔',
    'entity.state.idle': '待机',
    'entity.state.walking': '行走',
    'entity.state.sprinting': '跑步',
    'entity.state.jumping': '跳跃',
    'entity.state.falling': '下落',
    'entity.state.flying': '飞行',
    'entity.state.swimming': '游泳',
    'entity.state.floating': '漂浮',
    'entity.state.attacking': '攻击',
    'entity.state.air_attacking': '空中攻击',
    'entity.state.dying': '死亡',
    'entity.state.rolling': '翻滚',
    'entity.state.flinching': '受击硬直',
    'entity.state.interacting': '交互',
    'entity.state.knockdown': '倒地',
    'entity.state.getting_up': '起身',
    'entity.state.blocking': '格挡',
    'entity.state.guard_broken': '破防',
    'entity.state.dead': '已死亡',
    'entity.ai.peace': '和平',
    'entity.ai.combat': '战斗',
    'entity.ai.peace.patrol': '巡逻',
    'entity.ai.peace.build': '建造',
    'entity.ai.combat.chase': '追击',
    'entity.ai.combat.approach': '接近',
    'entity.ai.combat.volley': '齐射',
    'entity.ai.combat.kite': '风筝',
    'entity.ai.combat.attack': '出招',
    'entity.ai.combat.flee': '逃跑',
    'entity.ai.combat.inactive': '待机',
    'entity.no_props': '（无道具）',
    'entity.replace': '替换',
    'entity.brush_title': '建筑笔刷',
    'entity.brush_tool': '工具',
    'entity.brush_material': '材质',
    'entity.brush_prop': '道具',
    'entity.brush_enable': '启用（左键单击）',
    'entity.brush.place': '放置体素',
    'entity.brush.erase': '擦除体素',
    'entity.brush.prop': '放置道具',
    'entity.brush.fill': '区域填充',
    'entity.brush.replace': '区域替换',
    'entity.brush.stamp': '预制体',
    'entity.terrain_sculpt_title': '地形雕刻',
    'entity.terrain_sculpt_enable': '启用（滚轮雕刻）',

    /* ── 骨架面板 ── */
    'skeleton.joint_title': (name, id) => `关节：${name}（${id}）`,
    'skeleton.bone_title': (name, id) => `骨骼：${name}（${id}）`,
    'skeleton.pos': '位置',
    'skeleton.rot_euler': '旋转（欧拉）',
    'skeleton.cascade': '级联编辑',
    'skeleton.cascade_children': '级联子节点',
    'skeleton.depth': '层数',
    'skeleton.cascade_hint': '开：子节点（≤层数）跟随调整，层数外后代保持原位；关：仅本节点变化。配置 IK 的节点平移时由父级链求解，不受级联设置影响',
    'skeleton.ik': '节点 IK',
    'skeleton.ik_none': '无（普通节点）',
    'skeleton.ik_ccd': 'CCD（迭代）',
    'skeleton.ik_fabrik': 'FABRIK（位置迭代）',
    'skeleton.ik_depth': '影响父级段数',
    'skeleton.ik_hint': '该节点作为 IK 末端；Gizmo 平移时由父级链求解（默认影响 2 段父级）',
    'skeleton.add_child': '添加子关节',
    'skeleton.new_joint_name': '新关节名',
    'skeleton.length': '长度',
    'skeleton.roll': '绕轴扭转 roll',
    'skeleton.l': 'L',
    'skeleton.r': 'R',
    'skeleton.no_entity': '未创建骨架实体',
    'skeleton.no_selection': '未选中关节或骨骼',
    'skeleton.joint.root': '根',
    'skeleton.joint.spine': '髋部',
    'skeleton.joint.headNeck': '颈部',
    'skeleton.joint.headTop': '头顶',
    'skeleton.joint.rightArmShoulder': '右肩',
    'skeleton.joint.rightArmElbow': '右肘',
    'skeleton.joint.rightHandPivot': '右手',
    'skeleton.joint.rightWristPivot': '右腕',
    'skeleton.joint.rightWeaponMount': '右手武器挂点',
    'skeleton.joint.leftArmShoulder': '左肩',
    'skeleton.joint.leftArmElbow': '左肘',
    'skeleton.joint.leftHandPivot': '左手',
    'skeleton.joint.leftWristPivot': '左腕',
    'skeleton.joint.leftWeaponMount': '左手武器挂点',
    'skeleton.joint.backWeaponMount': '背部武器挂点',
    'skeleton.joint.rightLegHip': '右髋',
    'skeleton.joint.rightLegKnee': '右膝',
    'skeleton.joint.rightFoot': '右脚',
    'skeleton.joint.leftLegHip': '左髋',
    'skeleton.joint.leftLegKnee': '左膝',
    'skeleton.joint.leftFoot': '左脚',
    'skeleton.joint.lowerBodyCollider': '下半身碰撞块',
    'skeleton.joint.upperBodyCollider': '上半身碰撞块',

    /* ── 交互物类型 / 破坏来源 / 提示 ── */
    'interactable.save_point': '存档点',
    'interactable.teleport': '传送点',
    'interactable.switch': '开关',
    'interactable.push_door_single': '单推门',
    'interactable.push_door_double': '双推门',
    'interactable.gate': '升降闸门',
    'interactable.chest': '箱子',
    'interactable.elevator': '升降梯',
    'interactable.breakable': '可破坏道具',
    'breakable_source.melee': '近战',
    'breakable_source.ranged': '远程',
    'breakable_source.explosion': '爆炸',
    'breakable_source.roll': '翻滚',
    'interact.prompt.save_point_lit': '篝火（已点燃）',
    'interact.prompt.save_point_light': '点燃篝火',
    'interact.prompt.teleport': '传送',
    'interact.prompt.switch_off': '关闭',
    'interact.prompt.switch_on': '开启',
    'interact.prompt.door_close': '关门',
    'interact.prompt.door_open': '开门',
    'interact.prompt.gate_close': '关闭闸门',
    'interact.prompt.gate_open': '开启闸门',
    'interact.prompt.chest_open': '打开箱子',
    'interact.prompt.elevator_down': '下降',
    'interact.prompt.elevator_up': '上升',
    'interact.prompt.elevator_stop': '停止',
    'interact.prompt.elevator_run': '运行',
    'interact.prompt.pickup': (name) => `拾取 ${name}`,

    /* ── 建筑材质 / 道具 / 配方 ── */
    'material.rock': '岩石',
    'material.soil': '泥土',
    'material.brick': '砖石',
    'material.wood': '木材',
    'material.rusty_iron': '锈铁',
    'material.tile': '瓷砖',
    'material.cloth': '布料',
    'material.area_water': '水',
    'material.area_air': '空气',
    'material.area_force_field': '力场',
    'prop.door': '门',
    'prop.window': '窗',
    'prop.fence': '栅栏',
    'prop.lantern': '灯笼',
    'recipe.house': '平房',
    'recipe.tower': '塔楼',
    'recipe.wall': '城墙',
    'recipe.platform': '平台',
    'recipe.ruin': '废墟',
    'recipe.tree': '树木',
    'recipe.stairs': '阶梯',
    'recipe.spiral_stairs': '旋转楼梯',
    'recipe.bridge': '廊桥',
    'recipe.great_hall': '大殿',
    'recipe.keep': '主楼',
    'recipe.dungeon': '地下城',

    /* ── 地形生成器 ── */
    'terrain_gen.fbm': 'FBM 噪声',
    'terrain_gen.flat': '平坦',
    'terrain_gen.sine': '正弦波',
    'terrain_gen.steps': '阶梯',
}

export const entityEn: EntityLocale = {
    /* ── Entity panels ── */
    'entity.box_control': 'Box Control',
    'entity.destructible_box': 'Destructible Box',
    'entity.burning_box': 'Burning Box',
    'entity.magnet': 'Magnet',
    'entity.water_area': 'Water Area Control',
    'entity.area_control': 'Area Control',
    'entity.diorama_control': 'Diorama',
    'entity.slope_block_title': 'Slope Block',
    'entity.slope_axis': 'Slope Axis',
    'entity.field_float': 'Buoyancy Field',
    'entity.field_wind': 'Wind Field',
    'entity.field_gravity': 'Gravity Field',
    'entity.terrain_control': 'Terrain Control',
    'entity.fragment': 'Fragment',
    'entity.building_generator': 'Building Generator',
    'entity.mass': 'Mass',
    'entity.remaining': 'Remaining',
    'entity.interactable_title': 'Interactable',
    'entity.item_title': 'Dropped Item',
    'entity.kind': 'Type',
    'entity.name': 'Name',
    'entity.channel': 'Channel',
    'entity.pos_yaw': 'Position / Facing',
    'entity.params': 'Parameters',
    'entity.yaw': 'Yaw(°)',
    'entity.travel': 'Travel',
    'entity.speed': 'Speed',
    'entity.switch_mode': 'Switch Mode',
    'entity.mode.toggle': 'Toggle',
    'entity.mode.momentary': 'Momentary',
    'entity.breakable_by': 'Breakable By',
    'entity.trigger': 'Trigger Interaction',
    'entity.player_prefix': 'Player: ',
    'entity.skeleton_name': (n) => `Skeleton ${n}`,
    'entity.def_phys_short': 'Phys',
    'entity.def_magic_short': 'Magic',
    'entity.state.idle': 'Idle',
    'entity.state.walking': 'Walk',
    'entity.state.sprinting': 'Sprint',
    'entity.state.jumping': 'Jump',
    'entity.state.falling': 'Fall',
    'entity.state.flying': 'Fly',
    'entity.state.swimming': 'Swim',
    'entity.state.floating': 'Float',
    'entity.state.attacking': 'Attack',
    'entity.state.air_attacking': 'Air Attack',
    'entity.state.dying': 'Death',
    'entity.state.rolling': 'Roll',
    'entity.state.flinching': 'Flinch',
    'entity.state.interacting': 'Interact',
    'entity.state.knockdown': 'Knockdown',
    'entity.state.getting_up': 'Get Up',
    'entity.state.blocking': 'Block',
    'entity.state.guard_broken': 'Guard Broken',
    'entity.state.dead': 'Dead',
    'entity.ai.peace': 'Peace',
    'entity.ai.combat': 'Combat',
    'entity.ai.peace.patrol': 'Patrol',
    'entity.ai.peace.build': 'Build',
    'entity.ai.combat.chase': 'Chase',
    'entity.ai.combat.approach': 'Approach',
    'entity.ai.combat.volley': 'Volley',
    'entity.ai.combat.kite': 'Kite',
    'entity.ai.combat.attack': 'Attack',
    'entity.ai.combat.flee': 'Flee',
    'entity.ai.combat.inactive': 'Idle',
    'entity.no_props': '(no props)',
    'entity.replace': 'Replace',
    'entity.brush_title': 'Building Brush',
    'entity.brush_tool': 'Tool',
    'entity.brush_material': 'Material',
    'entity.brush_prop': 'Prop',
    'entity.brush_enable': 'Enable (left click)',
    'entity.brush.place': 'Place Voxel',
    'entity.brush.erase': 'Erase Voxel',
    'entity.brush.prop': 'Place Prop',
    'entity.brush.fill': 'Fill Area',
    'entity.brush.replace': 'Replace Area',
    'entity.brush.stamp': 'Prefab',
    'entity.terrain_sculpt_title': 'Terrain Sculpt',
    'entity.terrain_sculpt_enable': 'Enable (wheel sculpt)',

    /* ── Skeleton panel ── */
    'skeleton.joint_title': (name, id) => `Joint: ${name} (${id})`,
    'skeleton.bone_title': (name, id) => `Bone: ${name} (${id})`,
    'skeleton.pos': 'Position',
    'skeleton.rot_euler': 'Rotation (Euler)',
    'skeleton.cascade': 'Cascade Edit',
    'skeleton.cascade_children': 'Cascade children',
    'skeleton.depth': 'Depth',
    'skeleton.cascade_hint': 'On: children (≤ depth) follow, deeper descendants stay; Off: only this node changes. IK nodes use their parent chain instead',
    'skeleton.ik': 'Node IK',
    'skeleton.ik_none': 'None (plain node)',
    'skeleton.ik_ccd': 'CCD (iterative)',
    'skeleton.ik_fabrik': 'FABRIK (positional)',
    'skeleton.ik_depth': 'Affected parent segments',
    'skeleton.ik_hint': 'This node is the IK end effector; Gizmo translation solves its parent chain (default 2 segments)',
    'skeleton.add_child': 'Add Child Joint',
    'skeleton.new_joint_name': 'New joint name',
    'skeleton.length': 'Length',
    'skeleton.roll': 'Roll (twist about axis)',
    'skeleton.l': 'L',
    'skeleton.r': 'R',
    'skeleton.no_entity': 'No skeleton entity created',
    'skeleton.no_selection': 'No joint or bone selected',
    'skeleton.joint.root': 'Root',
    'skeleton.joint.spine': 'Hips',
    'skeleton.joint.headNeck': 'Neck',
    'skeleton.joint.headTop': 'Head Top',
    'skeleton.joint.rightArmShoulder': 'Right Shoulder',
    'skeleton.joint.rightArmElbow': 'Right Elbow',
    'skeleton.joint.rightHandPivot': 'Right Hand',
    'skeleton.joint.rightWristPivot': 'Right Wrist',
    'skeleton.joint.rightWeaponMount': 'Right Weapon Mount',
    'skeleton.joint.leftArmShoulder': 'Left Shoulder',
    'skeleton.joint.leftArmElbow': 'Left Elbow',
    'skeleton.joint.leftHandPivot': 'Left Hand',
    'skeleton.joint.leftWristPivot': 'Left Wrist',
    'skeleton.joint.leftWeaponMount': 'Left Weapon Mount',
    'skeleton.joint.backWeaponMount': 'Back Weapon Mount',
    'skeleton.joint.rightLegHip': 'Right Hip',
    'skeleton.joint.rightLegKnee': 'Right Knee',
    'skeleton.joint.rightFoot': 'Right Foot',
    'skeleton.joint.leftLegHip': 'Left Hip',
    'skeleton.joint.leftLegKnee': 'Left Knee',
    'skeleton.joint.leftFoot': 'Left Foot',
    'skeleton.joint.lowerBodyCollider': 'Lower Collider',
    'skeleton.joint.upperBodyCollider': 'Upper Collider',

    /* ── Interactable kinds / sources / prompts ── */
    'interactable.save_point': 'Save Point',
    'interactable.teleport': 'Teleport Point',
    'interactable.switch': 'Switch',
    'interactable.push_door_single': 'Single Door',
    'interactable.push_door_double': 'Double Door',
    'interactable.gate': 'Lift Gate',
    'interactable.chest': 'Chest',
    'interactable.elevator': 'Elevator',
    'interactable.breakable': 'Breakable Prop',
    'breakable_source.melee': 'Melee',
    'breakable_source.ranged': 'Ranged',
    'breakable_source.explosion': 'Explosion',
    'breakable_source.roll': 'Roll',
    'interact.prompt.save_point_lit': 'Campfire (lit)',
    'interact.prompt.save_point_light': 'Light campfire',
    'interact.prompt.teleport': 'Teleport',
    'interact.prompt.switch_off': 'Turn off',
    'interact.prompt.switch_on': 'Turn on',
    'interact.prompt.door_close': 'Close door',
    'interact.prompt.door_open': 'Open door',
    'interact.prompt.gate_close': 'Close gate',
    'interact.prompt.gate_open': 'Open gate',
    'interact.prompt.chest_open': 'Open chest',
    'interact.prompt.elevator_down': 'Descend',
    'interact.prompt.elevator_up': 'Ascend',
    'interact.prompt.elevator_stop': 'Stop',
    'interact.prompt.elevator_run': 'Run',
    'interact.prompt.pickup': (name) => `Pick up ${name}`,

    /* ── Building materials / props / recipes ── */
    'material.rock': 'Rock',
    'material.soil': 'Soil',
    'material.brick': 'Brick',
    'material.wood': 'Wood',
    'material.rusty_iron': 'Rusty Iron',
    'material.tile': 'Tile',
    'material.cloth': 'Cloth',
    'material.area_water': 'Water',
    'material.area_air': 'Air',
    'material.area_force_field': 'Force Field',
    'prop.door': 'Door',
    'prop.window': 'Window',
    'prop.fence': 'Fence',
    'prop.lantern': 'Lantern',
    'recipe.house': 'House',
    'recipe.tower': 'Tower',
    'recipe.wall': 'Wall',
    'recipe.platform': 'Platform',
    'recipe.ruin': 'Ruin',
    'recipe.tree': 'Tree',
    'recipe.stairs': 'Stairs',
    'recipe.spiral_stairs': 'Spiral Stairs',
    'recipe.bridge': 'Bridge',
    'recipe.great_hall': 'Great Hall',
    'recipe.keep': 'Keep',
    'recipe.dungeon': 'Dungeon',

    /* ── Terrain generators ── */
    'terrain_gen.fbm': 'FBM Noise',
    'terrain_gen.flat': 'Flat',
    'terrain_gen.sine': 'Sine Wave',
    'terrain_gen.steps': 'Steps',
}
