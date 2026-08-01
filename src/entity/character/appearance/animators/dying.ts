import type {AnimationHandler} from '../types.ts'

const FALL_END = 0.3

export const dyingAnim: AnimationHandler = {
    enter: () => {},
    update: (dt, model, ctx) => {
        void dt
        const t = ctx.stateTime

        const p = Math.min(t / FALL_END, 1)
        const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2

        model.group.rotation.x = Math.PI / 2 * easedP

        model.rightArmShoulder.rotation.x = easedP * 0.4
        model.leftArmShoulder.rotation.x = easedP * 0.4
        model.rightArmShoulder.rotation.z = easedP * 0.6
        model.leftArmShoulder.rotation.z = -easedP * 0.6

        model.rightArmElbow.rotation.x = easedP * 0.5
        model.leftArmElbow.rotation.x = easedP * 0.5

        model.rightLegHip.rotation.x = easedP * 0.2
        model.leftLegHip.rotation.x = easedP * 0.2
        model.rightLegKnee.rotation.x = easedP * 0.3
        model.leftLegKnee.rotation.x = easedP * 0.3

        model.headNeck.rotation.x = easedP * 0.3
    },
    exit: () => {},
}
