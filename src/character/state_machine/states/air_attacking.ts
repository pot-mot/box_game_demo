import type {CharacterEntity} from '../../types.ts'
import type {CharacterInput, CharacterStateName, StateHandler} from '../types.ts'
import type {CombatComponent} from '../../combat/types.ts'
import {segmentTotalDuration} from '../../weapon/attack_chain.ts'
import {DEFAULT_MELEE_AIR_ATTACK, type MeleeAirAttackConfig} from '../../weapon/melee_attacks.ts'
import {resolvePhases} from '../../combat/attack_phases.ts'
import {canStartAttack, inRecoveryWindow} from '../../combat/attack_runtime.ts'
import {fireSegmentImpulses} from '../../combat/attack_impulses.ts'
import {SLOPE_WALK_THRESHOLD} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {moveSpeedOf} from '../../types.ts'
import {canAffordStaminaEntry, spendStaminaEntry} from '../../stamina/runtime.ts'
import {advanceSegmentPhases, enterAttackSegment, resolveSegmentNextState, type SegmentInput} from './attacking/segment.ts'

/**
 * air_attacking meta-state —— 空中攻击子状态。
 *
 * 与地面 `attacking` 共用同一套段调度（`attacking/segment.ts`），差异：
 * - 起手固定走武器 `air` 链（空中键，与轻重链命名空间分离；远程武器空链 → 不起手）；
 * - 空中不蓄力（`attackHeld` 恒忽略）、无移动投射/斜坡逻辑，改为「保留跳跃惯性 + 低操控」；
 * - 段数/动量/操控由武器类的 `airAttack` 模组决定（段数可与地面不同）；
 * - 段动作是**自烘焙 clip**（`attack_clips/` 的 `_air_N` 条目），砸地等自身冲击由段的
 *   `impulses` 配置在指定段内时刻施加（见 `combat/attack_impulses.ts`）；
 * - 收招/落地后回到地面状态；**不回 jumping**（`jumping.enter` 会重置 vy，会造成二段跳）。
 */

/**
 * 空中攻击态：跳跃 / 下落 / 空中攻击中。
 * 是「攻击键是否映射为 air 键」的唯一依据（按状态判定，而非 isSupportedOn——
 * 胶囊跨 trimesh 棱线时接触法线会瞬时读陡，idle/walking 也会短暂 isSupportedOn=false）。
 */
const AIRBORNE_ATTACK_STATES: readonly CharacterStateName[] = ['jumping', 'falling', 'air_attacking']

/** 当前状态是否处于空中攻击态（决定玩家攻击键是否映射为 air 键） */
export const isAirborneAttackState = (state: CharacterStateName): boolean =>
    AIRBORNE_ATTACK_STATES.includes(state)

/** 当前武器空中攻击模组（非近战武器无模组，回退默认值） */
const airAttackOf = (entity: CharacterEntity): MeleeAirAttackConfig =>
    entity.state.combat.weapon.type === 'melee'
        ? {...DEFAULT_MELEE_AIR_ATTACK, ...entity.state.combat.weapon.airAttack}
        : DEFAULT_MELEE_AIR_ATTACK

/** 跳跃/下落中是否可起手空中攻击（起手候选存在且冷却就绪） */
export const canStartAirAttack = (entity: CharacterEntity): boolean =>
    canStartAttack(entity.state.combat, {dx: 0, dz: 0, holdDuration: 0, attackKey: 'air'})

/** 段是否已完整播完（阶段全部结束且累计时间达到段总时长） */
const segmentFinished = (c: CombatComponent): boolean => {
    const segment = c.activeSegment
    if (segment === undefined) return true
    const phases = resolvePhases(segment.phases)
    if (c.phaseIndex < phases.length) return false
    return c.attackTimer >= segmentTotalDuration(segment)
}

/** 空中攻击位移：保留起跳水平惯性（momentum），输入只按 airControl 微调朝向/速度 */
const applyAirAttackMotion = (input: CharacterInput, entity: CharacterEntity): void => {
    const air = airAttackOf(entity)
    const linvel = entity.body.linvel()
    const vx = linvel.x * air.momentum
    const vz = linvel.z * air.momentum
    const len = Math.hypot(input.dx, input.dz)
    if (len < 0.001) {
        entity.body.setLinvel({x: vx, y: linvel.y, z: vz}, true)
        return
    }
    const speed = moveSpeedOf(entity)
    const tx = (input.dx / len) * speed
    const tz = (input.dz / len) * speed
    entity.body.setLinvel({
        x: vx + (tx - vx) * air.airControl,
        y: linvel.y,
        z: vz + (tz - vz) * air.airControl,
    }, true)
}

export const airAttackingHandler: StateHandler = {
    enter: (entity) => {
        const c = entity.state.combat
        c.attackActive = true
        c.bufferedSegment = undefined
        c.attackedTargets.clear()
        c.pendingFlinch = false
        const segment = c.activeSegment
        if (segment === undefined) return
        spendStaminaEntry(entity.state.stamina, 'attack')
        enterAttackSegment(c, segment, entity)
    },
    update: (dt, input, entity) => {
        const c = entity.state.combat
        const segment = c.activeSegment
        if (segment === undefined) return

        /* 阶段时间线推进（不蓄力：attackHeld 恒 false） */
        const phasesDone = advanceSegmentPhases(c, dt, false)
        /* 段内冲击（数据驱动）：砸地等由段配置在指定时刻对自身施加 */
        fireSegmentImpulses(c, entity)

        /* 空中连段：按攻击键续接同一 `air` 链（把任意攻击键归一为空键）；
         * 与地面一致，**仅后摇窗口接受预输入** */
        if (input.attack && inRecoveryWindow(c)) {
            const next = resolveSegmentNextState(c, segment, {
                dx: input.dx,
                dz: input.dz,
                holdDuration: input.attackHoldDuration,
                attackKey: 'air',
            } satisfies SegmentInput)
            if (next !== undefined) c.bufferedSegment = next
        }

        if (phasesDone && c.bufferedSegment !== undefined) {
            if (canAffordStaminaEntry(entity.state.stamina, 'attack')) {
                spendStaminaEntry(entity.state.stamina, 'attack')
                enterAttackSegment(c, c.bufferedSegment, entity)
            } else {
                c.bufferedSegment = undefined
            }
        }

        applyAirAttackMotion(input, entity)
    },
    exit: (entity) => {
        const c = entity.state.combat
        c.attackActive = false
        c.bufferedSegment = undefined
        c.attackCharge = 0
        c.attackHolding = false
        c.chargeCommitted = false
        c.activeWeapon = c.weapon
    },
    transitions: [
        {
            to: 'dying',
            guard: (_input, entity) => entity.state.combat.health <= 0,
        },
        {
            to: 'flinching',
            guard: (_input, entity) => entity.state.combat.pendingFlinch && entity.state.combat.health > 0,
        },
        {
            to: 'walking',
            guard: (input, entity) =>
                segmentFinished(entity.state.combat)
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
                && Math.hypot(input.dx, input.dz) > 0.001,
        },
        {
            to: 'idle',
            guard: (_input, entity) => segmentFinished(entity.state.combat) && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity) => segmentFinished(entity.state.combat) && shouldFall(entity),
        },
    ],
}
