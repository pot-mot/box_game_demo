import type {PanelContext} from '../../box/base/ui'
import type {CharacterEntitySystem} from '../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {TendencyConfig, TendencyId} from '../../../character/faction.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import type {WeaponConfig, WeaponType} from '../../../character/weapon/catalog.ts'
import {ALL_WEAPON_PRESETS, findWeaponPreset} from '../../../character/weapon/catalog.ts'
import type {RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
import {chainOf, segmentDisplayName, type WeaponAttacks} from '../../../character/weapon/attack_chain.ts'
import {isPeaceSubStrategy, isCombatSubStrategy, PEACE_SUB_STRATEGIES, BUILDABLE_BOX_TYPES, type BuildableBoxType} from '../../../character/ai_strategy/types.ts'

/** 下拉项：武器 id（option.value）+ 所属类型（option.dataset.weaponType，用于收窄类型） */
interface WeaponOption {
    readonly id: string
    readonly type: WeaponType
    readonly label: string
}

/** 近战武器中文名（optgroup 标签） */
const WEAPON_GROUP_LABEL_MELEE = '近战武器'
/** 远程武器中文名（optgroup 标签） */
const WEAPON_GROUP_LABEL_RANGED = '远程武器'

/** 武器预设 → 下拉项文案（远程附带模式标记，便于区分特殊弹道） */
const describeWeapon = (w: WeaponConfig): string => {
    if (w.type === 'melee') return `${w.name} (dmg:${w.damage})`
    const tags: string[] = []
    if (w.spreadCount !== undefined) tags.push(`散射×${w.spreadCount}`)
    if (w.explosionRadius !== undefined) tags.push(`爆炸 R:${w.explosionRadius}`)
    if (w.homingStrength !== undefined) tags.push(`追踪 S:${w.homingStrength}`)
    if (w.throwAngle !== undefined) tags.push(`抛物线:${(w.throwAngle * 180 / Math.PI).toFixed(0)}°`)
    return `${w.name} (dmg:${w.damage} rng:${w.range})${tags.length > 0 ? ` [${tags.join(' ')}]` : ''}`
}

/** 武器下拉按近战/远程分组（类型由所选武器决定，因此不再有独立「攻击类型」选择器） */
const buildWeaponOptions = (): {melee: readonly WeaponOption[]; ranged: readonly WeaponOption[]} => {
    const melee: WeaponOption[] = []
    const ranged: WeaponOption[] = []
    for (const preset of ALL_WEAPON_PRESETS) {
        const option: WeaponOption = {id: preset.id, type: preset.type, label: describeWeapon(preset)}
        if (preset.type === 'melee') melee.push(option)
        else ranged.push(option)
    }
    return {melee, ranged}
}

/** 武器下拉数据（模块级构建一次：预设为静态数据） */
const WEAPON_OPTIONS = buildWeaponOptions()

/** 面板攻击区可见字段 */
interface AttackFields {
    readonly atkRange: HTMLInputElement
    readonly atkDmg: HTMLInputElement
    readonly atkCD: HTMLInputElement
    readonly bulletSpeed: HTMLInputElement
    readonly bulletKB: HTMLInputElement
    readonly bulletLife: HTMLInputElement
    readonly weaponTag: HTMLElement
}

/** 数字转输入框文本（避免 3.0000000000000004 之类的浮点尾巴） */
const formatNumber = (value: number): string => String(Number(value.toFixed(4)))

/** 起手段冷却：取轻击链首段（角色的冷却覆写落在段定义上） */
const entryCooldownOfAttacks = (attacks: WeaponAttacks): number => {
    const entryId = chainOf(attacks, 'light').entries[0]?.segmentId
    return entryId === undefined ? 0 : (attacks.segments[entryId]?.cooldown ?? 0)
}

/** 武器预设的起手段冷却（换武器预填用） */
const entryCooldownOf = (weapon: WeaponConfig): number => entryCooldownOfAttacks(weapon.attacks)

/** 远程武器特殊模式文案（散射 / 爆炸 / 追踪 / 抛物线） */
const rangedModeTags = (weapon: RangedWeaponConfig): readonly string[] => {
    const tags: string[] = []
    if (weapon.spreadCount !== undefined) tags.push(`散射 ×${weapon.spreadCount}`)
    if (weapon.explosionRadius !== undefined) tags.push(`爆炸 R:${weapon.explosionRadius}`)
    if (weapon.homingStrength !== undefined) tags.push(`追踪 S:${weapon.homingStrength}`)
    if (weapon.throwAngle !== undefined) tags.push(`抛物线:${(weapon.throwAngle * 180 / Math.PI).toFixed(0)}°`)
    return tags
}

/** 换武器时按武器预设预填数值覆写字段（冷却取起手段预设冷却；远程弹道仅在远程武器时展示） */
const autoFillFromWeapon = (weaponId: string, fields: AttackFields): void => {
    const weapon = findWeaponPreset(weaponId)
    if (weapon === undefined) return
    fields.atkDmg.value = formatNumber(weapon.damage)
    fields.atkCD.value = formatNumber(entryCooldownOf(weapon))
    if (weapon.type === 'ranged') {
        fields.weaponTag.textContent = [weapon.name, ...rangedModeTags(weapon)].join('  ')
        fields.atkRange.value = formatNumber(weapon.range)
        fields.bulletSpeed.value = formatNumber(weapon.projectileSpeed)
        fields.bulletKB.value = formatNumber(weapon.knockbackForce)
        fields.bulletLife.value = formatNumber(weapon.projectileLifetime)
    } else {
        fields.weaponTag.textContent = weapon.name
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
    readonly ranged?: {readonly range: number; readonly bulletSpeed: number; readonly bulletKnockback: number; readonly bulletLifetime: number}
} => {
    const weapon = sel.combat.weapon
    const cooldown = entryCooldownOfAttacks(sel.combat.attacks)
    if (weapon.type === 'ranged') {
        return {
            weaponId: weapon.id,
            damage: weapon.damage,
            cooldown,
            ranged: {
                range: weapon.range,
                bulletSpeed: weapon.projectileSpeed,
                bulletKnockback: weapon.knockbackForce,
                bulletLifetime: weapon.projectileLifetime,
            },
        }
    }
    return {weaponId: weapon.id, damage: weapon.damage, cooldown}
}

export const createCharacterPanel = (ctx: Omit<CharacterEntitySystem, 'panel'>): PanelContext => {
    const el = document.createElement('div')
    el.id = 'character-panel'
    el.style.cssText = [
        'position: fixed; bottom: 24px; right: 24px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 16px 20px;',
        'border-radius: 10px; min-width: 260px;',
        'user-select: none; display: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px'
    header.textContent = 'Character Control'
    el.appendChild(header)

    el.appendChild(createSection('Position'))
    const posX = createLabeledNumberInput(el, 'X', {step: '0.01'})
    const posY = createLabeledNumberInput(el, 'Y', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'Z', {step: '0.01'})
    const facingDeg = createLabeledNumberInput(el, 'Facing°', {min: '0', max: '360', step: '1', value: '0'})

    el.appendChild(createSection('Config'))
    const speed = createLabeledNumberInput(el, 'Speed', {min: '0.1', step: '0.1', value: '6'})
    const jumpH = createLabeledNumberInput(el, 'JumpH', {min: '0.1', step: '0.1', value: '2'})
    const scale = createLabeledNumberInput(el, 'Scale', {min: '0.1', step: '0.1', value: '1'})

    el.appendChild(createSection('Faction'))
    const faction = createLabeledNumberInput(el, 'Faction', {min: '0', step: '1', value: '0'})
    const tendencyLabel = document.createElement('label')
    tendencyLabel.textContent = 'Tendency '
    const tendSelect = document.createElement('select')
    const TENDENCY_OPTIONS: ReadonlyArray<{value: TendencyId; label: string}> = [
        {value: 'hostileAll', label: 'Hostile All'},
        {value: 'hostileExceptSelf', label: 'Hostile Except Self'},
        {value: 'hostileTo', label: 'Hostile To...'},
        {value: 'hostileExcept', label: 'Hostile Except...'},
        {value: 'pacifist', label: 'Pacifist'},
    ]
    for (const opt of TENDENCY_OPTIONS) {
        const o = document.createElement('option')
        o.value = opt.value; o.textContent = opt.label
        tendSelect.appendChild(o)
    }
    tendencyLabel.appendChild(tendSelect)
    el.appendChild(tendencyLabel)

    const targetFactionsLabel = document.createElement('label')
    targetFactionsLabel.textContent = 'TargetFactions '
    targetFactionsLabel.style.cssText = 'display:none'
    const targetFactionsInput = document.createElement('input')
    targetFactionsInput.type = 'text'
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

    /* 武器下拉：近战/远程同列并按 optgroup 分组；攻击类型由所选武器决定，故不再有类型选择器 */
    el.appendChild(createSection('Attack'))
    const atkRow = document.createElement('div')
    atkRow.style.cssText = 'display:flex;gap:8px;align-items:center'
    const weaponSelectLabel = document.createElement('label')
    weaponSelectLabel.textContent = 'Wpn '
    const weaponSelect = document.createElement('select')
    weaponSelect.style.cssText = 'max-width:180px'
    weaponSelectLabel.appendChild(weaponSelect)
    atkRow.appendChild(weaponSelectLabel)
    el.appendChild(atkRow)
    const attackSegmentTag = document.createElement('div')
    attackSegmentTag.style.cssText = 'font-size:11px;color:#aaa;margin-top:2px'
    el.appendChild(attackSegmentTag)
    for (const group of [{label: WEAPON_GROUP_LABEL_MELEE, options: WEAPON_OPTIONS.melee}, {label: WEAPON_GROUP_LABEL_RANGED, options: WEAPON_OPTIONS.ranged}]) {
        const optGroup = document.createElement('optgroup')
        optGroup.label = group.label
        for (const opt of group.options) {
            const o = document.createElement('option')
            o.value = opt.id
            o.dataset.weaponType = opt.type
            o.textContent = opt.label
            optGroup.appendChild(o)
        }
        weaponSelect.appendChild(optGroup)
    }

    const weaponTag = document.createElement('div')
    weaponTag.style.cssText = 'font-size:11px;color:#aaa;margin-top:2px;margin-bottom:4px'
    el.appendChild(weaponTag)

    const atkRange = createLabeledNumberInput(el, 'Range', {min: '0.1', step: '0.1', value: '10'})
    const atkDmg = createLabeledNumberInput(el, 'Damage', {min: '0.1', step: '0.1', value: '3'})
    const atkCD = createLabeledNumberInput(el, 'Cooldown', {min: '0.1', step: '0.1', value: '0.5'})
    el.appendChild(document.createElement('br'))
    const bulletSpeed = createLabeledNumberInput(el, 'BulSpd', {min: '1', step: '1', value: '20'})
    const bulletKB = createLabeledNumberInput(el, 'BulKnock', {min: '0', step: '0.5', value: '3'})
    const bulletLife = createLabeledNumberInput(el, 'BulLife', {min: '0.5', step: '0.5', value: '3'})

    /** 攻击区字段集合（预填与回显共用） */
    const attackFields: AttackFields = {atkRange, atkDmg, atkCD, bulletSpeed, bulletKB, bulletLife, weaponTag}

    el.appendChild(createSection('Health'))
    const maxHP = createLabeledNumberInput(el, 'MaxHP', {min: '1', step: '1', value: '15'})
    const curHP = createLabeledNumberInput(el, 'CurHP', {min: '0', step: '1', value: '15'})

    el.appendChild(createSection('Player'))
    const playerRow = document.createElement('div')
    playerRow.style.cssText = 'display:flex;gap:8px;align-items:center'
    const playerCheck = document.createElement('input')
    playerCheck.type = 'checkbox'
    playerCheck.id = 'chk-player'
    const playerLabel = document.createElement('label')
    playerLabel.htmlFor = 'chk-player'
    playerLabel.textContent = ' Mark as Player'
    playerLabel.style.cssText = 'cursor:pointer'
    playerRow.appendChild(playerCheck)
    playerRow.appendChild(playerLabel)
    el.appendChild(playerRow)

    /* AI 策略区（仅非玩家角色可见） */
    const aiSection = createSection('AI Strategy')
    el.appendChild(aiSection)

    /* 和平策略下拉框 */
    const peaceRow = document.createElement('div')
    peaceRow.style.cssText = 'display:flex;gap:8px;align-items:center'
    const peaceLabel = document.createElement('label')
    peaceLabel.textContent = 'Peace '
    const peaceSelect = document.createElement('select')
    for (const s of PEACE_SUB_STRATEGIES) {
        const o = document.createElement('option')
        o.value = s; o.textContent = s === 'patrol' ? 'Patrol' : 'Build'
        peaceSelect.appendChild(o)
    }
    peaceLabel.appendChild(peaceSelect)
    peaceRow.appendChild(peaceLabel)
    el.appendChild(peaceRow)

    /* 战斗策略下拉框 */
    const combatRow = document.createElement('div')
    combatRow.style.cssText = 'display:flex;gap:8px;align-items:center'
    const combatLabel = document.createElement('label')
    combatLabel.textContent = 'Combat '
    const combatSelect = document.createElement('select')
    const COMBAT_OPTIONS: ReadonlyArray<{value: string; label: string}> = [
        {value: 'tactical', label: 'Tactical (default)'},
        {value: 'aggressive', label: 'Aggressive'},
        {value: 'cowardly', label: 'Cowardly'},
    ]
    for (const opt of COMBAT_OPTIONS) {
        const o = document.createElement('option')
        o.value = opt.value; o.textContent = opt.label
        combatSelect.appendChild(o)
    }
    combatLabel.appendChild(combatSelect)
    combatRow.appendChild(combatLabel)
    el.appendChild(combatRow)

    /* 导航感知开关 */
    const navRow = document.createElement('div')
    navRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:4px'
    const navCheck = document.createElement('input')
    navCheck.type = 'checkbox'
    navCheck.id = 'chk-nav'
    const navLabel = document.createElement('label')
    navLabel.htmlFor = 'chk-nav'
    navLabel.textContent = ' Enable Nav Sensing'
    navLabel.style.cssText = 'cursor:pointer'
    navRow.appendChild(navCheck)
    navRow.appendChild(navLabel)
    el.appendChild(navRow)

    /* 建造配置区（仅 build 策略可见） */
    const buildSection = createSection('Build Config')
    el.appendChild(buildSection)
    const buildIntervalInput = createLabeledNumberInput(el, 'Interval(s)', {min: '0.5', step: '0.1', value: '3'})
    const buildBoxTypesLabel = document.createElement('label')
    buildBoxTypesLabel.textContent = 'Box Types '
    buildBoxTypesLabel.style.cssText = 'font-size:12px;color:#aaa'
    el.appendChild(buildBoxTypesLabel)
    el.appendChild(document.createElement('br'))

    /* 箱型概览列表容器 */
    const boxTypesContainer = document.createElement('div')
    boxTypesContainer.style.cssText = 'max-height:120px;overflow-y:auto;margin:4px 0'
    el.appendChild(boxTypesContainer)

    /* 添加箱型按钮 */
    const addBoxTypeBtn = document.createElement('button')
    addBoxTypeBtn.textContent = '+ Add Box Type'
    addBoxTypeBtn.style.cssText = 'font-size:12px;margin-top:4px'
    el.appendChild(addBoxTypeBtn)
    el.appendChild(document.createElement('br'))

    /* 箱型详细配置弹出面板 */
    const detailPanel = document.createElement('div')
    detailPanel.style.cssText = 'display:none;background:rgba(255,255,255,.08);padding:8px;border-radius:6px;margin-top:6px'
    const detailTitle = document.createElement('div')
    detailTitle.style.cssText = 'font-weight:700;font-size:12px;margin-bottom:4px'
    detailPanel.appendChild(detailTitle)
    const detailFields = document.createElement('div')
    detailPanel.appendChild(detailFields)
    el.appendChild(detailPanel)

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    peaceSelect.onchange = () => {
        const show = peaceSelect.value === 'build'
        buildSection.style.display = show ? '' : 'none'
        buildBoxTypesLabel.style.display = show ? '' : 'none'
        boxTypesContainer.style.display = show ? '' : 'none'
        addBoxTypeBtn.style.display = show ? '' : 'none'
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

    weaponSelect.onchange = () => {
        if (weaponSelect.value.length > 0) autoFillFromWeapon(weaponSelect.value, attackFields)
        showRanged()
    }

    const getSelected = (): CharacterEntity | undefined => {
        const id = ctx.getSelectedId()
        if (id === undefined) return undefined
        return ctx.getAll().find(c => c.id === id)
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
            row.style.cssText = 'display:flex;gap:4px;align-items:center;font-size:11px;padding:2px 0;cursor:pointer'
            row.textContent = `${bt.entityType} (${bt.probability}) ${bt.minWidth}-${bt.maxWidth}×${bt.minHeight}-${bt.maxHeight}×${bt.minDepth}-${bt.maxDepth}`
            row.title = '点击编辑详细参数'
            const delBtn = document.createElement('button')
            delBtn.textContent = '×'
            delBtn.style.cssText = 'font-size:10px;padding:0 3px;margin-left:auto'
            delBtn.onclick = (e) => { e.stopPropagation(); cachedBoxTypes.splice(i, 1); refreshBoxTypeList() }
            row.appendChild(delBtn)
            row.onclick = () => showDetail(i)
            boxTypesContainer.appendChild(row)
        }
    }

    const showDetail = (idx: number): void => {
        if (idx < 0 || idx >= cachedBoxTypes.length) { detailPanel.style.display = 'none'; return }
        const bt = cachedBoxTypes[idx]
        detailTitle.textContent = `Edit: ${bt.entityType}`
        detailFields.innerHTML = ''
        const addField = (label: string, key: keyof typeof bt): void => {
            const div = document.createElement('div')
            div.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0'
            const lbl = document.createElement('span')
            lbl.textContent = label; lbl.style.cssText = 'font-size:11px;width:100px'
            const inp = document.createElement('input')
            inp.type = 'text'; inp.style.cssText = 'width:60px;font-size:11px'
            inp.value = String(bt[key] ?? '')
            inp.oninput = () => { (bt as Record<string, string>)[key] = inp.value; refreshBoxTypeList() }
            div.appendChild(lbl); div.appendChild(inp)
            detailFields.appendChild(div)
        }
        addField('EntityType', 'entityType')
        addField('Probability', 'probability')
        addField('Min W', 'minWidth'); addField('Max W', 'maxWidth')
        addField('Min H', 'minHeight'); addField('Max H', 'maxHeight')
        addField('Min D', 'minDepth'); addField('Max D', 'maxDepth')
        addField('Mass', 'mass')
        addField('Friction', 'friction')
        if (bt.entityType === 'box/destruction' || bt.entityType === 'box/burning') {
            addField('MaxHealth', 'maxHealth')
        }
        if (bt.entityType === 'box/magnet') {
            addField('AttrRadius', 'attractionRadius')
            addField('AttrStrength', 'attractionStrength')
        }
        if (bt.entityType === 'box/elasticity') {
            addField('Stiffness', 'stiffness')
            addField('DampingRatio', 'dampingRatio')
            addField('MaxDeformFr', 'maxDeformFraction')
        }
        const closeBtn = document.createElement('button')
        closeBtn.textContent = 'Done'
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
        if (attack.ranged !== undefined) {
            atkRange.value = formatNumber(attack.ranged.range)
            bulletSpeed.value = formatNumber(attack.ranged.bulletSpeed)
            bulletKB.value = formatNumber(attack.ranged.bulletKnockback)
            bulletLife.value = formatNumber(attack.ranged.bulletLifetime)
        }
        const weaponPreset = findWeaponPreset(attack.weaponId)
        weaponTag.textContent = weaponPreset === undefined
            ? ''
            : weaponPreset.type === 'ranged'
                ? [weaponPreset.name, ...rangedModeTags(weaponPreset)].join('  ')
                : weaponPreset.name
        /* 当前攻击段 / 连段信息（不再有槽位与连段索引） */
        const activeSegment = sel.combat.activeSegment
        attackSegmentTag.textContent = activeSegment === undefined
            ? `${sel.combat.weapon.name} · 待机`
            : `${sel.combat.weapon.name} · ${segmentDisplayName(activeSegment)}`

        playerCheck.checked = sel.isPlayer
        peaceSelect.value = sel.peaceStrategy
        combatSelect.value = sel.combatStrategy
        navCheck.checked = sel.navEnabled
        aiSection.style.display = sel.isPlayer ? 'none' : ''
        peaceRow.style.display = sel.isPlayer ? 'none' : ''
        combatRow.style.display = sel.isPlayer ? 'none' : ''
        navRow.style.display = sel.isPlayer ? 'none' : ''
        buildSection.style.display = (!sel.isPlayer && sel.peaceStrategy === 'build') ? '' : 'none'
        showRanged()
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
                buildSection.style.display = (!isPlayer && peaceSelect.value === 'build') ? '' : 'none'
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
                const newAttack: AttackConfig = {
                    weaponId: selectedWeapon?.id ?? weaponSelect.value,
                    ...(isNaN(attackDamage) ? {} : {damage: attackDamage}),
                    ...(isNaN(attackCooldown) ? {} : {cooldown: attackCooldown}),
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
                ctx.updateCharacterConfig?.(cur.id, {
                    speed: parseFloat(speed.value),
                    jumpHeight: parseFloat(jumpH.value),
                    scale: parseFloat(scale.value),
                }, newAttack, parseFloat(faction.value), parseFloat(maxHP.value), buildTendencyConfig(), parseFloat(curHP.value))
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
