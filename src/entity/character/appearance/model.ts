import type {Group, Mesh} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import type {CharacterModel, CharacterColorPalette, WeaponEquipConfig} from './types.ts'
import type {ResolvedArmorLoadout} from '../../../character/armor/types.ts'
import {ARMOR_SLOTS, type ArmorSlot} from '../../../character/armor/slots.ts'
import {createWeaponMesh, type WeaponMeshConfig, type WeaponLocalHitBox} from './weapon_mesh.ts'
import {createArmorMesh, ARMOR_BODY_PART_JOINTS, type ArmorBodyPart} from './armor_mesh.ts'
import {SELECT_PALETTE} from './constants.ts'
import {recolorTwoFaceBoxPart, recolorHeadBoxPart, type TrackedBoxPart} from '../../../render/box_parts.ts'
import {skeletonFromDefinition} from '../../../skeleton/anim/serialization.ts'
import {createJointHierarchy} from '../../../skeleton/render/joint_hierarchy.ts'
import {buildCharacterSkeletonDefinition} from '../skeleton/preset.ts'
import {assembleCharacterAppearance} from './assemble.ts'

/** 单个武器槽（主手/副手各一）：武器骨骼挂点 + 武器网格状态 */
interface WeaponSlot {
    readonly mountJoint: Group
    group: Group | null
    hitCenter: Mesh | null
    tip: Mesh | null
    hitBox: WeaponLocalHitBox | null
    cleanup: (() => void) | null
    /** 原始几何中的主握把 Y 坐标（供骨骼编辑器校验主握点） */
    gripY: number
    supportGripOffset: number
    /** 当前装配的网格配置引用（同引用时跳过重建，只做挂背/回手换父节点） */
    meshConfig: WeaponMeshConfig | undefined
}

/** 取关节 Group；预设骨架保证存在，缺失即数据结构错误 */
const requireGroup = (groups: ReadonlyMap<string, Group>, jointId: string): Group => {
    const group = groups.get(jointId)
    if (group === undefined) throw new Error(`角色模型缺少关节 ${jointId}`)
    return group
}

/** 取关节上的部件 mesh；预设骨架保证存在 */
const requirePart = (jointParts: ReadonlyMap<string, TrackedBoxPart>, jointId: string): Mesh => {
    const part = jointParts.get(jointId)
    if (part === undefined) throw new Error(`角色模型缺少部件 ${jointId}`)
    return part.mesh
}

/** 护甲槽位 → 挂载关节：护甲件挂在被动画驱动的关节下，自动跟随姿态（纯视觉，不参与判定） */
const ARMOR_SLOT_JOINTS: Readonly<Record<ArmorSlot, readonly string[]>> = {
    head: ['headNeck'],
    chest: ['spine'],
    arms: ['rightArmElbow', 'leftArmElbow'],
    legs: ['leftLegHip', 'rightLegHip', 'leftLegKnee', 'rightLegKnee'],
}

/** 已装配的护甲部件（换装/释放时统一清理） */
interface MountedArmorPart {
    readonly group: Group
    readonly cleanup: () => void
}

/**
 * 构建完整的方块人模型：由**人形预设骨架定义**生成关节 Group 层级（`createJointHierarchy`），
 * 再用**游戏与骨骼编辑器共用的外观装配器**（`assembleCharacterAppearance`）挂上方块部件（含手部模型）。
 * 武器挂点（rightWeaponMount / leftWeaponMount / backWeaponMount）是独立关节，不并入手部骨骼：
 * 主手武器挂右腕，副手武器平时握左手、双手共持时挂背（`setOffhandStowed`）。
 */
export const createCharacterModel = (config: CharacterConfig, faction: number): CharacterModel => {
    const palette = SELECT_PALETTE(faction)

    /* 关节 Group 层级 = 预设骨架定义的唯一映射（含手部 rightHandPivot/leftHandPivot 与武器挂点） */
    const scaffold = skeletonFromDefinition(buildCharacterSkeletonDefinition())
    const hierarchy = createJointHierarchy(scaffold)
    const groups = hierarchy.groups
    const group = requireGroup(groups, 'root')
    group.scale.set(config.scale, config.scale, config.scale)

    /* 模型层：方块人外观部件（与骨骼编辑器同一构建器），手部部件挂手部关节 */
    const appearance = assembleCharacterAppearance(groups, palette)
    const jointParts = appearance.jointParts

    const rightWeaponMount = requireGroup(groups, 'rightWeaponMount')
    const leftWeaponMount = requireGroup(groups, 'leftWeaponMount')
    const backWeaponMount = requireGroup(groups, 'backWeaponMount')

    const createSlot = (mountJoint: Group): WeaponSlot => ({
        mountJoint, group: null, hitCenter: null, tip: null, hitBox: null, cleanup: null, gripY: 0, supportGripOffset: 0, meshConfig: undefined,
    })
    const rightSlot = createSlot(rightWeaponMount)
    const leftSlot = createSlot(leftWeaponMount)

    const clearSlot = (slot: WeaponSlot): void => {
        if (slot.group !== null) slot.mountJoint.remove(slot.group)
        slot.cleanup?.()
        slot.group = null
        slot.hitCenter = null
        slot.tip = null
        slot.hitBox = null
        slot.cleanup = null
        slot.gripY = 0
        slot.supportGripOffset = 0
        slot.meshConfig = undefined
    }

    const equipSlot = (slot: WeaponSlot, meshConfig: WeaponMeshConfig | undefined): void => {
        /* 同一网格配置引用：跳过重建（换持握模式只改挂背状态时零开销） */
        if (slot.meshConfig === meshConfig) return
        clearSlot(slot)
        if (meshConfig === undefined) return
        /* 武器模型已自带固有握持（握把中心在模型原点）；直接挂到武器骨骼下，朝向完全由骨骼动画控制 */
        const result = createWeaponMesh(meshConfig)
        slot.group = result.group
        slot.hitCenter = result.hitCenter
        slot.tip = result.tip
        slot.hitBox = result.hitBox
        slot.cleanup = result.cleanup
        slot.gripY = result.gripY
        slot.supportGripOffset = result.supportGripOffset
        slot.meshConfig = meshConfig
        slot.mountJoint.add(result.group)
    }

    const removeWeapon = (): void => {
        clearSlot(rightSlot)
        clearSlot(leftSlot)
    }

    /** 副手武器挂背 / 回手：只换父节点，不重建几何（双手共持时挂背，其余模式握在左手） */
    const setOffhandStowed = (stowed: boolean): void => {
        const group = leftSlot.group
        if (group === null) return
        const target = stowed ? backWeaponMount : leftWeaponMount
        if (group.parent !== target) target.add(group)
    }

    const equipWeapon = (equipConfig: WeaponEquipConfig): void => {
        equipSlot(rightSlot, equipConfig.main)
        equipSlot(leftSlot, equipConfig.offhand)
        /* 缺省 = 握在左手；显式 offhandStowed = 挂背（双手共持） */
        setOffhandStowed(equipConfig.offhandStowed === true)
    }

    /* ── 护甲：纯视觉部件，逐槽挂到对应关节（骨架编辑后缺失的关节安全跳过） ── */
    let mountedArmor: MountedArmorPart[] = []
    /** 被护甲顶替而隐藏的身体部件 → 原始可见性（换装 / 卸下时统一还原） */
    let hiddenBodyParts = new Map<TrackedBoxPart, boolean>()

    /** 隐藏某个身体部位的基础模型（护甲顶替而非叠加）；同一部件只记录一次原始可见性 */
    const hideBodyPart = (bodyPart: ArmorBodyPart): void => {
        const part = jointParts.get(ARMOR_BODY_PART_JOINTS[bodyPart])
        if (part === undefined) return
        if (!hiddenBodyParts.has(part)) hiddenBodyParts.set(part, part.mesh.visible)
        part.mesh.visible = false
    }

    const restoreBodyParts = (): void => {
        for (const [part, visible] of hiddenBodyParts) part.mesh.visible = visible
        hiddenBodyParts = new Map()
    }

    const removeArmor = (): void => {
        for (const part of mountedArmor) {
            part.group.removeFromParent()
            part.cleanup()
        }
        mountedArmor = []
        restoreBodyParts()
    }

    const equipArmor = (loadout: ResolvedArmorLoadout): void => {
        removeArmor()
        for (const slot of ARMOR_SLOTS) {
            const piece = loadout[slot]
            if (piece === undefined) continue
            for (const jointId of ARMOR_SLOT_JOINTS[slot]) {
                const joint = groups.get(jointId)
                if (joint === undefined) continue
                const result = createArmorMesh(piece.mesh, jointId)
                joint.add(result.group)
                mountedArmor.push({group: result.group, cleanup: result.cleanup})
            }
            for (const bodyPart of piece.mesh.hideBodyParts ?? []) hideBodyPart(bodyPart)
        }
    }

    /* 部件 mesh 引用（recolor 用；躯干/头/手为无骨骼段绑定部件，故从 jointParts 取） */
    const bodyMesh = requirePart(jointParts, 'spine')
    const headMesh = requirePart(jointParts, 'headNeck')
    const rightUpperArmMesh = requirePart(jointParts, 'rightArmShoulder')
    const rightForearmMesh = requirePart(jointParts, 'rightArmElbow')
    const leftUpperArmMesh = requirePart(jointParts, 'leftArmShoulder')
    const leftForearmMesh = requirePart(jointParts, 'leftArmElbow')
    const rightHandMesh = requirePart(jointParts, 'rightHandPivot')
    const leftHandMesh = requirePart(jointParts, 'leftHandPivot')
    const rightThighMesh = requirePart(jointParts, 'rightLegHip')
    const rightShinMesh = requirePart(jointParts, 'rightLegKnee')
    const leftThighMesh = requirePart(jointParts, 'leftLegHip')
    const leftShinMesh = requirePart(jointParts, 'leftLegKnee')

    /** 根据新调色板原地更新所有部位材质颜色（不重建几何体） */
    const recolor = (newPalette: CharacterColorPalette): void => {
        for (const mesh of [
            bodyMesh, rightUpperArmMesh, rightForearmMesh,
            leftUpperArmMesh, leftForearmMesh,
        ]) {
            recolorTwoFaceBoxPart(mesh, newPalette.bodyColor)
        }
        for (const mesh of [rightHandMesh, leftHandMesh]) {
            recolorTwoFaceBoxPart(mesh, newPalette.skinColor)
        }
        for (const mesh of [rightThighMesh, rightShinMesh, leftThighMesh, leftShinMesh]) {
            recolorTwoFaceBoxPart(mesh, newPalette.legColor)
        }
        recolorHeadBoxPart(headMesh, newPalette)
    }

    const dispose = (): void => {
        removeWeapon()
        removeArmor()
        appearance.cleanup()
        hierarchy.cleanup()
    }

    return {
        group,
        spine: requireGroup(groups, 'spine'),
        headNeck: requireGroup(groups, 'headNeck'),
        head: headMesh,
        body: bodyMesh,
        rightArmShoulder: requireGroup(groups, 'rightArmShoulder'),
        rightUpperArm: rightUpperArmMesh,
        rightArmElbow: requireGroup(groups, 'rightArmElbow'),
        rightForearm: rightForearmMesh,
        rightHandPivot: requireGroup(groups, 'rightHandPivot'),
        rightWristPivot: requireGroup(groups, 'rightWristPivot'),
        leftArmShoulder: requireGroup(groups, 'leftArmShoulder'),
        leftUpperArm: leftUpperArmMesh,
        leftArmElbow: requireGroup(groups, 'leftArmElbow'),
        leftForearm: leftForearmMesh,
        leftHandPivot: requireGroup(groups, 'leftHandPivot'),
        leftWristPivot: requireGroup(groups, 'leftWristPivot'),
        rightWeaponMount,
        leftWeaponMount,
        backWeaponMount,
        rightLegHip: requireGroup(groups, 'rightLegHip'),
        rightThigh: rightThighMesh,
        rightLegKnee: requireGroup(groups, 'rightLegKnee'),
        rightShin: rightShinMesh,
        leftLegHip: requireGroup(groups, 'leftLegHip'),
        leftThigh: leftThighMesh,
        leftLegKnee: requireGroup(groups, 'leftLegKnee'),
        leftShin: leftShinMesh,
        equipWeapon,
        setOffhandStowed,
        removeWeapon,
        equipArmor,
        removeArmor,
        recolor,
        get weaponMesh() { return rightSlot.hitCenter },
        get weaponTip() { return rightSlot.tip },
        get weaponGroup() { return rightSlot.group },
        get weaponHitBox() { return rightSlot.hitBox },
        get weaponGripY() { return rightSlot.gripY },
        get weaponSupportGripOffset() { return rightSlot.supportGripOffset },
        get offhandWeaponMesh() { return leftSlot.hitCenter },
        get offhandWeaponTip() { return leftSlot.tip },
        get offhandWeaponGroup() { return leftSlot.group },
        get offhandWeaponHitBox() { return leftSlot.hitBox },
        get offhandWeaponGripY() { return leftSlot.gripY },
        dispose,
    }
}
