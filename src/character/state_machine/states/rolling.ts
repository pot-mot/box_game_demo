import type {StateHandler} from '../types.ts'
import {ROLL_SPEED_MULTIPLIER, SLOPE_WALK_THRESHOLD, SLOPE_TRANSIENT_MIN_NY} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlopeAtSpeed, applySlopeSink} from '../ground.ts'
import {moveSpeedOf} from '../../types.ts'

/**
 * 翻滚状态：向锁定方向位移一段距离，**中段无敌帧**（`rollSkill.config.iframeStart/End`）内
 * `combat.invincibleTimer > 0`，伤害结算完全免疫；无敌期间模型材质切换为半透明白（world 层驱动）。
 * 根自转（前滚翻）与死亡倒地同模式：clip 只含蜷缩姿态，world 层按状态驻留时间合成 2π 根旋转。
 */
export const rollingHandler: StateHandler = {
    enter: (entity) => {
        const skill = entity.combat.rollSkill
        const linvel = entity.body.linvel()
        const vx = linvel.x
        const vz = linvel.z
        const vLen = Math.hypot(vx, vz)
        if (vLen > 0.1) {
            skill.dirX = vx / vLen
            skill.dirZ = vz / vLen
        } else {
            const angle = entity.appearanceGroup.rotation.y
            skill.dirX = Math.sin(angle)
            skill.dirZ = Math.cos(angle)
        }
        skill.cooldownTimer = skill.config.cooldown
        entity.combat.invincibleTimer = 0
        entity.body.wakeUp()
    },
    update: (_dt, _input, entity, ctx) => {
        const {config, dirX, dirZ} = entity.combat.rollSkill
        /* 无敌帧：窗口内逐帧重算剩余时间（不累积计时；窗口外清零，起手/收招可被命中） */
        entity.combat.invincibleTimer = ctx.stateTime >= config.iframeStart && ctx.stateTime < config.iframeEnd
            ? config.iframeEnd - ctx.stateTime
            : 0
        const speed = moveSpeedOf(entity) * ROLL_SPEED_MULTIPLIER
        if (!projectToSlopeAtSpeed(entity, dirX, dirZ, speed, SLOPE_WALK_THRESHOLD)) {
            /* 瞬态棱法线伪影时限速投影（同 walking），防止水平速度把角色甩离近平垂直墙面 */
            if (!projectToSlopeAtSpeed(entity, dirX, dirZ, speed, SLOPE_TRANSIENT_MIN_NY)) {
                const linvel = entity.body.linvel()
                entity.body.setLinvel({x: dirX * speed, y: linvel.y, z: dirZ * speed}, true)
            }
        } else {
            /* 弹跳悬空（宽限期）时向坡面吸附，快速落回 */
            applySlopeSink(entity)
        }
    },
    exit: (entity) => {
        entity.combat.invincibleTimer = 0
    },
    transitions: [
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                ctx.stateTime >= entity.combat.rollSkill.config.duration
                && Math.hypot(input.dx, input.dz) > 0.001
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'idle',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= entity.combat.rollSkill.config.duration
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= entity.combat.rollSkill.config.duration
                && shouldFall(entity),
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
        {
            to: 'flinching',
            guard: (_input, entity) => entity.combat.pendingFlinch && entity.combat.health > 0,
        },
    ],
}
