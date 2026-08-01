import type {AnimationHandler} from '../types.ts'

const CROUCH_END = 0.1
const EXTEND_END = 0.3

export const jumpingAnim: AnimationHandler = {
    enter: (model) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.rightLegHip.rotation.set(0, 0, 0)
        model.leftLegHip.rotation.set(0, 0, 0)
        model.rightLegKnee.rotation.set(0, 0, 0)
        model.leftLegKnee.rotation.set(0, 0, 0)
    },
    update: (dt, model, ctx) => {
        void dt
        const t = ctx.stateTime

        if (t < CROUCH_END) {
            const p = t / CROUCH_END
            const hip = p * 0.3
            const knee = p * 0.5
            model.rightLegHip.rotation.x = hip
            model.leftLegHip.rotation.x = hip
            model.rightLegKnee.rotation.x = knee
            model.leftLegKnee.rotation.x = knee

            model.rightArmShoulder.rotation.x = -p * 0.4
            model.leftArmShoulder.rotation.x = -p * 0.4
            model.rightArmElbow.rotation.x = p * 0.3
            model.leftArmElbow.rotation.x = p * 0.3
        } else if (t < EXTEND_END) {
            const p = (t - CROUCH_END) / (EXTEND_END - CROUCH_END)
            const hip = (1 - p) * 0.3
            const knee = (1 - p) * 0.5
            model.rightLegHip.rotation.x = hip
            model.leftLegHip.rotation.x = hip
            model.rightLegKnee.rotation.x = knee
            model.leftLegKnee.rotation.x = knee

            const armUp = -p * 0.8
            model.rightArmShoulder.rotation.x = armUp
            model.leftArmShoulder.rotation.x = armUp
            model.rightArmElbow.rotation.x = p * 0.2
            model.leftArmElbow.rotation.x = p * 0.2
        } else {
            model.rightLegHip.rotation.x = 0
            model.leftLegHip.rotation.x = 0
            model.rightLegKnee.rotation.x = 0
            model.leftLegKnee.rotation.x = 0

            model.rightArmShoulder.rotation.x = -0.8
            model.leftArmShoulder.rotation.x = -0.8
            model.rightArmElbow.rotation.x = 0.15
            model.leftArmElbow.rotation.x = 0.15
        }

        model.headNeck.rotation.x = 0
    },
    exit: (model) => {
        model.rightLegHip.rotation.set(0, 0, 0)
        model.leftLegHip.rotation.set(0, 0, 0)
        model.rightLegKnee.rotation.set(0, 0, 0)
        model.leftLegKnee.rotation.set(0, 0, 0)
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
    },
}
