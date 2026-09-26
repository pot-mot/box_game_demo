import {createSkeletonFromGroups, type SkeletonSceneBridge} from '../../skeleton/render/bridge.ts'
import type {CharacterModel} from './types.ts'

/**
 * 角色模型桥接：把方块人模型的 Group 关节层级绑定为领域骨架
 * （领域 FK 缓存为唯一世界变换源，动画播放器 applyPose 自动写回 Group）。
 * 关节 id 与 base_clips 的 CHARACTER_JOINT_IDS 一一对应；
 * 额外包含 rightHandPivot（武器挂点，保持完整层级 so 右腕 IK 目标世界位置正确）
 * 与 leftHandPivot（双手共持 IK 链末端）；
 * 两者不被 clip 驱动，applyPose 不会改写其静止位置。
 * 根位移由物理 body（syncPositions）管理，故 rootTranslationExternallyManaged = true。
 */
export const createCharacterSkeletonBridge = (model: CharacterModel): SkeletonSceneBridge => createSkeletonFromGroups([
    {jointId: 'root', group: model.group},
    {jointId: 'spine', group: model.spine},
    {jointId: 'headNeck', group: model.headNeck},
    {jointId: 'rightArmShoulder', group: model.rightArmShoulder},
    {jointId: 'rightArmElbow', group: model.rightArmElbow},
    {jointId: 'rightHandPivot', group: model.rightHandPivot},
    {jointId: 'rightWristPivot', group: model.rightWristPivot},
    {jointId: 'leftArmShoulder', group: model.leftArmShoulder},
    {jointId: 'leftArmElbow', group: model.leftArmElbow},
    {jointId: 'leftHandPivot', group: model.leftHandPivot},
    {jointId: 'rightLegHip', group: model.rightLegHip},
    {jointId: 'rightLegKnee', group: model.rightLegKnee},
    {jointId: 'leftLegHip', group: model.leftLegHip},
    {jointId: 'leftLegKnee', group: model.leftLegKnee},
], true, {rootTranslationExternallyManaged: true})