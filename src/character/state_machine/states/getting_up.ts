import type {StateHandler} from '../types.ts'
import type {CharacterEntity} from '../../types.ts'
import {SLOPE_WALK_THRESHOLD} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {GET_UP_PLANT_END, GET_UP_PUSH_END, GET_UP_TURN_180_DURATION} from '../../combat/constants.ts'

/** 伏地角度（rad） */
const PRONE_ANGLE = Math.PI / 2
/** 撑地阶段末尾抬起的角度（rad）：双手撑地、胸口略离地，身体整体仍接近伏地 */
const PLANT_LIFT_ANGLE = 0.14
/** 推起阶段末尾的剩余角度（rad）：已收到蹲姿，仅剩站直 */
const PUSH_END_ANGLE = 0.3

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1)
const smoothstep = (p: number): number => p * p * (3 - 2 * p)
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

/**
 * 起身根旋转分三拍，与 `pose_fns.ts` 的撑地 / 推起 / 站直姿势共用同一组阶段比例：
 * 1. 撑地（0 → GET_UP_PLANT_END）：双手收到肩下撑住地面，身体几乎保持伏地；
 * 2. 推起（GET_UP_PLANT_END → GET_UP_PUSH_END）：手臂蹬直、收腿，根旋转快速回落；
 * 3. 站直（GET_UP_PUSH_END → 1）：收尾回正。
 */
const getUpFallAngle = (p: number): number => {
    if (p <= GET_UP_PLANT_END) {
        return lerp(PRONE_ANGLE, PRONE_ANGLE - PLANT_LIFT_ANGLE, smoothstep(clamp01(p / GET_UP_PLANT_END)))
    }
    if (p <= GET_UP_PUSH_END) {
        const k = smoothstep(clamp01((p - GET_UP_PLANT_END) / (GET_UP_PUSH_END - GET_UP_PLANT_END)))
        return lerp(PRONE_ANGLE - PLANT_LIFT_ANGLE, PUSH_END_ANGLE, k)
    }
    const k = smoothstep(clamp01((p - GET_UP_PUSH_END) / (1 - GET_UP_PUSH_END)))
    return lerp(PUSH_END_ANGLE, 0, k)
}

/** 起身总时长 = 翻身前置动作（按角度）+ 爬起动作 */
const getUpTotalDuration = (entity: CharacterEntity): number =>
    Math.max(entity.state.combat.getUpTurnDuration, 0) + Math.max(entity.state.combat.getUpDuration, 0)

/**
 * 起身状态：倒地时长结束后进入。期间保持完全免疫（`hitImmunityTimer` 覆盖全程）。
 * 分为前置翻身 + 爬起两段：
 * 1. 翻身（0 → `getUpTurnDuration`）：身体保持伏地，水平转体到正面朝下（180° = 0.25s，按角度换算）；
 * 2. 爬起：撑地保持伏地 → 手臂蹬直 / 收腿推起快速回正 → 站直。
 * 根旋转由 `world.ts` 按 `knockdownFallAngle` 推进；起身结束后解除免疫并回满韧性。
 */
export const gettingUpHandler: StateHandler = {
    enter: (entity) => {
        /* 仅清水平速度：保留垂直方向，空中被击倒后起身期间仍受重力下落 */
        entity.body.setLinvel({x: 0, y: entity.body.linvel().y, z: 0}, true)
        /* 翻身 + 爬起全程免疫（倒地阶段已挂计时，此处按翻身时长上限兜底延长） */
        const c = entity.state.combat
        c.hitImmunityTimer = Math.max(c.hitImmunityTimer, GET_UP_TURN_180_DURATION + c.getUpDuration)
    },
    update: (_dt, _input, entity, ctx) => {
        void _dt, _input
        entity.body.setLinvel({x: 0, y: entity.body.linvel().y, z: 0}, true)
        /* 翻身阶段保持完全伏地，翻身结束后才按爬起进度回正 */
        const riseTime = Math.max(ctx.stateTime - Math.max(entity.state.combat.getUpTurnDuration, 0), 0)
        const p = clamp01(riseTime / Math.max(entity.state.combat.getUpDuration, 0.0001))
        entity.state.timers.knockdownFallAngle = getUpFallAngle(p)
    },
    exit: (entity) => {
        /* 起身结束：解除完全免疫并回满韧性 */
        entity.state.combat.hitImmunityTimer = 0
        entity.state.combat.poise = entity.state.combat.poiseMax
        entity.state.timers.knockdownFallAngle = 0
    },
    transitions: [
        {
            to: 'dying',
            guard: (_input, entity) => entity.state.combat.health <= 0,
        },
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                ctx.stateTime >= getUpTotalDuration(entity)
                && Math.hypot(input.dx, input.dz) > 0.001
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'idle',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= getUpTotalDuration(entity)
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= getUpTotalDuration(entity)
                && shouldFall(entity),
        },
    ],
}
