import type {Skeleton} from '../../skeleton/skeleton.ts'
import {ALL_WEAPON_PRESETS, DEFAULT_WEAPON_ID, defaultHoldMode, findWeaponPreset, type WeaponConfig} from '../../character/weapon/catalog.ts'
import {TWO_HAND_GRIP_OFFSET} from '../../entity/character/appearance/constants.ts'
import {clearTwoHandGripRoot, solveTwoHandedGrip} from '../../entity/character/appearance/two_handed_ik.ts'
import {
    equipSkeletonWeapon,
    RIGHT_WEAPON_MOUNT_JOINT,
    type SkeletonWeapon,
    type SkeletonWeaponSpec,
} from './weapon_equip.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import {
    ANIM_OPTION_WEAPON_AUTO,
    ANIM_OPTION_WEAPON_NONE,
    GRIP_TOGGLE_ID,
    WEAPON_AUTO_LABEL,
    WEAPON_GROUP_LABEL_MELEE,
    WEAPON_GROUP_LABEL_RANGED,
    WEAPON_NONE_LABEL,
    WEAPON_SELECT_ID,
} from './constants.ts'

/**
 * 骨骼动画编辑器武器控制：「武器占两个骨骼位」的装载与贴合。
 *
 * - 下拉三态：**自动**（跟随当前动画来源：选中内置攻击动作即装备该武器）/ **无武器** / 手动指定某把武器；
 * - 装载：武器网格挂 `rightWeaponMount`（右手武器挂点，随右手动画）；
 * - 双手贴合：武器 `twoHanded` 为真时，左肩设为 IK 根并每次姿态应用后把左手链 CCD 求解到
 *   武器轴上的副握点（与生产共用 `entity/character/appearance/two_handed_ik.ts`）。
 */

/** 当前动画的来源信息（用于「自动」模式选武器） */
export interface ClipWeaponSource {
    readonly weaponId?: string
    readonly segmentId?: string
    /**
     * 基础状态是否持械（仅 待机/行走 的持械-空手变体携带）：
     * false = 明确空手（卸下武器）；true / undefined = 保留当前武器。
     */
    readonly weaponHeld?: boolean
}

/** 自动模式的兜底武器（进入编辑器时即装备，避免「武器没出来」） */
export const DEFAULT_EDITOR_WEAPON_ID = DEFAULT_WEAPON_ID

/**
 * 「自动」模式解析应装备的武器：
 * - 动画带武器来源（内置攻击动作及其副本）→ 装备该武器；
 * - 基础状态空手变体（`weaponHeld === false`）→ 卸下武器（但记住上一次用的武器）；
 * - 其余（自定义动画、跳跃/下落等无持械语义的基础状态、持械变体）→ **保留当前武器**；
 * - 当前无武器时回退默认武器（进入编辑器即有一把武器可编辑）。
 */
export const resolveAutoWeapon = (
    source: ClipWeaponSource,
    current: SkeletonWeaponSpec | undefined,
): SkeletonWeaponSpec | undefined => {
    if (source.weaponId !== undefined) return weaponSpecOf(source.weaponId)
    if (source.weaponHeld === false) return undefined
    return current ?? weaponSpecOf(DEFAULT_EDITOR_WEAPON_ID)
}

/** 是否双手持握：取武器**默认持握模式**是否为双手共持（生产与编辑器同源） */
export const isTwoHandedWeapon = (weapon: WeaponConfig): boolean => defaultHoldMode(weapon) === 'two_handed'

/** 武器规格（编辑器装载用）；武器 id 未知时返回 undefined */
export const weaponSpecOf = (weaponId: string): SkeletonWeaponSpec | undefined => {
    const weapon = findWeaponPreset(weaponId)
    if (weapon === undefined) return undefined
    return {
        weaponId: weapon.id,
        meshConfig: weapon.mesh,
        offhandMeshConfig: weapon.offhandMesh,
        twoHanded: defaultHoldMode(weapon) === 'two_handed',
    }
}

export interface BoneEditWeaponControl {
    /** 控制条上的武器下拉（由 timeline 插入控制条） */
    readonly select: HTMLSelectElement
    /** 控制条上的「左手贴合」开关（默认关；见下方贴合策略） */
    readonly gripToggle: HTMLButtonElement
    /** 切换聚焦骨架/重建后重新装载（保留当前选择模式） */
    readonly reload: () => void
    /** 跟随当前动画来源（「自动」模式下装备该武器） */
    readonly syncForClip: (source: ClipWeaponSource) => void
    /**
     * 每次姿态应用后调用（仅播放预览时由 timeline 调用）：
     * 贴合开关打开且当前武器为双手时，把左手链求解到武器副握点；否则不做任何干预。
     */
    readonly solveGrip: () => void
    /** 左手贴合开关（默认关）：关闭时两只手完全独立，互不牵扯 */
    readonly isGripAssist: () => boolean
    readonly setGripAssist: (on: boolean) => void
    /** 当前装备武器 id（DOM 可测试面：data-weapon） */
    readonly currentWeaponId: () => string | undefined
    /** 当前装备武器是否双手（DOM 可测试面：data-two-handed） */
    readonly isTwoHanded: () => boolean
    /** 左手贴合是否已求解（DOM 可测试面：data-grip-solved） */
    readonly isGripSolved: () => boolean
    readonly dispose: () => void
}

export const createBoneEditWeaponControl = (world: SkeletonEntitiesContext): BoneEditWeaponControl => {
    const select = document.createElement('select')
    select.id = WEAPON_SELECT_ID
    select.title = '编辑器武器（自动 = 跟随当前动画所属武器）'
    select.style.cssText = 'max-width:150px'

    const autoOption = document.createElement('option')
    autoOption.value = ANIM_OPTION_WEAPON_AUTO
    autoOption.textContent = WEAPON_AUTO_LABEL
    select.appendChild(autoOption)
    const noneOption = document.createElement('option')
    noneOption.value = ANIM_OPTION_WEAPON_NONE
    noneOption.textContent = WEAPON_NONE_LABEL
    select.appendChild(noneOption)

    /* 左手贴合开关（默认关：编辑器里两只手独立，避免「拖武器牵扯另一只手」） */
    const gripToggle = document.createElement('button')
    gripToggle.id = GRIP_TOGGLE_ID
    gripToggle.style.cssText = 'padding:2px 8px;cursor:pointer;background:#2a2a33;color:#ddd;border:1px solid #444;border-radius:3px'

    /* 手动指定武器：近战 / 远程分组 */
    const groupOf = (label: string): HTMLOptGroupElement => {
        const group = document.createElement('optgroup')
        group.label = label
        select.appendChild(group)
        return group
    }
    const meleeGroup = groupOf(WEAPON_GROUP_LABEL_MELEE)
    const rangedGroup = groupOf(WEAPON_GROUP_LABEL_RANGED)
    for (const preset of ALL_WEAPON_PRESETS) {
        const option = document.createElement('option')
        option.value = preset.id
        option.textContent = preset.name
        option.dataset.weaponType = preset.type
        ;(preset.type === 'melee' ? meleeGroup : rangedGroup).appendChild(option)
    }

    let mode: string = ANIM_OPTION_WEAPON_AUTO
    let source: ClipWeaponSource = {}
    let equipped: SkeletonWeapon | undefined
    /** 上一次使用的武器（卸下后仍记住：空手变体切回持械变体时沿用） */
    let lastSpec: SkeletonWeaponSpec | undefined
    /** 左手贴合开关（默认关：编辑器里两只手完全独立，互不牵扯） */
    let gripAssist = false
    let gripSolved = false

    const focusSkeleton = (): Skeleton | undefined => world.getFocus()?.skeleton

    /** 释放当前武器并清除左手 IK 根（回到由 clip 驱动左手） */
    const unequip = (): void => {
        const skeleton = focusSkeleton()
        if (skeleton !== undefined) clearTwoHandGripRoot(skeleton)
        equipped?.dispose()
        equipped = undefined
        gripSolved = false
    }

    /** 解析当前应装备的武器规格：自动模式取动画来源（无来源保留当前/上次武器），手动模式取下拉值 */
    const resolveSpec = (): SkeletonWeaponSpec | undefined => {
        if (mode === ANIM_OPTION_WEAPON_NONE) return undefined
        if (mode === ANIM_OPTION_WEAPON_AUTO) return resolveAutoWeapon(source, equipped?.spec ?? lastSpec)
        return weaponSpecOf(mode)
    }

    const reload = (): void => {
        unequip()
        const spec = resolveSpec()
        if (spec === undefined) return
        const groups = world.getFocus()?.visuals.groups
        if (groups === undefined) return
        equipped = equipSkeletonWeapon(groups, spec)
        if (equipped !== undefined) lastSpec = spec
        /* 注意：装载本身不求解左手（贴合只在播放预览且开关打开时进行）——
         * 保证编辑（暂停）状态下拖任意关节都不会牵扯另一只手 */
    }

    const syncForClip = (next: ClipWeaponSource): void => {
        source = next
        reload()
    }

    select.addEventListener('change', () => {
        mode = select.value
        reload()
    })

    /**
     * 左手贴合求解（仅在贴合开关打开 + 双手武器 + 播放预览时由 timeline 调用）：
     * 左肩为 IK 根，链末端为左手武器挂点，目标为武器轴上的副握点（共享求解器）。
     * 关闭贴合时立即清除 IK 根（左臂回到 clip 姿态），不做任何跨手干预。
     */
    const solveGrip = (): void => {
        const focus = world.getFocus()
        const skeleton = focus?.skeleton
        if (skeleton === undefined || focus === undefined) {
            gripSolved = false
            return
        }
        if (!gripAssist || equipped === undefined || !equipped.spec.twoHanded) {
            if (!gripAssist) clearTwoHandGripRoot(skeleton)
            gripSolved = false
            return
        }
        gripSolved = solveTwoHandedGrip(skeleton, equipped.weaponGroup, {
            shoulderId: 'leftArmShoulder',
            /* 武器根节点已对齐主握把；按该武器沿柄身分配的间距定位副握点 */
            offset: equipped.supportGripOffset + TWO_HAND_GRIP_OFFSET,
            /* 与生产同源：目标换算回骨架空间（编辑器骨架若带根缩放也保持一致） */
            rootObject: focus.visuals.groups.get('root'),
        })
    }

    const refreshGripToggleLabel = (): void => {
        gripToggle.textContent = gripAssist ? '左手贴合：开' : '左手贴合：关'
        gripToggle.title = gripAssist
            ? '播放预览时把左手链求解到武器副握点（关闭后两只手互不牵扯）'
            : '左手贴合已关闭：编辑与预览时两只手完全独立'
    }

    const setGripAssist = (on: boolean): void => {
        gripAssist = on
        if (!on) {
            /* 关闭：立刻解除左手 IK 根并清状态（由 timeline 重新应用 clip 姿态） */
            const skeleton = focusSkeleton()
            if (skeleton !== undefined) clearTwoHandGripRoot(skeleton)
            gripSolved = false
        }
        refreshGripToggleLabel()
    }

    gripToggle.addEventListener('click', () => {
        setGripAssist(!gripAssist)
    })

    return {
        select,
        gripToggle,
        reload,
        syncForClip,
        solveGrip,
        isGripAssist: () => gripAssist,
        setGripAssist,
        currentWeaponId: () => equipped?.spec.weaponId,
        isTwoHanded: () => equipped?.spec.twoHanded === true,
        isGripSolved: () => gripSolved,
        dispose: unequip,
    }
}

/** 右手武器挂点关节 id（编辑器装载用；保留导出便于测试与外部引用） */
export {RIGHT_WEAPON_MOUNT_JOINT}
