import type {AnimationHandler} from '../types.ts'

const WINDUP_END = 0.15
const STRIKE_END = 0.3

export const attackingAnim: AnimationHandler = {
    enter: (model) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
    },
    update: (dt, model, ctx) => {
        void dt
        const t = ctx.stateTime

        if (t < WINDUP_END) {
            const p = t / WINDUP_END
            model.rightArmShoulder.rotation.x = -p * 1.5
            model.rightArmShoulder.rotation.z = p * 0.3
            model.rightArmElbow.rotation.x = p * 0.4

            model.leftArmShoulder.rotation.x = -p * 0.2
            model.leftArmElbow.rotation.x = p * 0.15

            model.headNeck.rotation.z = -p * 0.08
        } else if (t < STRIKE_END) {
            const p = (t - WINDUP_END) / (STRIKE_END - WINDUP_END)
            const easeP = p < 0.5
                ? 2 * p * p
                : 1 - Math.pow(-2 * p + 2, 2) / 2
            model.rightArmShoulder.rotation.x = -1.5 + easeP * 3.5
            model.rightArmShoulder.rotation.z = 0.3 - easeP * 0.3
            model.rightArmElbow.rotation.x = 0.4 - easeP * 0.5

            model.leftArmShoulder.rotation.x = -0.2
            model.leftArmElbow.rotation.x = 0.15

            model.headNeck.rotation.z = easeP * 0.05
        } else {
            const p = Math.min((t - STRIKE_END) / 0.2, 1)
            model.rightArmShoulder.rotation.x = 2.0 * (1 - p)
            model.rightArmShoulder.rotation.z = 0
            model.rightArmElbow.rotation.x = -0.1 + p * 0.15

            model.leftArmShoulder.rotation.x = -0.2 * (1 - p)
            model.leftArmElbow.rotation.x = 0.15 * (1 - p)

            model.headNeck.rotation.z = 0.05 * (1 - p)
        }

        model.rightLegHip.rotation.x = 0
        model.leftLegHip.rotation.x = 0
        model.rightLegKnee.rotation.x = 0
        model.leftLegKnee.rotation.x = 0
        model.headNeck.rotation.x = Math.sin(t * 6) * 0.02
    },
    exit: (model) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.headNeck.rotation.set(0, 0, 0)
    },
}
