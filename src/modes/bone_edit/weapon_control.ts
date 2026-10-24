import {DEFAULT_WEAPON_ID, defaultHoldMode, findWeaponPreset, supportsHoldMode, weaponDisplayName, weaponsOfForm, type WeaponConfig} from '../../character/weapon/catalog.ts'
import type {HoldMode} from '../../character/weapon/hold_mode.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../character/handedness.ts'
import {
    equipSkeletonWeapon,
    type SkeletonWeapon,
    type SkeletonWeaponSpec,
} from './weapon_equip.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import {localizeText, localizeTitle, localizeApply} from '../../i18n/dom.ts'
import {translate, type StringLocaleKey} from '../../i18n/index.ts'
import {
    ANIM_OPTION_WEAPON_AUTO,
    ANIM_OPTION_WEAPON_NONE,
    WEAPON_SELECT_ID,
} from './constants.ts'

/**
 * 骨骼动画编辑器武器控制：
 * - 下拉三态：**自动**（跟随当前动画来源）/ **无武器** / 手动指定当前体形的武器；
 * - 装载：主手武器挂点（人形按惯用手取左右手挂点；生物体形使用武器自带 `mountJointId`）；
 * - **不再自动求解副手贴合**：双手共持动作由动画数据与节点 IK 独立控制；
 * - 切换体形时重建武器列表并同步该体形的默认武器。
 */

/** 当前动画的来源信息（用于「自动」模式选武器） */
export interface ClipWeaponSource {
    readonly weaponId?: string
    readonly segmentId?: string
    /** 段所在持握模式（决定编辑器预览时是否双手） */
    readonly holdMode?: HoldMode
    /**
     * 基础状态是否持械（仅 待机/行走 的持械-空手变体携带）：
     * false = 明确空手（卸下武器）；true / undefined = 保留当前武器。
     */
    readonly weaponHeld?: boolean
}

/**
 * 「自动」模式解析应装备的武器：
 * - 动画带武器来源 → 该武器；
 * - 基础状态空手变体（`weaponHeld === false`）→ 卸下；
 * - 其余 → 保留当前武器，无当前时回退体形默认武器。
 */
export const resolveAutoWeapon = (
    source: ClipWeaponSource,
    current: SkeletonWeaponSpec | undefined,
    fallback: SkeletonWeaponSpec | undefined,
    formId?: string,
): SkeletonWeaponSpec | undefined => {
    if (source.weaponId !== undefined) return weaponSpecOf(source.weaponId, source.holdMode, formId) ?? fallback
    if (source.weaponHeld === false) return undefined
    return current ?? fallback
}

/** 是否双手持握：显式模式优先，缺省取武器默认持握模式（生产与编辑器同源） */
export const isTwoHandedWeapon = (weapon: WeaponConfig, holdMode?: HoldMode): boolean =>
    (holdMode !== undefined && supportsHoldMode(weapon, holdMode) ? holdMode : defaultHoldMode(weapon)) === 'two_handed'

/** 武器规格（编辑器装载用）；武器 id 未知或不属于指定体形时返回 undefined */
export const weaponSpecOf = (
    weaponId: string,
    holdMode?: HoldMode,
    formId?: string,
): SkeletonWeaponSpec | undefined => {
    const weapon = findWeaponPreset(weaponId)
    if (weapon === undefined) return undefined
    if (formId !== undefined && weapon.formId !== formId) return undefined
    const mode = holdMode !== undefined && supportsHoldMode(weapon, holdMode) ? holdMode : defaultHoldMode(weapon)
    return {
        weaponId: weapon.id,
        meshConfig: weapon.mesh,
        /* 双持预览：副手用同类默认模型（与主手同一网格）；其余模式不装配副手 */
        offhandMeshConfig: mode === 'dual_wield' ? weapon.mesh : undefined,
        twoHanded: mode === 'two_handed',
        ...(weapon.mountJointId !== undefined ? {mountJointId: weapon.mountJointId} : {}),
        ...(weapon.mountRotation !== undefined ? {mountRotation: weapon.mountRotation} : {}),
    }
}

export interface BoneEditWeaponControl {
    /** 控制条上的武器下拉（由 timeline 插入控制条） */
    readonly select: HTMLSelectElement
    /** 切换聚焦骨架/体形后重新装载（保留当前选择模式；体形变化时重建列表） */
    readonly reload: () => void
    /** 跟随当前动画来源（「自动」模式下装备该武器） */
    readonly syncForClip: (source: ClipWeaponSource) => void
    /** 当前惯用手（决定人形主手挂点侧） */
    readonly getHandedness: () => Handedness
    /** 切换惯用手：改挂主手挂点侧并重装武器（动作数据不变） */
    readonly setHandedness: (next: Handedness) => void
    /** 启用/停用武器控制（体形不支持武器控制时卸下武器） */
    readonly setEnabled: (enabled: boolean) => void
    /** 当前装备武器 id（DOM 可测试面：data-weapon） */
    readonly currentWeaponId: () => string | undefined
    /** 当前装备武器是否双手（DOM 可测试面：data-two-handed） */
    readonly isTwoHanded: () => boolean
    readonly dispose: () => void
}

export const createBoneEditWeaponControl = (
    world: SkeletonEntitiesContext,
    getFormId: () => string,
    getDefaultWeaponId: () => string,
): BoneEditWeaponControl => {
    const select = document.createElement('select')
    select.id = WEAPON_SELECT_ID
    select.className = 'dc-select'
    localizeTitle(select, 'bone_edit.weapon.select_title')
    select.style.cssText = 'max-width:150px'

    let mode: string = ANIM_OPTION_WEAPON_AUTO
    let source: ClipWeaponSource = {}
    let equipped: SkeletonWeapon | undefined
    /** 上一次使用的武器（卸下后仍记住：空手变体切回持械变体时沿用） */
    let lastSpec: SkeletonWeaponSpec | undefined
    /** 惯用手：决定人形主手挂点侧 */
    let handedness: Handedness = DEFAULT_HANDEDNESS
    /** 非轨道模式停用（卸下武器并禁止重装） */
    let enabled = true
    let formIdCache = getFormId()

    const weaponsForCurrentForm = (): readonly WeaponConfig[] => weaponsOfForm(formIdCache)

    const rebuildOptions = (): void => {
        select.innerHTML = ''
        const autoOption = document.createElement('option')
        autoOption.value = ANIM_OPTION_WEAPON_AUTO
        localizeText(autoOption, 'bone_edit.weapon.auto')
        select.appendChild(autoOption)
        const noneOption = document.createElement('option')
        noneOption.value = ANIM_OPTION_WEAPON_NONE
        localizeText(noneOption, 'bone_edit.weapon.none')
        select.appendChild(noneOption)

        /* 手动指定武器：近战 / 远程分组（optgroup 用 label 属性，不能走 localizeText 以免清空子选项） */
        const groupOf = (labelKey: StringLocaleKey): HTMLOptGroupElement => {
            const group = document.createElement('optgroup')
            localizeApply(group, el => {
                if (el instanceof HTMLOptGroupElement) el.label = translate(labelKey)
            })
            select.appendChild(group)
            return group
        }
        const meleeGroup = groupOf('bone_edit.weapon.group_melee')
        const rangedGroup = groupOf('bone_edit.weapon.group_ranged')
        for (const preset of weaponsForCurrentForm()) {
            const option = document.createElement('option')
            option.value = preset.id
            localizeApply(option, el => { el.textContent = weaponDisplayName(preset) })
            option.dataset.weaponType = preset.type
            ;(preset.type === 'melee' ? meleeGroup : rangedGroup).appendChild(option)
        }
        select.value = mode
    }

    /** 体形变化时重建武器列表并回到「自动」，避免沿用上一体形的武器 */
    const refreshForm = (): void => {
        const formId = getFormId()
        if (formId === formIdCache) return
        formIdCache = formId
        mode = ANIM_OPTION_WEAPON_AUTO
        lastSpec = undefined
        rebuildOptions()
    }

    const fallbackSpec = (): SkeletonWeaponSpec | undefined =>
        weaponSpecOf(getDefaultWeaponId(), undefined, formIdCache)
            ?? weaponSpecOf(DEFAULT_WEAPON_ID, undefined, formIdCache)

    /** 解析当前应装备的武器规格 */
    const resolveSpec = (): SkeletonWeaponSpec | undefined => {
        refreshForm()
        if (mode === ANIM_OPTION_WEAPON_NONE) return undefined
        if (mode === ANIM_OPTION_WEAPON_AUTO) {
            const current = equipped?.spec ?? lastSpec
            const currentValid = current !== undefined && weaponSpecOf(current.weaponId, undefined, formIdCache) !== undefined
                ? current
                : undefined
            return resolveAutoWeapon(source, currentValid, fallbackSpec(), formIdCache)
        }
        return weaponSpecOf(mode, undefined, formIdCache) ?? fallbackSpec()
    }

    const reload = (): void => {
        equipped?.dispose()
        equipped = undefined
        if (!enabled) return
        const spec = resolveSpec()
        if (spec === undefined) return
        const groups = world.getFocus()?.visuals.groups
        if (groups === undefined) return
        equipped = equipSkeletonWeapon(groups, spec, handedness)
        if (equipped !== undefined) lastSpec = spec
    }

    const syncForClip = (next: ClipWeaponSource): void => {
        source = next
        refreshForm()
        reload()
    }

    select.addEventListener('change', () => {
        refreshForm()
        mode = select.value
        reload()
    })

    const setHandedness = (next: Handedness): void => {
        if (next === handedness) return
        handedness = next
        reload()
    }

    const setEnabled = (next: boolean): void => {
        if (enabled === next) return
        enabled = next
        select.disabled = !next
        if (!next) {
            equipped?.dispose()
            equipped = undefined
            return
        }
        refreshForm()
        reload()
    }

    rebuildOptions()

    return {
        select,
        reload,
        syncForClip,
        getHandedness: () => handedness,
        setHandedness,
        setEnabled,
        currentWeaponId: () => equipped?.spec.weaponId,
        isTwoHanded: () => equipped?.spec.twoHanded === true,
        dispose: () => {
            equipped?.dispose()
            equipped = undefined
        },
    }
}
