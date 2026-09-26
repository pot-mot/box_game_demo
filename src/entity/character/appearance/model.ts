import type {Group, Mesh} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import type {CharacterModel, CharacterColorPalette, WeaponEquipConfig} from './types.ts'
import {createWeaponMesh, type WeaponMeshConfig, type WeaponLocalHitBox} from './weapon_mesh.ts'
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

/**
 * 构建完整的方块人模型：由**人形预设骨架定义**生成关节 Group 层级（`createJointHierarchy`），
 * 再用**游戏与骨骼编辑器共用的外观装配器**（`assembleCharacterAppearance`）挂上方块部件（含手部模型）。
 * 武器挂点（rightWeaponMount / leftWeaponMount）是独立关节，不并入手部骨骼。
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

    const createSlot = (mountJoint: Group): WeaponSlot => ({
        mountJoint, group: null, hitCenter: null, tip: null, hitBox: null, cleanup: null, gripY: 0, supportGripOffset: 0,
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
    }

    const equipSlot = (slot: WeaponSlot, meshConfig: WeaponMeshConfig | undefined): void => {
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
        slot.mountJoint.add(result.group)
    }

    const removeWeapon = (): void => {
        clearSlot(rightSlot)
        clearSlot(leftSlot)
    }

    const equipWeapon = (equipConfig: WeaponEquipConfig): void => {
        equipSlot(rightSlot, equipConfig.main)
        equipSlot(leftSlot, equipConfig.offhand)
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
        rightLegHip: requireGroup(groups, 'rightLegHip'),
        rightThigh: rightThighMesh,
        rightLegKnee: requireGroup(groups, 'rightLegKnee'),
        rightShin: rightShinMesh,
        leftLegHip: requireGroup(groups, 'leftLegHip'),
        leftThigh: leftThighMesh,
        leftLegKnee: requireGroup(groups, 'leftLegKnee'),
        leftShin: leftShinMesh,
        equipWeapon,
        removeWeapon,
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
