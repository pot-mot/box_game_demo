import {
    ConeGeometry,
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
import {createSkeletonBone} from '../../../skeleton/bone.ts'
import {createJointHierarchy} from '../../../skeleton/render/joint_hierarchy.ts'
import {
    BONE_DIAMOND_COLOR,
    BONE_DIAMOND_MIN_LENGTH,
    BONE_DIAMOND_SELECTED_COLOR,
    BONE_DIAMOND_THICKNESS,
    JOINT_GIZMO_COLOR,
    JOINT_GIZMO_RADIUS,
    JOINT_GIZMO_SELECTED_COLOR,
    ROTATION_GIZMO_COLOR,
    ROTATION_GIZMO_HEIGHT,
    ROTATION_GIZMO_OFFSET,
    ROTATION_GIZMO_RADIUS,
} from '../constants.ts'

/** 骨骼可视化：关节 = 小球，骨骼段 = 细长菱形（连接段），Group 层级以骨架关节树为真源。
 *  骨骼层（小球/菱形/旋转指针）以 x-ray 覆盖方式压在模型层上方（depthTest=false + renderOrder=1）。 */
export interface JointVisuals {
    /** 骨架根容器（挂入 scene；整体移动 = 移动骨架） */
    readonly rootGroup: Group
    /** 关节 id → Group（层级与关节树一致） */
    readonly groups: ReadonlyMap<string, Group>
    /** 关节 id → 小球 mesh（选中改色用） */
    readonly gizmos: ReadonlyMap<string, Mesh>
    /** 骨骼段 id → 菱形 mesh（head→tail 连接段，选中改色用） */
    readonly boneVisuals: ReadonlyMap<string, Mesh>
    /** 桥接骨架：与实体骨架同一对象（写局部 pose 时同步 Group），实体骨架以它为真源 */
    readonly bridge: SkeletonSceneBridge
    /** 按 head→tail 实际距离更新菱形（关节拖拽/面板/IK 调整后调用） */
    resizeBoneVisuals: () => void
    cleanup: () => void
}

/** 选中项（joint 高亮小球 / bone 高亮菱形） */
export interface BoneEditSelection {
    readonly kind: 'joint' | 'bone'
    readonly id: string
}

/** 按骨架关节树创建 Group 层级 + 关节小球 + 骨骼段菱形，并建立场景真源桥接：
 *  桥接骨架与传入骨架同构（复制关节局部 pose/ikRootLevel/骨骼段），此后实体以桥接骨架为骨架对象，
 *  updateWorldTransforms 经 onWorldUpdate 把局部 pose 写回 Group（场景图级联）。 */
export const createJointVisuals = (skeleton: Skeleton, scene: Scene): JointVisuals => {
    const rootGroup = new Group()
    scene.add(rootGroup)

    /* Group 层级由通用构建器生成（与角色模型共用同一实现），编辑器仅追加骨架可视化 */
    const hierarchy = createJointHierarchy(skeleton)
    const groups = hierarchy.groups
    for (const root of hierarchy.roots) rootGroup.add(root)

    const gizmos = new Map<string, Mesh>()
    const boneVisuals = new Map<string, Mesh>()
    const materials: MeshBasicMaterial[] = []
    const geometries: (SphereGeometry | OctahedronGeometry | ConeGeometry)[] = []

    /* 关节小球（骨骼层覆盖渲染：忽略深度、后绘制） */
    for (const joint of skeleton.joints.values()) {
        const group = groups.get(joint.id)
        if (group === undefined) continue
        const geometry = new SphereGeometry(JOINT_GIZMO_RADIUS, 16, 12)
        const material = new MeshBasicMaterial({color: JOINT_GIZMO_COLOR, depthTest: false, depthWrite: false})
        materials.push(material)
        geometries.push(geometry)
        const gizmo = new Mesh(geometry, material)
        gizmo.renderOrder = 1
        gizmo.userData.jointId = joint.id
        gizmos.set(joint.id, gizmo)
        group.add(gizmo)
    }

    /* 桥接骨架：按 Group 层级自动建连（与关节树一致）；局部 pose 由 bridge 从 Group 读回 */
    const bridge = createSkeletonFromGroups(
        [...groups.entries()].map(([jointId, group]) => ({jointId, group})),
        true,
    )
    /* 复制 IK 根级别到桥接骨架 */
    for (const joint of skeleton.joints.values()) {
        const target = bridge.findJoint(joint.id)
        if (target === undefined) continue
        target.ikRootLevel = joint.ikRootLevel
    }
    /* 骨骼段复制到桥接骨架（菱形/面板/时间轴以桥接骨架的 bones 为准） */
    for (const bone of skeleton.bones.values()) {
        const head = bridge.findJoint(bone.head.id)
        const tail = bridge.findJoint(bone.tail.id)
        if (head === undefined || tail === undefined) continue
        bridge.addBone(createSkeletonBone(bone.name, head, tail, bone.length, bone.id))
    }

    /* 骨骼段菱形：挂在 head group 下，位置 = 段局部中点、方向对准 head→tail、
     * 沿段方向拉伸（厚度 = BONE_DIAMOND_THICKNESS）；长度取两端关节实际距离，始终连接两节点 */
    const resizeBoneVisuals = (): void => {
        for (const bone of bridge.bones.values()) {
            const mesh = boneVisuals.get(bone.id)
            if (mesh === undefined) continue
            const headPos = bridge.getWorldPosition(bone.head.id)
            const tailPos = bridge.getWorldPosition(bone.tail.id)
            const headRot = bridge.getWorldRotation(bone.head.id)
            if (headPos === undefined || tailPos === undefined || headRot === undefined) continue
            /* tail 在 head 局部空间的偏移（菱形挂在 head group 下） */
            const local = tailPos.clone().sub(headPos).applyQuaternion(headRot.clone().invert())
            const len = local.length()
            if (len <= BONE_DIAMOND_MIN_LENGTH) {
                mesh.visible = false
                continue
            }
            mesh.visible = true
            const dir = len > 1e-9 ? local.clone().normalize() : new Vector3(0, 1, 0)
            mesh.position.copy(local).multiplyScalar(0.5)
            mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir)
            mesh.scale.set(BONE_DIAMOND_THICKNESS, len, BONE_DIAMOND_THICKNESS)
        }
    }

    for (const bone of bridge.bones.values()) {
        const headGroup = groups.get(bone.head.id)
        if (headGroup === undefined) continue
        const geometry = new OctahedronGeometry(0.5, 0)
        const material = new MeshBasicMaterial({color: BONE_DIAMOND_COLOR, depthTest: false, depthWrite: false})
        materials.push(material)
        geometries.push(geometry)
        const diamond = new Mesh(geometry, material)
        diamond.renderOrder = 1
        diamond.userData.boneId = bone.id
        diamond.userData.jointId = bone.head.id
        boneVisuals.set(bone.id, diamond)
        headGroup.add(diamond)
    }
    /* 把复制到桥接骨架的局部 pose 写回 Group（初始化场景图），再更新菱形 */
    bridge.updateWorldTransforms()
    resizeBoneVisuals()

    const cleanup = (): void => {
        for (const gizmo of gizmos.values()) gizmo.removeFromParent()
        for (const diamond of boneVisuals.values()) diamond.removeFromParent()
        rootGroup.removeFromParent()
        hierarchy.cleanup()
        for (const material of materials) material.dispose()
        for (const geometry of geometries) geometry.dispose()
    }

    return {rootGroup, groups, gizmos, boneVisuals, bridge, resizeBoneVisuals, cleanup}
}

/** 创建旋转指针（方向三角形）：3 棱圆锥，尖端指向局部 +Z，挂到选中关节 Group 下（随关节旋转） */
export const createRotationGizmo = (group: Group, jointId: string): Mesh => {
    const geometry = new ConeGeometry(ROTATION_GIZMO_RADIUS, ROTATION_GIZMO_HEIGHT, 3)
    const material = new MeshBasicMaterial({color: ROTATION_GIZMO_COLOR, depthTest: false, depthWrite: false})
    const mesh = new Mesh(geometry, material)
    /* 圆锥默认尖端 +Y，旋转 π/2 使尖端指向局部 +Z */
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(0, 0, ROTATION_GIZMO_OFFSET)
    mesh.renderOrder = 1
    mesh.userData.jointId = jointId
    mesh.userData.rotHandle = true
    group.add(mesh)
    return mesh
}

/** 销毁旋转指针（从 Group 移除并释放几何/材质） */
export const disposeRotationGizmo = (mesh: Mesh): void => {
    mesh.removeFromParent()
    mesh.geometry.dispose()
    if (mesh.material instanceof MeshBasicMaterial) {
        mesh.material.dispose()
    }
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
