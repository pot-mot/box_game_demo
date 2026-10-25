import {describe, it, expect} from 'vitest'
import {weaponPresetOrDefault, weaponAttacksOf} from '../../../../../character/weapon/catalog.ts'
import {orderedSegments} from '../../../../../character/weapon/attack_chain.ts'
import type {HoldMode} from '../../../../../character/weapon/hold_mode.ts'
import type {AnimationContext} from '../../../appearance/types.ts'
import {evaluateHumanoidFrame} from './progress_graph.ts'

const makeCtx = (
    holdMode: HoldMode,
    weaponClassId: string,
    shieldHands: {main: boolean; off: boolean},
): AnimationContext => ({
    stateTime: 0,
    horizontalSpeed: 0,
    humanoid: {holdMode, handedness: 'right', shieldHands, weaponClassId},
    attackSegment: undefined,
    attackPhase: undefined,
    attackPhaseProgress: 0,
    attackTotalProgress: 0,
    attackPhaseIndex: 0,
    attackCharge: 0,
    attackHolding: false,
    weaponHeld: true,
})

const maxDiff = (
    a: ReturnType<typeof evaluateHumanoidFrame>,
    b: ReturnType<typeof evaluateHumanoidFrame>,
    jointIds: readonly string[],
): number => {
    let max = 0
    for (const jointId of jointIds) {
        const left = a[jointId]
        const right = b[jointId]
        if (left === undefined || right === undefined) continue
        const l = 'rotation' in left ? left.rotation : left
        const r = 'rotation' in right ? right.rotation : right
        for (let axis = 0; axis < 3; axis++) max = Math.max(max, Math.abs(l[axis]! - r[axis]!))
    }
    return max
}

describe('攻击收招恢复到待机姿态', () => {
    it('盾牌收招盾牌朝向与待机一致（不再瞬跳）', () => {
        const weapon = weaponPresetOrDefault('shield_small')
        const segment = orderedSegments(weaponAttacksOf(weapon, 'one_handed'))[0]!
        const ctx = makeCtx('one_handed', weapon.classId, {main: true, off: false})
        const idle = evaluateHumanoidFrame('idle', ctx)
        const attack = evaluateHumanoidFrame('attacking', {
            ...ctx,
            stateTime: segment.duration + segment.recovery,
            attackSegment: segment,
            attackPhase: 'recovery',
            attackPhaseProgress: 1,
            attackTotalProgress: 1,
            attackPhaseIndex: 99,
        })
        expect(maxDiff(idle, attack, ['rightWeaponMount', 'rightArmShoulder', 'rightArmElbow'])).toBeLessThan(0.01)
    })

    it('双持收招左臂回到待机持械姿态', () => {
        const weapon = weaponPresetOrDefault('short_sword')
        const segment = weaponAttacksOf(weapon, 'dual_wield').segments['short_sword_dual_wield_light_1']!
        const ctx = makeCtx('dual_wield', weapon.classId, {main: false, off: false})
        const idle = evaluateHumanoidFrame('idle', ctx)
        const attack = evaluateHumanoidFrame('attacking', {
            ...ctx,
            stateTime: segment.duration + segment.recovery,
            attackSegment: segment,
            attackPhase: 'recovery',
            attackPhaseProgress: 1,
            attackTotalProgress: 1,
            attackPhaseIndex: 99,
        })
        expect(maxDiff(idle, attack, ['leftArmShoulder', 'leftArmElbow', 'leftWeaponMount'])).toBeLessThan(0.01)
    })

    it('远程收招脊柱 / 头部 / 腿部回到待机姿态', () => {
        const weapon = weaponPresetOrDefault('longbow')
        const segment = weaponAttacksOf(weapon, 'two_handed').segments['longbow_shot']!
        const ctx = makeCtx('two_handed', weapon.classId, {main: false, off: false})
        const idle = evaluateHumanoidFrame('idle', ctx)
        const attack = evaluateHumanoidFrame('attacking', {
            ...ctx,
            stateTime: segment.duration + segment.recovery,
            attackSegment: segment,
            attackPhase: 'recovery',
            attackPhaseProgress: 1,
            attackTotalProgress: 1,
            attackPhaseIndex: 99,
        })
        expect(maxDiff(idle, attack, ['spine', 'headNeck', 'rightLegHip', 'rightLegKnee', 'leftLegHip', 'leftLegKnee'])).toBeLessThan(0.01)
    })
})
