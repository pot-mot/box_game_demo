import type {AnimationHandler} from '../types.ts'

export const fallingAnim: AnimationHandler = {
    enter: () => {},
    update: (dt, model, ctx) => {
        void dt

        const speed = Math.min(ctx.horizontalSpeed, 4)
        const t = ctx.stateTime

        model.rightArmShoulder.rotation.x = -1.2
        model.leftArmShoulder.rotation.x = -1.2

        const armZ = 0.3 + Math.sin(t * 0.8) * 0.1
        model.rightArmShoulder.rotation.z = armZ
        model.leftArmShoulder.rotation.z = -armZ

        model.rightArmElbow.rotation.x = 0.3
        model.leftArmElbow.rotation.x = 0.3

        const legSpread = speed * 0.04
        model.rightLegHip.rotation.x = -0.15 - legSpread
        model.leftLegHip.rotation.x = -0.15 + legSpread
        model.rightLegKnee.rotation.x = 0.1
        model.leftLegKnee.rotation.x = 0.1

        model.headNeck.rotation.x = 0.15
        model.headNeck.rotation.z = 0
    },
    exit: () => {},
}
