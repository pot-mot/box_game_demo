import type {AnimationHandler} from '../types.ts'

export const idleAnim: AnimationHandler = {
    enter: (model) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.rightLegHip.rotation.set(0, 0, 0)
        model.leftLegHip.rotation.set(0, 0, 0)
        model.rightLegKnee.rotation.set(0, 0, 0)
        model.leftLegKnee.rotation.set(0, 0, 0)
        model.headNeck.rotation.set(0, 0, 0)
    },
    update: (dt, model, ctx) => {
        const t = ctx.stateTime
        void dt

        const armSway = Math.sin(t * 1.8) * 0.06
        model.rightArmShoulder.rotation.x = armSway
        model.leftArmShoulder.rotation.x = -armSway

        model.rightArmElbow.rotation.x = 0.08
        model.leftArmElbow.rotation.x = 0.08

        model.rightLegHip.rotation.x = 0
        model.leftLegHip.rotation.x = 0
        model.rightLegKnee.rotation.x = 0
        model.leftLegKnee.rotation.x = 0

        model.headNeck.rotation.x = Math.sin(t * 2.5) * 0.02
        model.headNeck.rotation.z = 0
    },
    exit: () => {},
}
