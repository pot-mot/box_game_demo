import type {StateHandler} from '../types.ts'
import {GET_UP_TURN_SPEED, KNOCKDOWN_FALL_RATIO} from '../../combat/constants.ts'

/** 倒地根旋转缓动（easeInOutQuad，与死亡倒地一致） */
const easeInOutQuad = (p: number): number =>
    p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2

/**
 * 倒地状态：韧性归零（`pendingKnockdown`）或受到 `knockdown` 级冲击时进入。
 * 进入时清水平速度、禁用攻击 / 格挡，并挂上覆盖「倒地 + 翻身 + 起身」全程的完全免疫
 * （`hitImmunityTimer = knockdownDuration + getUpTurnDuration + getUpDuration`）；期间忽略 `pendingFlinch` / `pendingKnockdown`。
 * 倒向由最后受击冲击方向决定（与死亡倒地同机制），`world.ts` 据 `knockdownFallAngle` 合成根旋转。
 * 倒地只在总时长前半段（`KNOCKDOWN_FALL_RATIO`）完成，后半段保持完全倒地的最后一帧静止不动。
 * 同时按「当前面朝 → 倒向（俯卧）」的水平转角预计算起身前翻身时长（180° = 0.25s）。
 */
export const knockdownHandler: StateHandler = {
    enter: (entity) => {
        const c = entity.combat
        c.attackActive = false
        c.pendingFlinch = false
        c.pendingKnockdown = false
        c.bufferedSegment = undefined
        c.phaseIndex = 0
        c.phaseTimer = 0
        /* 仅清水平速度：保留垂直方向，空中被击倒时仍受重力下落（与 guard_broken 一致） */
        entity.body.setLinvel({x: 0, y: entity.body.linvel().y, z: 0}, true)
        /* 倒向 = 最后受击冲击方向（来源 → 受击者）；无记录时默认向后倒（沿面朝反方向） */
        const yaw = entity.appearanceGroup.rotation.y
        const {lastHitDirX, lastHitDirZ} = c
        const len = Math.hypot(lastHitDirX, lastHitDirZ)
        if (len > 1e-3) {
            entity.knockdownFallDirX = lastHitDirX / len
            entity.knockdownFallDirZ = lastHitDirZ / len
        } else {
            entity.knockdownFallDirX = -Math.sin(yaw)
            entity.knockdownFallDirZ = -Math.cos(yaw)
        }
        entity.knockdownFallAngle = 0
        /* 起身前翻身：躺姿从当前面朝水平转到倒向（正面朝下）所需角度；180° = GET_UP_TURN_180_DURATION */
        const targetYaw = Math.atan2(entity.knockdownFallDirX, entity.knockdownFallDirZ)
        let turnDiff = targetYaw - yaw
        turnDiff = ((turnDiff + Math.PI) % (2 * Math.PI)) - Math.PI
        c.getUpTurnDuration = Math.abs(turnDiff) / GET_UP_TURN_SPEED
        /* 完全免疫覆盖倒地 + 翻身 + 起身全程，避免起身动画期间被再次击倒 / 打断 */
        c.hitImmunityTimer = c.knockdownDuration + c.getUpTurnDuration + c.getUpDuration
    },
    update: (_dt, _input, entity, ctx) => {
        void _dt, _input
        entity.body.setLinvel({x: 0, y: entity.body.linvel().y, z: 0}, true)
        /* 前 KNOCKDOWN_FALL_RATIO 完成倒下，之后保持完全伏地的最后一帧（静止停顿） */
        const fallDuration = Math.max(entity.combat.knockdownDuration * KNOCKDOWN_FALL_RATIO, 0.0001)
        const p = Math.min(Math.max(ctx.stateTime / fallDuration, 0), 1)
        entity.knockdownFallAngle = Math.PI / 2 * easeInOutQuad(p)
    },
    exit: () => {},
    transitions: [
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
        {
            to: 'getting_up',
            guard: (_input, entity, ctx) => ctx.stateTime >= entity.combat.knockdownDuration,
        },
    ],
}
