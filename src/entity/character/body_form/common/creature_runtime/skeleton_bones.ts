import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'

type JointDefinition = SkeletonDefinition['joints'][number]
type BoneDefinition = SkeletonDefinition['bones'][number]

/** 骨骼段声明：id / 显示名 / 头关节 / 尾关节（长度由关节静止位置自动推导） */
export type BoneEdgeSpec = readonly [
    id: string,
    name: string,
    headJointId: string,
    tailJointId: string,
]

/**
 * 通用生物骨骼段生成：按关节静止位置计算段长，供狼 / 马 / 飞龙骨架补齐与人类同构的
 * 「关节 + 骨骼段」层级数据（骨骼编辑器显示连接段、导出资产保留结构）。
 */
export const buildBoneEdges = (
    joints: readonly JointDefinition[],
    specs: readonly BoneEdgeSpec[],
): readonly BoneDefinition[] => {
    const byId = new Map(joints.map(joint => [joint.id, joint]))
    return specs.map(([id, name, headJointId, tailJointId]) => {
        const head = byId.get(headJointId)
        const tail = byId.get(tailJointId)
        if (head === undefined || tail === undefined) {
            throw new Error(`骨骼段 ${id} 引用了未定义关节：${headJointId} → ${tailJointId}`)
        }
        /* 关节 position 是相对父关节的局部坐标：仅直接父子边可直接取尾关节局部偏移；
         * 非直接边长度交由编辑器刷新时按实际距离回写（`syncBoneLengths`） */
        const [tx, ty, tz] = tail.position
        const length = tail.parentId === headJointId ? Math.hypot(tx, ty, tz) : 0
        return {
            id,
            name,
            headJointId,
            tailJointId,
            length,
            roll: 0,
        }
    })
}
