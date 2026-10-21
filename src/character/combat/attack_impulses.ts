import {Quaternion, Vector3} from 'three'
import type {CharacterEntity} from '../types.ts'
import type {CombatComponent} from './types.ts'
import {isSupportedOn} from '../state_machine/ground.ts'
import {SLOPE_WALK_THRESHOLD} from '../state_machine/constants.ts'

const _dir = new Vector3()
const _quat = new Quaternion()

/**
 * 攻击段冲击派发（`AttackSegment.impulses`）：
 * 段内时间轴推进到 `impulse.at` 时，对施术者自身叠加一次速度冲量（`linvel += dir * speed`）。
 *
 * - 与阶段时间线 / 动画 clip 同一时钟（段总时长 = clip 时长），故「动画播到该程度」即「时间到达」；
 * - 每条冲击每段只施加一次（`combat.impulsesFired` 消费索引，段入场清零）；
 * - 蓄力冻结期间时间不推进，冲击自然不触发；蓄力释放导致的跳跃会**补发**被跨过的冲击（跨帧不漏）；
 * - `requireAirborne` 的冲击在已落地时跳过（砸地类：不该再向地面注入速度）。
 */
export const fireSegmentImpulses = (c: CombatComponent, entity: CharacterEntity): void => {
    const impulses = c.activeSegment?.impulses
    if (impulses === undefined || impulses.length === 0) return
    while (c.impulsesFired < impulses.length) {
        const impulse = impulses[c.impulsesFired]
        if (impulse.at > c.attackTimer) return
        c.impulsesFired += 1
        if (impulse.requireAirborne === true && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)) continue
        _dir.set(impulse.direction.x, impulse.direction.y, impulse.direction.z)
        if (impulse.relativeToFacing === true) {
            const rot = entity.body.rotation()
            _quat.set(rot.x, rot.y, rot.z, rot.w)
            _dir.applyQuaternion(_quat)
        }
        const len = _dir.length()
        if (len < 1e-6) continue
        const linvel = entity.body.linvel()
        const scale = impulse.speed / len
        entity.body.setLinvel({
            x: linvel.x + _dir.x * scale,
            y: linvel.y + _dir.y * scale,
            z: linvel.z + _dir.z * scale,
        }, true)
    }
}
