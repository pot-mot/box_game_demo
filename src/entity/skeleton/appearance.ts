import type {Group, Mesh} from 'three'
import type {TrackedBoxPart} from '../../render/box_parts.ts'
import type {Skeleton} from '../../skeleton/skeleton.ts'
import type {SkeletonDefinition} from '../../skeleton/anim/serialization.ts'

/** 部件 ↔ 骨骼段绑定（骨骼段长度变化时缩放用）：baseHeight = 长度 1 倍时的基准高度 */
export interface BonePartBinding {
    readonly boneId: string | undefined
    readonly part: TrackedBoxPart
    readonly baseHeight: number
}

/**
 * 骨架实体外观（模型层）装载结果（通用，不绑定具体人形）：
 * 由 `SkeletonPreset.mountAppearance` 提供；`resize` 可选，用于骨骼段长度变化后同步部件缩放。
 */
export interface SkeletonAppearance {
    /** 骨骼段 id → 部件绑定（resize 用） */
    readonly boneParts: ReadonlyMap<string, BonePartBinding>
    /** 全部部件 mesh（raycast 拾取用） */
    readonly partMeshes: readonly Mesh[]
    /** 骨骼段长度变化后按实际距离缩放部件（无部件或无需缩放时省略） */
    resize?: (skeleton: Skeleton) => void
    cleanup: () => void
}

/**
 * 骨架实体预设（由角色侧注入，使 entity/skeleton 保持与人形无关）：
 * 提供「新建预设骨架」的定义与「关节 Group 层级 → 模型外观」的装配器。
 */
export interface SkeletonPreset {
    createDefinition: () => SkeletonDefinition
    mountAppearance: (groups: ReadonlyMap<string, Group>) => SkeletonAppearance
}
