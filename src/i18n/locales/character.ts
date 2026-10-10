/**
 * 角色领域文案域（槽位 / 持握模式 / 攻击类别 / 护甲肢体武器名 / 角色面板）。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `characterZh`、英文表 `characterEn` 必须结构一致。
 */
export type CharacterLocale = {
    /* ── 领域标签 ── */
    'hold_mode.one_handed': string
    'hold_mode.two_handed': string
    'hold_mode.dual_wield': string
    'damage.physical': string
    'damage.magic': string
    'attack_key.light': string
    'attack_key.heavy': string
    'character.segment_name': (keyLabel: string, step: string) => string
    'armor_slot.head': string
    'armor_slot.chest': string
    'armor_slot.arms': string
    'armor_slot.legs': string
    'limb_slot.head': string
    'limb_slot.arms': string
    'limb_slot.body': string
    'limb_slot.legs': string
    'weapon.short_sword': string
    'weapon.long_sword': string
    'weapon.heavy_sword': string
    'weapon.spear': string
    'weapon.dual_axe': string
    'weapon.war_hammer': string
    'weapon.longbow': string
    'weapon.crossbow': string
    'weapon.shotgun': string
    'weapon.staff': string
    'weapon.magic_wand': string
    'weapon.throwing_axe': string
    'weapon.grenade': string
    'weapon.molotov': string
    'weapon.throwing_dart': string
    'weapon.test_weapon': string
    'armor.cloth_cap': string
    'armor.iron_helmet': string
    'armor.mage_hood': string
    'armor.cloth_vest': string
    'armor.leather_armor': string
    'armor.iron_plate': string
    'armor.mage_robe': string
    'armor.scale_mail': string
    'armor.cloth_bracers': string
    'armor.iron_bracers': string
    'armor.battle_bracers': string
    'armor.mage_wraps': string
    'armor.cloth_pants': string
    'armor.iron_greaves': string
    'armor.mage_leggings': string
    'armor.swift_boots': string
    'armor.wind_boots': string
    'limb.skeleton_head': string
    'limb.skeleton_arms': string
    'limb.skeleton_body': string
    'limb.skeleton_legs': string
    'limb.orc_head': string
    'limb.orc_arms': string
    'limb.orc_body': string
    'limb.orc_legs': string
    'limb.elf_head': string
    'limb.elf_arms': string
    'limb.elf_body': string
    'limb.elf_legs': string

    /* ── 角色面板 ── */
    'character.title': string
    'character.section.equip': string
    'character.section.attributes': string
    'character.section.lock_points': string
    'character.section.player': string
    'character.section.ai': string
    'character.section.build': string
    'character.facing': string
    'character.speed': string
    'character.jump_height': string
    'character.scale': string
    'character.faction': string
    'character.tendency': string
    'character.target_factions': string
    'character.weapon': string
    'character.offhand': string
    'character.hold': string
    'character.range': string
    'character.damage': string
    'character.cooldown': string
    'character.charge_power': string
    'character.charge_time': string
    'character.bullet_speed': string
    'character.bullet_knockback': string
    'character.bullet_life': string
    'character.max_hp': string
    'character.cur_hp': string
    'character.base_def_phys': string
    'character.base_def_magic': string
    'character.build_interval': string
    'character.box_types': string
    'character.add_box_type': string
    'character.add_lock_point': string
    'character.default_lock_point': string
    'character.limb_prefix': string
    'character.detail_edit_title': (type: string) => string
    'character.detail_hint': string
    'character.done': string
    'character.mark_player': string
    'character.enable_nav': string
    'character.hold_mode_hint': string
    'character.offhand_tip': string
    'character.hold_tip': string
    'character.limb_tip': string
    'character.weapon_group_melee': string
    'character.weapon_group_ranged': string
    'character.tag.spread': (n: string) => string
    'character.tag.explosion': (r: string) => string
    'character.tag.homing': (s: string) => string
    'character.tag.throw_arc': (deg: string) => string
    'character.tag.def_phys': (n: string) => string
    'character.tag.def_magic': (n: string) => string
    'character.tag.atk_phys': (n: string) => string
    'character.tag.atk_magic': (n: string) => string
    'character.tag.move_speed': (n: string) => string
    'character.armor_desc': (name: string, tags: string) => string
    'character.preview_defense': (phys: string, magic: string) => string
    'character.preview_attack': (phys: string, magic: string) => string
    'character.preview_move': (total: string, base: string, equip: string) => string
    'character.idle': string
    'character.tendency.hostile_all': string
    'character.tendency.hostile_except_self': string
    'character.tendency.hostile_to': string
    'character.tendency.hostile_except': string
    'character.tendency.pacifist': string
    'character.peace.patrol': string
    'character.peace.build': string
    'character.peace_label': string
    'character.combat_label': string
    'character.combat.tactical': string
    'character.combat.aggressive': string
    'character.combat.cowardly': string
    'character.field.entity_type': string
    'character.field.probability': string
    'character.field.min_w': string
    'character.field.max_w': string
    'character.field.min_h': string
    'character.field.max_h': string
    'character.field.min_d': string
    'character.field.max_d': string
    'character.field.mass': string
    'character.field.friction': string
    'character.field.max_health': string
    'character.field.attr_radius': string
    'character.field.attr_strength': string
    'character.field.stiffness': string
    'character.field.damping_ratio': string
    'character.field.max_deform': string
}

export const characterZh: CharacterLocale = {
    /* ── 领域标签 ── */
    'hold_mode.one_handed': '单持',
    'hold_mode.two_handed': '双手共持',
    'hold_mode.dual_wield': '双持',
    'damage.physical': '物理',
    'damage.magic': '魔法',
    'attack_key.light': '轻击',
    'attack_key.heavy': '重击',
    'character.segment_name': (keyLabel, step) => {
        const numerals: Record<string, string> = {'1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六'}
        return `${keyLabel}${numerals[step] ?? step}段`
    },
    'armor_slot.head': '头盔',
    'armor_slot.chest': '胸甲',
    'armor_slot.arms': '臂甲',
    'armor_slot.legs': '护腿',
    'limb_slot.head': '头部',
    'limb_slot.arms': '手臂',
    'limb_slot.body': '身体',
    'limb_slot.legs': '腿部',
    'weapon.short_sword': '短剑',
    'weapon.long_sword': '长剑',
    'weapon.heavy_sword': '巨剑',
    'weapon.spear': '长枪',
    'weapon.dual_axe': '战斧',
    'weapon.war_hammer': '战锤',
    'weapon.longbow': '长弓',
    'weapon.crossbow': '弩',
    'weapon.shotgun': '霰弹枪',
    'weapon.staff': '法杖',
    'weapon.magic_wand': '魔杖',
    'weapon.throwing_axe': '飞斧',
    'weapon.grenade': '手雷',
    'weapon.molotov': '燃烧瓶',
    'weapon.throwing_dart': '飞镖',
    'weapon.test_weapon': '测试武器',
    'armor.cloth_cap': '布帽',
    'armor.iron_helmet': '铁盔',
    'armor.mage_hood': '法师兜帽',
    'armor.cloth_vest': '布衣',
    'armor.leather_armor': '皮甲',
    'armor.iron_plate': '铁胸甲',
    'armor.mage_robe': '法袍',
    'armor.scale_mail': '鳞甲',
    'armor.cloth_bracers': '布护腕',
    'armor.iron_bracers': '铁臂甲',
    'armor.battle_bracers': '战臂甲',
    'armor.mage_wraps': '法印护腕',
    'armor.cloth_pants': '布裤',
    'armor.iron_greaves': '铁胫甲',
    'armor.mage_leggings': '法师护腿',
    'armor.swift_boots': '疾行靴',
    'armor.wind_boots': '疾风靴',
    'limb.skeleton_head': '骷髅头颅',
    'limb.skeleton_arms': '骷髅臂骨',
    'limb.skeleton_body': '骷髅躯干',
    'limb.skeleton_legs': '骷髅腿骨',
    'limb.orc_head': '兽人头颅',
    'limb.orc_arms': '兽人臂膀',
    'limb.orc_body': '兽人躯干',
    'limb.orc_legs': '兽人腿脚',
    'limb.elf_head': '精灵头颅',
    'limb.elf_arms': '精灵手臂',
    'limb.elf_body': '精灵身躯',
    'limb.elf_legs': '精灵腿脚',

    /* ── 角色面板 ── */
    'character.title': '角色控制',
    'character.section.equip': '装备',
    'character.section.attributes': '属性',
    'character.section.lock_points': '锁定点',
    'character.section.player': '玩家',
    'character.section.ai': 'AI 策略',
    'character.section.build': '建造配置',
    'character.facing': '朝向°',
    'character.speed': '速度',
    'character.jump_height': '跳跃高',
    'character.scale': '体型',
    'character.faction': '阵营',
    'character.tendency': '倾向',
    'character.target_factions': '目标阵营',
    'character.weapon': '武器',
    'character.offhand': '副手',
    'character.hold': '持握',
    'character.range': '射程',
    'character.damage': '伤害',
    'character.cooldown': '冷却',
    'character.charge_power': '蓄力%',
    'character.charge_time': '蓄力时',
    'character.bullet_speed': '弹速',
    'character.bullet_knockback': '击退',
    'character.bullet_life': '存活',
    'character.max_hp': '最大生命',
    'character.cur_hp': '当前生命',
    'character.base_def_phys': '基础物防',
    'character.base_def_magic': '基础魔防',
    'character.build_interval': '间隔(秒)',
    'character.box_types': '箱型',
    'character.add_box_type': '+ 添加箱型',
    'character.add_lock_point': '+ 添加锁定点',
    'character.default_lock_point': '默认：身体中心（不可删除）',
    'character.limb_prefix': '肢体·',
    'character.detail_edit_title': (type) => `编辑：${type}`,
    'character.detail_hint': '点击编辑详细参数',
    'character.done': '完成',
    'character.mark_player': '标记为玩家',
    'character.enable_nav': '启用导航感知',
    'character.hold_mode_hint': '双持需副手装备同类近战武器',
    'character.offhand_tip': '副手武器：单持时左手持握、双手共持时挂背；与主手同类近战可双持',
    'character.hold_tip': '持握模式：单持 / 双手共持 / 双持（双持需副手装备同类近战武器）',
    'character.limb_tip': '肢体组件（骷髅 / 兽人 / 精灵）：装备后默认顶替该部位的人类肢体，颜色随阵营变化；空 = 默认人类肢体',
    'character.weapon_group_melee': '近战武器',
    'character.weapon_group_ranged': '远程武器',
    'character.tag.spread': (n) => `散射×${n}`,
    'character.tag.explosion': (r) => `爆炸 R:${r}`,
    'character.tag.homing': (s) => `追踪 S:${s}`,
    'character.tag.throw_arc': (deg) => `抛物线:${deg}°`,
    'character.tag.def_phys': (n) => `物防${n}`,
    'character.tag.def_magic': (n) => `魔防${n}`,
    'character.tag.atk_phys': (n) => `物攻+${n}`,
    'character.tag.atk_magic': (n) => `魔攻+${n}`,
    'character.tag.move_speed': (n) => `移速×${n}`,
    'character.armor_desc': (name, tags) => `${name}（${tags}）`,
    'character.preview_defense': (phys, magic) => `有效防御：物 ${phys} / 魔 ${magic}`,
    'character.preview_attack': (phys, magic) => `攻击加成：物 ${phys} / 魔 ${magic}`,
    'character.preview_move': (total, base, equip) => `有效移速：${total}（基础 ${base} × 装备 ${equip}）`,
    'character.idle': '待机',
    'character.tendency.hostile_all': '敌对全部',
    'character.tendency.hostile_except_self': '敌对除自身外',
    'character.tendency.hostile_to': '敌对指定...',
    'character.tendency.hostile_except': '除指定外敌对...',
    'character.tendency.pacifist': '和平',
    'character.peace.patrol': '巡逻',
    'character.peace.build': '建造',
    'character.peace_label': '和平',
    'character.combat_label': '战斗',
    'character.combat.tactical': '战术（默认）',
    'character.combat.aggressive': '激进',
    'character.combat.cowardly': '怯懦',
    'character.field.entity_type': '实体类型',
    'character.field.probability': '概率',
    'character.field.min_w': '最小宽',
    'character.field.max_w': '最大宽',
    'character.field.min_h': '最小高',
    'character.field.max_h': '最大高',
    'character.field.min_d': '最小深',
    'character.field.max_d': '最大深',
    'character.field.mass': '质量',
    'character.field.friction': '摩擦',
    'character.field.max_health': '最大生命',
    'character.field.attr_radius': '吸引半径',
    'character.field.attr_strength': '吸引强度',
    'character.field.stiffness': '刚度',
    'character.field.damping_ratio': '阻尼比',
    'character.field.max_deform': '最大形变',
}

export const characterEn: CharacterLocale = {
    /* ── Domain labels ── */
    'hold_mode.one_handed': 'One-handed',
    'hold_mode.two_handed': 'Two-handed',
    'hold_mode.dual_wield': 'Dual wield',
    'damage.physical': 'Physical',
    'damage.magic': 'Magic',
    'attack_key.light': 'Light',
    'attack_key.heavy': 'Heavy',
    'character.segment_name': (keyLabel, step) => `${keyLabel} ${step}`,
    'armor_slot.head': 'Head',
    'armor_slot.chest': 'Chest',
    'armor_slot.arms': 'Arms',
    'armor_slot.legs': 'Legs',
    'limb_slot.head': 'Head',
    'limb_slot.arms': 'Arms',
    'limb_slot.body': 'Body',
    'limb_slot.legs': 'Legs',
    'weapon.short_sword': 'Short Sword',
    'weapon.long_sword': 'Long Sword',
    'weapon.heavy_sword': 'Heavy Sword',
    'weapon.spear': 'Spear',
    'weapon.dual_axe': 'Battle Axe',
    'weapon.war_hammer': 'War Hammer',
    'weapon.longbow': 'Longbow',
    'weapon.crossbow': 'Crossbow',
    'weapon.shotgun': 'Shotgun',
    'weapon.staff': 'Staff',
    'weapon.magic_wand': 'Magic Wand',
    'weapon.throwing_axe': 'Throwing Axe',
    'weapon.grenade': 'Grenade',
    'weapon.molotov': 'Molotov',
    'weapon.throwing_dart': 'Throwing Dart',
    'weapon.test_weapon': 'Test Weapon',
    'armor.cloth_cap': 'Cloth Cap',
    'armor.iron_helmet': 'Iron Helmet',
    'armor.mage_hood': 'Mage Hood',
    'armor.cloth_vest': 'Cloth Vest',
    'armor.leather_armor': 'Leather Armor',
    'armor.iron_plate': 'Iron Plate',
    'armor.mage_robe': 'Mage Robe',
    'armor.scale_mail': 'Scale Mail',
    'armor.cloth_bracers': 'Cloth Bracers',
    'armor.iron_bracers': 'Iron Bracers',
    'armor.battle_bracers': 'Battle Bracers',
    'armor.mage_wraps': 'Mage Wraps',
    'armor.cloth_pants': 'Cloth Pants',
    'armor.iron_greaves': 'Iron Greaves',
    'armor.mage_leggings': 'Mage Leggings',
    'armor.swift_boots': 'Swift Boots',
    'armor.wind_boots': 'Wind Boots',
    'limb.skeleton_head': 'Skeleton Skull',
    'limb.skeleton_arms': 'Skeleton Arm Bones',
    'limb.skeleton_body': 'Skeleton Torso',
    'limb.skeleton_legs': 'Skeleton Leg Bones',
    'limb.orc_head': 'Orc Skull',
    'limb.orc_arms': 'Orc Arms',
    'limb.orc_body': 'Orc Torso',
    'limb.orc_legs': 'Orc Legs',
    'limb.elf_head': 'Elf Skull',
    'limb.elf_arms': 'Elf Arms',
    'limb.elf_body': 'Elf Torso',
    'limb.elf_legs': 'Elf Legs',

    /* ── Character panel ── */
    'character.title': 'Character Control',
    'character.section.equip': 'Equipment',
    'character.section.attributes': 'Attributes',
    'character.section.lock_points': 'Lock Points',
    'character.section.player': 'Player',
    'character.section.ai': 'AI Strategy',
    'character.section.build': 'Build Config',
    'character.facing': 'Facing°',
    'character.speed': 'Speed',
    'character.jump_height': 'JumpH',
    'character.scale': 'Scale',
    'character.faction': 'Faction',
    'character.tendency': 'Tendency',
    'character.target_factions': 'TargetFactions',
    'character.weapon': 'Wpn',
    'character.offhand': 'Off',
    'character.hold': 'Hold',
    'character.range': 'Range',
    'character.damage': 'Damage',
    'character.cooldown': 'Cooldown',
    'character.charge_power': 'ChgPwr%',
    'character.charge_time': 'ChgTime',
    'character.bullet_speed': 'BulSpd',
    'character.bullet_knockback': 'BulKnock',
    'character.bullet_life': 'BulLife',
    'character.max_hp': 'MaxHP',
    'character.cur_hp': 'CurHP',
    'character.base_def_phys': 'Base Phys Def',
    'character.base_def_magic': 'Base Magic Def',
    'character.build_interval': 'Interval(s)',
    'character.box_types': 'Box Types',
    'character.add_box_type': '+ Add Box Type',
    'character.add_lock_point': '+ Add Lock Point',
    'character.default_lock_point': 'Default: body center (cannot delete)',
    'character.limb_prefix': 'Limb·',
    'character.detail_edit_title': (type) => `Edit: ${type}`,
    'character.detail_hint': 'Click to edit details',
    'character.done': 'Done',
    'character.mark_player': 'Mark as Player',
    'character.enable_nav': 'Enable Nav Sensing',
    'character.hold_mode_hint': 'Dual wield needs an offhand melee weapon of the same class',
    'character.offhand_tip': 'Offhand weapon: held in left hand when one-handed, stowed on back when two-handed; dual wield needs the same melee class as the main hand',
    'character.hold_tip': 'Hold mode: one-handed / two-handed / dual wield (dual wield needs an offhand melee weapon of the same class)',
    'character.limb_tip': 'Limb parts (skeleton / orc / elf): equipping replaces the human limb of that part, color follows faction; empty = default human limb',
    'character.weapon_group_melee': 'Melee Weapons',
    'character.weapon_group_ranged': 'Ranged Weapons',
    'character.tag.spread': (n) => `Spread×${n}`,
    'character.tag.explosion': (r) => `Blast R:${r}`,
    'character.tag.homing': (s) => `Homing S:${s}`,
    'character.tag.throw_arc': (deg) => `Arc:${deg}°`,
    'character.tag.def_phys': (n) => `PDef${n}`,
    'character.tag.def_magic': (n) => `MDef${n}`,
    'character.tag.atk_phys': (n) => `PAtk+${n}`,
    'character.tag.atk_magic': (n) => `MAtk+${n}`,
    'character.tag.move_speed': (n) => `Spd×${n}`,
    'character.armor_desc': (name, tags) => `${name} (${tags})`,
    'character.preview_defense': (phys, magic) => `Effective defense: phys ${phys} / magic ${magic}`,
    'character.preview_attack': (phys, magic) => `Attack bonus: phys ${phys} / magic ${magic}`,
    'character.preview_move': (total, base, equip) => `Effective speed: ${total} (base ${base} × gear ${equip})`,
    'character.idle': 'Idle',
    'character.tendency.hostile_all': 'Hostile All',
    'character.tendency.hostile_except_self': 'Hostile Except Self',
    'character.tendency.hostile_to': 'Hostile To...',
    'character.tendency.hostile_except': 'Hostile Except...',
    'character.tendency.pacifist': 'Pacifist',
    'character.peace.patrol': 'Patrol',
    'character.peace.build': 'Build',
    'character.peace_label': 'Peace',
    'character.combat_label': 'Combat',
    'character.combat.tactical': 'Tactical (default)',
    'character.combat.aggressive': 'Aggressive',
    'character.combat.cowardly': 'Cowardly',
    'character.field.entity_type': 'EntityType',
    'character.field.probability': 'Probability',
    'character.field.min_w': 'Min W',
    'character.field.max_w': 'Max W',
    'character.field.min_h': 'Min H',
    'character.field.max_h': 'Max H',
    'character.field.min_d': 'Min D',
    'character.field.max_d': 'Max D',
    'character.field.mass': 'Mass',
    'character.field.friction': 'Friction',
    'character.field.max_health': 'MaxHealth',
    'character.field.attr_radius': 'AttrRadius',
    'character.field.attr_strength': 'AttrStrength',
    'character.field.stiffness': 'Stiffness',
    'character.field.damping_ratio': 'DampingRatio',
    'character.field.max_deform': 'MaxDeformFr',
}
