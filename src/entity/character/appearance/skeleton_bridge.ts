import {createSkeletonFromGroups, type SkeletonSceneBridge} from '../../skeleton/render/bridge.ts'
import type {GroupJointBinding} from '../../skeleton/render/bridge.ts'
import type {CreatureModel} from './types.ts'

/**
 * 体形模型桥接：把模型 Group 关节层级（`jointGroups`）绑定为领域骨架
 * （领域 FK 缓存为唯一世界变换源，动画播放器 applyPose 自动写回 Group）。
 * 关节 id 与所属体形的 clip 关节 id 一致；跨体形通用。
 * 根位移由物理 body（syncPositions）管理，故 rootTranslationExternallyManaged = true。
 */
export const createCharacterSkeletonBridge = (model: CreatureModel): SkeletonSceneBridge => {
    const bindings: GroupJointBinding[] = [...model.jointGroups.entries()].map(([jointId, group]) => ({jointId, group}))
    return createSkeletonFromGroups(bindings, true, {rootTranslationExternallyManaged: true})
}
