import {Quaternion, Vector3} from 'three'

/** 全局关节 id 计数器：未显式指定 id 时生成全局唯一 id */
let nextJointId = 1

/**
 * 骨骼关节点（≈ Godot bone）：
 * - 持有相对父关节的局部变换（position + rotation），通过 parent 单向引用组织为树；
 * - children 数组由 connectJoint / disconnectJoint 维护（可变数组，接口内保持只读视图约定）；
 * - ikRootLevel：IK 根级别标记（undefined = 普通关节），IK 链回溯见 resolveIkChain。
 */
export interface SkeletonJoint {
    readonly id: string
    readonly name: string
    /** 单向连接：父关节引用（根关节为 undefined） */
    parent: SkeletonJoint | undefined
    /** 局部位置（相对父关节） */
    position: Vector3
    /** 局部旋转（四元数，相对父关节） */
    rotation: Quaternion
    /** 子关节集合（由 connectJoint / disconnectJoint 维护；消费方按只读约定使用，勿直接增删） */
    readonly children: SkeletonJoint[]
    /** IK 根级别（undefined = 普通关节；0 为最高级根） */
    ikRootLevel: number | undefined
}

/** 创建骨骼关节点。id 未显式提供时由全局计数器生成唯一 id；
 *  显式 id 形如 joint_N 时同步推进计数器，避免与后续自动 id 碰撞（导入资产场景） */
export const createSkeletonJoint = (name: string, id?: string): SkeletonJoint => {
    const children: SkeletonJoint[] = []
    if (id !== undefined) {
        const match = /^joint_(\d+)$/.exec(id)
        if (match !== null) {
            nextJointId = Math.max(nextJointId, Number(match[1]) + 1)
        }
    }
    const joint: SkeletonJoint = {
        id: id ?? `joint_${nextJointId++}`,
        name,
        parent: undefined,
        position: new Vector3(),
        rotation: new Quaternion(),
        children,
        ikRootLevel: undefined,
    }
    return joint
}

/** 断言 joint 不在 parent 的祖先链上（禁止自环） */
const assertNotAncestor = (parent: SkeletonJoint, joint: SkeletonJoint): void => {
    let cursor: SkeletonJoint | undefined = joint
    while (cursor !== undefined) {
        if (cursor === parent) {
            throw new Error(`connectJoint 失败：关节 "${parent.name}" 是 "${joint.name}" 的祖先，禁止自环连接`)
        }
        cursor = cursor.parent
    }
}

/**
 * 建立单向连接：child.parent = parent，并把 child 加入 parent.children。
 * 若 child 已有父关节，先断开旧连接（隐式 reparent）。
 */
export const connectJoint = (parent: SkeletonJoint, child: SkeletonJoint): void => {
    if (parent === child) {
        throw new Error(`connectJoint 失败：不能连接自身（${parent.name}）`)
    }
    if (child.parent === parent) return
    assertNotAncestor(parent, child)
    if (child.parent !== undefined) {
        disconnectJoint(child)
    }
    child.parent = parent
    parent.children.push(child)
}

/** 断开单向连接：从父关节的 children 移除，自身 parent 置 undefined */
export const disconnectJoint = (joint: SkeletonJoint): void => {
    const parent = joint.parent
    if (parent === undefined) return
    const siblings = parent.children
    const index = siblings.indexOf(joint)
    if (index >= 0) siblings.splice(index, 1)
    joint.parent = undefined
}