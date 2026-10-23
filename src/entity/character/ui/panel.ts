import type {PanelContext} from '../../box/base/ui/index.ts'
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
import {availableHoldModes, findWeaponPreset, isDualWieldPair, weaponAttacksOf, weaponDisplayName, weaponsOfForm} from '../../../character/weapon/catalog.ts'
import {HOLD_MODE_LABELS, isHoldMode} from '../../../character/weapon/hold_mode.ts'
import {HANDEDNESS, HANDEDNESS_LABELS, isHandedness} from '../../../character/handedness.ts'
import type {RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
import type {ChargeTuning} from '../../../character/weapon/charge_tuning.ts'
import {chainOf, segmentDisplayName, type WeaponAttacks} from '../../../character/weapon/attack_chain.ts'
import {ARMOR_SLOTS, ARMOR_SLOT_LABELS, LIMB_SLOTS, LIMB_SLOT_LABELS, type ArmorSlot, type LimbSlot} from '../../../character/armor/slots.ts'
import {armorPiecesOfSlot, armorPieceDisplayName, attackTermsOf, defenseTermsOf, findArmorPreset, findLimbPreset, limbPiecesOfSlot, moveSpeedTermsOf, poiseTermsOf, resolveArmorLoadout, resolveLimbLoadout, type StatTerm} from '../../../character/armor/catalog.ts'
import type {ArmorLoadout, ArmorPieceConfig, LimbLoadout, LimbPieceConfig} from '../../../character/armor/types.ts'
import type {DefenseProfile} from '../../../character/combat/defense.ts'
import type {DamageType, DamageTypeProfile} from '../../../character/combat/damage_type.ts'
import {DAMAGE_TYPE_LABELS} from '../../../character/combat/damage_type.ts'
import {isPeaceSubStrategy, isCombatSubStrategy, isOriginSubStrategy, PEACE_SUB_STRATEGIES, ORIGIN_SUB_STRATEGIES, type BoxSpawnEntry, type OriginSubStrategy} from '../../../character/ai_strategy/types.ts'
import {BOX_PRESET_IDS, isBoxPresetId, type BoxPresetId} from '../../../types/boxPreset.ts'
import type {LockPointConfig} from '../../../character/lock_point.ts'
import {CHARACTER_JOINT_IDS} from '../body_form/humanoid/skeleton_animation/clips/base_clips.ts'
import {buildCharacterSkeletonDefinition, humanoidJointDisplayName} from '../body_form/humanoid/skeleton/skeleton.ts'
import {BODY_FORM_IDS, BODY_FORMS, bodyFormOf, type BodyForm} from '../body_form/index.ts'
import {humanoidBodyStateOf} from '../body_form/humanoid/state/body_state.ts'
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

/** 建造配置的箱型预设显示名键 */
const BOX_PRESET_LABEL_KEYS: Record<BoxPresetId, StringLocaleKey> = {
    common: 'character.preset.common',
    destructible: 'character.preset.destructible',
    burning: 'character.preset.burning',
    magnet: 'character.preset.magnet',
    elastic: 'character.preset.elastic',
}

/** 预设标识 → 本地化显示名（非法标识原样回显） */
const presetDisplayName = (preset: string): string =>
    isBoxPresetId(preset) ? translate(BOX_PRESET_LABEL_KEYS[preset]) : preset

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

/** 行为原点策略 → 下拉项文案 */
const ORIGIN_LABELS: Record<OriginSubStrategy, StringLocaleKey> = {
    resident: 'character.origin.resident',
    fighter: 'character.origin.fighter',
    hunter: 'character.origin.hunter',
    roamer: 'character.origin.roamer',
}

/** 武器预设 → 下拉项文案（远程附带模式标记，便于区分特殊弹道） */
const describeWeapon = (w: WeaponConfig): string => {
    const name = weaponDisplayName(w)
    if (w.type === 'melee') return `${name} (dmg:${w.damage})`
    const tags: string[] = []
    if (w.spreadCount !== undefined) tags.push(translate({key: 'character.tag.spread', args: [String(w.spreadCount)]}))
    if (w.explosionRadius !== undefined) tags.push(translate({key: 'character.tag.explosion', args: [String(w.explosionRadius)]}))
    if (w.homingStrength !== undefined) tags.push(translate({key: 'character.tag.homing', args: [String(w.homingStrength)]}))
    if (w.throwAngle !== undefined) tags.push(translate({key: 'character.tag.throw_arc', args: [(w.throwAngle * 180 / Math.PI).toFixed(0)]}))
    return `${name} (dmg:${w.damage} rng:${w.range})${tags.length > 0 ? ` [${tags.join(' ')}]` : ''}`
}

/** 武器下拉按近战 / 盾牌 / 远程分组（类型由所选武器决定，因此不再有独立「攻击类型」选择器） */
const buildWeaponOptions = (form: BodyForm): {melee: readonly WeaponOption[]; shield: readonly WeaponOption[]; ranged: readonly WeaponOption[]} => {
    const melee: WeaponOption[] = []
    const shield: WeaponOption[] = []
    const ranged: WeaponOption[] = []
    for (const preset of weaponsOfForm(form.id)) {
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

/**
 * 填充武器下拉：近战 / 盾牌 / 远程分组（withNone = 追加「无」空项，供副手选择）；选项文案随语言切换重译。
 * 选项 = 该体形拥有的武器（`weaponsOfForm(form.id)`；武器只属于一种体形）。会先清空现有选项。
 */
const fillWeaponSelect = (select: HTMLSelectElement, withNone: boolean, form: BodyForm): void => {
    select.replaceChildren()
    if (withNone) {
        const none = document.createElement('option')
        none.value = ''
        localizeText(none, 'common.none')
        select.appendChild(none)
    }
    const weaponOptions = buildWeaponOptions(form)
    for (const group of [
        {labelKey: WEAPON_GROUP_LABEL_MELEE, options: weaponOptions.melee},
        {labelKey: WEAPON_GROUP_LABEL_SHIELD, options: weaponOptions.shield},
        {labelKey: WEAPON_GROUP_LABEL_RANGED, options: weaponOptions.ranged},
    ]) {
        const visible = group.options
        if (visible.length === 0) continue
        const optGroup = document.createElement('optgroup')
        localizeApply(optGroup, el => {
            if (el instanceof HTMLOptGroupElement) el.label = translate(group.labelKey)
        })
        for (const opt of visible) {
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

/** 逐项数值来源文本（`名称 数值`） */
const renderStatTerm = (term: StatTerm): string => `${term.name} ${formatNumber(term.value)}`

/**
 * 属性 / 状态行的公式登记：基础值输入 + 加值 / 乘区取值 + 只读文本节点。
 * 展示形态「结果 | (基础值 + 逐项加值) × 逐项乘区」：结果在前，公式拆解逐项列出来源。
 */
interface StatFormula {
    readonly base: HTMLInputElement
    /** 加值项来源（防御 / 攻击 / 韧性等，逐项列出） */
    readonly addends: () => readonly StatTerm[]
    /** 乘区项来源（移速乘数等，逐项列出） */
    readonly multipliers: () => readonly StatTerm[]
    /** 结果文本（属性行 = 最终值；状态行 = 最大值） */
    readonly head: HTMLElement
    /** 加值文本节点（` + 名称 数值 …`，无来源时为空） */
    readonly addendSpan: HTMLElement
    /** 乘区文本节点（` × 名称 数值 …`，无来源时为空） */
    readonly mulSpan: HTMLElement
}

/** 渲染一行只读公式：结果 + `(基础值 + 逐项加值) × 逐项乘区`（前缀括号 / 分隔符由行内静态文本提供） */
const renderStatFormula = (entry: StatFormula): void => {
    const addends = entry.addends()
    const multipliers = entry.multipliers()
    const base = parseFloat(entry.base.value)
    let result = isNaN(base) ? 0 : base
    for (const term of addends) result += term.value
    for (const term of multipliers) result *= term.value
    entry.head.textContent = formatNumber(result)
    entry.addendSpan.textContent = addends.length > 0 ? ` + ${addends.map(renderStatTerm).join(' + ')}` : ''
    entry.mulSpan.textContent = multipliers.length > 0 ? ` × ${multipliers.map(renderStatTerm).join(' × ')}` : ''
}

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
    const weaponName = weaponDisplayName(weapon)
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

    /* 惯用手：右撇子（默认）/ 左撇子（主副手槽位互换 + 动作与外观镜像） */
    const handednessLabel = document.createElement('label')
    handednessLabel.className = 'dc-label'
    appendLocalizedText(handednessLabel, 'character.handedness')
    handednessLabel.appendChild(document.createTextNode(' '))
    const handednessSelect = document.createElement('select')
    handednessSelect.id = 'handedness-select'
    handednessSelect.className = 'dc-select'
    for (const value of HANDEDNESS) {
        const o = document.createElement('option')
        o.value = value
        localizeText(o, HANDEDNESS_LABELS[value])
        handednessSelect.appendChild(o)
    }
    handednessLabel.appendChild(handednessSelect)
    el.appendChild(handednessLabel)

    /* 基础模组（体形）：切换运行时重建骨架 / 外观 / 碰撞 / 受击 / 装备槽（见 world.setBodyForm） */
    const bodyFormLabel = document.createElement('label')
    bodyFormLabel.className = 'dc-label'
    appendLocalizedText(bodyFormLabel, 'character.body_form')
    bodyFormLabel.appendChild(document.createTextNode(' '))
    const bodyFormSelect = document.createElement('select')
    bodyFormSelect.id = 'body-form-select'
    bodyFormSelect.className = 'dc-select'
    for (const planId of BODY_FORM_IDS) {
        const o = document.createElement('option')
        o.value = planId
        localizeText(o, BODY_FORMS[planId].nameKey)
        bodyFormSelect.appendChild(o)
    }
    bodyFormLabel.appendChild(bodyFormSelect)
    el.appendChild(bodyFormLabel)

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
    fillWeaponSelect(weaponSelect, false, bodyFormOf(undefined))

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
    fillWeaponSelect(offhandSelect, true, bodyFormOf(undefined))
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

    const equipRowEls: Array<{readonly armor: ArmorSlot; readonly limb: LimbSlot; readonly row: HTMLDivElement; readonly armorLabel: HTMLLabelElement; readonly limbLabel: HTMLLabelElement}> = []
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
        equipRowEls.push({armor, limb, row, armorLabel, limbLabel})
    }

    /** 按体形计划的 equipSlots 隐藏不适用装备区域（无对应 kind+bodyPart 的体形整行隐藏） */
    const applyEquipVisibility = (planId: string | undefined): void => {
        const slots = bodyFormOf(planId).equipSlots
        for (const entry of equipRowEls) {
            const hasArmor = slots.some(slot => slot.kind === 'armor' && slot.bodyPart === entry.armor)
            const hasLimb = slots.some(slot => slot.kind === 'limb' && slot.bodyPart === entry.limb)
            entry.armorLabel.style.display = hasArmor ? '' : 'none'
            entry.limbLabel.style.display = hasLimb ? '' : 'none'
            entry.row.style.display = hasArmor || hasLimb ? '' : 'none'
        }
    }

    /* 属性模块：状态类（生命 / 韧性）与属性类（攻击 / 防御 / 移速 / 跳跃高度 / 体型）排成公式行。
       展示形态「结果 | (基础值 + 逐项加值) × 逐项乘区」：结果在前，公式拆解逐项列出来源（如装备名）。
       每行只可编辑「当前值 / 基础值」输入框，加值 / 乘区 / 结果均为基于当前装备选择实时计算的只读文本。 */
    el.appendChild(createSection('character.section.attributes'))

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

    /* 当前选择解析后的护甲 / 肢体（公式的加值取值口径，与运行时 setCombatEquipment 一致） */
    const resolvedArmor = (): ReturnType<typeof resolveArmorLoadout> => resolveArmorLoadout(readArmorLoadout())
    const resolvedLimb = (): ReturnType<typeof resolveLimbLoadout> => resolveLimbLoadout(readLimbLoadout())

    /** 主手武器对指定攻击类别的加值项（武器伤害仅计入其固有攻击类别） */
    const weaponAttackTerms = (category: DamageType): StatTerm[] => {
        const weapon = selectedWeaponOf(weaponSelect)
        if (weapon === undefined || weapon.damageType !== category || weapon.damage <= 0) return []
        return [{name: weaponDisplayName(weapon), value: weapon.damage}]
    }

    /** 属性 / 状态行公式登记表 */
    const statFormulas: StatFormula[] = []
    /* 每个数值组独立成块级行：行内 `label` 连排会撑宽面板遮住左侧实体列表；允许换行以适配窄面板 */
    const formulaRow = (): HTMLDivElement => {
        const row = document.createElement('div')
        row.className = 'dc-row'
        row.style.cssText = 'flex-wrap:wrap'
        el.appendChild(row)
        return row
    }
    /** 在行内追加只读文本片段（公式括号 / 分隔符等），与输入框同字号 / 同前景色 */
    const formulaText = (row: HTMLElement, text: string): HTMLSpanElement => {
        const span = document.createElement('span')
        span.className = 'dc-formula'
        span.textContent = text
        row.appendChild(span)
        return span
    }
    /** 追加只读空文本节点（结果 / 加值 / 乘区），内容由 renderStatFormula 填充 */
    const formulaSlot = (row: HTMLElement): HTMLSpanElement => {
        const span = document.createElement('span')
        span.className = 'dc-formula'
        row.appendChild(span)
        return span
    }
    /** 属性类行前缀：结果槽 + ` | (`（随后由 createLabeledNumberInput 追加基础值输入） */
    const openAttributeRow = (row: HTMLElement): HTMLSpanElement => {
        const head = formulaSlot(row)
        formulaText(row, ' | (')
        return head
    }
    /** 状态类行前缀：` / ` + 最大值结果槽 + ` | (` */
    const openStateRow = (row: HTMLElement): HTMLSpanElement => {
        formulaText(row, ' / ')
        const head = formulaSlot(row)
        formulaText(row, ' | (')
        return head
    }
    /** 行后缀：加值槽 + `)` + 乘区槽（置于基础值输入之后） */
    const closeFormulaRow = (row: HTMLElement): {addendSpan: HTMLSpanElement; mulSpan: HTMLSpanElement} => {
        const addendSpan = formulaSlot(row)
        formulaText(row, ')')
        const mulSpan = formulaSlot(row)
        return {addendSpan, mulSpan}
    }
    /** 登记一行公式：装备 / 武器 / 基础值变更时重算；语言切换自动重译（来源名随语言更新） */
    const registerFormula = (
        row: HTMLElement,
        base: HTMLInputElement,
        addends: () => readonly StatTerm[],
        multipliers: () => readonly StatTerm[],
        head: HTMLElement,
        tail: {addendSpan: HTMLElement; mulSpan: HTMLElement},
    ): void => {
        const entry: StatFormula = {base, addends, multipliers, head, addendSpan: tail.addendSpan, mulSpan: tail.mulSpan}
        statFormulas.push(entry)
        localizeApply(row, () => { renderStatFormula(entry) })
    }

    /* 生命：当前值 / 最大值 | (基础值 + 加值) × 乘区（角色暂无装备生命加成：加值 / 乘区为空） */
    const hpRow = formulaRow()
    const curHP = createLabeledNumberInput(hpRow, 'character.cur_hp', {min: '0', step: '1', value: '15'})
    const hpHead = openStateRow(hpRow)
    const maxHP = createLabeledNumberInput(hpRow, 'character.base_hp', {min: '1', step: '1', value: '15'})
    registerFormula(hpRow, maxHP, () => [], () => [], hpHead, closeFormulaRow(hpRow))

    /* 韧性：当前值 / 最大值 | (基础值 + 装备韧性加值) × 乘区 */
    const poiseRow = formulaRow()
    const poiseInput = createLabeledNumberInput(poiseRow, 'character.cur_poise', {min: '0', step: '1', value: '20'})
    const poiseHead = openStateRow(poiseRow)
    const poiseMaxInput = createLabeledNumberInput(poiseRow, 'character.base_poise', {min: '1', step: '1', value: '20'})
    registerFormula(poiseRow, poiseMaxInput, () => poiseTermsOf(resolvedArmor(), resolvedLimb()), () => [], poiseHead, closeFormulaRow(poiseRow))

    /* 攻击：结果 | (基础值 + 主手武器伤害 + 装备攻击加成) × 乘区（逐类别一行） */
    const atkPhysRow = formulaRow()
    const atkPhysHead = openAttributeRow(atkPhysRow)
    const baseAtkPhys = createLabeledNumberInput(atkPhysRow, 'character.base_atk_phys', {min: '0', step: '1', value: '0'})
    registerFormula(atkPhysRow, baseAtkPhys, () => [...weaponAttackTerms('physical'), ...attackTermsOf('physical', resolvedArmor(), resolvedLimb())], () => [], atkPhysHead, closeFormulaRow(atkPhysRow))
    const atkMagicRow = formulaRow()
    const atkMagicHead = openAttributeRow(atkMagicRow)
    const baseAtkMagic = createLabeledNumberInput(atkMagicRow, 'character.base_atk_magic', {min: '0', step: '1', value: '0'})
    registerFormula(atkMagicRow, baseAtkMagic, () => [...weaponAttackTerms('magic'), ...attackTermsOf('magic', resolvedArmor(), resolvedLimb())], () => [], atkMagicHead, closeFormulaRow(atkMagicRow))

    /* 防御：结果 | (基础值 + 装备防御加值) × 乘区（逐类别一行） */
    const defPhysRow = formulaRow()
    const defPhysHead = openAttributeRow(defPhysRow)
    const baseDefPhys = createLabeledNumberInput(defPhysRow, 'character.base_def_phys', {min: '0', step: '1', value: '0'})
    registerFormula(defPhysRow, baseDefPhys, () => defenseTermsOf('physical', resolvedArmor(), resolvedLimb()), () => [], defPhysHead, closeFormulaRow(defPhysRow))
    const defMagicRow = formulaRow()
    const defMagicHead = openAttributeRow(defMagicRow)
    const baseDefMagic = createLabeledNumberInput(defMagicRow, 'character.base_def_magic', {min: '0', step: '1', value: '0'})
    registerFormula(defMagicRow, baseDefMagic, () => defenseTermsOf('magic', resolvedArmor(), resolvedLimb()), () => [], defMagicHead, closeFormulaRow(defMagicRow))

    /* 移速：结果 | (基础值) × 装备移速乘区（装备为乘数而非加值） */
    const speedRow = formulaRow()
    const speedHead = openAttributeRow(speedRow)
    const speed = createLabeledNumberInput(speedRow, 'character.base_move_speed', {min: '0.1', step: '0.1', value: '6'})
    registerFormula(speedRow, speed, () => [], () => moveSpeedTermsOf(resolvedArmor(), resolvedLimb()), speedHead, closeFormulaRow(speedRow))

    /* 跳跃高度 / 体型：结果 = 基础值（无加值 / 乘区） */
    const jumpRow = formulaRow()
    const jumpHead = openAttributeRow(jumpRow)
    const jumpH = createLabeledNumberInput(jumpRow, 'character.base_jump_height', {min: '0.1', step: '0.1', value: '2'})
    registerFormula(jumpRow, jumpH, () => [], () => [], jumpHead, closeFormulaRow(jumpRow))
    const scaleRow = formulaRow()
    const scaleHead = openAttributeRow(scaleRow)
    const scale = createLabeledNumberInput(scaleRow, 'character.base_scale', {min: '0.1', step: '0.1', value: '1'})
    registerFormula(scaleRow, scale, () => [], () => [], scaleHead, closeFormulaRow(scaleRow))

    /** 重算所有公式行的只读文本（装备 / 武器选择 / 基础值输入变更时调用） */
    const refreshStatFormulas = (): void => {
        for (const entry of statFormulas) renderStatFormula(entry)
    }

    /* 韧性 / 倒地属性：受击后延迟回充参数 + 倒地/起身时长（逐项独立成块级行，避免行内连排撑宽面板） */
    const blockRow = (): HTMLDivElement => {
        const row = document.createElement('div')
        el.appendChild(row)
        return row
    }
    const poiseRegenDelayInput = createLabeledNumberInput(blockRow(), 'character.poise_regen_delay', {min: '0', step: '0.1', value: '1'})
    const poiseRegenRateInput = createLabeledNumberInput(blockRow(), 'character.poise_regen_rate', {min: '0', step: '1', value: '8'})
    const knockdownDurationInput = createLabeledNumberInput(blockRow(), 'character.knockdown_duration', {min: '0', step: '0.1', value: '1.4'})
    const getUpDurationInput = createLabeledNumberInput(blockRow(), 'character.get_up_duration', {min: '0', step: '0.1', value: '1.2'})

    /* 装备 / 武器下拉与基础值输入变更即时重算公式（武器决定攻击行的加值项） */
    for (const slot of ARMOR_SLOTS) armorSelects[slot].onchange = refreshStatFormulas
    for (const slot of LIMB_SLOTS) limbSelects[slot].onchange = refreshStatFormulas
    weaponSelect.addEventListener('change', refreshStatFormulas)
    offhandSelect.addEventListener('change', refreshStatFormulas)
    for (const entry of statFormulas) entry.base.addEventListener('input', refreshStatFormulas)

    /** 读取基础防御（负值/空值安全回退 0） */
    const readBaseDefense = (): DefenseProfile => ({
        physical: Math.max(0, parseFloat(baseDefPhys.value) || 0),
        magic: Math.max(0, parseFloat(baseDefMagic.value) || 0),
    })

    /** 读取基础攻击加成（负值/空值安全回退 0） */
    const readBaseAttack = (): DamageTypeProfile => ({
        physical: Math.max(0, parseFloat(baseAtkPhys.value) || 0),
        magic: Math.max(0, parseFloat(baseAtkMagic.value) || 0),
    })

    /* 动态字段（坐标 / 朝向 / 当前生命 / 当前韧性）：逐帧实时同步运行时状态；
       用户一旦编辑即标记为「待应用」，在 Apply 或重新渲染前跳过刷新，避免覆盖尚未提交的输入 */
    const dirtyDynamic = new Set<HTMLInputElement>()
    for (const input of [posX, posY, posZ, facingDeg, curHP, poiseInput]) {
        input.addEventListener('input', () => dirtyDynamic.add(input))
    }

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

    /* 行为原点策略下拉框 + 漫游者更新间隔（同处一行） */
    const originRow = document.createElement('div')
    originRow.className = 'dc-row'
    const originLabel = document.createElement('label')
    originLabel.className = 'dc-label'
    appendLocalizedText(originLabel, 'character.origin_label')
    originLabel.appendChild(document.createTextNode(' '))
    const originSelect = document.createElement('select')
    originSelect.className = 'dc-select'
    for (const s of ORIGIN_SUB_STRATEGIES) {
        const o = document.createElement('option')
        o.value = s
        localizeText(o, ORIGIN_LABELS[s])
        originSelect.appendChild(o)
    }
    originLabel.appendChild(originSelect)
    originRow.appendChild(originLabel)
    /* 更新间隔与原点策略同排（仅 roamer 策略可见，隐藏时仅收起该 label 而非整行） */
    const originIntervalInput = createLabeledNumberInput(originRow, 'character.origin.interval', {min: '1', step: '1', value: '20'})
    el.appendChild(originRow)

    /* 当前行为原点坐标（只读展示：随策略迁移实时刷新） */
    const originCoordsTag = document.createElement('div')
    originCoordsTag.id = 'origin-coords'
    originCoordsTag.className = 'dc-hint'
    originCoordsTag.style.cssText = 'margin-bottom:4px;white-space:pre-line'
    el.appendChild(originCoordsTag)

    /* 追击活动半径输入 */
    const chaseRadiusRow = document.createElement('div')
    chaseRadiusRow.className = 'dc-row'
    el.appendChild(chaseRadiusRow)
    const chaseRadiusInput = createLabeledNumberInput(chaseRadiusRow, 'character.chase_radius_label', {min: '0', step: '1', value: '20'})

    /* AI 反应式举盾窗口 / 冷却（仅非玩家 AI） */
    const blockReactionRow = document.createElement('div')
    blockReactionRow.className = 'dc-row'
    el.appendChild(blockReactionRow)
    const aiBlockDurationInput = createLabeledNumberInput(blockReactionRow, 'character.ai_block_duration_label', {min: '0.1', step: '0.1', value: '0.4'})
    const aiBlockCooldownInput = createLabeledNumberInput(blockReactionRow, 'character.ai_block_cooldown_label', {min: '0.1', step: '0.1', value: '1.2'})

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

    /* 原点策略区显隐：玩家隐藏整组；漫游者间隔仅 roamer 策略展示；原点坐标随之显隐 */
    const applyOriginVisibility = (originStrategy: string, isPlayer: boolean): void => {
        originRow.style.display = isPlayer ? 'none' : ''
        originIntervalInput.parentElement!.style.display = (!isPlayer && originStrategy === 'roamer') ? '' : 'none'
        originCoordsTag.style.display = isPlayer ? 'none' : ''
        chaseRadiusInput.parentElement!.style.display = isPlayer ? 'none' : ''
        blockReactionRow.style.display = isPlayer ? 'none' : ''
    }

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    peaceSelect.onchange = () => {
        applyBuildVisibility(peaceSelect.value, playerCheck.checked)
    }

    originSelect.onchange = () => {
        applyOriginVisibility(originSelect.value, playerCheck.checked)
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
        const name = weaponDisplayName(weapon)
        return weapon.type === 'ranged'
            ? [name, ...rangedModeTags(weapon)].join('  ') + damageTypeLabel
            : name + damageTypeLabel
    }

    /** 当前攻击段标签文本（武器名 · 段名 / 待机；随语言切换重译） */
    const renderAttackSegmentTag = (): string => {
        const sel = getSelected()
        if (sel === undefined) return ''
        const name = weaponDisplayName(sel.combat.weapon)
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

    /* 运行时箱型配置缓存（preset 为字符串，提交时经 isBoxPresetId 校验） */
    let cachedBoxTypes: Array<{
        preset: string
        probability: string
        minWidth: string; maxWidth: string
        minHeight: string; maxHeight: string
        minDepth: string; maxDepth: string
        mass: string; friction: string
    }> = []

    const refreshBoxTypeList = (): void => {
        boxTypesContainer.innerHTML = ''
        for (let i = 0; i < cachedBoxTypes.length; i++) {
            const bt = cachedBoxTypes[i]
            const row = document.createElement('div')
            row.className = 'dc-row'
            row.style.cssText = 'gap:4px;font-size:11px;padding:2px 0;cursor:pointer'
            row.textContent = `${presetDisplayName(bt.preset)} (${bt.probability}) ${bt.minWidth}-${bt.maxWidth}×${bt.minHeight}-${bt.maxHeight}×${bt.minDepth}-${bt.maxDepth}`
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
        detailTitle.textContent = translate({key: 'character.detail_edit_title', args: [presetDisplayName(bt.preset)]})
        detailFields.innerHTML = ''
        /* 特性预设下拉：选项为全部预设；非法 / 未知值不预选 */
        const presetRow = document.createElement('div')
        presetRow.className = 'dc-row'
        presetRow.style.cssText = 'gap:4px;margin:2px 0'
        const presetLbl = document.createElement('span')
        presetLbl.textContent = translate('character.field.preset')
        presetLbl.className = 'dc-label'
        presetLbl.style.cssText = 'font-size:11px;width:100px'
        const presetSel = document.createElement('select')
        presetSel.className = 'dc-select'
        presetSel.style.cssText = 'font-size:11px'
        for (const preset of BOX_PRESET_IDS) {
            const opt = document.createElement('option')
            opt.value = preset
            localizeText(opt, BOX_PRESET_LABEL_KEYS[preset])
            presetSel.appendChild(opt)
        }
        presetSel.value = isBoxPresetId(bt.preset) ? bt.preset : ''
        presetSel.onchange = () => { bt.preset = presetSel.value; refreshBoxTypeList() }
        presetRow.appendChild(presetLbl); presetRow.appendChild(presetSel)
        detailFields.appendChild(presetRow)
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
        addField('character.field.probability', 'probability')
        addField('character.field.min_w', 'minWidth'); addField('character.field.max_w', 'maxWidth')
        addField('character.field.min_h', 'minHeight'); addField('character.field.max_h', 'maxHeight')
        addField('character.field.min_d', 'minDepth'); addField('character.field.max_d', 'maxDepth')
        addField('character.field.mass', 'mass')
        addField('character.field.friction', 'friction')
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
            preset: 'common', probability: '0',
            minWidth: '0.5', maxWidth: '2',
            minHeight: '0.5', maxHeight: '2',
            minDepth: '0.5', maxDepth: '2',
            mass: '1', friction: '0.3',
        })
        refreshBoxTypeList()
    }

    /** 刷新当前行为原点坐标展示（玩家或 AI 未激活时留空） */
    const refreshOriginValue = (sel: CharacterEntity | undefined): void => {
        const origin = sel ? ctx.getOrigin?.(sel.id) : undefined
        originCoordsTag.textContent = origin
            ? `${translate('character.origin.current')}: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)})`
            : ''
    }

    /** 逐帧刷新动态字段：仅跳过当前聚焦的输入框，其余实时同步运行时状态（坐标 / 朝向 / 当前生命 / 当前韧性 / 原点） */
    const refreshLiveValues = (): void => {
        const sel = getSelected()
        if (!sel) {
            originCoordsTag.textContent = ''
            return
        }
        const focus = document.activeElement
        const setIfUnfocused = (input: HTMLInputElement, value: string): void => {
            if (input !== focus && !dirtyDynamic.has(input)) input.value = value
        }
        setIfUnfocused(posX, sel.mesh.position.x.toFixed(2))
        setIfUnfocused(posY, sel.mesh.position.y.toFixed(2))
        setIfUnfocused(posZ, sel.mesh.position.z.toFixed(2))
        setIfUnfocused(facingDeg, String(Math.round(ctx.getFacing?.(sel.id) ?? 0)))
        setIfUnfocused(curHP, formatNumber(sel.combat.health))
        setIfUnfocused(poiseInput, formatNumber(sel.combat.poise))
        refreshOriginValue(sel)
    }

    /** 刷新全部配置字段（仅 render 时调用一次） */
    const refreshFullConfig = (): void => {
        const sel = getSelected()
        if (!sel) return
        /* 重新回显即清除「待应用」标记：面板显示值与运行时状态重新对齐 */
        dirtyDynamic.clear()

        speed.value = String(sel.config.speed)
        jumpH.value = String(sel.config.jumpHeight)
        scale.value = String(sel.config.scale)
        handednessSelect.value = humanoidBodyStateOf(sel.bodyState).handedness
        bodyFormSelect.value = bodyFormOf(sel.config.bodyFormId).id
        applyEquipVisibility(sel.config.bodyFormId)

        maxHP.value = String(sel.combat.maxHealth)
        curHP.value = String(sel.combat.health)
        faction.value = String(sel.combat.faction)
        tendSelect.value = sel.combat.tendencyConfig.tendencyId
        targetFactionsInput.value = sel.combat.tendencyConfig.targetFactions?.join(',') ?? ''
        showTargetFactions()

        /* 攻击区：装备武器 + 数值覆写（类型由武器决定，动作时长由武器模组决定，均不在面板暴露）。
         * 按当前体形重建武器选项（天然类别仅其所属体形可选）。 */
        const form = bodyFormOf(sel.config.bodyFormId)
        fillWeaponSelect(weaponSelect, false, form)
        fillWeaponSelect(offhandSelect, true, form)
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
        holdModeSelect.value = humanoidBodyStateOf(sel.bodyState).holdMode

        /* 护甲 / 肢体与防御回显：无效 / 槽位不匹配的存档 id 显示为「无」（下拉中不存在该选项时选回空槽） */
        for (const slot of ARMOR_SLOTS) {
            const piece = findArmorPreset(sel.combat.equipment.armor[slot])
            armorSelects[slot].value = piece !== undefined && piece.slot === slot ? piece.id : ''
        }
        for (const slot of LIMB_SLOTS) {
            const piece = findLimbPreset(sel.combat.equipment.limb[slot])
            limbSelects[slot].value = piece !== undefined && piece.slot === slot ? piece.id : ''
        }
        baseDefPhys.value = formatNumber(sel.combat.baseDefense.physical)
        baseDefMagic.value = formatNumber(sel.combat.baseDefense.magic)
        baseAtkPhys.value = formatNumber(sel.combat.baseAttack.physical)
        baseAtkMagic.value = formatNumber(sel.combat.baseAttack.magic)
        poiseMaxInput.value = formatNumber(sel.combat.basePoiseMax)
        poiseInput.value = formatNumber(sel.combat.poise)
        poiseRegenDelayInput.value = formatNumber(sel.combat.poiseRegenDelay)
        poiseRegenRateInput.value = formatNumber(sel.combat.poiseRegenPerSec)
        knockdownDurationInput.value = formatNumber(sel.combat.knockdownDuration)
        getUpDurationInput.value = formatNumber(sel.combat.getUpDuration)
        refreshStatFormulas()

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
        originSelect.value = sel.originStrategy
        originIntervalInput.value = formatNumber(sel.originInterval)
        chaseRadiusInput.value = formatNumber(sel.chaseLeashRadius)
        aiBlockDurationInput.value = formatNumber(sel.aiBlockDuration)
        aiBlockCooldownInput.value = formatNumber(sel.aiBlockCooldown)
        aiSection.style.display = sel.isPlayer ? 'none' : ''
        peaceRow.style.display = sel.isPlayer ? 'none' : ''
        combatRow.style.display = sel.isPlayer ? 'none' : ''
        navRow.style.display = sel.isPlayer ? 'none' : ''
        applyBuildVisibility(sel.peaceStrategy, sel.isPlayer)
        applyOriginVisibility(sel.originStrategy, sel.isPlayer)
        refreshOriginValue(sel)
        showRanged()
        showCharge()
    }

    return {
        render: (container: HTMLElement) => {
            const sel = getSelected()
            if (!sel) return
            container.appendChild(el)
            el.style.display = 'block'

            refreshLiveValues()
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
                applyOriginVisibility(originSelect.value, isPlayer)
                ctx.setNavEnabled?.(cur.id, navCheck.checked)
                const peaceStrat = peaceSelect.value
                if (isPeaceSubStrategy(peaceStrat)) {
                    ctx.setPeaceStrategy?.(cur.id, peaceStrat)
                }
                const combatStrat = combatSelect.value
                if (isCombatSubStrategy(combatStrat)) {
                    ctx.setCombatStrategy?.(cur.id, combatStrat)
                }
                /* 行为原点策略：切换时按策略复位原点（见 world.setOriginStrategy） */
                const originStrat = originSelect.value
                if (isOriginSubStrategy(originStrat)) {
                    ctx.setOriginStrategy?.(cur.id, originStrat)
                }
                const originInterval = parseFloat(originIntervalInput.value)
                if (!isNaN(originInterval) && originInterval > 0) ctx.setOriginInterval?.(cur.id, originInterval)
                const chaseRadius = parseFloat(chaseRadiusInput.value)
                if (!isNaN(chaseRadius) && chaseRadius > 0) ctx.setChaseLeashRadius?.(cur.id, chaseRadius)
                const aiBlockDuration = parseFloat(aiBlockDurationInput.value)
                if (!isNaN(aiBlockDuration) && aiBlockDuration > 0) ctx.setAIBlockDuration?.(cur.id, aiBlockDuration)
                const aiBlockCooldown = parseFloat(aiBlockCooldownInput.value)
                if (!isNaN(aiBlockCooldown) && aiBlockCooldown > 0) ctx.setAIBlockCooldown?.(cur.id, aiBlockCooldown)
                /* 持久化建造配置：仅保留预设合法的条目（非法预设跳过，避免写入脏数据） */
                if (peaceStrat === 'build') {
                    const boxTypes: BoxSpawnEntry[] = []
                    for (const bt of cachedBoxTypes) {
                        if (!isBoxPresetId(bt.preset)) continue
                        boxTypes.push({
                            preset: bt.preset,
                            probability: parseFloat(bt.probability) || 0,
                            minWidth: parseFloat(bt.minWidth) || 0.5,
                            maxWidth: parseFloat(bt.maxWidth) || 2,
                            minHeight: parseFloat(bt.minHeight) || 0.5,
                            maxHeight: parseFloat(bt.maxHeight) || 2,
                            minDepth: parseFloat(bt.minDepth) || 0.5,
                            maxDepth: parseFloat(bt.maxDepth) || 2,
                            mass: parseFloat(bt.mass) || 1,
                            friction: parseFloat(bt.friction) || 0.3,
                        })
                    }
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
                /* 护甲 / 肢体装备在本次 Apply 中读取一次，供防御重算与韧性上界换算共用 */
                const armorLoadout = readArmorLoadout()
                const limbLoadout = readLimbLoadout()
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
                /* 体形切换：先按所选基础模组运行时重构（骨架 / 外观 / 碰撞 / 装备槽），再应用其余配置 */
                ctx.setBodyForm?.(cur.id, bodyFormSelect.value)
                /* 立即按新体形刷新装备区域可见性（不等下次回显） */
                applyEquipVisibility(bodyFormSelect.value)
                const handednessValue = handednessSelect.value
                ctx.updateCharacterConfig?.(cur.id, {
                    speed: parseFloat(speed.value),
                    jumpHeight: parseFloat(jumpH.value),
                    scale: parseFloat(scale.value),
                    ...(isHandedness(handednessValue) ? {bodyState: {...cur.bodyState, handedness: handednessValue}} : {}),
                    ...poiseCfg,
                }, newAttack, parseFloat(faction.value), parseFloat(maxHP.value), buildTendencyConfig(), parseFloat(curHP.value), {
                    baseDefense: readBaseDefense(),
                    baseAttack: readBaseAttack(),
                    equipment: {
                        limb: limbLoadout,
                        weapon: {
                            ...Object.fromEntries(Object.entries(cur.combat.equipment.weapon).filter(([key]) => key !== 'main_hand' && key !== 'off_hand')),
                            main_hand: newAttack.weaponId,
                            ...(newOffhand !== null ? {off_hand: newOffhand.weaponId} : {}),
                        },
                        armor: armorLoadout,
                    },
                }, newOffhand)
                /* 当前韧性：0..最大韧性（换装导致上界变化时由 setPoise 夹取） */
                const poiseValue = parseFloat(poiseInput.value)
                if (!isNaN(poiseValue)) ctx.setPoise?.(cur.id, poiseValue)
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
                    baseAtkPhys.value = formatNumber(updated.combat.baseAttack.physical)
                    baseAtkMagic.value = formatNumber(updated.combat.baseAttack.magic)
                    poiseMaxInput.value = formatNumber(updated.combat.basePoiseMax)
                    poiseInput.value = formatNumber(updated.combat.poise)
                    refreshStatFormulas()
                }
                /* 应用后清除「待应用」标记，动态字段恢复逐帧实时刷新 */
                dirtyDynamic.clear()
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
        update: refreshLiveValues,
    }
}
