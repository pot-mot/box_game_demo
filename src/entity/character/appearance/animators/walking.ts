import type {AnimationHandler} from '../types.ts'

export const walkingAnim: AnimationHandler = {
    enter: () => {},
    update: (dt, model, ctx) => {
        void dt

        /*
         * 相位 = 基础步频时间 + 位移驱动步频：
         * t = 1.2×stateTime + 1.3×horizontalTravel（与原公式 stateTime×(1.2+speed×1.3) 在匀速时等价）
         * 两项均单调递增 → 相位永不回退，coyote 吸附/弹跳导致的速度突变只改变摆腿速率不产生相位跳变
         */
        const t = 1.2 * ctx.stateTime + 1.3 * ctx.horizontalTravel

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
