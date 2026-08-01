import type {AnimationHandler} from '../types.ts'
import {WALK_ANIM_MAX_SPEED} from '../constants.ts'

export const walkingAnim: AnimationHandler = {
    enter: () => {},
    update: (dt, model, ctx) => {
        void dt

        const speed = Math.min(ctx.horizontalSpeed, WALK_ANIM_MAX_SPEED)
        const freq = 1.2 + speed * 1.3
        const t = ctx.stateTime * freq

        const legSwing = Math.sin(t) * 0.5
        const kneeBend = Math.max(0, -Math.cos(t)) * 0.35

        model.rightLegHip.rotation.x = legSwing
        model.leftLegHip.rotation.x = -legSwing

        const swingAbs = Math.abs(Math.sin(t))
        model.rightLegKnee.rotation.x = swingAbs < 0.3 ? kneeBend : kneeBend * (1 - (swingAbs - 0.3) / 0.7)
        model.leftLegKnee.rotation.x = swingAbs > 0.7 ? kneeBend * ((1 - swingAbs) / 0.3) : kneeBend

        const armSwing = -Math.sin(t) * 0.35
        model.rightArmShoulder.rotation.x = armSwing
        model.leftArmShoulder.rotation.x = -armSwing

        const armBend = Math.max(0, Math.cos(t)) * 0.2
        model.rightArmElbow.rotation.x = armBend + 0.05
        model.leftArmElbow.rotation.x = armBend + 0.05

        model.headNeck.rotation.x = Math.abs(Math.sin(t * 2)) * 0.04 - 0.02
    },
    exit: () => {},
}
