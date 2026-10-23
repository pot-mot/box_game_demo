import {Quaternion, Vector3} from 'three'

/** 全局关节 id 计数器：未显式指定 id 时生成全局唯一 id */
let nextJointId = 1

/** 节点 IK 求解器（求解以该节点为末端、向父级回溯的链） */
export const IK_SOLVERS = ['ccd', 'fabrik'] as const
export type IkSolverId = typeof IK_SOLVERS[number]

/** 节点 IK 配置：末端节点 + 求解器 + 影响父级段数（仅编辑器 Gizmo 拖拽使用，生产动画零运行时 IK） */
export interface JointIkConfig {
    readonly solver: IkSolverId
    /** 影响父级段数（1 = 仅父节点，默认 2） */
    readonly chainDepth: number
}

/** 运行时校验求解器 id（存档/导入边界用） */
export const isIkSolverId = (value: unknown): value is IkSolverId =>
    IK_SOLVERS.some(solver => solver === value)

/**
 * 骨骼关节点（≈ Godot bone）：
 * - 持有相对父关节的局部变换（position + rotation），通过 parent 单向引用组织为树；
 * - children 数组由 connectJoint / disconnectJoint 维护（可变数组，接口内保持只读视图约定）；
 * - ik：节点 IK 配置（undefined = 普通节点）；配置后该节点始终作为 IK 末端求解父级链。
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
    /** 节点 IK 配置（undefined = 普通节点） */
    ik: JointIkConfig | undefined
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
        ik: undefined,
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