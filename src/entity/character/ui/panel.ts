import type {PanelContext} from '../../box/base/ui'
import type {CharacterEntitySystem} from '../physics/world.ts'
import type {CharacterConfig, CharacterEntity} from '../../../character/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {TendencyConfig, TendencyId} from '../../../character/faction.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {createEntityPanel} from '../../../ui/components/entity_panel.ts'
import {createIcon} from '../../../ui/icons/icon.ts'
import type {WeaponConfig, WeaponType} from '../../../character/weapon/catalog.ts'
import {ALL_WEAPON_PRESETS, availableHoldModes, findWeaponPreset, isDualWieldPair, weaponAttacksOf, weaponDisplayName} from '../../../character/weapon/catalog.ts'
import {HOLD_MODE_LABELS, isHoldMode} from '../../../character/weapon/hold_mode.ts'
import type {RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
import type {ChargeTuning} from '../../../character/weapon/charge_tuning.ts'
import {chainOf, segmentDisplayName, type WeaponAttacks} from '../../../character/weapon/attack_chain.ts'
import {ARMOR_SLOTS, ARMOR_SLOT_LABELS, LIMB_SLOTS, LIMB_SLOT_LABELS, type ArmorSlot, type LimbSlot} from '../../../character/armor/slots.ts'
import {armorPiecesOfSlot, armorPieceDisplayName, findArmorPreset, findLimbPreset, limbPiecesOfSlot, resolveArmorLoadout, resolveLimbLoadout, totalAttackOf, totalDefenseOf, totalMoveSpeedOf} from '../../../character/armor/catalog.ts'
import type {ArmorLoadout, ArmorPieceConfig, LimbLoadout, LimbPieceConfig} from '../../../character/armor/types.ts'
import type {DefenseProfile} from '../../../character/combat/defense.ts'
import {DAMAGE_TYPE_LABELS} from '../../../character/combat/damage_type.ts'
import {isPeaceSubStrategy, isCombatSubStrategy, PEACE_SUB_STRATEGIES, BUILDABLE_BOX_TYPES, type BuildableBoxType} from '../../../character/ai_strategy/types.ts'
import type {LockPointConfig} from '../../../character/lock_point.ts'
import {CHARACTER_JOINT_IDS} from '../appearance/clips/base_clips.ts'
import {buildCharacterSkeletonDefinition, humanoidJointDisplayName} from '../skeleton/preset.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import {localizeText, localizeTitle, appendLocalizedText, localizeApply} from '../../../i18n/dom.ts'

/** 锁定点下拉关节选项：骨架定义关节名 + 关节 id（名称随语言切换重译） */
const JOINT_LOCK_POINT_OPTIONS: ReadonlyArray<{readonly id: string; readonly name: string}> = (() => {
    const names = new Map(buildCharacterSkeletonDefinition().joints.map(joint => [joint.id, joint.name]))
    return CHARACTER_JOINT_IDS.map(id => ({id, name: names.get(id) ?? id}))
})()

/** 锁定点偏移输入标签（X / Y / Z） */
const OFFSET_AXIS_LABELS: readonly StringLocaleKey[] = ['panel.x', 'panel.y', 'panel.z']
/** 新增锁定点的默认关节（髋部：接近身体中心，便于调整） */
const LOCK_POINT_DEFAULT_JOINT = 'spine'

/** 锁定点编辑缓存行（偏移为输入框原值字符串，Apply 时解析） */
interface LockPointEditRow {
    jointId: string
    offset: [string, string, string]
}

/** 下拉项：武器 id（option.value）+ 所属类型（option.dataset.weaponType，用于收窄类型） */
interface WeaponOption {
    readonly id: string
    readonly type: WeaponType
    readonly preset: WeaponConfig
}

/** 近战武器名（optgroup 标签） */
const WEAPON_GROUP_LABEL_MELEE: StringLocaleKey = 'character.weapon_group_melee'
/** 盾牌名（optgroup 标签；盾为近战类，单独成组） */
const WEAPON_GROUP_LABEL_SHIELD: StringLocaleKey = 'character.weapon_group_shield'
/** 远程武器名（optgroup 标签） */
const WEAPON_GROUP_LABEL_RANGED: StringLocaleKey = 'character.weapon_group_ranged'

/** 武器预设 → 下拉项文案（远程附带模式标记，便于区分特殊弹道） */
const describeWeapon = (w: WeaponConfig): string => {
    const name = weaponDisplayName(w.id, w.name)
    if (w.type === 'melee') return `${name} (dmg:${w.damage})`
    const tags: string[] = []
    if (w.spreadCount !== undefined) tags.push(translate({key: 'character.tag.spread', args: [String(w.spreadCount)]}))
    if (w.explosionRadius !== undefined) tags.push(translate({key: 'character.tag.explosion', args: [String(w.explosionRadius)]}))
    if (w.homingStrength !== undefined) tags.push(translate({key: 'character.tag.homing', args: [String(w.homingStrength)]}))
    if (w.throwAngle !== undefined) tags.push(translate({key: 'character.tag.throw_arc', args: [(w.throwAngle * 180 / Math.PI).toFixed(0)]}))
    return `${name} (dmg:${w.damage} rng:${w.range})${tags.length > 0 ? ` [${tags.join(' ')}]` : ''}`
}

/** 武器下拉按近战 / 盾牌 / 远程分组（类型由所选武器决定，因此不再有独立「攻击类型」选择器） */
const buildWeaponOptions = (): {melee: readonly WeaponOption[]; shield: readonly WeaponOption[]; ranged: readonly WeaponOption[]} => {
    const melee: WeaponOption[] = []
    const shield: WeaponOption[] = []
    const ranged: WeaponOption[] = []
    for (const preset of ALL_WEAPON_PRESETS) {
        const option: WeaponOption = {id: preset.id, type: preset.type, preset}
        if (preset.type === 'melee') {
            if (preset.block !== undefined) shield.push(option)
            else melee.push(option)
        } else {
            ranged.push(option)
        }
    }
    return {melee, shield, ranged}
}

/** 武器下拉数据（模块级构建一次：预设为静态数据） */
const WEAPON_OPTIONS = buildWeaponOptions()

/** 填充武器下拉：近战 / 盾牌 / 远程分组（withNone = 追加「无」空项，供副手选择）；选项文案随语言切换重译 */
const fillWeaponSelect = (select: HTMLSelectElement, withNone: boolean): void => {
    if (withNone) {
        const none = document.createElement('option')
        none.value = ''
        localizeText(none, 'common.none')
        select.appendChild(none)
    }
    for (const group of [
        {labelKey: WEAPON_GROUP_LABEL_MELEE, options: WEAPON_OPTIONS.melee},
        {labelKey: WEAPON_GROUP_LABEL_SHIELD, options: WEAPON_OPTIONS.shield},
        {labelKey: WEAPON_GROUP_LABEL_RANGED, options: WEAPON_OPTIONS.ranged},
    ]) {
        const optGroup = document.createElement('optgroup')
        localizeApply(optGroup, el => {
            if (el instanceof HTMLOptGroupElement) el.label = translate(group.labelKey)
        })
        for (const opt of group.options) {
            const o = document.createElement('option')
            o.value = opt.id
            o.dataset.weaponType = opt.type
            localizeApply(o, el => { el.textContent = describeWeapon(opt.preset) })
            optGroup.appendChild(o)
        }
        select.appendChild(optGroup)
    }
}

/** 面板攻击区可见字段 */
interface AttackFields {
    readonly atkRange: HTMLInputElement
    readonly atkDmg: HTMLInputElement
    readonly atkCD: HTMLInputElement
    readonly atkChargeMult: HTMLInputElement
    readonly atkChargeTime: HTMLInputElement
    readonly bulletSpeed: HTMLInputElement
    readonly bulletKB: HTMLInputElement
    readonly bulletLife: HTMLInputElement
    readonly weaponTag: HTMLElement
}

/** 数字转输入框文本（避免 3.0000000000000004 之类的浮点尾巴） */
const formatNumber = (value: number): string => String(Number(value.toFixed(4)))

/** 装备（护甲 / 肢体）预设 → 下拉项文案：列出非零的防御 / 攻击加成与移速修正（无修正时只显示名称） */
const describeArmorPiece = (piece: ArmorPieceConfig | LimbPieceConfig): string => {
    const tags: string[] = []
    if (piece.defense.physical > 0) tags.push(translate({key: 'character.tag.def_phys', args: [String(piece.defense.physical)]}))
    if (piece.defense.magic > 0) tags.push(translate({key: 'character.tag.def_magic', args: [String(piece.defense.magic)]}))
    if (piece.attack.physical > 0) tags.push(translate({key: 'character.tag.atk_phys', args: [String(piece.attack.physical)]}))
    if (piece.attack.magic > 0) tags.push(translate({key: 'character.tag.atk_magic', args: [String(piece.attack.magic)]}))
    if (piece.moveSpeedMultiplier !== 1) tags.push(translate({key: 'character.tag.move_speed', args: [formatNumber(piece.moveSpeedMultiplier)]}))
    const name = armorPieceDisplayName(piece)
    return tags.length > 0 ? translate({key: 'character.armor_desc', args: [name, tags.join(' ')]}) : name
}

/**
 * 面板装备区行映射：一行两列（左护甲 / 右肢体），按用户语义顺序 头部 → 手臂 → 身体 → 腿部。
 * 「身体」肢体对应胸甲槽位（同一身体区域）。两套槽位独立，缺省均为空。
 */
const EQUIP_ROWS: ReadonlyArray<{readonly armor: ArmorSlot; readonly limb: LimbSlot}> = [
    {armor: 'head', limb: 'head'},
    {armor: 'arms', limb: 'arms'},
    {armor: 'chest', limb: 'body'},
    {armor: 'legs', limb: 'legs'},
]

/** 起手段冷却：取轻击链首段（角色的冷却覆写落在段定义上） */
const entryCooldownOfAttacks = (attacks: WeaponAttacks): number => {
    const entryId = chainOf(attacks, 'light').entries[0]?.segmentId
    return entryId === undefined ? 0 : (attacks.segments[entryId]?.cooldown ?? 0)
}

/** 武器预设的起手段冷却（换武器预填用；取默认持握模式的攻击链） */
const entryCooldownOf = (weapon: WeaponConfig): number => entryCooldownOfAttacks(weaponAttacksOf(weapon))

/** 远程武器特殊模式文案（散射 / 爆炸 / 追踪 / 抛物线） */
const rangedModeTags = (weapon: RangedWeaponConfig): readonly string[] => {
    const tags: string[] = []
    if (weapon.spreadCount !== undefined) tags.push(translate({key: 'character.tag.spread', args: [String(weapon.spreadCount)]}))
    if (weapon.explosionRadius !== undefined) tags.push(translate({key: 'character.tag.explosion', args: [String(weapon.explosionRadius)]}))
    if (weapon.homingStrength !== undefined) tags.push(translate({key: 'character.tag.homing', args: [String(weapon.homingStrength)]}))
    if (weapon.throwAngle !== undefined) tags.push(translate({key: 'character.tag.throw_arc', args: [(weapon.throwAngle * 180 / Math.PI).toFixed(0)]}))
    return tags
}

/** 武器有效蓄力调参（近战 heavyCharge / 远程 charge；无 = 不可蓄力） */
const chargeTuningOfWeapon = (weapon: WeaponConfig): ChargeTuning | undefined =>
    weapon.type === 'melee' ? weapon.heavyCharge : weapon.charge

/** 换武器时按武器预设预填数值覆写字段（冷却取起手段预设冷却；远程弹道仅在远程武器时展示） */
const autoFillFromWeapon = (weaponId: string, fields: AttackFields): void => {
    const weapon = findWeaponPreset(weaponId)
    if (weapon === undefined) return
    fields.atkDmg.value = formatNumber(weapon.damage)
    fields.atkCD.value = formatNumber(entryCooldownOf(weapon))
    const charge = chargeTuningOfWeapon(weapon)
    fields.atkChargeMult.value = formatNumber(charge?.maxChargeMultiplier ?? 100)
    fields.atkChargeTime.value = formatNumber(charge?.maxChargeTime ?? 1)
    const damageTypeLabel = `  ·  ${translate(DAMAGE_TYPE_LABELS[weapon.damageType])}`
    const weaponName = weaponDisplayName(weapon.id, weapon.name)
    if (weapon.type === 'ranged') {
        fields.weaponTag.textContent = [weaponName, ...rangedModeTags(weapon)].join('  ') + damageTypeLabel
        fields.atkRange.value = formatNumber(weapon.range)
        fields.bulletSpeed.value = formatNumber(weapon.projectileSpeed)
        fields.bulletKB.value = formatNumber(weapon.knockbackForce)
        fields.bulletLife.value = formatNumber(weapon.projectileLifetime)
    } else {
        fields.weaponTag.textContent = weaponName + damageTypeLabel
    }
}

/** 当前选中武器（未选中返回 undefined）；类型由所选武器本身决定 */
const selectedWeaponOf = (select: HTMLSelectElement): WeaponConfig | undefined => {
    const weaponId = select.value
    return weaponId.length > 0 ? findWeaponPreset(weaponId) : undefined
}

/** 读取角色当前攻击配置：武器 + 数值覆写 + 起手段当前冷却（用于面板回显） */
const readSelectedAttack = (sel: CharacterEntity): {
    readonly weaponId: string
    readonly damage: number
    readonly cooldown: number
    readonly charge?: ChargeTuning
    readonly ranged?: {readonly range: number; readonly bulletSpeed: number; readonly bulletKnockback: number; readonly bulletLifetime: number}
} => {
    const weapon = sel.combat.weapon
    const cooldown = entryCooldownOfAttacks(sel.combat.attacks)
    const charge = chargeTuningOfWeapon(weapon)
    if (weapon.type === 'ranged') {
        return {
            weaponId: weapon.id,
            damage: weapon.damage,
            cooldown,
            ...(charge !== undefined ? {charge} : {}),
            ranged: {
                range: weapon.range,
                bulletSpeed: weapon.projectileSpeed,
                bulletKnockback: weapon.knockbackForce,
                bulletLifetime: weapon.projectileLifetime,
            },
        }
    }
    return {weaponId: weapon.id, damage: weapon.damage, cooldown, ...(charge !== undefined ? {charge} : {})}
}

export const createCharacterPanel = (ctx: Omit<CharacterEntitySystem, 'panel'>): PanelContext => {
    const el = createEntityPanel('character-panel', 'character.title')
    el.style.cssText += ';min-width:260px'

    el.appendChild(createSection('panel.position'))
    const posX = createLabeledNumberInput(el, 'panel.x', {step: '0.01'})
    const posY = createLabeledNumberInput(el, 'panel.y', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'panel.z', {step: '0.01'})
    const facingDeg = createLabeledNumberInput(el, 'character.facing', {min: '0', max: '360', step: '1', value: '0'})

    el.appendChild(createSection('panel.config'))
    const speed = createLabeledNumberInput(el, 'character.speed', {min: '0.1', step: '0.1', value: '6'})
    const jumpH = createLabeledNumberInput(el, 'character.jump_height', {min: '0.1', step: '0.1', value: '2'})
    const scale = createLabeledNumberInput(el, 'character.scale', {min: '0.1', step: '0.1', value: '1'})

    el.appendChild(createSection('panel.faction'))
    const faction = createLabeledNumberInput(el, 'character.faction', {min: '0', step: '1', value: '0'})
    const tendencyLabel = document.createElement('label')
    tendencyLabel.className = 'dc-label'
    appendLocalizedText(tendencyLabel, 'character.tendency')
    tendencyLabel.appendChild(document.createTextNode(' '))
    const tendSelect = document.createElement('select')
    tendSelect.className = 'dc-select'
    const TENDENCY_OPTIONS: ReadonlyArray<{value: TendencyId; labelKey: StringLocaleKey}> = [
        {value: 'hostileAll', labelKey: 'character.tendency.hostile_all'},
        {value: 'hostileExceptSelf', labelKey: 'character.tendency.hostile_except_self'},
        {value: 'hostileTo', labelKey: 'character.tendency.hostile_to'},
        {value: 'hostileExcept', labelKey: 'character.tendency.hostile_except'},
        {value: 'pacifist', labelKey: 'character.tendency.pacifist'},
    ]
    for (const opt of TENDENCY_OPTIONS) {
        const o = document.createElement('option')
        o.value = opt.value
        localizeText(o, opt.labelKey)
        tendSelect.appendChild(o)
    }
    tendencyLabel.appendChild(tendSelect)
    el.appendChild(tendencyLabel)

    const targetFactionsLabel = document.createElement('label')
    targetFactionsLabel.className = 'dc-label'
    appendLocalizedText(targetFactionsLabel, 'character.target_factions')
    targetFactionsLabel.appendChild(document.createTextNode(' '))
    targetFactionsLabel.style.cssText = 'display:none'
    const targetFactionsInput = document.createElement('input')
    targetFactionsInput.type = 'text'
    targetFactionsInput.className = 'dc-input'
    targetFactionsInput.placeholder = '1,2,3'
    targetFactionsInput.style.cssText = 'width:80px;margin-left:4px'
    targetFactionsLabel.appendChild(targetFactionsInput)
    el.appendChild(targetFactionsLabel)

    const showTargetFactions = (): void => {
        const needs = tendSelect.value === 'hostileTo' || tendSelect.value === 'hostileExcept'
        targetFactionsLabel.style.display = needs ? '' : 'none'
        if (!needs) targetFactionsInput.value = ''
    }
    tendSelect.onchange = showTargetFactions

    const buildTendencyConfig = (): TendencyConfig => {
        const tendencyId = tendSelect.value as TendencyId
        if (tendencyId === 'hostileTo' || tendencyId === 'hostileExcept') {
            const raw = targetFactionsInput.value.trim()
            const factions = raw.length > 0
                ? raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
                : []
            return {tendencyId, targetFactions: factions}
        }
        return {tendencyId}
    }

    /* 装备模块：武器（下拉 + 数值覆写）与护甲（四槽下拉）统一放置 */
    el.appendChild(createSection('character.section.equip'))
    const atkRow = document.createElement('div')
    atkRow.className = 'dc-row'
    const weaponSelectLabel = document.createElement('label')
    weaponSelectLabel.className = 'dc-label'
    appendLocalizedText(weaponSelectLabel, 'character.weapon')
    weaponSelectLabel.appendChild(document.createTextNode(' '))
    const weaponSelect = document.createElement('select')
    weaponSelect.className = 'dc-select'
    weaponSelect.style.cssText = 'max-width:180px'
    weaponSelectLabel.appendChild(weaponSelect)
    atkRow.appendChild(weaponSelectLabel)
    el.appendChild(atkRow)
    const attackSegmentTag = document.createElement('div')
    attackSegmentTag.className = 'dc-hint'
    attackSegmentTag.style.cssText = 'margin-top:2px'
    el.appendChild(attackSegmentTag)
    fillWeaponSelect(weaponSelect, false)

    const weaponTag = document.createElement('div')
    weaponTag.className = 'dc-hint'
    weaponTag.style.cssText = 'margin-top:2px;margin-bottom:4px'
    el.appendChild(weaponTag)

    /* 副手武器（近战主手可用）：单持握左手 / 双手共持挂背 / 与主手同类近战时启用双持 */
    const offhandRow = document.createElement('div')
    offhandRow.className = 'dc-row'
    const offhandLabel = document.createElement('label')
    offhandLabel.className = 'dc-label'
    appendLocalizedText(offhandLabel, 'character.offhand')
    offhandLabel.appendChild(document.createTextNode(' '))
    localizeTitle(offhandLabel, 'character.offhand_tip')
    const offhandSelect = document.createElement('select')
    offhandSelect.id = 'offhand-weapon-select'
    offhandSelect.className = 'dc-select'
    offhandSelect.style.cssText = 'max-width:180px'
    fillWeaponSelect(offhandSelect, true)
    offhandLabel.appendChild(offhandSelect)
    offhandRow.appendChild(offhandLabel)
    el.appendChild(offhandRow)

    /* 持握模式（选项 = 主手武器声明的模式 ∩ 双持可用性；默认单持） */
    const holdRow = document.createElement('div')
    holdRow.className = 'dc-row'
    const holdLabel = document.createElement('label')
    holdLabel.className = 'dc-label'
    appendLocalizedText(holdLabel, 'character.hold')
    holdLabel.appendChild(document.createTextNode(' '))
    localizeTitle(holdLabel, 'character.hold_tip')
    const holdModeSelect = document.createElement('select')
    holdModeSelect.id = 'hold-mode-select'
    holdModeSelect.className = 'dc-select'
    holdLabel.appendChild(holdModeSelect)
    holdRow.appendChild(holdLabel)
    el.appendChild(holdRow)
    const holdModeHint = document.createElement('div')
    holdModeHint.className = 'dc-hint dc-text-warning'
    holdModeHint.style.cssText = 'margin-bottom:4px;display:none'
    localizeText(holdModeHint, 'character.hold_mode_hint')
    el.appendChild(holdModeHint)

    const atkRange = createLabeledNumberInput(el, 'character.range', {min: '0.1', step: '0.1', value: '10'})
    const atkDmg = createLabeledNumberInput(el, 'character.damage', {min: '0.1', step: '0.1', value: '3'})
    const atkCD = createLabeledNumberInput(el, 'character.cooldown', {min: '0.1', step: '0.1', value: '0.5'})
    /* 蓄力调参：最大蓄力倍率（%，100 = 无加成）+ 最长蓄力时间（秒）；对可蓄力武器生效 */
    const atkChargeMult = createLabeledNumberInput(el, 'character.charge_power', {min: '100', step: '10', value: '200'})
    const atkChargeTime = createLabeledNumberInput(el, 'character.charge_time', {min: '0.1', step: '0.1', value: '1'})
    el.appendChild(document.createElement('br'))
    const bulletSpeed = createLabeledNumberInput(el, 'character.bullet_speed', {min: '1', step: '1', value: '20'})
    const bulletKB = createLabeledNumberInput(el, 'character.bullet_knockback', {min: '0', step: '0.5', value: '3'})
    const bulletLife = createLabeledNumberInput(el, 'character.bullet_life', {min: '0.5', step: '0.5', value: '3'})

    /* 攻击区字段集合（预填与回显共用） */
    const attackFields: AttackFields = {atkRange, atkDmg, atkCD, atkChargeMult, atkChargeTime, bulletSpeed, bulletKB, bulletLife, weaponTag}

    /* 装备下拉（一行两列：左护甲 / 右肢体）：首项「无」= 空槽；选项文案列出数值影响（非零项才列出） */
    const armorSelects: Record<ArmorSlot, HTMLSelectElement> = {head: document.createElement('select'), chest: document.createElement('select'), arms: document.createElement('select'), legs: document.createElement('select')}
    const limbSelects: Record<LimbSlot, HTMLSelectElement> = {head: document.createElement('select'), arms: document.createElement('select'), body: document.createElement('select'), legs: document.createElement('select')}

    /** 填充装备下拉（首项「无」+ 该槽位全部预设；护甲 / 肢体共用） */
    const fillEquipSelect = (select: HTMLSelectElement, pieces: readonly (ArmorPieceConfig | LimbPieceConfig)[]): void => {
        const noneOption = document.createElement('option')
        noneOption.value = ''
        noneOption.textContent = translate('common.none')
        select.appendChild(noneOption)
        for (const piece of pieces) {
            const option = document.createElement('option')
            option.value = piece.id
            localizeApply(option, el => { el.textContent = describeArmorPiece(piece) })
            select.appendChild(option)
        }
    }

    for (const {armor, limb} of EQUIP_ROWS) {
        const row = document.createElement('div')
        row.className = 'dc-row'

        const armorLabel = document.createElement('label')
        armorLabel.className = 'dc-label'
        appendLocalizedText(armorLabel, ARMOR_SLOT_LABELS[armor])
        armorLabel.appendChild(document.createTextNode(' '))
        armorSelects[armor].className = 'dc-select'
        armorSelects[armor].style.cssText = 'max-width:180px'
        fillEquipSelect(armorSelects[armor], armorPiecesOfSlot(armor))
        armorLabel.appendChild(armorSelects[armor])
        row.appendChild(armorLabel)

        const limbLabel = document.createElement('label')
        limbLabel.className = 'dc-label'
        appendLocalizedText(limbLabel, 'character.limb_prefix')
        appendLocalizedText(limbLabel, LIMB_SLOT_LABELS[limb])
        limbLabel.appendChild(document.createTextNode(' '))
        localizeTitle(limbLabel, 'character.limb_tip')
        limbSelects[limb].className = 'dc-select'
        limbSelects[limb].style.cssText = 'max-width:180px'
        fillEquipSelect(limbSelects[limb], limbPiecesOfSlot(limb))
        limbLabel.appendChild(limbSelects[limb])
        row.appendChild(limbLabel)

        el.appendChild(row)
    }

    /* 属性模块：生命、基础防御与装备数值预览（有效防御 / 攻击加成 / 有效移速） */
    el.appendChild(createSection('character.section.attributes'))
    const maxHP = createLabeledNumberInput(el, 'character.max_hp', {min: '1', step: '1', value: '15'})
    const curHP = createLabeledNumberInput(el, 'character.cur_hp', {min: '0', step: '1', value: '15'})
    const baseDefPhys = createLabeledNumberInput(el, 'character.base_def_phys', {min: '0', step: '1', value: '0'})
    const baseDefMagic = createLabeledNumberInput(el, 'character.base_def_magic', {min: '0', step: '1', value: '0'})
    /* 韧性 / 倒地属性：上界基础值 + 受击后延迟回充参数 + 倒地/起身时长。
       逐项包在块级容器内——`createLabeledNumberInput` 追加的是行内 `label`，若连续直接挂在
       面板根上会排成一行，其宽度之和会撑大面板（属性段原有 4 项已接近满宽，再加 5 项会遮住左侧实体列表）。 */
    const blockRow = (): HTMLDivElement => {
        const row = document.createElement('div')
        el.appendChild(row)
        return row
    }
    const poiseMaxInput = createLabeledNumberInput(blockRow(), 'character.poise', {min: '1', step: '1', value: '20'})
    const poiseRegenDelayInput = createLabeledNumberInput(blockRow(), 'character.poise_regen_delay', {min: '0', step: '0.1', value: '1'})
    const poiseRegenRateInput = createLabeledNumberInput(blockRow(), 'character.poise_regen_rate', {min: '0', step: '1', value: '8'})
    const knockdownDurationInput = createLabeledNumberInput(blockRow(), 'character.knockdown_duration', {min: '0', step: '0.1', value: '0.7'})
    const getUpDurationInput = createLabeledNumberInput(blockRow(), 'character.get_up_duration', {min: '0', step: '0.1', value: '0.6'})
    const equipmentPreviewTag = document.createElement('div')
    equipmentPreviewTag.className = 'dc-hint'
    equipmentPreviewTag.style.cssText = 'margin-bottom:4px;white-space:pre-line'
    el.appendChild(equipmentPreviewTag)

    /** 读取当前护甲选择（空 value = 空槽） */
    const readArmorLoadout = (): ArmorLoadout => {
        const loadout: Partial<Record<ArmorSlot, string>> = {}
        for (const slot of ARMOR_SLOTS) {
            const value = armorSelects[slot].value
            if (value.length > 0) loadout[slot] = value
        }
        return loadout
    }

    /** 读取当前肢体选择（空 value = 默认人类肢体） */
    const readLimbLoadout = (): LimbLoadout => {
        const loadout: Partial<Record<LimbSlot, string>> = {}
        for (const slot of LIMB_SLOTS) {
            const value = limbSelects[slot].value
            if (value.length > 0) loadout[slot] = value
        }
        return loadout
    }

    /** 读取基础防御（负值/空值安全回退 0） */
    const readBaseDefense = (): DefenseProfile => ({
        physical: Math.max(0, parseFloat(baseDefPhys.value) || 0),
        magic: Math.max(0, parseFloat(baseDefMagic.value) || 0),
    })

    /** 装备数值预览：复用目录汇总函数（与运行时 setCombatEquipment 同一口径）：有效防御 / 攻击加成 / 有效移速 */
    const buildEquipmentPreview = (): string => {
        const resolvedArmor = resolveArmorLoadout(readArmorLoadout())
        const resolvedLimb = resolveLimbLoadout(readLimbLoadout())
        const defense = totalDefenseOf(readBaseDefense(), resolvedArmor, resolvedLimb)
        const attack = totalAttackOf(resolvedArmor, resolvedLimb)
        const moveSpeedMultiplier = totalMoveSpeedOf(resolvedArmor, resolvedLimb)
        const baseSpeed = parseFloat(speed.value) || 0
        return [
            translate({key: 'character.preview_defense', args: [formatNumber(defense.physical), formatNumber(defense.magic)]}),
            translate({key: 'character.preview_attack', args: [formatNumber(attack.physical), formatNumber(attack.magic)]}),
            translate({key: 'character.preview_move', args: [formatNumber(baseSpeed * moveSpeedMultiplier), formatNumber(baseSpeed), formatNumber(moveSpeedMultiplier)]}),
        ].join('\n')
    }
    const updateEquipmentPreview = (): void => {
        equipmentPreviewTag.textContent = buildEquipmentPreview()
    }
    /* 预览文本随语言切换重译（复用同一计算口径） */
    localizeApply(equipmentPreviewTag, el => { el.textContent = buildEquipmentPreview() })
    for (const slot of ARMOR_SLOTS) armorSelects[slot].onchange = updateEquipmentPreview
    for (const slot of LIMB_SLOTS) limbSelects[slot].onchange = updateEquipmentPreview
    baseDefPhys.oninput = updateEquipmentPreview
    baseDefMagic.oninput = updateEquipmentPreview
    speed.oninput = updateEquipmentPreview

    /* 锁定点区：默认身体中心点（不可编辑）+ 可增删改的关节锁定点（关节 id + 关节本地偏移） */
    el.appendChild(createSection('character.section.lock_points'))
    const defaultLockPointTag = document.createElement('div')
    defaultLockPointTag.className = 'dc-hint'
    defaultLockPointTag.style.cssText = 'margin-bottom:2px'
    localizeText(defaultLockPointTag, 'character.default_lock_point')
    el.appendChild(defaultLockPointTag)

    const lockPointsContainer = document.createElement('div')
    lockPointsContainer.className = 'dc-scroll'
    lockPointsContainer.style.cssText = 'max-height:120px;margin:2px 0'
    el.appendChild(lockPointsContainer)

    const addLockPointBtn = document.createElement('button')
    addLockPointBtn.className = 'dc-btn'
    localizeText(addLockPointBtn, 'character.add_lock_point')
    addLockPointBtn.style.cssText = 'font-size:12px'
    el.appendChild(addLockPointBtn)

    let cachedLockPoints: LockPointEditRow[] = []

    const refreshLockPointList = (): void => {
        lockPointsContainer.innerHTML = ''
        for (let index = 0; index < cachedLockPoints.length; index++) {
            const point = cachedLockPoints[index]
            const row = document.createElement('div')
            row.className = 'lock-point-row dc-row'
            row.style.cssText = 'gap:4px;font-size:11px;padding:2px 0'
            const jointSelect = document.createElement('select')
            jointSelect.className = 'lock-point-joint dc-select'
            jointSelect.style.cssText = 'max-width:118px;font-size:11px'
            for (const option of JOINT_LOCK_POINT_OPTIONS) {
                const o = document.createElement('option')
                o.value = option.id
                localizeApply(o, el => { el.textContent = `${humanoidJointDisplayName(option.id, option.name)} (${option.id})` })
                jointSelect.appendChild(o)
            }
            jointSelect.value = point.jointId
            jointSelect.onchange = () => { point.jointId = jointSelect.value }
            row.appendChild(jointSelect)
            for (let axis = 0; axis < point.offset.length; axis++) {
                const input = createLabeledNumberInput(row, OFFSET_AXIS_LABELS[axis], {step: '0.01', style: 'width:42px'})
                input.classList.add('lock-point-offset')
                input.value = point.offset[axis]
                input.oninput = () => { point.offset[axis] = input.value }
            }
            const delBtn = document.createElement('button')
            delBtn.className = 'dc-list-del'
            delBtn.appendChild(createIcon('close', {size: 'sm'}))
            delBtn.onclick = () => { cachedLockPoints.splice(index, 1); refreshLockPointList() }
            row.appendChild(delBtn)
            lockPointsContainer.appendChild(row)
        }
    }

    addLockPointBtn.onclick = () => {
        cachedLockPoints.push({jointId: LOCK_POINT_DEFAULT_JOINT, offset: ['0', '0', '0']})
        refreshLockPointList()
    }

    el.appendChild(createSection('character.section.player'))
    const playerRow = document.createElement('div')
    playerRow.className = 'dc-row'
    const playerCheck = document.createElement('input')
    playerCheck.type = 'checkbox'
    playerCheck.className = 'dc-check'
    playerCheck.id = 'chk-player'
    const playerLabel = document.createElement('label')
    playerLabel.className = 'dc-label'
    playerLabel.htmlFor = 'chk-player'
    localizeText(playerLabel, 'character.mark_player')
    playerLabel.style.cssText = 'cursor:pointer'
    playerRow.appendChild(playerCheck)
    playerRow.appendChild(playerLabel)
    el.appendChild(playerRow)

    /* AI 策略区（仅非玩家角色可见） */
    const aiSection = createSection('character.section.ai')
    el.appendChild(aiSection)

    /* 和平策略下拉框 */
    const peaceRow = document.createElement('div')
    peaceRow.className = 'dc-row'
    const peaceLabel = document.createElement('label')
    peaceLabel.className = 'dc-label'
    appendLocalizedText(peaceLabel, 'character.peace_label')
    peaceLabel.appendChild(document.createTextNode(' '))
    const peaceSelect = document.createElement('select')
    peaceSelect.className = 'dc-select'
    for (const s of PEACE_SUB_STRATEGIES) {
        const o = document.createElement('option')
        o.value = s
        localizeText(o, s === 'patrol' ? 'character.peace.patrol' : 'character.peace.build')
        peaceSelect.appendChild(o)
    }
    peaceLabel.appendChild(peaceSelect)
    peaceRow.appendChild(peaceLabel)
    el.appendChild(peaceRow)

    /* 战斗策略下拉框 */
    const combatRow = document.createElement('div')
    combatRow.className = 'dc-row'
    const combatLabel = document.createElement('label')
    combatLabel.className = 'dc-label'
    appendLocalizedText(combatLabel, 'character.combat_label')
    combatLabel.appendChild(document.createTextNode(' '))
    const combatSelect = document.createElement('select')
    combatSelect.className = 'dc-select'
    const COMBAT_OPTIONS: ReadonlyArray<{value: string; labelKey: StringLocaleKey}> = [
        {value: 'tactical', labelKey: 'character.combat.tactical'},
        {value: 'aggressive', labelKey: 'character.combat.aggressive'},
        {value: 'cowardly', labelKey: 'character.combat.cowardly'},
    ]
    for (const opt of COMBAT_OPTIONS) {
        const o = document.createElement('option')
        o.value = opt.value
        localizeText(o, opt.labelKey)
        combatSelect.appendChild(o)
    }
    combatLabel.appendChild(combatSelect)
    combatRow.appendChild(combatLabel)
    el.appendChild(combatRow)

    /* 导航感知开关 */
    const navRow = document.createElement('div')
    navRow.className = 'dc-row'
    navRow.style.cssText = 'margin-top:4px'
    const navCheck = document.createElement('input')
    navCheck.type = 'checkbox'
    navCheck.className = 'dc-check'
    navCheck.id = 'chk-nav'
    const navLabel = document.createElement('label')
    navLabel.className = 'dc-label'
    navLabel.htmlFor = 'chk-nav'
    localizeText(navLabel, 'character.enable_nav')
    navLabel.style.cssText = 'cursor:pointer'
    navRow.appendChild(navCheck)
    navRow.appendChild(navLabel)
    el.appendChild(navRow)

    /* 建造配置区（仅 build 策略可见）：标题与全部控件包进同一容器，统一显隐 */
    const buildPanel = document.createElement('div')
    el.appendChild(buildPanel)
    buildPanel.appendChild(createSection('character.section.build'))
    const buildIntervalInput = createLabeledNumberInput(buildPanel, 'character.build_interval', {min: '0.5', step: '0.1', value: '3'})
    const buildBoxTypesLabel = document.createElement('label')
    buildBoxTypesLabel.className = 'dc-label'
    localizeText(buildBoxTypesLabel, 'character.box_types')
    buildPanel.appendChild(buildBoxTypesLabel)
    buildPanel.appendChild(document.createElement('br'))

    /* 箱型概览列表容器 */
    const boxTypesContainer = document.createElement('div')
    boxTypesContainer.className = 'dc-scroll'
    boxTypesContainer.style.cssText = 'max-height:120px;margin:4px 0'
    buildPanel.appendChild(boxTypesContainer)

    /* 添加箱型按钮 */
    const addBoxTypeBtn = document.createElement('button')
    addBoxTypeBtn.className = 'dc-btn'
    localizeText(addBoxTypeBtn, 'character.add_box_type')
    addBoxTypeBtn.style.cssText = 'font-size:12px;margin-top:4px'
    buildPanel.appendChild(addBoxTypeBtn)
    buildPanel.appendChild(document.createElement('br'))

    /* 箱型详细配置弹出面板 */
    const detailPanel = document.createElement('div')
    detailPanel.style.cssText = 'display:none;background:var(--dc-bg-3);border:1px solid var(--dc-border);padding:8px;border-radius:var(--dc-radius);margin-top:6px'
    const detailTitle = document.createElement('div')
    detailTitle.className = 'dc-text-gold'
    detailTitle.style.cssText = 'font-weight:700;font-size:12px;margin-bottom:4px'
    detailPanel.appendChild(detailTitle)
    const detailFields = document.createElement('div')
    detailPanel.appendChild(detailFields)
    buildPanel.appendChild(detailPanel)

    /* 建造配置区显隐：仅非玩家且和平策略为 build 时展示，隐藏时收起详情弹窗 */
    const applyBuildVisibility = (peaceStrategy: string, isPlayer: boolean): void => {
        const show = !isPlayer && peaceStrategy === 'build'
        buildPanel.style.display = show ? '' : 'none'
        if (!show) detailPanel.style.display = 'none'
    }

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    peaceSelect.onchange = () => {
        applyBuildVisibility(peaceSelect.value, playerCheck.checked)
    }

    /** 远程弹道数值仅在所选武器为远程时显示（近战打击距离由武器几何驱动） */
    const showRanged = (): void => {
        const weapon = selectedWeaponOf(weaponSelect)
        const isRanged = weapon !== undefined && weapon.type === 'ranged'
        atkRange.parentElement!.style.display = isRanged ? '' : 'none';
        [bulletSpeed, bulletKB, bulletLife].forEach(input => {
            input.parentElement!.style.display = isRanged ? '' : 'none'
        })
    }

    /** 蓄力数值仅在所选武器可蓄力时显示（近战重击 / 弓与投掷类；不可蓄力武器不写 charge） */
    const showCharge = (): void => {
        const weapon = selectedWeaponOf(weaponSelect)
        const chargeable = weapon !== undefined && chargeTuningOfWeapon(weapon) !== undefined
        ;[atkChargeMult, atkChargeTime].forEach(input => {
            input.parentElement!.style.display = chargeable ? '' : 'none'
        })
    }

    weaponSelect.onchange = () => {
        if (weaponSelect.value.length > 0) autoFillFromWeapon(weaponSelect.value, attackFields)
        showRanged()
        showCharge()
        updateOffhandAvailability()
        rebuildHoldModeOptions()
    }

    offhandSelect.onchange = () => rebuildHoldModeOptions()

    const getSelected = (): CharacterEntity | undefined => {
        const id = ctx.getSelectedId()
        if (id === undefined) return undefined
        return ctx.getAll().find(c => c.id === id)
    }

    /** 武器标签文本（当前选中武器 + 伤害类型；随语言切换重译） */
    const renderWeaponTag = (): string => {
        const sel = getSelected()
        if (sel === undefined) return ''
        const weapon = sel.combat.weapon
        const damageTypeLabel = `  ·  ${translate(DAMAGE_TYPE_LABELS[weapon.damageType])}`
        const name = weaponDisplayName(weapon.id, weapon.name)
        return weapon.type === 'ranged'
            ? [name, ...rangedModeTags(weapon)].join('  ') + damageTypeLabel
            : name + damageTypeLabel
    }

    /** 当前攻击段标签文本（武器名 · 段名 / 待机；随语言切换重译） */
    const renderAttackSegmentTag = (): string => {
        const sel = getSelected()
        if (sel === undefined) return ''
        const name = weaponDisplayName(sel.combat.weapon.id, sel.combat.weapon.name)
        const activeSegment = sel.combat.activeSegment
        return activeSegment === undefined
            ? `${name} · ${translate('character.idle')}`
            : `${name} · ${segmentDisplayName(activeSegment)}`
    }
    localizeApply(weaponTag, el => { el.textContent = renderWeaponTag() })
    localizeApply(attackSegmentTag, el => { el.textContent = renderAttackSegmentTag() })

    /** 当前副手选择（空 value = 无副手） */
    const selectedOffhandWeapon = (): WeaponConfig | undefined => selectedWeaponOf(offhandSelect)

    /** 主手为远程时副手不参与（禁用选择；数据保留，切回近战恢复展示与可用性） */
    const updateOffhandAvailability = (): void => {
        const main = selectedWeaponOf(weaponSelect)
        offhandSelect.disabled = main !== undefined && main.type === 'ranged'
    }

    /** 重建持握模式选项：可用模式 = 主手声明 ∩ 双持（副手同类近战）；保留仍可用的当前选择 */
    const rebuildHoldModeOptions = (): void => {
        const main = selectedWeaponOf(weaponSelect)
        const previous = holdModeSelect.value
        holdModeSelect.innerHTML = ''
        const modes = main === undefined ? [] : availableHoldModes(main, selectedOffhandWeapon())
        for (const mode of modes) {
            const option = document.createElement('option')
            option.value = mode
            localizeApply(option, el => { el.textContent = translate(HOLD_MODE_LABELS[mode]) })
            holdModeSelect.appendChild(option)
        }
        holdModeSelect.value = modes.some(mode => mode === previous) ? previous : (modes[0] ?? '')
        /* 提示：近战主手但副手不构成双持时，说明双持条件 */
        const dualAvailable = main !== undefined && main.type === 'melee' && isDualWieldPair(main, selectedOffhandWeapon())
        holdModeHint.style.display = (main !== undefined && main.type === 'melee' && !dualAvailable) ? '' : 'none'
    }

    /* 运行时箱型配置缓存 */
    let cachedBoxTypes: Array<{
        entityType: string
        probability: string
        minWidth: string; maxWidth: string
        minHeight: string; maxHeight: string
        minDepth: string; maxDepth: string
        mass: string; friction: string
        maxHealth?: string
        attractionRadius?: string; attractionStrength?: string
        stiffness?: string; dampingRatio?: string; maxDeformFraction?: string
    }> = []

    const refreshBoxTypeList = (): void => {
        boxTypesContainer.innerHTML = ''
        for (let i = 0; i < cachedBoxTypes.length; i++) {
            const bt = cachedBoxTypes[i]
            const row = document.createElement('div')
            row.className = 'dc-row'
            row.style.cssText = 'gap:4px;font-size:11px;padding:2px 0;cursor:pointer'
            row.textContent = `${bt.entityType} (${bt.probability}) ${bt.minWidth}-${bt.maxWidth}×${bt.minHeight}-${bt.maxHeight}×${bt.minDepth}-${bt.maxDepth}`
            row.title = translate('character.detail_hint')
            const delBtn = document.createElement('button')
            delBtn.className = 'dc-list-del'
            delBtn.appendChild(createIcon('close', {size: 'sm'}))
            delBtn.style.cssText = 'margin-left:auto'
            delBtn.onclick = (e) => { e.stopPropagation(); cachedBoxTypes.splice(i, 1); refreshBoxTypeList() }
            row.appendChild(delBtn)
            row.onclick = () => showDetail(i)
            boxTypesContainer.appendChild(row)
        }
    }

    const showDetail = (idx: number): void => {
        if (idx < 0 || idx >= cachedBoxTypes.length) { detailPanel.style.display = 'none'; return }
        const bt = cachedBoxTypes[idx]
        detailTitle.textContent = translate({key: 'character.detail_edit_title', args: [bt.entityType]})
        detailFields.innerHTML = ''
        const addField = (labelKey: StringLocaleKey, key: keyof typeof bt): void => {
            const div = document.createElement('div')
            div.className = 'dc-row'
            div.style.cssText = 'gap:4px;margin:2px 0'
            const lbl = document.createElement('span')
            lbl.textContent = translate(labelKey)
            lbl.className = 'dc-label'
            lbl.style.cssText = 'font-size:11px;width:100px'
            const inp = document.createElement('input')
            inp.type = 'text'; inp.className = 'dc-input'; inp.style.cssText = 'width:60px;font-size:11px'
            inp.value = String(bt[key] ?? '')
            inp.oninput = () => { (bt as Record<string, string>)[key] = inp.value; refreshBoxTypeList() }
            div.appendChild(lbl); div.appendChild(inp)
            detailFields.appendChild(div)
        }
        addField('character.field.entity_type', 'entityType')
        addField('character.field.probability', 'probability')
        addField('character.field.min_w', 'minWidth'); addField('character.field.max_w', 'maxWidth')
        addField('character.field.min_h', 'minHeight'); addField('character.field.max_h', 'maxHeight')
        addField('character.field.min_d', 'minDepth'); addField('character.field.max_d', 'maxDepth')
        addField('character.field.mass', 'mass')
        addField('character.field.friction', 'friction')
        if (bt.entityType === 'box/destruction' || bt.entityType === 'box/burning') {
            addField('character.field.max_health', 'maxHealth')
        }
        if (bt.entityType === 'box/magnet') {
            addField('character.field.attr_radius', 'attractionRadius')
            addField('character.field.attr_strength', 'attractionStrength')
        }
        if (bt.entityType === 'box/elasticity') {
            addField('character.field.stiffness', 'stiffness')
            addField('character.field.damping_ratio', 'dampingRatio')
            addField('character.field.max_deform', 'maxDeformFraction')
        }
        const closeBtn = document.createElement('button')
        closeBtn.className = 'dc-btn'
        closeBtn.textContent = translate('character.done')
        closeBtn.style.cssText = 'font-size:11px;margin-top:4px'
        closeBtn.onclick = () => { detailPanel.style.display = 'none' }
        detailFields.appendChild(closeBtn)
        detailPanel.style.display = 'block'
    }

    addBoxTypeBtn.onclick = () => {
        cachedBoxTypes.push({
            entityType: 'box/common', probability: '0',
            minWidth: '0.5', maxWidth: '2',
            minHeight: '0.5', maxHeight: '2',
            minDepth: '0.5', maxDepth: '2',
            mass: '1', friction: '0.3',
        })
        refreshBoxTypeList()
    }

    /** 仅刷新位置/朝向字段（gizmo 拖拽/物理模拟后调用） */
    const refreshPositionValues = (): void => {
        /* 输入框聚焦中不刷新，避免覆盖用户输入 */
        if (el.contains(document.activeElement)) return
        const sel = getSelected()
        if (!sel) return
        posX.value = sel.mesh.position.x.toFixed(2)
        posY.value = sel.mesh.position.y.toFixed(2)
        posZ.value = sel.mesh.position.z.toFixed(2)
        facingDeg.value = String(Math.round(ctx.getFacing?.(sel.id) ?? 0))
    }

    /** 刷新全部配置字段（仅 render 时调用一次） */
    const refreshFullConfig = (): void => {
        const sel = getSelected()
        if (!sel) return

        speed.value = String(sel.config.speed)
        jumpH.value = String(sel.config.jumpHeight)
        scale.value = String(sel.config.scale)

        maxHP.value = String(sel.combat.maxHealth)
        curHP.value = String(sel.combat.health)
        faction.value = String(sel.combat.faction)
        tendSelect.value = sel.combat.tendencyConfig.tendencyId
        targetFactionsInput.value = sel.combat.tendencyConfig.targetFactions?.join(',') ?? ''
        showTargetFactions()

        /* 攻击区：装备武器 + 数值覆写（类型由武器决定，动作时长由武器模组决定，均不在面板暴露） */
        const attack = readSelectedAttack(sel)
        weaponSelect.value = attack.weaponId
        atkDmg.value = formatNumber(attack.damage)
        atkCD.value = formatNumber(attack.cooldown)
        if (attack.charge !== undefined) {
            atkChargeMult.value = formatNumber(attack.charge.maxChargeMultiplier)
            atkChargeTime.value = formatNumber(attack.charge.maxChargeTime)
        }
        if (attack.ranged !== undefined) {
            atkRange.value = formatNumber(attack.ranged.range)
            bulletSpeed.value = formatNumber(attack.ranged.bulletSpeed)
            bulletKB.value = formatNumber(attack.ranged.bulletKnockback)
            bulletLife.value = formatNumber(attack.ranged.bulletLifetime)
        }
        weaponTag.textContent = renderWeaponTag()
        attackSegmentTag.textContent = renderAttackSegmentTag()

        /* 副手武器与持握模式回显（未知 / 已移除的副手武器视为无） */
        const offhandWeapon = sel.combat.offhand?.weapon
        offhandSelect.value = offhandWeapon !== undefined && findWeaponPreset(offhandWeapon.id) !== undefined
            ? offhandWeapon.id
            : ''
        updateOffhandAvailability()
        rebuildHoldModeOptions()
        holdModeSelect.value = sel.holdMode

        /* 护甲 / 肢体与防御回显：无效 / 槽位不匹配的存档 id 显示为「无」（下拉中不存在该选项时选回空槽） */
        for (const slot of ARMOR_SLOTS) {
            const piece = findArmorPreset(sel.combat.armor[slot])
            armorSelects[slot].value = piece !== undefined && piece.slot === slot ? piece.id : ''
        }
        for (const slot of LIMB_SLOTS) {
            const piece = findLimbPreset(sel.combat.limb[slot])
            limbSelects[slot].value = piece !== undefined && piece.slot === slot ? piece.id : ''
        }
        baseDefPhys.value = formatNumber(sel.combat.baseDefense.physical)
        baseDefMagic.value = formatNumber(sel.combat.baseDefense.magic)
        poiseMaxInput.value = formatNumber(sel.combat.basePoiseMax)
        poiseRegenDelayInput.value = formatNumber(sel.combat.poiseRegenDelay)
        poiseRegenRateInput.value = formatNumber(sel.combat.poiseRegenPerSec)
        knockdownDurationInput.value = formatNumber(sel.combat.knockdownDuration)
        getUpDurationInput.value = formatNumber(sel.combat.getUpDuration)
        updateEquipmentPreview()

        /* 额外锁定点回显（默认身体中心点固定，不在此列表） */
        cachedLockPoints = sel.lockPoints.map((point): LockPointEditRow => ({
            jointId: point.jointId,
            offset: [formatNumber(point.offset[0]), formatNumber(point.offset[1]), formatNumber(point.offset[2])],
        }))
        refreshLockPointList()

        playerCheck.checked = sel.isPlayer
        peaceSelect.value = sel.peaceStrategy
        combatSelect.value = sel.combatStrategy
        navCheck.checked = sel.navEnabled
        aiSection.style.display = sel.isPlayer ? 'none' : ''
        peaceRow.style.display = sel.isPlayer ? 'none' : ''
        combatRow.style.display = sel.isPlayer ? 'none' : ''
        navRow.style.display = sel.isPlayer ? 'none' : ''
        applyBuildVisibility(sel.peaceStrategy, sel.isPlayer)
        showRanged()
        showCharge()
    }

    return {
        render: (container: HTMLElement) => {
            const sel = getSelected()
            if (!sel) return
            container.appendChild(el)
            el.style.display = 'block'

            refreshPositionValues()
            refreshFullConfig()

            const onApply = () => {
                const cur = getSelected()
                if (!cur) return
                ctx.setTransform(cur.id,
                    {x: parseFloat(posX.value), y: parseFloat(posY.value), z: parseFloat(posZ.value)},
                    {x: 0, y: 0, z: 0},
                )
                /* 朝向（0-360°，0 = 世界 +Z 前方）：归一化后写入 facingAngles */
                const fd = parseFloat(facingDeg.value)
                if (!isNaN(fd)) ctx.setFacing?.(cur.id, fd)
                if (playerCheck.checked) ctx.markPlayer(cur.id)
                else if (cur.isPlayer) ctx.unmarkPlayer()
                const isPlayer = playerCheck.checked
                aiSection.style.display = isPlayer ? 'none' : ''
                peaceRow.style.display = isPlayer ? 'none' : ''
                combatRow.style.display = isPlayer ? 'none' : ''
                navRow.style.display = isPlayer ? 'none' : ''
                applyBuildVisibility(peaceSelect.value, isPlayer)
                ctx.setNavEnabled?.(cur.id, navCheck.checked)
                const peaceStrat = peaceSelect.value
                if (isPeaceSubStrategy(peaceStrat)) {
                    ctx.setPeaceStrategy?.(cur.id, peaceStrat)
                }
                const combatStrat = combatSelect.value
                if (isCombatSubStrategy(combatStrat)) {
                    ctx.setCombatStrategy?.(cur.id, combatStrat)
                }
                /* 持久化建造配置 */
                if (peaceStrat === 'build') {
                    const boxTypes = cachedBoxTypes
                        .filter(bt => BUILDABLE_BOX_TYPES.includes(bt.entityType as BuildableBoxType))
                        .map(bt => ({
                            entityType: bt.entityType as BuildableBoxType,
                            probability: parseFloat(bt.probability) || 0,
                            minWidth: parseFloat(bt.minWidth) || 0.5,
                            maxWidth: parseFloat(bt.maxWidth) || 2,
                            minHeight: parseFloat(bt.minHeight) || 0.5,
                            maxHeight: parseFloat(bt.maxHeight) || 2,
                            minDepth: parseFloat(bt.minDepth) || 0.5,
                            maxDepth: parseFloat(bt.maxDepth) || 2,
                            mass: parseFloat(bt.mass) || 1,
                            friction: parseFloat(bt.friction) || 0.3,
                            ...(bt.entityType === 'box/destruction' || bt.entityType === 'box/burning' ? {maxHealth: parseFloat(bt.maxHealth ?? '0') || 10} : {}),
                            ...(bt.entityType === 'box/magnet' ? {
                                attractionRadius: parseFloat(bt.attractionRadius ?? '0') || 5,
                                attractionStrength: parseFloat(bt.attractionStrength ?? '0') || 10,
                            } : {}),
                            ...(bt.entityType === 'box/elasticity' ? {
                                stiffness: parseFloat(bt.stiffness ?? '0') || 100,
                                dampingRatio: parseFloat(bt.dampingRatio ?? '0') || 0.3,
                                maxDeformFraction: parseFloat(bt.maxDeformFraction ?? '0') || 0.2,
                            } : {}),
                        }))
                    ctx.setPeaceConfig?.(cur.id, {
                        buildInterval: parseFloat(buildIntervalInput.value) || 3,
                        boxTypes,
                    })
                }
                /* 攻击配置：装备武器 + 数值覆写（动作时长/动画由武器模组的攻击链决定，不在此提交） */
                const selectedWeapon = selectedWeaponOf(weaponSelect)
                const attackDamage = parseFloat(atkDmg.value)
                const attackCooldown = parseFloat(atkCD.value)
                const chargeMult = parseFloat(atkChargeMult.value)
                const chargeTime = parseFloat(atkChargeTime.value)
                /* 蓄力调参仅对可蓄力武器写入（不可蓄力武器忽略该字段，避免写无意义存档） */
                const chargeable = selectedWeapon !== undefined && chargeTuningOfWeapon(selectedWeapon) !== undefined
                const newAttack: AttackConfig = {
                    weaponId: selectedWeapon?.id ?? weaponSelect.value,
                    ...(isNaN(attackDamage) ? {} : {damage: attackDamage}),
                    ...(isNaN(attackCooldown) ? {} : {cooldown: attackCooldown}),
                    ...(chargeable && !(isNaN(chargeMult) && isNaN(chargeTime)) ? {charge: {
                        ...(isNaN(chargeMult) ? {} : {maxChargeMultiplier: chargeMult}),
                        ...(isNaN(chargeTime) ? {} : {maxChargeTime: chargeTime}),
                    }} : {}),
                    /* 远程弹道数值仅远程武器写入 */
                    ...(selectedWeapon !== undefined && selectedWeapon.type === 'ranged'
                        ? {ranged: {
                            range: parseFloat(atkRange.value),
                            bulletSpeed: parseFloat(bulletSpeed.value),
                            bulletKnockback: parseFloat(bulletKB.value),
                            bulletLifetime: parseFloat(bulletLife.value),
                        }}
                        : {}),
                }
                /* 副手武器：空选择 = 卸下（null）；否则按所选武器（数值取预设，可后续扩展覆写） */
                const selectedOffhand = selectedOffhandWeapon()
                const newOffhand: AttackConfig | null = selectedOffhand === undefined ? null : {weaponId: selectedOffhand.id}
                /* 韧性属性（可选）：非法输入不写入，保留运行时原值 */
                const poiseCfg: Partial<CharacterConfig> = {}
                const parseOpt = (v: string): number | undefined => {
                    const n = parseFloat(v)
                    return isNaN(n) ? undefined : n
                }
                const poiseMaxValue = parseOpt(poiseMaxInput.value)
                if (poiseMaxValue !== undefined) poiseCfg.poiseMax = poiseMaxValue
                const poiseDelayValue = parseOpt(poiseRegenDelayInput.value)
                if (poiseDelayValue !== undefined) poiseCfg.poiseRegenDelay = poiseDelayValue
                const poiseRateValue = parseOpt(poiseRegenRateInput.value)
                if (poiseRateValue !== undefined) poiseCfg.poiseRegenPerSec = poiseRateValue
                const knockdownValue = parseOpt(knockdownDurationInput.value)
                if (knockdownValue !== undefined) poiseCfg.knockdownDuration = knockdownValue
                const getUpValue = parseOpt(getUpDurationInput.value)
                if (getUpValue !== undefined) poiseCfg.getUpDuration = getUpValue
                ctx.updateCharacterConfig?.(cur.id, {
                    speed: parseFloat(speed.value),
                    jumpHeight: parseFloat(jumpH.value),
                    scale: parseFloat(scale.value),
                    ...poiseCfg,
                }, newAttack, parseFloat(faction.value), parseFloat(maxHP.value), buildTendencyConfig(), parseFloat(curHP.value), {
                    baseDefense: readBaseDefense(),
                    armor: readArmorLoadout(),
                    limb: readLimbLoadout(),
                }, newOffhand)
                /* 持握模式：换装重置为默认后再按面板选择显式设置（不可用时 setHoldMode 回退默认模式） */
                const holdValue = holdModeSelect.value
                if (isHoldMode(holdValue)) ctx.setHoldMode?.(cur.id, holdValue)
                /* 额外锁定点：默认身体中心点由运行时提供；非法偏移输入解析为 0（运行时仍会剔除） */
                ctx.setLockPoints?.(cur.id, cachedLockPoints.map((point): LockPointConfig => ({
                    jointId: point.jointId,
                    offset: [
                        parseFloat(point.offset[0]) || 0,
                        parseFloat(point.offset[1]) || 0,
                        parseFloat(point.offset[2]) || 0,
                    ],
                })))
                const updated = getSelected()
                if (updated) {
                    maxHP.value = String(updated.combat.maxHealth)
                    curHP.value = String(updated.combat.health)
                }
            }

            const onDelete = () => {
                const cur = getSelected()
                if (cur) ctx.remove(cur.id)
            }
            applyBtn.onclick = onApply
            deleteBtn.onclick = onDelete
        },
        destroy: () => {
            el.remove()
        },
        update: refreshPositionValues,
    }
}
