import {describe, it, expect} from 'vitest'
import {buildCharacterSkeletonDefinition, PRESET_PART_SIZES} from './preset.ts'
import {skeletonFromDefinition} from '../../skeleton/anim/serialization.ts'
import {MODEL_BASE_HEIGHT, HIP_Y} from '../../render/constants.ts'

/** 人形预设骨架：锚点位置与头部骨骼段约定 */
describe('人形预设骨架定义', () => {
    it('root 为脚底锚点：脚底关节落在地面 y=0，无关节沉入地面以下', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        const heights = [...skeleton.joints.keys()].map(id => skeleton.getWorldPosition(id)!.y)
        expect(skeleton.getWorldPosition('rightFoot')!.y).toBeCloseTo(0)
        expect(skeleton.getWorldPosition('leftFoot')!.y).toBeCloseTo(0)
        expect(Math.min(...heights)).toBeCloseTo(0)
        expect(Math.max(...heights)).toBeCloseTo(MODEL_BASE_HEIGHT)
    })

    it('髋部关节抬至腿高，颈根位于躯干顶端（肩部同高）', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        expect(skeleton.getWorldPosition('spine')!.y).toBeCloseTo(HIP_Y)
        expect(skeleton.getWorldPosition('headNeck')!.y).toBeCloseTo(HIP_Y + PRESET_PART_SIZES.bodyH)
        expect(skeleton.getWorldPosition('rightArmShoulder')!.y).toBeCloseTo(HIP_Y + PRESET_PART_SIZES.bodyH)
    })

    it('头顶关节收束头部段：躯干/头部段均为沿脊柱向上的正长段', () => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        expect(skeleton.getWorldPosition('headTop')!.y).toBeCloseTo(MODEL_BASE_HEIGHT)
        const torso = skeleton.findBone('torso')
        const head = skeleton.findBone('head')
        expect(torso?.head.id).toBe('spine')
        expect(torso?.tail.id).toBe('headNeck')
        expect(torso?.length).toBeCloseTo(PRESET_PART_SIZES.bodyH)
        expect(head?.head.id).toBe('headNeck')
        expect(head?.tail.id).toBe('headTop')
        expect(head?.length).toBeCloseTo(PRESET_PART_SIZES.headH)
    })
})
