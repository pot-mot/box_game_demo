import type {AnimationHandler} from '../types.ts'
import {WEAPON_READY_SHOULDER, WEAPON_READY_ELBOW, WEAPON_READY_SWAY} from '../constants.ts'

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

        /* 持械时持械臂戒备位（肩微前举 + 肘弯加大 + 武器竖持微摆），空手自然下垂微摆 */
        const rightSway = ctx.weaponHeld
            ? WEAPON_READY_SHOULDER + Math.sin(t * 1.8) * WEAPON_READY_SWAY
            : Math.sin(t * 1.8) * 0.06
        const armSway = Math.sin(t * 1.8) * 0.06
        model.rightArmShoulder.rotation.x = rightSway
        model.leftArmShoulder.rotation.x = -armSway

        model.rightArmElbow.rotation.x = ctx.weaponHeld ? WEAPON_READY_ELBOW : 0.08
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
