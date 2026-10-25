import {Euler, type Group, type Mesh} from 'three'
import type {CharacterConfig} from '../../../../../character/types.ts'
import type {Handedness} from '../../../../../character/handedness.ts'
import {humanoidBodyStateOf} from '../state/body_state.ts'
import type {CharacterColorPalette, WeaponEquipConfig} from '../../../appearance/types.ts'
import type {CharacterModel} from './types.ts'
import type {ResolvedArmorLoadout, ResolvedLimbLoadout} from '../../../../../character/armor/types.ts'
import {createWeaponMesh, isShieldMeshId, resolveAttackBoxes, WEAPON_MESH_GRIPS, type WeaponMeshConfig} from '../../../appearance/weapon_mesh.ts'
import type {WeaponAttackBoxSpec} from '../../../../../character/weapon/mesh_config.ts'
import {createArmorMesh, createLimbMesh, ARMOR_BODY_PART_JOINTS, type ArmorBodyPart} from './armor_mesh.ts'
import {resolveArmorLoadout, resolveLimbLoadout} from '../../../../../character/armor/catalog.ts'
import {SELECT_PALETTE, WEAPON_GRIP_FLEX} from '../../../appearance/constants.ts'
import {SHIELD_STOW_TILT_X} from '../state/constants.ts'
import {recolorTwoFaceBoxPart, recolorHeadBoxPart, type TrackedBoxPart} from '../../../../../render/box_parts.ts'
import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {createJointHierarchy} from '../../../../../skeleton/render/joint_hierarchy.ts'
import type {BodyForm} from '../../common/types.ts'
import {resolveEquipmentMounts} from '../../common/equipment.ts'

/** 单个武器槽（主手/副手各一）：武器骨骼挂点 + 武器网格状态 */
interface WeaponSlot {
    readonly mountJoint: Group
    group: Group | null
    hitCenter: Mesh | null
    tip: Mesh | null
    attackBoxes: readonly WeaponAttackBoxSpec[]
    cleanup: (() => void) | null
    /** 原始几何中的主握把 Y 坐标（供骨骼编辑器校验主握点） */
    gripY: number
    supportGripOffset: number
    /** 当前装配的网格配置引用（同引用时跳过重建，只做挂背/回手换父节点） */
    meshConfig: WeaponMeshConfig | undefined
}

/** 解析人形武器攻击箱的符号关节：weaponMount / hand / forearm / upperArm → 主副手侧实际关节 */
const resolveHumanoidAttackBoxJoints = (
    boxes: readonly WeaponAttackBoxSpec[] | undefined,
    mountJointId: string,
): readonly WeaponAttackBoxSpec[] | undefined => {
    if (boxes === undefined) return undefined
    const side = mountJointId.startsWith('left') ? 'left' : 'right'
    return boxes.map(box => {
        switch (box.jointId) {
            case 'weaponMount': return {...box, jointId: mountJointId}
            case 'hand': return {...box, jointId: `${side}HandPivot`}
            case 'forearm': return {...box, jointId: `${side}ArmElbow`}
            case 'upperArm': return {...box, jointId: `${side}ArmShoulder`}
            default: return box
        }
    })
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

/** 肢体部位 id → 顶替（隐藏）的人类身体部位：装备肢体即 replace，缺省保留人类肢体 */
const LIMB_HIDDEN_PARTS_BY_BODY_PART: Readonly<Record<string, readonly ArmorBodyPart[]>> = {
    head: ['head'],
    arms: ['rightUpperArm', 'rightForearm', 'rightHand', 'leftUpperArm', 'leftForearm', 'leftHand'],
    body: ['torso'],
    legs: ['rightThigh', 'rightShin', 'leftThigh', 'leftShin'],
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
export const createCharacterModel = (config: CharacterConfig, faction: number, plan: BodyForm): CharacterModel => {
    /* 当前调色板（换阵营时更新）：肢体颜色随阵营调色板重建；阵营色统一走 `factionColorOf`。
     * 体形计划声明固定调色板时，外观不随阵营变化。 */
    const fixedPalette = plan.palette
    let currentPalette = fixedPalette ?? SELECT_PALETTE(faction)

    /* 关节 Group 层级 = 体形骨架定义的唯一映射（含手部 rightHandPivot/leftHandPivot 与武器挂点） */
    const scaffold = skeletonFromDefinition(plan.skeleton.build())
    const hierarchy = createJointHierarchy(scaffold)
    const groups = hierarchy.groups
    const group = requireGroup(groups, 'root')
    group.scale.set(config.scale, config.scale, config.scale)

    /* 模型层：体形外观部件（与骨骼编辑器同一构建器），手部部件挂手部关节 */
    const appearance = plan.assemble(groups, currentPalette)
    const jointParts = appearance.jointParts

    const rightWeaponMount = requireGroup(groups, 'rightWeaponMount')
    const leftWeaponMount = requireGroup(groups, 'leftWeaponMount')
    const backWeaponMount = requireGroup(groups, 'backWeaponMount')

    const createSlot = (mountJoint: Group): WeaponSlot => ({
        mountJoint, group: null, hitCenter: null, tip: null, attackBoxes: [], cleanup: null, gripY: 0, supportGripOffset: 0, meshConfig: undefined,
    })
    const rightSlot = createSlot(rightWeaponMount)
    const leftSlot = createSlot(leftWeaponMount)

    /* 惯用手：决定主 / 副手槽位（主手武器挂点）与非对称网格镜像；缺省 / 非法值 = 右撇子 */
    let currentHandedness: Handedness = humanoidBodyStateOf(config.bodyState).handedness

    /** 当前主手槽（右撇子 = 右挂点槽、左撇子 = 左挂点槽） */
    const mainSlot = (): WeaponSlot => currentHandedness === 'left' ? leftSlot : rightSlot
    /** 当前副手槽（与主手相反） */
    const offSlot = (): WeaponSlot => currentHandedness === 'left' ? rightSlot : leftSlot

    /** 非对称网格镜像系数：左撇子 = -1（跨矢状面反射；Three.js 按矩阵行列式自动翻转绕序，法线由法线矩阵保持） */
    const mirrorScale = (): number => currentHandedness === 'left' ? -1 : 1

    const clearSlot = (slot: WeaponSlot): void => {
        if (slot.group !== null) slot.mountJoint.remove(slot.group)
        slot.cleanup?.()
        slot.group = null
        slot.hitCenter = null
        slot.tip = null
        slot.attackBoxes = []
        slot.cleanup = null
        slot.gripY = 0
        slot.supportGripOffset = 0
        slot.meshConfig = undefined
        /* 武器骨骼回到默认（无握持）角：未播放动画的静止姿态下空手不带动武器朝向 */
        slot.mountJoint.rotation.set(0, 0, 0)
    }

    const equipSlot = (
        slot: WeaponSlot,
        meshConfig: WeaponMeshConfig | undefined,
        attackBoxes: readonly WeaponAttackBoxSpec[] | undefined,
    ): void => {
        /* 同一网格配置引用：跳过重建（换持握模式只改挂背状态时零开销） */
        if (slot.meshConfig === meshConfig) return
        clearSlot(slot)
        if (meshConfig === undefined) return
        /* 武器模型已自带固有握持（握把中心在模型原点）；直接挂到武器骨骼下，朝向完全由骨骼动画控制 */
        const result = createWeaponMesh(meshConfig)
        slot.group = result.group
        slot.hitCenter = result.hitCenter
        slot.tip = result.tip
        slot.attackBoxes = resolveAttackBoxes(result, slot.mountJoint.name, resolveHumanoidAttackBoxJoints(attackBoxes, slot.mountJoint.name))
        slot.cleanup = result.cleanup
        slot.gripY = result.gripY
        slot.supportGripOffset = result.supportGripOffset
        slot.meshConfig = meshConfig
        /* 左撇子：武器网格跨矢状面镜像（仅 x 翻转；武器挂点本地系与 canonical 同向，故局部翻转 = 全局反射） */
        result.group.scale.set(mirrorScale(), 1, 1)
        slot.mountJoint.add(result.group)
        /* 默认（未播放动画的静止姿态，如装备预览）：武器骨骼即为持械握持屈角，
         * 与待机 / 行走等常规状态一致，避免武器贴合前臂穿模（有动画时由 clip 轨道覆盖） */
        slot.mountJoint.rotation.set(WEAPON_GRIP_FLEX, 0, 0)
    }

    const removeWeapon = (): void => {
        clearSlot(rightSlot)
        clearSlot(leftSlot)
    }

    /** 副手武器挂背 / 回手：只换父节点，不重建几何（双手共持时挂背，其余模式握在副手） */
    const setOffhandStowed = (stowed: boolean): void => {
        const slot = offSlot()
        const group = slot.group
        if (group === null) return
        const target = stowed ? backWeaponMount : slot.mountJoint
        if (group.parent !== target) target.add(group)
        /* 盾挂背：叠加绕武器本地 X 的倾角，使盾面法线水平、盾面竖直贴背；其余武器沿用固有握持角 */
        const id = slot.meshConfig?.id
        const grip = id !== undefined ? WEAPON_MESH_GRIPS[id] : undefined
        const tilt = stowed && id !== undefined && isShieldMeshId(id) ? SHIELD_STOW_TILT_X : 0
        group.quaternion.setFromEuler(new Euler((grip?.rx ?? 0) + tilt, grip?.ry ?? 0, grip?.rz ?? 0))
    }

    const equipWeapon = (equipConfig: WeaponEquipConfig): void => {
        equipSlot(mainSlot(), equipConfig.main, equipConfig.mainAttackBoxes)
        equipSlot(offSlot(), equipConfig.offhand, equipConfig.offhandAttackBoxes)
        /* 缺省 = 握在副手；显式 offhandStowed = 挂背（双手共持） */
        setOffhandStowed(equipConfig.offhandStowed === true)
    }

    /* ── 护甲 / 肢体：纯视觉部件，逐槽挂到对应关节（骨架编辑后缺失的关节安全跳过） ── */
    let mountedArmor: MountedArmorPart[] = []
    let mountedLimbs: MountedArmorPart[] = []
    /** 当前护甲 / 肢体装备表（换阵营重建肢体、重算顶替部位时读取） */
    let currentArmor: ResolvedArmorLoadout = {}
    let currentLimb: ResolvedLimbLoadout = {}
    /** 被护甲 / 肢体顶替而隐藏的身体部件 → 原始可见性（换装 / 卸下时统一还原） */
    let hiddenBodyParts = new Map<TrackedBoxPart, boolean>()

    /** 隐藏某个身体部位的基础模型（护甲 / 肢体顶替而非叠加）；同一部件只记录一次原始可见性 */
    const hideBodyPart = (bodyPart: ArmorBodyPart): void => {
        const part = jointParts.get(ARMOR_BODY_PART_JOINTS[bodyPart])
        if (part === undefined) return
        if (!hiddenBodyParts.has(part)) hiddenBodyParts.set(part, part.mesh.visible)
        part.mesh.visible = false
    }

    /** 按「当前护甲 + 当前肢体」重算被顶替的身体部位（先整体还原再统一隐藏，两套装备互不干扰） */
    const refreshHiddenBodyParts = (): void => {
        for (const [part, visible] of hiddenBodyParts) part.mesh.visible = visible
        hiddenBodyParts = new Map()
        for (const piece of Object.values(currentArmor)) {
            for (const bodyPart of piece.mesh.hideBodyParts ?? []) hideBodyPart(bodyPart)
        }
        for (const [bodyPart, piece] of Object.entries(currentLimb)) {
            if (piece === undefined) continue
            for (const hidden of LIMB_HIDDEN_PARTS_BY_BODY_PART[bodyPart] ?? []) hideBodyPart(hidden)
        }
    }

    /** 清理并移除一组已装配部件（几何 / 材质一并释放） */
    const clearMounted = (parts: MountedArmorPart[]): void => {
        for (const part of parts) {
            part.group.removeFromParent()
            part.cleanup()
        }
        parts.length = 0
    }

    const removeArmor = (): void => {
        clearMounted(mountedArmor)
        currentArmor = {}
        refreshHiddenBodyParts()
    }

    const equipArmor = (loadout: ResolvedArmorLoadout): void => {
        clearMounted(mountedArmor)
        currentArmor = loadout
        for (const [bodyPart, piece] of Object.entries(loadout)) {
            if (piece === undefined) continue
            const slot = plan.equipSlots.find(candidate => candidate.kind === 'armor' && candidate.bodyPart === bodyPart)
            if (slot === undefined) continue
            for (const mount of resolveEquipmentMounts(piece, slot)) {
                const joint = groups.get(mount.jointId)
                if (joint === undefined) continue
                const result = createArmorMesh(mount.mesh, mount.jointId)
                result.group.position.set(mount.offset?.x ?? 0, mount.offset?.y ?? 0, mount.offset?.z ?? 0)
                result.group.rotation.set(mount.rotation?.x ?? 0, mount.rotation?.y ?? 0, mount.rotation?.z ?? 0)
                result.group.scale.set(
                    (mount.scale?.x ?? 1) * mirrorScale(),
                    mount.scale?.y ?? 1,
                    mount.scale?.z ?? 1,
                )
                joint.add(result.group)
                mountedArmor.push({group: result.group, cleanup: result.cleanup})
            }
        }
        refreshHiddenBodyParts()
    }

    const removeLimbs = (): void => {
        clearMounted(mountedLimbs)
        currentLimb = {}
        refreshHiddenBodyParts()
    }

    const equipLimbs = (loadout: ResolvedLimbLoadout): void => {
        clearMounted(mountedLimbs)
        currentLimb = loadout
        for (const [bodyPart, piece] of Object.entries(loadout)) {
            if (piece === undefined) continue
            const slot = plan.equipSlots.find(candidate => candidate.kind === 'limb' && candidate.bodyPart === bodyPart)
            if (slot === undefined) continue
            for (const mount of resolveEquipmentMounts(piece, slot)) {
                const joint = groups.get(mount.jointId)
                if (joint === undefined) continue
                const result = createLimbMesh(mount.mesh, mount.jointId, currentPalette)
                result.group.position.set(mount.offset?.x ?? 0, mount.offset?.y ?? 0, mount.offset?.z ?? 0)
                result.group.rotation.set(mount.rotation?.x ?? 0, mount.rotation?.y ?? 0, mount.rotation?.z ?? 0)
                result.group.scale.set(
                    (mount.scale?.x ?? 1) * mirrorScale(),
                    mount.scale?.y ?? 1,
                    mount.scale?.z ?? 1,
                )
                joint.add(result.group)
                mountedLimbs.push({group: result.group, cleanup: result.cleanup})
            }
        }
        refreshHiddenBodyParts()
    }

    /** 交换两个挂点槽的全部内容（挂点固定、内容迁移；换手时武器网格不重建） */
    const swapSlotContents = (a: WeaponSlot, b: WeaponSlot): void => {
        const g = a.group; a.group = b.group; b.group = g
        const h = a.hitCenter; a.hitCenter = b.hitCenter; b.hitCenter = h
        const t = a.tip; a.tip = b.tip; b.tip = t
        const ab = a.attackBoxes; a.attackBoxes = b.attackBoxes; b.attackBoxes = ab
        const c = a.cleanup; a.cleanup = b.cleanup; b.cleanup = c
        const gy = a.gripY; a.gripY = b.gripY; b.gripY = gy
        const s = a.supportGripOffset; a.supportGripOffset = b.supportGripOffset; b.supportGripOffset = s
        const mc = a.meshConfig; a.meshConfig = b.meshConfig; b.meshConfig = mc
    }

    /**
     * 切换惯用手：主 / 副手内容在左右挂点槽间迁移，并重挂到对应武器挂点 +
     * 重设全部非对称网格（武器 / 护甲 / 肢体）的镜像；副手挂背状态保持不变。
     * 动作镜像由进度组合层按 handedness 处理，此处不动。
     */
    const setHandedness = (handedness: Handedness): void => {
        if (handedness === currentHandedness) return
        const offStowed = offSlot().group?.parent === backWeaponMount
        swapSlotContents(rightSlot, leftSlot)
        currentHandedness = handedness
        for (const slot of [rightSlot, leftSlot]) {
            if (slot.group === null) continue
            slot.mountJoint.add(slot.group)
            slot.group.scale.x = mirrorScale()
        }
        for (const part of [...mountedArmor, ...mountedLimbs]) part.group.scale.x *= -1
        setOffhandStowed(offStowed)
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

    /** 根据新调色板原地更新所有部位材质颜色（不重建几何体）；已装备肢体随阵营重建外观 */
    const recolor = (newPalette: CharacterColorPalette): void => {
        /* 固定调色板体形：外观不随阵营重着色 */
        if (fixedPalette !== undefined) return
        currentPalette = newPalette
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
        /* 肢体外观的颜色随阵营调色板：仅换阵营时重建（非每帧） */
        if (Object.keys(currentLimb).length > 0) equipLimbs(currentLimb)
    }

    const dispose = (): void => {
        removeWeapon()
        removeArmor()
        removeLimbs()
        appearance.cleanup()
        hierarchy.cleanup()
    }

    return {
        group,
        jointGroups: groups,
        jointParts,
        colliderMeshes: appearance.colliderMeshes,
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
        setHandedness,
        removeWeapon,
        equipArmor,
        removeArmor,
        equipLimbs,
        removeLimbs,
        equipEquipmentState: (state) => {
            equipArmor(resolveArmorLoadout(state.armor))
            equipLimbs(resolveLimbLoadout(state.limb))
        },
        recolor,
        get weaponMesh() { return mainSlot().hitCenter },
        get weaponTip() { return mainSlot().tip },
        get weaponGroup() { return mainSlot().group },
        get weaponAttackBoxes() { return mainSlot().attackBoxes },
        get weaponGripY() { return mainSlot().gripY },
        get weaponSupportGripOffset() { return mainSlot().supportGripOffset },
        get offhandWeaponMesh() { return offSlot().hitCenter },
        get offhandWeaponTip() { return offSlot().tip },
        get offhandWeaponGroup() { return offSlot().group },
        get offhandWeaponAttackBoxes() { return offSlot().attackBoxes },
        get offhandWeaponGripY() { return offSlot().gripY },
        dispose,
    }
}
