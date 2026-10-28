/**
 * 角色领域文案域（槽位 / 持握模式 / 攻击类别 / 护甲肢体武器名 / 角色面板）。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `characterZh`、英文表 `characterEn` 必须结构一致。
 */
export type CharacterLocale = {
    /* ── 领域标签 ── */
    'hold_mode.one_handed': string
    'hold_mode.two_handed': string
    'hold_mode.dual_wield': string
    'handedness.right': string
    'handedness.left': string
    'damage.physical': string
    'damage.magic': string
    'impact.light': string
    'impact.medium': string
    'impact.heavy': string
    'impact.knockdown': string
    'attack_key.light': string
    'attack_key.heavy': string
    'attack_key.air': string
    'attack_module.breath': string
    'body_form.humanoid': string
    'body_form.wolf': string
    'body_form.horse': string
    'body_form.wyvern': string
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
    'weapon.unarmed': string
    'weapon.bite': string
    'weapon.claw': string
    'weapon.kick': string
    'weapon.breath': string
    'weapon.wolf_bite': string
    'weapon.wolf_short_sword': string
    'weapon.wolf_long_sword': string
    'weapon.wolf_claw': string
    'weapon.wolf_claw_blade': string
    'weapon.horse_iron_hoof': string
    'weapon.wyvern_claw': string
    'weapon.wyvern_wing_blade': string
    'breath.natural': string
    'breath.fireball': string
    'breath.lightning': string
    'breath.laser': string
    'weapon.shield_small': string
    'weapon.shield_medium': string
    'weapon.shield_large': string
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
    'armor.leather_cap': string
    'armor.leather_bracers': string
    'armor.leather_legs': string
    'armor.scale_helm': string
    'armor.scale_bracers': string
    'armor.scale_legs': string
    'armor.stone_helm': string
    'armor.stone_plate': string
    'armor.stone_bracers': string
    'armor.stone_legs': string
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
    'armor.wolf_head_guard': string
    'armor.wolf_hide': string
    'armor.wolf_leg_wraps': string
    'armor.wolf_claw_guard': string
    'limb.wolf_claw_wrap': string
    'limb.wolf_tail_guard': string
    'limb.wolf_torso_harness': string
    'limb.wolf_head_guard': string
    'limb.wolf_leg_guards': string
    'armor.horse_head_armor': string
    'armor.horse_barding': string
    'armor.horse_hoof_shoes': string
    'armor.horse_leg_guards': string
    'limb.horse_iron_legs': string
    'limb.horse_tail_banner': string
    'limb.horse_head_plume': string
    'limb.horse_torso_barding': string
    'armor.wyvern_head_crest': string
    'armor.wyvern_scale_plate': string
    'armor.wyvern_wing_guards': string
    'armor.wyvern_tail_spikes': string
    'armor.wyvern_leg_guards': string
    'limb.wyvern_wing_claw_blade': string
    'limb.wyvern_head_horns': string
    'limb.wyvern_tail_blade': string
    'limb.wyvern_wing_guard': string
    'limb.wyvern_torso_plates': string
    'limb.wyvern_leg_guards': string
    /* 非人形护甲套装 / 逐槽位肢体 */
    'armor_set.wolf_leather': string
    'armor_set.wolf_bone': string
    'armor_set.horse_iron': string
    'armor_set.horse_leather': string
    'armor_set.wyvern_scale': string
    'armor_set.wyvern_bone': string
    'armor.wolf_bone_head': string
    'armor.wolf_bone_torso': string
    'armor.wolf_bone_legs': string
    'armor.wolf_bone_claw': string
    'armor.wolf_bone_tail': string
    'armor.horse_leather_head': string
    'armor.horse_leather_torso': string
    'armor.horse_leather_legs': string
    'armor.horse_leather_tail': string
    'armor.wyvern_bone_wing_claw': string
    'armor.wyvern_bone_head': string
    'armor.wyvern_bone_tail': string
    'armor.wyvern_bone_wing': string
    'armor.wyvern_bone_torso': string
    'armor.wyvern_bone_legs': string
    'limb.wolf_limb_blue': string
    'limb.wolf_limb_red': string
    'limb.wolf_limb_white': string
    'limb.horse_limb_white': string
    'limb.horse_limb_black': string
    'limb.horse_limb_yellow': string
    'limb.wyvern_limb_white': string
    'limb.wyvern_limb_black': string
    'limb.wyvern_limb_red': string
    'limb.wyvern_limb_yellow': string
    'limb.wyvern_limb_purple': string
    'limb.wyvern_limb_blue': string
    'limb.wolf_blue': string
    'limb.wolf_red': string
    'limb.wolf_white': string
    'limb.horse_white': string
    'limb.horse_black': string
    'limb.horse_yellow': string
    'limb.wyvern_white': string
    'limb.wyvern_black': string
    'limb.wyvern_red': string
    'limb.wyvern_yellow': string
    'limb.wyvern_purple': string
    'limb.wyvern_blue': string

    /* ── 角色面板 ── */
    'character.title': string
    'character.section.equip': string
    'character.section.attributes': string
    'character.section.poise': string
    'character.section.stamina': string
    'character.section.lock_points': string
    'character.section.player': string
    'character.section.ai': string
    'character.section.build': string
    'character.facing': string
    'character.base_move_speed': string
    'character.base_jump_height': string
    'character.base_scale': string
    'character.handedness': string
    'character.body_form': string
    'character.faction': string
    'character.ai_tendency': string
    'character.target_factions': string
    'character.exclude_factions': string
    'character.weapon': string
    'character.offhand': string
    'character.hold': string
    'character.attack_module': string
    'character.attack_module_tip': string
    'character.attack_module_hint': string
    'character.attack_primary': string
    'character.attack_offhand': string
    'character.attack_offhand_hint': string
    'character.range': string
    'character.damage': string
    'character.cooldown': string
    'character.charge_power': string
    'character.charge_time': string
    'character.bullet_speed': string
    'character.bullet_knockback': string
    'character.bullet_life': string
    'character.base_hp': string
    'character.cur_hp': string
    'character.base_poise': string
    'character.cur_poise': string
    'character.poise_regen_delay': string
    'character.poise_regen_rate': string
    'character.flight_enabled': string
    'character.stamina_max': string
    'character.cur_stamina': string
    'character.stamina_regen_delay': string
    'character.stamina_regen_rate': string
    'character.stamina_drain_sprinting': string
    'character.stamina_drain_flying': string
    'character.stamina_drain_blocking': string
    'character.stamina_entry_attack': string
    'character.stamina_entry_roll': string
    'character.stamina_entry_jump': string
    'character.knockdown_duration': string
    'character.get_up_duration': string
    'character.base_atk_phys': string
    'character.base_atk_magic': string
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
    'character.disable_ai': string
    'character.hold_mode_hint': string
    'character.offhand_tip': string
    'character.hold_tip': string
    'character.limb_tip': string
    'character.weapon_group_melee': string
    'character.weapon_group_shield': string
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
    'character.idle': string
    'character.tendency.hostile_all': string
    'character.tendency.hostile_except_self': string
    'character.tendency.hostile_to': string
    'character.tendency.hostile_except': string
    'character.tendency.pacifist': string
    'character.peace.patrol': string
    'character.peace.build': string
    'character.preset.common': string
    'character.preset.destructible': string
    'character.preset.burning': string
    'character.preset.magnet': string
    'character.preset.elastic': string
    'character.peace_label': string
    'character.combat_label': string
    'character.combat.tactical': string
    'character.combat.aggressive': string
    'character.combat.cowardly': string
    'character.origin_label': string
    'character.origin.resident': string
    'character.origin.fighter': string
    'character.origin.hunter': string
    'character.origin.roamer': string
    'character.origin.interval': string
    'character.origin.current': string
    'character.chase_radius_label': string
    'character.ai_block_duration_label': string
    'character.ai_block_cooldown_label': string
    'character.field.preset': string
    'character.field.probability': string
    'character.field.min_w': string
    'character.field.max_w': string
    'character.field.min_h': string
    'character.field.max_h': string
    'character.field.min_d': string
    'character.field.max_d': string
    'character.field.mass': string
    'character.field.friction': string
}

export const characterZh: CharacterLocale = {
    /* ── 领域标签 ── */
    'hold_mode.one_handed': '单持',
    'hold_mode.two_handed': '双手共持',
    'hold_mode.dual_wield': '双持',
    'handedness.right': '右撇子',
    'handedness.left': '左撇子',
    'damage.physical': '物理',
    'damage.magic': '魔法',
    'impact.light': '轻',
    'impact.medium': '中',
    'impact.heavy': '重',
    'impact.knockdown': '倒地',
    'attack_key.light': '轻击',
    'attack_key.heavy': '重击',
    'attack_key.air': '空中攻击',
    'attack_module.breath': '吐息',
    'body_form.humanoid': '人形',
    'body_form.wolf': '狼',
    'body_form.horse': '马',
    'body_form.wyvern': '双足飞龙',
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
    'weapon.unarmed': '空手',
    'weapon.bite': '撕咬',
    'weapon.claw': '爪击',
    'weapon.kick': '踢击',
    'weapon.breath': '吐息',
    'weapon.wolf_bite': '撕咬',
    'weapon.wolf_short_sword': '口含短剑',
    'weapon.wolf_long_sword': '口含长剑',
    'weapon.wolf_claw': '狼爪',
    'weapon.wolf_claw_blade': '爪刃',
    'weapon.horse_iron_hoof': '铁蹄',
    'weapon.wyvern_claw': '龙爪',
    'weapon.wyvern_wing_blade': '翼刃',
    'breath.natural': '天然吐息',
    'breath.fireball': '火球吐息',
    'breath.lightning': '雷电吐息',
    'breath.laser': '激光吐息',
    'weapon.shield_small': '小盾',
    'weapon.shield_medium': '中盾',
    'weapon.shield_large': '大盾',
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
    'armor.leather_cap': '皮帽',
    'armor.leather_bracers': '皮护腕',
    'armor.leather_legs': '皮护腿',
    'armor.scale_helm': '鳞盔',
    'armor.scale_bracers': '鳞护腕',
    'armor.scale_legs': '鳞护腿',
    'armor.stone_helm': '石盔',
    'armor.stone_plate': '石胸甲',
    'armor.stone_bracers': '石护腕',
    'armor.stone_legs': '石护腿',
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
    'armor.wolf_head_guard': '皮革护首',
    'armor.wolf_hide': '皮革胸甲',
    'armor.wolf_leg_wraps': '皮革护腿',
    'armor.wolf_claw_guard': '皮革护爪',
    'limb.wolf_claw_wrap': '狼爪束甲',
    'limb.wolf_tail_guard': '狼尾护甲',
    'limb.wolf_torso_harness': '狼躯束具',
    'limb.wolf_head_guard': '狼首护具',
    'limb.wolf_leg_guards': '狼腿护具',
    'armor.horse_head_armor': '马首面甲',
    'armor.horse_barding': '马身具装',
    'armor.horse_hoof_shoes': '马蹄铁',
    'armor.horse_leg_guards': '马腿铁甲',
    'limb.horse_iron_legs': '马铁腿甲',
    'limb.horse_tail_banner': '马尾长缨',
    'limb.horse_head_plume': '马首翎羽',
    'limb.horse_torso_barding': '马躯革甲',
    'armor.wyvern_head_crest': '龙首甲冠',
    'armor.wyvern_scale_plate': '龙鳞胸甲',
    'armor.wyvern_wing_guards': '龙翼护甲',
    'armor.wyvern_tail_spikes': '龙尾棘甲',
    'armor.wyvern_leg_guards': '龙腿鳞甲',
    'limb.wyvern_wing_claw_blade': '龙翼爪刃',
    'limb.wyvern_head_horns': '龙首角饰',
    'limb.wyvern_tail_blade': '龙尾刃甲',
    'limb.wyvern_wing_guard': '龙翼肢甲',
    'limb.wyvern_torso_plates': '龙躯腹甲',
    'limb.wyvern_leg_guards': '龙腿肢甲',
    /* 非人形护甲套装 / 逐槽位肢体 */
    'armor_set.wolf_leather': '皮革具装',
    'armor_set.wolf_bone': '狼骨具装',
    'armor_set.horse_iron': '马铁具装',
    'armor_set.horse_leather': '马革具装',
    'armor_set.wyvern_scale': '龙鳞具装',
    'armor_set.wyvern_bone': '龙骸具装',
    'armor.wolf_bone_head': '狼骨护首',
    'armor.wolf_bone_torso': '狼骨护胸',
    'armor.wolf_bone_legs': '狼骨护腿',
    'armor.wolf_bone_claw': '狼骨护爪',
    'armor.wolf_bone_tail': '狼骨护尾',
    'armor.horse_leather_head': '马革护首',
    'armor.horse_leather_torso': '马革护胸',
    'armor.horse_leather_legs': '马革护腿',
    'armor.horse_leather_tail': '马革护尾',
    'armor.wyvern_bone_wing_claw': '龙骸护爪',
    'armor.wyvern_bone_head': '龙骸护首',
    'armor.wyvern_bone_tail': '龙骸护尾',
    'armor.wyvern_bone_wing': '龙骸护翼',
    'armor.wyvern_bone_torso': '龙骸护胸',
    'armor.wyvern_bone_legs': '龙骸护腿',
    'limb.wolf_limb_blue': '蓝毛狼肢',
    'limb.wolf_limb_red': '赤毛狼肢',
    'limb.wolf_limb_white': '白毛狼肢',
    'limb.horse_limb_white': '白马皮',
    'limb.horse_limb_black': '黑马皮',
    'limb.horse_limb_yellow': '黄马皮',
    'limb.wyvern_limb_white': '白龙鳞',
    'limb.wyvern_limb_black': '黑龙鳞',
    'limb.wyvern_limb_red': '赤龙鳞',
    'limb.wyvern_limb_yellow': '黄龙鳞',
    'limb.wyvern_limb_purple': '紫龙鳞',
    'limb.wyvern_limb_blue': '蓝龙鳞',
    'limb.wolf_blue': '蓝毛狼肢',
    'limb.wolf_red': '赤毛狼肢',
    'limb.wolf_white': '白毛狼肢',
    'limb.horse_white': '白马皮',
    'limb.horse_black': '黑马皮',
    'limb.horse_yellow': '黄马皮',
    'limb.wyvern_white': '白龙鳞',
    'limb.wyvern_black': '黑龙鳞',
    'limb.wyvern_red': '赤龙鳞',
    'limb.wyvern_yellow': '黄龙鳞',
    'limb.wyvern_purple': '紫龙鳞',
    'limb.wyvern_blue': '蓝龙鳞',

    /* ── 角色面板 ── */
    'character.title': '角色控制',
    'character.section.equip': '装备',
    'character.section.attributes': '属性',
    'character.section.poise': '韧性',
    'character.section.stamina': '体力',
    'character.section.lock_points': '锁定点',
    'character.section.player': '玩家',
    'character.section.ai': 'AI 策略',
    'character.section.build': '建造配置',
    'character.facing': '朝向°',
    'character.base_move_speed': '基础移速',
    'character.base_jump_height': '基础跳跃高',
    'character.base_scale': '基础体型',
    'character.handedness': '惯用手',
    'character.body_form': '基础模组',
    'character.faction': '阵营',
    'character.ai_tendency': 'AI倾向',
    'character.target_factions': '目标阵营',
    'character.exclude_factions': '排除阵营',
    'character.weapon': '武器',
    'character.offhand': '副手',
    'character.hold': '持握',
    'character.attack_module': '攻击模组',
    'character.attack_module_tip': '攻击模组：由角色全部武器槽的装备情况决定可用列表',
    'character.attack_module_hint': '当前可用模组由武器槽装备提供；Ctrl 可环切',
    'character.attack_primary': '主手攻击',
    'character.attack_offhand': '副手攻击',
    'character.attack_offhand_hint': '副手武器属性独立配置；角色战斗中的冷却、蓄力与远程弹道仍参照主手武器',
    'character.range': '射程',
    'character.damage': '伤害',
    'character.cooldown': '冷却',
    'character.charge_power': '蓄力%',
    'character.charge_time': '蓄力时',
    'character.bullet_speed': '弹速',
    'character.bullet_knockback': '击退',
    'character.bullet_life': '存活',
    'character.base_hp': '基础生命',
    'character.cur_hp': '当前生命',
    'character.base_poise': '基础韧性',
    'character.cur_poise': '当前韧性',
    'character.poise_regen_delay': '韧性延迟',
    'character.poise_regen_rate': '韧性回复',
    'character.flight_enabled': '允许飞行',
    'character.stamina_max': '基础体力上限',
    'character.cur_stamina': '当前体力',
    'character.stamina_regen_delay': '体力恢复延迟',
    'character.stamina_regen_rate': '体力恢复速度',
    'character.stamina_drain_sprinting': '跑步消耗',
    'character.stamina_drain_flying': '飞行消耗',
    'character.stamina_drain_blocking': '格挡消耗',
    'character.stamina_entry_attack': '攻击消耗',
    'character.stamina_entry_roll': '翻滚消耗',
    'character.stamina_entry_jump': '跳跃消耗',
    'character.knockdown_duration': '倒地时长',
    'character.get_up_duration': '起身时长',
    'character.base_atk_phys': '基础物攻',
    'character.base_atk_magic': '基础魔攻',
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
    'character.disable_ai': '关闭 AI',
    'character.hold_mode_hint': '双持需副手装备同类近战武器',
    'character.offhand_tip': '副手武器：单持时副手持握、双手共持时挂背；与主手同类近战可双持',
    'character.hold_tip': '持握模式：单持 / 双手共持 / 双持（双持需副手装备同类近战武器）',
    'character.limb_tip': '肢体组件（骷髅 / 兽人 / 精灵）：装备后默认顶替该部位的人类肢体，颜色随阵营变化；空 = 默认人类肢体',
    'character.weapon_group_melee': '近战武器',
    'character.weapon_group_shield': '盾牌',
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
    'character.idle': '待机',
    'character.tendency.hostile_all': '敌对全部阵营（含本阵营）',
    'character.tendency.hostile_except_self': '敌对非本阵营',
    'character.tendency.hostile_to': '仅敌对指定阵营',
    'character.tendency.hostile_except': '敌对指定阵营以外的所有阵营',
    'character.tendency.pacifist': '不攻击任何阵营',
    'character.peace.patrol': '巡逻',
    'character.peace.build': '建造',
    'character.preset.common': '普通',
    'character.preset.destructible': '可破坏',
    'character.preset.burning': '燃烧',
    'character.preset.magnet': '磁力',
    'character.preset.elastic': '弹性',
    'character.peace_label': '和平',
    'character.combat_label': '战斗',
    'character.combat.tactical': '战术',
    'character.combat.aggressive': '激进',
    'character.combat.cowardly': '怯懦',
    'character.origin_label': '原点策略',
    'character.origin.resident': '居民',
    'character.origin.fighter': '战斗者',
    'character.origin.hunter': '狩猎者',
    'character.origin.roamer': '漫游者',
    'character.origin.interval': '更新间隔(秒)',
    'character.origin.current': '当前原点',
    'character.chase_radius_label': '追击半径',
    'character.ai_block_duration_label': '举盾窗口(秒)',
    'character.ai_block_cooldown_label': '举盾冷却(秒)',
    'character.field.preset': '特性预设',
    'character.field.probability': '概率',
    'character.field.min_w': '最小宽',
    'character.field.max_w': '最大宽',
    'character.field.min_h': '最小高',
    'character.field.max_h': '最大高',
    'character.field.min_d': '最小深',
    'character.field.max_d': '最大深',
    'character.field.mass': '质量',
    'character.field.friction': '摩擦',
}

export const characterEn: CharacterLocale = {
    /* ── Domain labels ── */
    'hold_mode.one_handed': 'One-handed',
    'hold_mode.two_handed': 'Two-handed',
    'hold_mode.dual_wield': 'Dual wield',
    'handedness.right': 'Right-handed',
    'handedness.left': 'Left-handed',
    'damage.physical': 'Physical',
    'damage.magic': 'Magic',
    'impact.light': 'Light',
    'impact.medium': 'Medium',
    'impact.heavy': 'Heavy',
    'impact.knockdown': 'Knockdown',
    'attack_key.light': 'Light',
    'attack_key.heavy': 'Heavy',
    'attack_key.air': 'Air',
    'attack_module.breath': 'Breath',
    'body_form.humanoid': 'Humanoid',
    'body_form.wolf': 'Wolf',
    'body_form.horse': 'Horse',
    'body_form.wyvern': 'Wyvern',
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
    'weapon.unarmed': 'Unarmed',
    'weapon.bite': 'Bite',
    'weapon.claw': 'Claw',
    'weapon.kick': 'Kick',
    'weapon.breath': 'Breath',
    'weapon.wolf_bite': 'Bite',
    'weapon.wolf_short_sword': 'Mouthed Short Sword',
    'weapon.wolf_long_sword': 'Mouthed Long Sword',
    'weapon.wolf_claw': 'Wolf Claw',
    'weapon.wolf_claw_blade': 'Claw Blade',
    'weapon.horse_iron_hoof': 'Iron Hoof',
    'weapon.wyvern_claw': 'Dragon Claw',
    'weapon.wyvern_wing_blade': 'Wing Blade',
    'breath.natural': 'Natural Breath',
    'breath.fireball': 'Fireball Breath',
    'breath.lightning': 'Lightning Breath',
    'breath.laser': 'Laser Breath',
    'weapon.shield_small': 'Small Shield',
    'weapon.shield_medium': 'Medium Shield',
    'weapon.shield_large': 'Large Shield',
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
    'armor.leather_cap': 'Leather Cap',
    'armor.leather_bracers': 'Leather Bracers',
    'armor.leather_legs': 'Leather Leggings',
    'armor.scale_helm': 'Scale Helm',
    'armor.scale_bracers': 'Scale Bracers',
    'armor.scale_legs': 'Scale Greaves',
    'armor.stone_helm': 'Stone Helm',
    'armor.stone_plate': 'Stone Plate',
    'armor.stone_bracers': 'Stone Bracers',
    'armor.stone_legs': 'Stone Greaves',
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
    'armor.wolf_head_guard': 'Leather Headguard',
    'armor.wolf_hide': 'Leather Chestguard',
    'armor.wolf_leg_wraps': 'Leather Legguards',
    'armor.wolf_claw_guard': 'Leather Clawguards',
    'limb.wolf_claw_wrap': 'Wolf Claw Wraps',
    'limb.wolf_tail_guard': 'Wolf Tail Guard',
    'limb.wolf_torso_harness': 'Wolf Torso Harness',
    'limb.wolf_head_guard': 'Wolf Head Guard',
    'limb.wolf_leg_guards': 'Wolf Leg Guards',
    'armor.horse_head_armor': 'Horse Faceplate',
    'armor.horse_barding': 'Horse Barding',
    'armor.horse_hoof_shoes': 'Horse Hoof Shoes',
    'armor.horse_leg_guards': 'Horse Leg Armor',
    'limb.horse_iron_legs': 'Horse Iron Legs',
    'limb.horse_tail_banner': 'Horse Tail Banner',
    'limb.horse_head_plume': 'Horse Head Plume',
    'limb.horse_torso_barding': 'Horse Torso Harness',
    'armor.wyvern_head_crest': 'Wyvern Head Crest',
    'armor.wyvern_scale_plate': 'Wyvern Scale Plate',
    'armor.wyvern_wing_guards': 'Wyvern Wing Guards',
    'armor.wyvern_tail_spikes': 'Wyvern Tail Spikes',
    'armor.wyvern_leg_guards': 'Wyvern Leg Guards',
    'limb.wyvern_wing_claw_blade': 'Wyvern Wing Claw Blades',
    'limb.wyvern_head_horns': 'Wyvern Head Horns',
    'limb.wyvern_tail_blade': 'Wyvern Tail Blade',
    'limb.wyvern_wing_guard': 'Wyvern Wing Guards',
    'limb.wyvern_torso_plates': 'Wyvern Torso Plates',
    'limb.wyvern_leg_guards': 'Wyvern Leg Guards',
    /* Non-humanoid armor sets / whole-body tint limbs */
    'armor_set.wolf_leather': 'Leather Set',
    'armor_set.wolf_bone': 'Wolf Bone Set',
    'armor_set.horse_iron': 'Horse Iron Set',
    'armor_set.horse_leather': 'Horse Leather Set',
    'armor_set.wyvern_scale': 'Wyvern Scale Set',
    'armor_set.wyvern_bone': 'Wyvern Bone Set',
    'armor.wolf_bone_head': 'Wolf Bone Headguard',
    'armor.wolf_bone_torso': 'Wolf Bone Chestguard',
    'armor.wolf_bone_legs': 'Wolf Bone Legguards',
    'armor.wolf_bone_claw': 'Wolf Bone Clawguards',
    'armor.wolf_bone_tail': 'Wolf Bone Tailguard',
    'armor.horse_leather_head': 'Horse Leather Headpiece',
    'armor.horse_leather_torso': 'Horse Leather Chestpiece',
    'armor.horse_leather_legs': 'Horse Leather Legguards',
    'armor.horse_leather_tail': 'Horse Leather Tailguard',
    'armor.wyvern_bone_wing_claw': 'Wyvern Bone Clawguards',
    'armor.wyvern_bone_head': 'Wyvern Bone Headguard',
    'armor.wyvern_bone_tail': 'Wyvern Bone Tailguard',
    'armor.wyvern_bone_wing': 'Wyvern Bone Wingguards',
    'armor.wyvern_bone_torso': 'Wyvern Bone Chestguard',
    'armor.wyvern_bone_legs': 'Wyvern Bone Legguards',
    'limb.wolf_limb_blue': 'Blue Wolf Fur',
    'limb.wolf_limb_red': 'Red Wolf Fur',
    'limb.wolf_limb_white': 'White Wolf Fur',
    'limb.horse_limb_white': 'White Horse Hide',
    'limb.horse_limb_black': 'Black Horse Hide',
    'limb.horse_limb_yellow': 'Yellow Horse Hide',
    'limb.wyvern_limb_white': 'White Wyvern Scales',
    'limb.wyvern_limb_black': 'Black Wyvern Scales',
    'limb.wyvern_limb_red': 'Red Wyvern Scales',
    'limb.wyvern_limb_yellow': 'Yellow Wyvern Scales',
    'limb.wyvern_limb_purple': 'Purple Wyvern Scales',
    'limb.wyvern_limb_blue': 'Blue Wyvern Scales',
    'limb.wolf_blue': 'Blue Wolf Fur',
    'limb.wolf_red': 'Red Wolf Fur',
    'limb.wolf_white': 'White Wolf Fur',
    'limb.horse_white': 'White Horse Hide',
    'limb.horse_black': 'Black Horse Hide',
    'limb.horse_yellow': 'Yellow Horse Hide',
    'limb.wyvern_white': 'White Wyvern Scales',
    'limb.wyvern_black': 'Black Wyvern Scales',
    'limb.wyvern_red': 'Red Wyvern Scales',
    'limb.wyvern_yellow': 'Yellow Wyvern Scales',
    'limb.wyvern_purple': 'Purple Wyvern Scales',
    'limb.wyvern_blue': 'Blue Wyvern Scales',

    /* ── Character panel ── */
    'character.title': 'Character Control',
    'character.section.equip': 'Equipment',
    'character.section.attributes': 'Attributes',
    'character.section.poise': 'Poise',
    'character.section.stamina': 'Stamina',
    'character.section.lock_points': 'Lock Points',
    'character.section.player': 'Player',
    'character.section.ai': 'AI Strategy',
    'character.section.build': 'Build Config',
    'character.facing': 'Facing°',
    'character.base_move_speed': 'Base Spd',
    'character.base_jump_height': 'Base JumpH',
    'character.base_scale': 'Base Scale',
    'character.handedness': 'Handed',
    'character.body_form': 'Body plan',
    'character.faction': 'Faction',
    'character.ai_tendency': 'AI Tendency',
    'character.target_factions': 'TargetFactions',
    'character.exclude_factions': 'ExcludedFactions',
    'character.weapon': 'Wpn',
    'character.offhand': 'Off',
    'character.hold': 'Hold',
    'character.attack_module': 'Attack Module',
    'character.attack_module_tip': 'Attack modules are determined by all equipped weapon slots',
    'character.attack_module_hint': 'Available modules come from equipped weapon slots; Ctrl cycles them',
    'character.attack_primary': 'Main-hand Attack',
    'character.attack_offhand': 'Off-hand Attack',
    'character.attack_offhand_hint': 'Off-hand weapon stats are configured independently; combat cooldown, charge and ballistics still follow the main-hand weapon',
    'character.range': 'Range',
    'character.damage': 'Damage',
    'character.cooldown': 'Cooldown',
    'character.charge_power': 'ChgPwr%',
    'character.charge_time': 'ChgTime',
    'character.bullet_speed': 'BulSpd',
    'character.bullet_knockback': 'BulKnock',
    'character.bullet_life': 'BulLife',
    'character.base_hp': 'BaseHP',
    'character.cur_hp': 'CurHP',
    'character.base_poise': 'BasePoise',
    'character.cur_poise': 'CurPoise',
    'character.poise_regen_delay': 'PoiseDelay',
    'character.poise_regen_rate': 'PoiseRegen',
    'character.flight_enabled': 'Flight',
    'character.stamina_max': 'Base Stamina',
    'character.cur_stamina': 'Cur Stamina',
    'character.stamina_regen_delay': 'Stam Delay',
    'character.stamina_regen_rate': 'Stam Regen',
    'character.stamina_drain_sprinting': 'Sprint Cost',
    'character.stamina_drain_flying': 'Fly Cost',
    'character.stamina_drain_blocking': 'Block Cost',
    'character.stamina_entry_attack': 'Atk Cost',
    'character.stamina_entry_roll': 'Roll Cost',
    'character.stamina_entry_jump': 'Jump Cost',
    'character.knockdown_duration': 'Knockdown(s)',
    'character.get_up_duration': 'GetUp(s)',
    'character.base_atk_phys': 'Base Phys Atk',
    'character.base_atk_magic': 'Base Magic Atk',
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
    'character.disable_ai': 'Disable AI',
    'character.hold_mode_hint': 'Dual wield needs an offhand melee weapon of the same class',
    'character.offhand_tip': 'Offhand weapon: held in the off hand when one-handed, stowed on back when two-handed; dual wield needs the same melee class as the main hand',
    'character.hold_tip': 'Hold mode: one-handed / two-handed / dual wield (dual wield needs an offhand melee weapon of the same class)',
    'character.limb_tip': 'Limb parts (skeleton / orc / elf): equipping replaces the human limb of that part, color follows faction; empty = default human limb',
    'character.weapon_group_melee': 'Melee Weapons',
    'character.weapon_group_shield': 'Shields',
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
    'character.idle': 'Idle',
    'character.tendency.hostile_all': 'Hostile to all factions (incl. own)',
    'character.tendency.hostile_except_self': 'Hostile to non-own factions',
    'character.tendency.hostile_to': 'Hostile only to specified factions',
    'character.tendency.hostile_except': 'Hostile to all except specified factions',
    'character.tendency.pacifist': 'Attacks no factions',
    'character.peace.patrol': 'Patrol',
    'character.peace.build': 'Build',
    'character.preset.common': 'Common',
    'character.preset.destructible': 'Breakable',
    'character.preset.burning': 'Burning',
    'character.preset.magnet': 'Magnet',
    'character.preset.elastic': 'Elastic',
    'character.peace_label': 'Peace',
    'character.combat_label': 'Combat',
    'character.combat.tactical': 'Tactical',
    'character.combat.aggressive': 'Aggressive',
    'character.combat.cowardly': 'Cowardly',
    'character.origin_label': 'Origin',
    'character.origin.resident': 'Resident',
    'character.origin.fighter': 'Fighter',
    'character.origin.hunter': 'Hunter',
    'character.origin.roamer': 'Roamer',
    'character.origin.interval': 'Interval (s)',
    'character.origin.current': 'Current origin',
    'character.chase_radius_label': 'Chase radius',
    'character.ai_block_duration_label': 'Block window (s)',
    'character.ai_block_cooldown_label': 'Block cooldown (s)',
    'character.field.preset': 'Preset',
    'character.field.probability': 'Probability',
    'character.field.min_w': 'Min W',
    'character.field.max_w': 'Max W',
    'character.field.min_h': 'Min H',
    'character.field.max_h': 'Max H',
    'character.field.min_d': 'Min D',
    'character.field.max_d': 'Max D',
    'character.field.mass': 'Mass',
    'character.field.friction': 'Friction',
}
