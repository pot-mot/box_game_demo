import {BoxGeometry, Group, Mesh, MeshBasicMaterial, type Scene} from 'three'
import type {Skeleton} from '../../../skeleton/skeleton.ts'
import {createSkeletonFromGroups, type SkeletonSceneBridge} from './bridge.ts'
import {JOINT_GIZMO_COLOR, JOINT_GIZMO_SIZE} from '../constants.ts'

/** 关节视觉：Group 层级（以骨架关节树为真源）+ gizmo + 桥接骨架 */
export interface JointVisuals {
    /** 骨架根容器（挂入 scene；整体移动 = 移动骨架） */
    readonly rootGroup: Group
    /** 关节 id → Group（层级与关节树一致） */
    readonly groups: ReadonlyMap<string, Group>
    /** 关节 id → gizmo mesh（选中改色用） */
    readonly gizmos: ReadonlyMap<string, Mesh>
    readonly bridge: SkeletonSceneBridge
    cleanup: () => void
}

/** 按骨架关节树创建 Group 层级 + 关节 gizmo，并建立场景真源桥接 */
export const createJointVisuals = (skeleton: Skeleton, scene: Scene): JointVisuals => {
    const rootGroup = new Group()
    scene.add(rootGroup)

    const groups = new Map<string, Group>()
    const gizmos = new Map<string, Mesh>()
    const materials: MeshBasicMaterial[] = []
    const geometries: BoxGeometry[] = []

    for (const joint of skeleton.joints.values()) {
        const group = new Group()
        groups.set(joint.id, group)
        const geometry = new BoxGeometry(JOINT_GIZMO_SIZE, JOINT_GIZMO_SIZE, JOINT_GIZMO_SIZE)
        const material = new MeshBasicMaterial({color: JOINT_GIZMO_COLOR})
        materials.push(material)
        geometries.push(geometry)
        const gizmo = new Mesh(geometry, material)
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

    const bridge = createSkeletonFromGroups(
        [...groups.entries()].map(([jointId, group]) => ({jointId, group})),
    )

    const cleanup = (): void => {
        for (const gizmo of gizmos.values()) gizmo.removeFromParent()
        rootGroup.removeFromParent()
        for (const material of materials) material.dispose()
        for (const geometry of geometries) geometry.dispose()
    }

    return {rootGroup, groups, gizmos, bridge, cleanup}
}

/** 设置关节 gizmo 选中高亮色 */
export const setGizmoSelected = (gizmos: ReadonlyMap<string, Mesh>, jointId: string, selected: boolean): void => {
    const gizmo = gizmos.get(jointId)
    if (gizmo === undefined) return
    const material = gizmo.material as MeshBasicMaterial
    material.color.set(selected ? 0xffcc44 : JOINT_GIZMO_COLOR)
}