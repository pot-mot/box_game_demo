import type {AnimationHandler} from '../types.ts'

/** 三阶段动画的归一化时间分界点（在总时长中的比例 0-1），按攻击总时长等比缩放 */
const WINDUP_END_RATIO = 0.3
const STRIKE_END_RATIO = 0.6

export const attackingAnim: AnimationHandler = {
    enter: (model, _ctx) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.body.rotation.x = 0
    },
    update: (_dt, model, ctx) => {
        void _dt
        const tilt = ctx.swingTilt
        const cosTilt = Math.cos(tilt)
        const sinTilt = Math.sin(tilt)

        /* 使用 attackTotalProgress 按比例驱动动画时间轴（兼容无阶段信息的回退场景） */
        const tNorm = ctx.attackTotalProgress > 0
            ? ctx.attackTotalProgress
            : ctx.stateTime / 0.5

        if (tNorm < WINDUP_END_RATIO) {
            const p = tNorm / WINDUP_END_RATIO
            model.rightArmShoulder.rotation.x = -p * 1.5 * cosTilt
            model.rightArmShoulder.rotation.z = -p * 1.5 * sinTilt
            model.rightArmElbow.rotation.x = p * 0.4

            model.leftArmShoulder.rotation.x = -p * 0.2
            model.leftArmElbow.rotation.x = p * 0.15

            model.headNeck.rotation.z = -p * 0.08
            model.body.rotation.x = 0
        } else if (tNorm < STRIKE_END_RATIO) {
            const p = (tNorm - WINDUP_END_RATIO) / (STRIKE_END_RATIO - WINDUP_END_RATIO)
            const easeP = p < 0.5
                ? 2 * p * p
                : 1 - Math.pow(-2 * p + 2, 2) / 2
            const totalSwing = -1.5 + easeP * 3.5
            model.rightArmShoulder.rotation.x = totalSwing * cosTilt
            model.rightArmShoulder.rotation.z = totalSwing * sinTilt
            model.rightArmElbow.rotation.x = 0.4 - easeP * 0.5

            model.leftArmShoulder.rotation.x = -0.2
            model.leftArmElbow.rotation.x = 0.15

            model.headNeck.rotation.z = easeP * 0.05
            model.body.rotation.x = easeP * 0.1
        } else if (tNorm < 1.0) {
            const p = Math.min((tNorm - STRIKE_END_RATIO) / (1.0 - STRIKE_END_RATIO), 1)
            const swingMag = 2.0 * (1 - p)
            model.rightArmShoulder.rotation.x = swingMag * cosTilt
            model.rightArmShoulder.rotation.z = swingMag * sinTilt
            model.rightArmElbow.rotation.x = -0.1 + p * 0.15

            model.leftArmShoulder.rotation.x = -0.2 * (1 - p)
            model.leftArmElbow.rotation.x = 0.15 * (1 - p)

            model.headNeck.rotation.z = 0.05 * (1 - p)
            model.body.rotation.x = 0.1 * (1 - p)
        } else {
            model.rightArmShoulder.rotation.set(0, 0, 0)
            model.rightArmElbow.rotation.set(0, 0, 0)
            model.leftArmShoulder.rotation.set(0, 0, 0)
            model.leftArmElbow.rotation.set(0, 0, 0)
            model.headNeck.rotation.set(0, 0, 0)
            model.body.rotation.x = 0
        }

        model.rightLegHip.rotation.x = 0
        model.leftLegHip.rotation.x = 0
        model.rightLegKnee.rotation.x = 0
        model.leftLegKnee.rotation.x = 0
        model.headNeck.rotation.x = Math.sin(tNorm * 6) * 0.02
    },
    exit: (model) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.headNeck.rotation.set(0, 0, 0)
        model.body.rotation.x = 0
    },
}