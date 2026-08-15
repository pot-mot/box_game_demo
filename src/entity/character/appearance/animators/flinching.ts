import type {AnimationHandler} from '../types.ts'
import {FLINCH_DURATION} from '../../../../character/combat/attack_phases.ts'
import {HIP_Y, FLINCH_SPINE_BACK, FLINCH_ARM_RAISE, FLINCH_ARM_SPREAD, FLINCH_ELBOW, FLINCH_HEAD_BACK} from '../constants.ts'

/**
 * 受击硬直：冲击瞬间后仰最快（三次 ease-out），随后缓收。
 * 双臂抬举护头、屈肘、头部后仰，武器随腕关节自然垂落。
 */
export const flinchingAnim: AnimationHandler = {
    enter: (model) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.rightWristPivot.rotation.set(0, 0, 0)
        model.headNeck.rotation.set(0, 0, 0)
        model.spine.rotation.set(0, 0, 0)
        model.spine.position.set(0, HIP_Y, 0)
    },
    update: (_dt, model, ctx) => {
        void _dt
        const p = Math.min(ctx.stateTime / FLINCH_DURATION, 1)
        const e = 1 - Math.pow(1 - p, 3)

        model.spine.rotation.x = -FLINCH_SPINE_BACK * e
        model.rightArmShoulder.rotation.x = -FLINCH_ARM_RAISE * e
        model.leftArmShoulder.rotation.x = -FLINCH_ARM_RAISE * e
        model.rightArmShoulder.rotation.z = FLINCH_ARM_SPREAD * e
        model.leftArmShoulder.rotation.z = -FLINCH_ARM_SPREAD * e
        model.rightArmElbow.rotation.x = FLINCH_ELBOW * e
        model.leftArmElbow.rotation.x = FLINCH_ELBOW * e
        model.headNeck.rotation.x = -FLINCH_HEAD_BACK * e

        model.rightLegHip.rotation.x = 0
        model.leftLegHip.rotation.x = 0
        model.rightLegKnee.rotation.x = 0
        model.leftLegKnee.rotation.x = 0
    },
    exit: (model) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.rightWristPivot.rotation.set(0, 0, 0)
        model.headNeck.rotation.set(0, 0, 0)
        model.spine.rotation.set(0, 0, 0)
        model.spine.position.set(0, HIP_Y, 0)
    },
}
