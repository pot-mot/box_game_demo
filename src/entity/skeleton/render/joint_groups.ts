import {
    Group,
    Mesh,
    MeshBasicMaterial,
    OctahedronGeometry,
    SphereGeometry,
    Vector3,
    type Scene,
} from 'three'
import type {Skeleton} from '../../../skeleton/skeleton.ts'
import {createSkeletonFromGroups, type SkeletonSceneBridge} from './bridge.ts'
import {
    BONE_DIAMOND_COLOR,
    BONE_DIAMOND_MIN_LENGTH,
    BONE_DIAMOND_SELECTED_COLOR,
    JOINT_GIZMO_COLOR,
    JOINT_GIZMO_RADIUS,
    JOINT_GIZMO_SELECTED_COLOR,
} from '../constants.ts'

/** 骨骼可视化：关节 = 小球，骨骼段 = 菱形（连接段），Group 层级以骨架关节树为真源 */
export interface JointVisuals {
    /** 骨架根容器（挂入 scene；整体移动 = 移动骨架） */
    readonly rootGroup: Group
    /** 关节 id → Group（层级与关节树一致） */
    readonly groups: ReadonlyMap<string, Group>
    /** 关节 id → 小球 mesh（选中改色用） */
    readonly gizmos: ReadonlyMap<string, Mesh>
    /** 骨骼段 id → 菱形 mesh（head→tail 连接段，选中改色用） */
    readonly boneVisuals: ReadonlyMap<string, Mesh>
    readonly bridge: SkeletonSceneBridge
    /** 按骨骼段 length 更新菱形（段长变化后调用，如面板/IK 调整） */
    resizeBoneVisuals: () => void
    cleanup: () => void
}

/** 选中项（joint 高亮小球 / bone 高亮菱形） */
export interface BoneEditSelection {
    readonly kind: 'joint' | 'bone'
    readonly id: string
}

/** 按骨架关节树创建 Group 层级 + 关节小球 + 骨骼段菱形，并建立场景真源桥接 */
export const createJointVisuals = (skeleton: Skeleton, scene: Scene): JointVisuals => {
    const rootGroup = new Group()
    scene.add(rootGroup)

    const groups = new Map<string, Group>()
    const gizmos = new Map<string, Mesh>()
    const boneVisuals = new Map<string, Mesh>()
    const materials: MeshBasicMaterial[] = []
    const geometries: (SphereGeometry | OctahedronGeometry)[] = []

    /* 关节小球 */
    for (const joint of skeleton.joints.values()) {
        const group = new Group()
        groups.set(joint.id, group)
        const geometry = new SphereGeometry(JOINT_GIZMO_RADIUS, 16, 12)
        const material = new MeshBasicMaterial({color: JOINT_GIZMO_COLOR})
        materials.push(material)
        geometries.push(geometry)
        const gizmo = new Mesh(geometry, material)
        gizmo.userData.jointId = joint.id
        gizmos.set(joint.id, gizmo)
        group.add(gizmo)
    }

    for (const joint of skeleton.joints.values()) {
        const group = groups.get(joint.id)!
        if (joint.parent !== undefined) {
            const parentGroup = groups.get(joint.parent.id)
            if (parentGroup !== undefined) {
                parentGroup.add(group)
                continue
            }
        }
        rootGroup.add(group)
    }

    /* 骨骼段菱形：挂在 head group 下（head→tail 为父子链，段方向在 head 局部空间恒定），
     * 位置 = 段局部中点、方向对准段、沿段方向拉伸 */
    const resizeBoneVisuals = (): void => {
        for (const bone of skeleton.bones.values()) {
            const mesh = boneVisuals.get(bone.id)
            if (mesh === undefined) continue
            const dir = bone.tail.position.clone()
            const len = bone.length > 0 ? bone.length : dir.length()
            if (len <= BONE_DIAMOND_MIN_LENGTH) {
                mesh.visible = false
                continue
            }
            mesh.visible = true
            if (dir.lengthSq() < 1e-9) {
                dir.set(0, 1, 0)
            } else {
                dir.normalize()
            }
            mesh.position.copy(bone.tail.position).multiplyScalar(0.5)
            mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir)
            mesh.scale.set(1, len, 1)
        }
    }

    for (const bone of skeleton.bones.values()) {
        const headGroup = groups.get(bone.head.id)
        if (headGroup === undefined) continue
        const geometry = new OctahedronGeometry(0.5, 0)
        const material = new MeshBasicMaterial({color: BONE_DIAMOND_COLOR})
        materials.push(material)
        geometries.push(geometry)
        const diamond = new Mesh(geometry, material)
        diamond.userData.boneId = bone.id
        diamond.userData.jointId = bone.head.id
        boneVisuals.set(bone.id, diamond)
        headGroup.add(diamond)
    }
    resizeBoneVisuals()

    const bridge = createSkeletonFromGroups(
        [...groups.entries()].map(([jointId, group]) => ({jointId, group})),
    )

    const cleanup = (): void => {
        for (const gizmo of gizmos.values()) gizmo.removeFromParent()
        for (const diamond of boneVisuals.values()) diamond.removeFromParent()
        rootGroup.removeFromParent()
        for (const material of materials) material.dispose()
        for (const geometry of geometries) geometry.dispose()
    }

    return {rootGroup, groups, gizmos, boneVisuals, bridge, resizeBoneVisuals, cleanup}
}

/** 设置选中高亮：joint 高亮小球、bone 高亮菱形 */
export const setSelectedVisual = (
    visuals: JointVisuals,
    selection: BoneEditSelection | undefined,
    selected: boolean,
): void => {
    if (selection === undefined) return
    if (selection.kind === 'joint') {
        const gizmo = visuals.gizmos.get(selection.id)
        if (gizmo === undefined) return
        const material = gizmo.material as MeshBasicMaterial
        material.color.set(selected ? JOINT_GIZMO_SELECTED_COLOR : JOINT_GIZMO_COLOR)
    } else {
        const diamond = visuals.boneVisuals.get(selection.id)
        if (diamond === undefined) return
        const material = diamond.material as MeshBasicMaterial
        material.color.set(selected ? BONE_DIAMOND_SELECTED_COLOR : BONE_DIAMOND_COLOR)
    }
}

/** 清除全部选中高亮（切回默认色） */
export const clearSelectedVisuals = (visuals: JointVisuals): void => {
    for (const gizmo of visuals.gizmos.values()) {
        const material = gizmo.material as MeshBasicMaterial
        material.color.set(JOINT_GIZMO_COLOR)
    }
    for (const diamond of visuals.boneVisuals.values()) {
        const material = diamond.material as MeshBasicMaterial
        material.color.set(BONE_DIAMOND_COLOR)
    }
}