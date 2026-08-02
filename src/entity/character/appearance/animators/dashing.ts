import type {AnimationHandler} from '../types.ts'

export const dashingAnim: AnimationHandler = {
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
        const t = ctx.stateTime * 30
        const legSwing = Math.sin(t) * 0.15
        model.rightLegHip.rotation.x = legSwing
        model.leftLegHip.rotation.x = -legSwing
        model.rightLegKnee.rotation.x = 0.05
        model.leftLegKnee.rotation.x = 0.05

        model.body.rotation.x = -0.15
        model.rightArmShoulder.rotation.x = -0.5
        model.leftArmShoulder.rotation.x = -0.5
        model.rightArmElbow.rotation.x = -0.3
        model.leftArmElbow.rotation.x = -0.3

        model.headNeck.rotation.x = 0.1
        model.headNeck.rotation.y = 0
    },
    exit: (model) => {
        model.rightLegHip.rotation.set(0, 0, 0)
        model.leftLegHip.rotation.set(0, 0, 0)
        model.rightLegKnee.rotation.set(0, 0, 0)
        model.leftLegKnee.rotation.set(0, 0, 0)
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.body.rotation.set(0, 0, 0)
        model.headNeck.rotation.set(0, 0, 0)
    },
}
