import type {PanelContext} from '../../box/base/ui'
import type {CharacterEntitySystem} from '../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {TendencyConfig, TendencyId} from '../../../character/faction.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {MELEE_WEAPON_PRESETS} from '../../../character/weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS, type RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import {RANGED_SKILL_PRESETS} from '../../../character/combat/ranged_skill.ts'
import {isPeaceSubStrategy, isCombatSubStrategy, PEACE_SUB_STRATEGIES, BUILDABLE_BOX_TYPES, type BuildableBoxType} from '../../../character/ai_strategy/types.ts'

const MELEE_WEAPON_OPTIONS = Object.entries(MELEE_WEAPON_PRESETS).map(([key, w]) => ({value: key, label: `${w.id} (dmg:${w.damage} rng:${w.range})`}))
const RANGED_WEAPON_OPTIONS = Object.entries(RANGED_WEAPON_PRESETS).map(([key, w]) => ({
    value: key, label: `${w.id} (dmg:${w.damage} rng:${w.range})${
        w.spreadCount ? ' [Shotgun]' : w.explosionRadius ? ' [Explosion]' : w.homingStrength ? ' [Homing]' : w.throwAngle ? ' [Throw]' : ''
    }`,
}))

const SKILL_MAP: Record<string, {cooldown: number; duration: number} | undefined> = {}
for (const [, s] of Object.entries(MELEE_SKILL_PRESETS)) SKILL_MAP[s.weapon.id] = {cooldown: s.cooldown, duration: s.duration}
for (const [, s] of Object.entries(RANGED_SKILL_PRESETS)) SKILL_MAP[s.weapon.id] = {cooldown: s.cooldown, duration: s.duration}

const autoFillFromWeapon = (weaponId: string, type: 'melee' | 'ranged', fields: {
    atkRange: HTMLInputElement; atkDmg: HTMLInputElement; atkCD: HTMLInputElement; atkDuration: HTMLInputElement
    bulletSpeed: HTMLInputElement; bulletKB: HTMLInputElement; bulletLife: HTMLInputElement
    weaponTag: HTMLElement
}): void => {
    const w = type === 'melee' ? MELEE_WEAPON_PRESETS[weaponId] : RANGED_WEAPON_PRESETS[weaponId]
    if (!w) return
    fields.atkRange.value = String(w.range)
    fields.atkDmg.value = String(w.damage)
    const sk = SKILL_MAP[w.id]
    if (sk) {
        fields.atkCD.value = String(sk.cooldown)
        fields.atkDuration.value = String(sk.duration)
    }
    if (type === 'ranged') {
        const rw = w as RangedWeaponConfig
        fields.bulletSpeed.value = String(rw.projectileSpeed)
        fields.bulletKB.value = String(rw.knockbackForce)
        fields.bulletLife.value = String(rw.projectileLifetime)
        const tags: string[] = []
        if (rw.spreadCount) tags.push(`Spread ×${rw.spreadCount}`)
        if (rw.explosionRadius) tags.push(`Explosion R:${rw.explosionRadius}`)
        if (rw.homingStrength) tags.push(`Homing S:${rw.homingStrength}`)
        if (rw.throwAngle) tags.push(`Arc:${(rw.throwAngle * 180 / Math.PI).toFixed(0)}°`)
        fields.weaponTag.textContent = tags.join('  ')
    } else {
        fields.weaponTag.textContent = ''
    }
}

const populateWeaponOptions = (select: HTMLSelectElement, type: 'melee' | 'ranged'): void => {
    select.innerHTML = ''
    const options = type === 'melee' ? MELEE_WEAPON_OPTIONS : RANGED_WEAPON_OPTIONS
    for (const opt of options) {
        const o = document.createElement('option')
        o.value = opt.value; o.textContent = opt.label
        select.appendChild(o)
    }
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

    el.appendChild(createSection('Config'))
    const speed = createLabeledNumberInput(el, 'Speed', {min: '0.1', step: '0.1', value: '6'})
    const jumpH = createLabeledNumberInput(el, 'JumpH', {min: '0.1', step: '0.1', value: '2'})
    const radius = createLabeledNumberInput(el, 'Radius', {min: '0.05', step: '0.01', value: '0.125'})
    const height = createLabeledNumberInput(el, 'Height', {min: '0.2', step: '0.01', value: '1'})

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

    el.appendChild(createSection('Attack'))
    const atkTypeRow = document.createElement('div')
    atkTypeRow.style.cssText = 'display:flex;gap:8px;align-items:center'
    const atkSelectLabel = document.createElement('label')
    atkSelectLabel.textContent = 'Type '
    const atkSelect = document.createElement('select')
    const meleeOpt = document.createElement('option')
    meleeOpt.value = 'melee'; meleeOpt.textContent = 'Melee'
    const rangedOpt = document.createElement('option')
    rangedOpt.value = 'ranged'; rangedOpt.textContent = 'Ranged'
    atkSelect.appendChild(meleeOpt)
    atkSelect.appendChild(rangedOpt)
    atkSelectLabel.appendChild(atkSelect)
    atkTypeRow.appendChild(atkSelectLabel)

    const weaponSelectLabel = document.createElement('label')
    weaponSelectLabel.textContent = 'Wpn '
    const weaponSelect = document.createElement('select')
    weaponSelect.style.cssText = 'max-width:180px'
    weaponSelectLabel.appendChild(weaponSelect)
    atkTypeRow.appendChild(weaponSelectLabel)
    el.appendChild(atkTypeRow)

    const weaponTag = document.createElement('div')
    weaponTag.style.cssText = 'font-size:11px;color:#aaa;margin-top:2px;margin-bottom:4px'
    el.appendChild(weaponTag)

    const atkRange = createLabeledNumberInput(el, 'Range', {min: '0.1', step: '0.1', value: '1.5'})
    const atkDmg = createLabeledNumberInput(el, 'Damage', {min: '0.1', step: '0.1', value: '3'})
    const atkCD = createLabeledNumberInput(el, 'Cooldown', {min: '0.1', step: '0.1', value: '0.5'})
    const atkDuration = createLabeledNumberInput(el, 'Duration', {min: '0.05', step: '0.05', value: '0.3'})
    el.appendChild(document.createElement('br'))
    const bulletSpeed = createLabeledNumberInput(el, 'BulSpd', {min: '1', step: '1', value: '20'})
    const bulletKB = createLabeledNumberInput(el, 'BulKnock', {min: '0', step: '0.5', value: '3'})
    const bulletLife = createLabeledNumberInput(el, 'BulLife', {min: '0.5', step: '0.5', value: '3'})

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

    let currentType: 'melee' | 'ranged' = 'melee'

    peaceSelect.onchange = () => {
        const show = peaceSelect.value === 'build'
        buildSection.style.display = show ? '' : 'none'
        buildBoxTypesLabel.style.display = show ? '' : 'none'
        boxTypesContainer.style.display = show ? '' : 'none'
        addBoxTypeBtn.style.display = show ? '' : 'none'
    }

    const showRanged = () => {
        [bulletSpeed, bulletKB, bulletLife].forEach(input => {
            input.parentElement!.style.display = atkSelect.value === 'ranged' ? '' : 'none'
        })
    }

    atkSelect.onchange = (): void => {
        currentType = atkSelect.value as 'melee' | 'ranged'
        populateWeaponOptions(weaponSelect, currentType)
        showRanged()
        weaponTag.textContent = ''
    }

    weaponSelect.onchange = () => {
        if (weaponSelect.value) {
            autoFillFromWeapon(weaponSelect.value, currentType, {
                atkRange, atkDmg, atkCD, atkDuration,
                bulletSpeed, bulletKB, bulletLife,
                weaponTag,
            })
        }
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

    return {
        render: (container: HTMLElement) => {
            const sel = getSelected()
            if (!sel) return
            container.appendChild(el)
            el.style.display = 'block'

            posX.value = sel.mesh.position.x.toFixed(2)
            posY.value = sel.mesh.position.y.toFixed(2)
            posZ.value = sel.mesh.position.z.toFixed(2)

            speed.value = String(sel.config.speed)
            jumpH.value = String(sel.config.jumpHeight)
            radius.value = String(sel.config.radius)
            height.value = String(sel.config.height)

            const skill = sel.combat.skills[sel.combat.currentSkillIndex]
            maxHP.value = String(sel.combat.maxHealth)
            curHP.value = String(sel.combat.health)
            faction.value = String(sel.combat.faction)
            tendSelect.value = sel.combat.tendencyConfig.tendencyId
            targetFactionsInput.value = sel.combat.tendencyConfig.targetFactions?.join(',') ?? ''
            showTargetFactions()

            const skillType = skill?.config.type ?? 'melee'
            atkSelect.value = skillType
            currentType = skillType as 'melee' | 'ranged'
            populateWeaponOptions(weaponSelect, currentType)

            const weaponId = skill?.config.weapon.id ?? ''
            if (MELEE_WEAPON_PRESETS[weaponId] || RANGED_WEAPON_PRESETS[weaponId]) {
                weaponSelect.value = weaponId
                autoFillFromWeapon(weaponId, currentType, {
                    atkRange, atkDmg, atkCD, atkDuration,
                    bulletSpeed, bulletKB, bulletLife,
                    weaponTag,
                })
            } else {
                weaponSelect.value = ''
                atkRange.value = String(skill?.config.weapon.range ?? 1.5)
                atkDmg.value = String(skill?.config.weapon.damage ?? 3)
                atkCD.value = String(skill?.config.cooldown ?? 0.5)
                atkDuration.value = String(skill?.config.duration ?? 0.3)
                if (skill?.config.type === 'ranged') {
                    bulletSpeed.value = String(skill.config.weapon.projectileSpeed)
                    bulletKB.value = String(skill.config.weapon.knockbackForce)
                    bulletLife.value = String(skill.config.weapon.projectileLifetime)
                }
                weaponTag.textContent = ''
            }

            playerCheck.checked = sel.isPlayer
            peaceSelect.value = sel.peaceStrategy
            combatSelect.value = sel.combatStrategy
            aiSection.style.display = sel.isPlayer ? 'none' : ''
            peaceRow.style.display = sel.isPlayer ? 'none' : ''
            combatRow.style.display = sel.isPlayer ? 'none' : ''
            buildSection.style.display = (!sel.isPlayer && sel.peaceStrategy === 'build') ? '' : 'none'
            showRanged()

            const onApply = () => {
                const cur = getSelected()
                if (!cur) return
                ctx.setTransform?.(cur.id,
                    {x: parseFloat(posX.value), y: parseFloat(posY.value), z: parseFloat(posZ.value)},
                )
                if (playerCheck.checked) ctx.markPlayer(cur.id)
                else if (cur.isPlayer) ctx.unmarkPlayer()
                const isPlayer = playerCheck.checked
                aiSection.style.display = isPlayer ? 'none' : ''
                peaceRow.style.display = isPlayer ? 'none' : ''
                combatRow.style.display = isPlayer ? 'none' : ''
                buildSection.style.display = (!isPlayer && peaceSelect.value === 'build') ? '' : 'none'
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
                const isRanged = atkSelect.value === 'ranged'
                const selectedWeaponId = weaponSelect.value || undefined
                ctx.updateCharacterConfig?.(cur.id, {
                    speed: parseFloat(speed.value),
                    jumpHeight: parseFloat(jumpH.value),
                    radius: parseFloat(radius.value),
                    height: parseFloat(height.value),
                }, isRanged ? {
                    type: 'ranged',
                    weaponId: selectedWeaponId,
                    range: parseFloat(atkRange.value),
                    damage: parseFloat(atkDmg.value),
                    cooldown: parseFloat(atkCD.value),
                    duration: parseFloat(atkDuration.value),
                    bulletSpeed: parseFloat(bulletSpeed.value),
                    bulletKnockback: parseFloat(bulletKB.value),
                    bulletLifetime: parseFloat(bulletLife.value),
                } : {
                    type: 'melee',
                    weaponId: selectedWeaponId,
                    range: parseFloat(atkRange.value),
                    damage: parseFloat(atkDmg.value),
                    cooldown: parseFloat(atkCD.value),
                    duration: parseFloat(atkDuration.value),
                }, parseFloat(faction.value), parseFloat(maxHP.value), buildTendencyConfig(), parseFloat(curHP.value))
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
    }
}
