/**
 * 骨骼动画编辑器文案域（时间轴控制条 / 轨道列表 / 内置动作库 / 武器控制 / 导入导出）。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `boneEditZh`、英文表 `boneEditEn` 必须结构一致。
 */
export type BoneEditLocale = {
    /* ── 时间轴控制条 ── */
    'bone_edit.timeline.drag_height': string
    'bone_edit.timeline.play_pause': string
    'bone_edit.timeline.stop': string
    'bone_edit.timeline.loop': string
    'bone_edit.timeline.anim_list_title': string
    'bone_edit.timeline.new_anim': string
    'bone_edit.timeline.del_anim': string
    'bone_edit.timeline.rename_anim': string
    'bone_edit.timeline.add_key': string
    'bone_edit.timeline.add_key_title': string
    'bone_edit.timeline.add_event': string
    'bone_edit.timeline.add_event_title': string
    'bone_edit.timeline.del_key': string
    'bone_edit.timeline.del_key_title': string
    'bone_edit.timeline.copy': string
    'bone_edit.timeline.paste': string
    'bone_edit.timeline.onion_off': string
    'bone_edit.timeline.onion_on': string
    'bone_edit.timeline.undo': string
    'bone_edit.timeline.redo': string
    'bone_edit.timeline.export': string
    'bone_edit.timeline.import': string
    'bone_edit.timeline.duration': string
    'bone_edit.timeline.speed': string
    'bone_edit.timeline.rename_prompt': string
    'bone_edit.timeline.default_clip_name': string

    /* ── 右侧视图/编辑常驻面板 ── */
    'bone_edit.view.title': string
    'bone_edit.view.edit_enabled': string
    'bone_edit.view.show_joints': string
    'bone_edit.view.show_bones': string
    'bone_edit.view.show_model': string

    /* ── 轨道插值方式 ── */
    'bone_edit.interp.linear': string
    'bone_edit.interp.linear_bezier': string
    'bone_edit.interp.ease_in': string
    'bone_edit.interp.ease_out': string
    'bone_edit.interp.strike_peak': string

    /* ── 武器控制 ── */
    'bone_edit.weapon.select_title': string
    'bone_edit.weapon.auto': string
    'bone_edit.weapon.none': string
    'bone_edit.weapon.group_melee': string
    'bone_edit.weapon.group_ranged': string

    /* ── 惯用手预览 ── */
    'bone_edit.handedness': string
    'bone_edit.handedness.select_title': string

    /* ── 动画库 / 导入导出 ── */
    'bone_edit.anim.edited_group': string
    'bone_edit.anim.builtin_suffix': string
    'bone_edit.library.import_skeleton': (n: number) => string
    'bone_edit.library.invalid_asset': string

    /* ── 内置动作分组 ── */
    'bone_edit.group.base': string
    'bone_edit.group.melee': string
    'bone_edit.group.ranged': string

    /* ── 内置动作：基础状态 ── */
    'bone_edit.state.idle': string
    'bone_edit.state.walking': string
    'bone_edit.state.jumping': string
    'bone_edit.state.falling': string
    'bone_edit.state.swimming': string
    'bone_edit.state.floating': string
    'bone_edit.state.dying': string
    'bone_edit.state.rolling': string
    'bone_edit.state.flinching': string
    'bone_edit.state.interacting': string
    'bone_edit.state.knockdown': string
    'bone_edit.state.getting_up': string
    'bone_edit.state.blocking': string
    'bone_edit.state.guard_broken': string
    'bone_edit.state.variant_bare': string
    'bone_edit.state.variant_held': string

    /* ── 函数编排模式 ── */
    'bone_edit.mode.tracks': string
    'bone_edit.mode.script': string
    'bone_edit.form': string
    'bone_edit.form.select_title': string
    'bone_edit.script.title': string
    'bone_edit.script.help': string
    'bone_edit.script.rebake': string
    'bone_edit.script.to_tracks': string
    'bone_edit.script.duration': string
    'bone_edit.script.loop': string
    'bone_edit.script.once': string
    'bone_edit.script.error': string
    'bone_edit.script.empty': string
    'bone_edit.script.baked': (n: number) => string
    'bone_edit.script.humanoid.wave': string
    'bone_edit.script.humanoid.bow': string
    'bone_edit.script.humanoid.march': string
    'bone_edit.script.wolf.tail_wag': string
    'bone_edit.script.wolf.prowl': string
    'bone_edit.script.wolf.howl': string
    'bone_edit.script.horse.head_nod': string
    'bone_edit.script.horse.trot': string
    'bone_edit.script.horse.paw': string
    'bone_edit.script.wyvern.wing_fold': string
    'bone_edit.script.wyvern.roar': string
    'bone_edit.script.wyvern.stalk': string
}

export const boneEditZh: BoneEditLocale = {
    /* ── 时间轴控制条 ── */
    'bone_edit.timeline.drag_height': '拖拽调节高度',
    'bone_edit.timeline.play_pause': '播放/暂停',
    'bone_edit.timeline.stop': '停止',
    'bone_edit.timeline.loop': '循环 ',
    'bone_edit.timeline.anim_list_title': '动画列表：编辑动画 + 内置动作（攻击/行走/跳跃等，选中载入可编辑副本）',
    'bone_edit.timeline.new_anim': '+动画',
    'bone_edit.timeline.del_anim': '−动画',
    'bone_edit.timeline.rename_anim': '改名',
    'bone_edit.timeline.add_key': '+关键帧',
    'bone_edit.timeline.add_key_title': '把当前姿态记录到播放头时间（选中目标或全部）',
    'bone_edit.timeline.add_event': '+事件',
    'bone_edit.timeline.add_event_title': '在播放头时间插入事件（默认 hitbox_on）',
    'bone_edit.timeline.del_key': '−关键帧',
    'bone_edit.timeline.del_key_title': '删除选中关键帧',
    'bone_edit.timeline.copy': '复制',
    'bone_edit.timeline.paste': '粘贴',
    'bone_edit.timeline.onion_off': '洋葱皮',
    'bone_edit.timeline.onion_on': '洋葱皮开',
    'bone_edit.timeline.undo': '撤销',
    'bone_edit.timeline.redo': '重做',
    'bone_edit.timeline.export': '导出',
    'bone_edit.timeline.import': '导入',
    'bone_edit.timeline.duration': '时长',
    'bone_edit.timeline.speed': '速度',
    'bone_edit.timeline.rename_prompt': '新动画名：',
    'bone_edit.timeline.default_clip_name': '动画',

    /* ── 右侧视图/编辑常驻面板 ── */
    'bone_edit.view.title': '视图与编辑',
    'bone_edit.view.edit_enabled': '允许编辑节点',
    'bone_edit.view.show_joints': '显示节点',
    'bone_edit.view.show_bones': '显示骨骼',
    'bone_edit.view.show_model': '显示模型',

    /* ── 轨道插值方式 ── */
    'bone_edit.interp.linear': '线性',
    'bone_edit.interp.linear_bezier': '线性(贝)',
    'bone_edit.interp.ease_in': '先慢后快',
    'bone_edit.interp.ease_out': '先快后慢',
    'bone_edit.interp.strike_peak': '末端加速',

    /* ── 武器控制 ── */
    'bone_edit.weapon.select_title': '编辑器武器（自动 = 跟随当前动画所属武器）',
    'bone_edit.weapon.auto': '武器：自动',
    'bone_edit.weapon.none': '武器：无',
    'bone_edit.weapon.group_melee': '近战武器',
    'bone_edit.weapon.group_ranged': '远程武器',

    /* ── 惯用手预览 ── */
    'bone_edit.handedness': '惯用手',
    'bone_edit.handedness.select_title': '预览惯用手：左撇子 = 聚焦骨架整体镜像（与游戏内镜像结果一致）',

    /* ── 动画库 / 导入导出 ── */
    'bone_edit.anim.edited_group': '编辑动画',
    'bone_edit.anim.builtin_suffix': '（选中载入副本）',
    'bone_edit.library.import_skeleton': (n) => `导入骨架${n}`,
    'bone_edit.library.invalid_asset': '资产文件格式无效！',

    /* ── 内置动作分组 ── */
    'bone_edit.group.base': '基础状态',
    'bone_edit.group.melee': '近战攻击',
    'bone_edit.group.ranged': '远程攻击',

    /* ── 内置动作：基础状态 ── */
    'bone_edit.state.idle': '待机',
    'bone_edit.state.walking': '行走',
    'bone_edit.state.jumping': '跳跃',
    'bone_edit.state.falling': '下落',
    'bone_edit.state.swimming': '游泳',
    'bone_edit.state.floating': '漂浮',
    'bone_edit.state.dying': '死亡',
    'bone_edit.state.rolling': '翻滚',
    'bone_edit.state.flinching': '受击硬直',
    'bone_edit.state.interacting': '交互',
    'bone_edit.state.knockdown': '倒地',
    'bone_edit.state.getting_up': '起身',
    'bone_edit.state.blocking': '格挡',
    'bone_edit.state.guard_broken': '破防',
    'bone_edit.state.variant_bare': '（空手）',
    'bone_edit.state.variant_held': '（持械）',

    /* ── 函数编排模式 ── */
    'bone_edit.mode.tracks': '轨道编辑',
    'bone_edit.mode.script': '函数编排',
    'bone_edit.form': '体形',
    'bone_edit.form.select_title': '切换骨骼体形（各体形独立保存动画库）',
    'bone_edit.script.title': '语义动作脚本',
    'bone_edit.script.help': '动作函数在首次进入本模式时烘焙为 clip，之后直接播放缓存',
    'bone_edit.script.rebake': '重新烘焙',
    'bone_edit.script.to_tracks': '载入轨道编辑',
    'bone_edit.script.duration': '时长',
    'bone_edit.script.loop': '循环',
    'bone_edit.script.once': '单次',
    'bone_edit.script.error': '烘焙失败',
    'bone_edit.script.empty': '当前体形没有注册脚本动作',
    'bone_edit.script.baked': (n) => `已烘焙 ${n} 个动作`,
    'bone_edit.script.humanoid.wave': '挥手',
    'bone_edit.script.humanoid.bow': '鞠躬',
    'bone_edit.script.humanoid.march': '行军步',
    'bone_edit.script.wolf.tail_wag': '摇尾',
    'bone_edit.script.wolf.prowl': '潜行',
    'bone_edit.script.wolf.howl': '长嚎',
    'bone_edit.script.horse.head_nod': '点头',
    'bone_edit.script.horse.trot': '快步',
    'bone_edit.script.horse.paw': '刨蹄',
    'bone_edit.script.wyvern.wing_fold': '振翼',
    'bone_edit.script.wyvern.roar': '咆哮',
    'bone_edit.script.wyvern.stalk': '潜近',
}

export const boneEditEn: BoneEditLocale = {
    /* ── Timeline controls ── */
    'bone_edit.timeline.drag_height': 'Drag to resize',
    'bone_edit.timeline.play_pause': 'Play / Pause',
    'bone_edit.timeline.stop': 'Stop',
    'bone_edit.timeline.loop': 'Loop ',
    'bone_edit.timeline.anim_list_title': 'Animation list: edited animations + built-in actions (attacks / walk / jump, etc.; selecting loads an editable copy)',
    'bone_edit.timeline.new_anim': '+Anim',
    'bone_edit.timeline.del_anim': '−Anim',
    'bone_edit.timeline.rename_anim': 'Rename',
    'bone_edit.timeline.add_key': '+Key',
    'bone_edit.timeline.add_key_title': 'Record current pose at the playhead (selected targets or all)',
    'bone_edit.timeline.add_event': '+Event',
    'bone_edit.timeline.add_event_title': 'Insert an event at the playhead (default hitbox_on)',
    'bone_edit.timeline.del_key': '−Key',
    'bone_edit.timeline.del_key_title': 'Delete selected keyframes',
    'bone_edit.timeline.copy': 'Copy',
    'bone_edit.timeline.paste': 'Paste',
    'bone_edit.timeline.onion_off': 'Onion Skin',
    'bone_edit.timeline.onion_on': 'Onion Skin On',
    'bone_edit.timeline.undo': 'Undo',
    'bone_edit.timeline.redo': 'Redo',
    'bone_edit.timeline.export': 'Export',
    'bone_edit.timeline.import': 'Import',
    'bone_edit.timeline.duration': 'Duration',
    'bone_edit.timeline.speed': 'Speed',
    'bone_edit.timeline.rename_prompt': 'New animation name:',
    'bone_edit.timeline.default_clip_name': 'Animation',

    /* ── View/edit side panel ── */
    'bone_edit.view.title': 'View & Editing',
    'bone_edit.view.edit_enabled': 'Allow node editing',
    'bone_edit.view.show_joints': 'Show joints',
    'bone_edit.view.show_bones': 'Show bones',
    'bone_edit.view.show_model': 'Show model',

    /* ── Track interpolation ── */
    'bone_edit.interp.linear': 'Linear',
    'bone_edit.interp.linear_bezier': 'Linear (Bézier)',
    'bone_edit.interp.ease_in': 'Ease In',
    'bone_edit.interp.ease_out': 'Ease Out',
    'bone_edit.interp.strike_peak': 'Strike Peak',

    /* ── Weapon control ── */
    'bone_edit.weapon.select_title': 'Editor weapon (Auto = follow the current animation weapon)',
    'bone_edit.weapon.auto': 'Weapon: Auto',
    'bone_edit.weapon.none': 'Weapon: None',
    'bone_edit.weapon.group_melee': 'Melee',
    'bone_edit.weapon.group_ranged': 'Ranged',

    /* ── Handedness preview ── */
    'bone_edit.handedness': 'Handed',
    'bone_edit.handedness.select_title': 'Preview handedness: left = mirror the focused skeleton as a whole (matches the in-game mirror result)',

    /* ── Animation library / import-export ── */
    'bone_edit.anim.edited_group': 'Edited Animations',
    'bone_edit.anim.builtin_suffix': ' (select to load a copy)',
    'bone_edit.library.import_skeleton': (n) => `Imported Skeleton ${n}`,
    'bone_edit.library.invalid_asset': 'Invalid asset file format!',

    /* ── Built-in action groups ── */
    'bone_edit.group.base': 'Base States',
    'bone_edit.group.melee': 'Melee Attacks',
    'bone_edit.group.ranged': 'Ranged Attacks',

    /* ── Built-in actions: base states ── */
    'bone_edit.state.idle': 'Idle',
    'bone_edit.state.walking': 'Walk',
    'bone_edit.state.jumping': 'Jump',
    'bone_edit.state.falling': 'Fall',
    'bone_edit.state.swimming': 'Swim',
    'bone_edit.state.floating': 'Float',
    'bone_edit.state.dying': 'Death',
    'bone_edit.state.rolling': 'Roll',
    'bone_edit.state.flinching': 'Flinch',
    'bone_edit.state.interacting': 'Interact',
    'bone_edit.state.knockdown': 'Knockdown',
    'bone_edit.state.getting_up': 'Get Up',
    'bone_edit.state.blocking': 'Block',
    'bone_edit.state.guard_broken': 'Guard Broken',
    'bone_edit.state.variant_bare': ' (Unarmed)',
    'bone_edit.state.variant_held': ' (Armed)',

    /* ── Script authoring mode ── */
    'bone_edit.mode.tracks': 'Tracks',
    'bone_edit.mode.script': 'Script',
    'bone_edit.form': 'Form',
    'bone_edit.form.select_title': 'Switch skeleton form (each form keeps its own animation library)',
    'bone_edit.script.title': 'Semantic Motion Scripts',
    'bone_edit.script.help': 'Motion functions are baked into clips the first time this mode opens, then played from cache',
    'bone_edit.script.rebake': 'Re-bake',
    'bone_edit.script.to_tracks': 'Load to Tracks',
    'bone_edit.script.duration': 'Duration',
    'bone_edit.script.loop': 'Loop',
    'bone_edit.script.once': 'One-shot',
    'bone_edit.script.error': 'Bake failed',
    'bone_edit.script.empty': 'No scripted motions registered for this form',
    'bone_edit.script.baked': (n) => `${n} motion(s) baked`,
    'bone_edit.script.humanoid.wave': 'Wave',
    'bone_edit.script.humanoid.bow': 'Bow',
    'bone_edit.script.humanoid.march': 'March',
    'bone_edit.script.wolf.tail_wag': 'Tail Wag',
    'bone_edit.script.wolf.prowl': 'Prowl',
    'bone_edit.script.wolf.howl': 'Howl',
    'bone_edit.script.horse.head_nod': 'Head Nod',
    'bone_edit.script.horse.trot': 'Trot',
    'bone_edit.script.horse.paw': 'Paw',
    'bone_edit.script.wyvern.wing_fold': 'Wing Flap',
    'bone_edit.script.wyvern.roar': 'Roar',
    'bone_edit.script.wyvern.stalk': 'Stalk',
}
