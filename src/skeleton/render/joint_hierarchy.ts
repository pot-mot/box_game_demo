import {Group} from 'three'
import type {Skeleton} from '../skeleton.ts'

/**
 * 骨架 → three Group 层级（bridge.ts 的逆向）：
 * 为每个关节创建一个 Group（局部 position/rotation 取自关节静止 pose），并按关节树父子关系嵌套；
 * 无父关节的关节成为独立根（`roots`）。调用方负责把 roots 挂到自己的容器/场景。
 *
 * 这是「模型构建器」与「骨骼编辑器可视化」共用的层级构建步骤：
 * - 角色模型（entity/character/appearance）据此建 Group 后装配方块部件；
 * - 骨骼编辑器 createJointVisuals 据此建 Group 后追加小球/菱形并建立桥接骨架。
 */
export interface JointHierarchy {
    /** 关节 id → Group（层级与关节树一致） */
    readonly groups: ReadonlyMap<string, Group>
    /** 无父关节的根 Group（顺序与骨架注册顺序一致） */
    readonly roots: readonly Group[]
    /** 从当前父节点解除全部根 Group（销毁前调用） */
    cleanup: () => void
}

export const createJointHierarchy = (skeleton: Skeleton): JointHierarchy => {
    const groups = new Map<string, Group>()
    for (const joint of skeleton.joints.values()) {
        const group = new Group()
        group.name = joint.id
        group.position.copy(joint.position)
        group.quaternion.copy(joint.rotation)
        groups.set(joint.id, group)
    }

    const roots: Group[] = []
    for (const joint of skeleton.joints.values()) {
        const group = groups.get(joint.id)
        if (group === undefined) continue
        const parentGroup = joint.parent !== undefined ? groups.get(joint.parent.id) : undefined
        if (parentGroup !== undefined) {
            parentGroup.add(group)
        } else {
            roots.push(group)
        }
    }

    const cleanup = (): void => {
        for (const root of roots) root.removeFromParent()
    }

    return {groups, roots, cleanup}
}
