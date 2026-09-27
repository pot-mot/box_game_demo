import {describe, it, expect} from 'vitest'
import {Group, Vector3} from 'three'
import {createPlayerLockOn, selectLockOnTarget, wrapAngle, type LockOnCamera, type LockOnCharacterSource, type LockOnCandidate} from './lock_on.ts'
import type {LockPointConfig} from '../../character/lock_point.ts'
import {LOCK_ON_HALF_ANGLE, LOCK_ON_RADIUS} from './constants.ts'

const candidate = (actorId: number, pointIndex: number, x: number, z: number): LockOnCandidate => ({actorId, pointIndex, x, z})

/** 测试角色：位置可变，锁定校验逐帧读取 */
interface TestActor {
    readonly id: number
    lockPoints: LockPointConfig[]
    readonly combat: {
        isDead: boolean
        faction: number
        attackTendency: (self: number, target: number) => boolean
    }
    readonly body: {translation: () => {x: number; y: number; z: number}}
    readonly pos: {x: number; y: number; z: number}
    readonly appearanceGroup: Group
}

const makeActor = (id: number, x: number, z: number, attackTendency: (self: number, target: number) => boolean = () => true, lockPoints: LockPointConfig[] = []): TestActor => {
    const pos = {x, y: 0.5, z}
    const appearanceGroup = new Group()
    appearanceGroup.position.set(x, pos.y - 0.5, z)
    return {
        id,
        lockPoints,
        combat: {isDead: false, faction: 0, attackTendency},
        body: {translation: () => pos},
        pos,
        appearanceGroup,
    }
}

/** 给角色外观根节点挂一个命名的关节 Group（模拟骨架层级） */
const addJoint = (actor: TestActor, jointId: string, x: number, y: number, z: number): Group => {
    const joint = new Group()
    joint.name = jointId
    joint.position.set(x, y, z)
    actor.appearanceGroup.add(joint)
    return joint
}

const makeSource = (player: TestActor | undefined, others: TestActor[]): LockOnCharacterSource => ({
    getPlayerCharacter: () => player,
    getAll: () => player ? [player, ...others] : others,
})

/** 朝向角为 yaw 的相机（getWorldDirection 输出水平单位向量） */
const makeCamera = (yaw: number): LockOnCamera => ({
    getWorldDirection: (target: Vector3) => target.set(Math.sin(yaw), 0, Math.cos(yaw)),
})

describe('wrapAngle', () => {
    it('归一化角度到 (-π, π]', () => {
        expect(wrapAngle(0.4)).toBeCloseTo(0.4)
        expect(wrapAngle(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI)
        expect(wrapAngle(-1.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI)
        expect(wrapAngle(2 * Math.PI + 0.3)).toBeCloseTo(0.3)
    })
})

describe('selectLockOnTarget', () => {
    it('选择镜头前方偏角最小的锁定点（而非距离最近者）', () => {
        const nearlyAhead = candidate(1, 1, 8 * Math.sin(0.1), 8 * Math.cos(0.1))
        const offToTheSide = candidate(1, 0, 3 * Math.sin(Math.PI / 4), 3 * Math.cos(Math.PI / 4))
        expect(selectLockOnTarget(0, 0, 0, [offToTheSide, nearlyAhead])).toEqual(nearlyAhead)
    })

    it('超出搜索半径的锁定点不参与', () => {
        expect(selectLockOnTarget(0, 0, 0, [candidate(1, 0, 0, LOCK_ON_RADIUS + 0.5)])).toBeUndefined()
        expect(selectLockOnTarget(0, 0, 0, [candidate(1, 0, 0, LOCK_ON_RADIUS)])?.actorId).toBe(1)
    })

    it('偏角超出 ±60° 的锁定点不参与', () => {
        const over = LOCK_ON_HALF_ANGLE + 0.02
        const under = LOCK_ON_HALF_ANGLE - 0.02
        expect(selectLockOnTarget(0, 0, 0, [candidate(1, 0, 5 * Math.sin(over), 5 * Math.cos(over))])).toBeUndefined()
        expect(selectLockOnTarget(0, 0, 0, [candidate(1, 0, 5 * Math.sin(under), 5 * Math.cos(under))])?.actorId).toBe(1)
    })

    it('偏角相同时取更近者', () => {
        const far = candidate(1, 0, 0, 8)
        const near = candidate(2, 0, 0, 4)
        expect(selectLockOnTarget(0, 0, 0, [far, near])?.actorId).toBe(2)
        expect(selectLockOnTarget(0, 0, 0, [near, far])?.actorId).toBe(2)
    })

    it('偏角以镜头水平朝向为基准', () => {
        const ahead = candidate(1, 0, 5, 0)
        const behindView = candidate(2, 0, 0, 5)
        expect(selectLockOnTarget(0, 0, Math.PI / 2, [ahead, behindView])?.actorId).toBe(1)
        expect(selectLockOnTarget(0, 0, Math.PI / 2, [behindView])).toBeUndefined()
    })

    it('无候选锁定点返回 undefined', () => {
        expect(selectLockOnTarget(0, 0, 0, [])).toBeUndefined()
    })
})

describe('createPlayerLockOn', () => {
    it('切换锁定最接近镜头角度的敌人，再次切换解除', () => {
        const player = makeActor(1, 0, 0)
        const ahead = makeActor(2, 0, 5)
        const side = makeActor(3, 3, 4)
        const lockOn = createPlayerLockOn(makeSource(player, [side, ahead]), makeCamera(0))

        expect(lockOn.getAimPoint()).toBeUndefined()
        lockOn.toggle()
        expect(lockOn.getAimPoint()?.x).toBeCloseTo(0)
        expect(lockOn.getAimPoint()?.z).toBeCloseTo(5)

        /* 目标移动后瞄准点跟随（仍在脱锁半径内） */
        ahead.pos.z = 6
        expect(lockOn.getAimPoint()?.z).toBeCloseTo(6)

        lockOn.toggle()
        expect(lockOn.getAimPoint()).toBeUndefined()
    })

    it('默认锁定点为身体最中心', () => {
        const player = makeActor(1, 0, 0)
        const enemy = makeActor(2, 0, 5)
        const lockOn = createPlayerLockOn(makeSource(player, [enemy]), makeCamera(0))

        lockOn.toggle()
        const aim = lockOn.getAimPoint()
        expect(aim?.x).toBeCloseTo(0)
        expect(aim?.y).toBeCloseTo(0.5)
        expect(aim?.z).toBeCloseTo(5)
    })

    it('额外锁定点（关节 + 偏移）优先于身体中心被选中，并随关节移动', () => {
        const player = makeActor(1, 0, 0)
        /* 身体中心偏角 5.7°，额外点经偏移后正对镜头（偏角 0）→ 选中额外点 */
        const enemy = makeActor(2, 0.5, 5, () => true, [{jointId: 'headNeck', offset: [-0.5, 0, 0]}])
        const joint = addJoint(enemy, 'headNeck', 0, 1.6, 0)
        const lockOn = createPlayerLockOn(makeSource(player, [enemy]), makeCamera(0))

        lockOn.toggle()
        expect(lockOn.getAimPoint()?.x).toBeCloseTo(0)
        expect(lockOn.getAimPoint()?.y).toBeCloseTo(1.6)
        expect(lockOn.getAimPoint()?.z).toBeCloseTo(5)

        joint.position.y = 1.7
        expect(lockOn.getAimPoint()?.y).toBeCloseTo(1.7)
    })

    it('找不到关节的额外锁定点被跳过（仅剩默认身体中心点）', () => {
        const player = makeActor(1, 0, 0)
        const enemy = makeActor(2, 0, 5, () => true, [{jointId: 'no_such_joint', offset: [0, 10, 0]}])
        const lockOn = createPlayerLockOn(makeSource(player, [enemy]), makeCamera(0))

        lockOn.toggle()
        expect(lockOn.getAimPoint()?.y).toBeCloseTo(0.5)
    })

    it('锁定期间额外锁定点被移除时自动解除', () => {
        const player = makeActor(1, 0, 0)
        /* 身体中心偏角 5.7°，额外点经关节 + 偏移后正对镜头 → 锁定的下标为 1 */
        const enemy = makeActor(2, 0.5, 5, () => true, [{jointId: 'headNeck', offset: [0, 1, 0]}])
        addJoint(enemy, 'headNeck', -0.5, 0.6, 0)
        const lockOn = createPlayerLockOn(makeSource(player, [enemy]), makeCamera(0))

        lockOn.toggle()
        expect(lockOn.getAimPoint()).toBeDefined()
        enemy.lockPoints = []
        expect(lockOn.getAimPoint()).toBeUndefined()
    })

    it('玩家攻击倾向外的目标不参与锁定', () => {
        /* 玩家倾向判定与近战命中过滤一致：不攻击的目标不作为锁定候选 */
        const player = makeActor(1, 0, 0, (_self, target) => target !== 0)
        const allyFaction = makeActor(2, 0, 5)
        const enemyFaction = makeActor(3, 1, 5)
        enemyFaction.combat.faction = 1
        const lockOn = createPlayerLockOn(makeSource(player, [enemyFaction, allyFaction]), makeCamera(0))

        lockOn.toggle()
        const aim = lockOn.getAimPoint()
        expect(aim?.x).toBeCloseTo(1)
        expect(aim?.z).toBeCloseTo(5)
    })

    it('目标死亡或离开脱锁半径后自动解除', () => {
        const player = makeActor(1, 0, 0)
        const enemy = makeActor(2, 0, 5)
        const lockOn = createPlayerLockOn(makeSource(player, [enemy]), makeCamera(0))

        lockOn.toggle()
        expect(lockOn.getAimPoint()).toBeDefined()

        /* 搜索半径 10m 之外的迟滞区间（≤ 12m）内保持锁定 */
        enemy.pos.z = 11
        expect(lockOn.getAimPoint()).toBeDefined()

        enemy.pos.z = 13
        expect(lockOn.getAimPoint()).toBeUndefined()

        /* 已解除：目标回到范围内也不会自动重锁 */
        enemy.pos.z = 5
        expect(lockOn.getAimPoint()).toBeUndefined()

        lockOn.toggle()
        enemy.combat.isDead = true
        expect(lockOn.getAimPoint()).toBeUndefined()
    })

    it('目标从角色列表移除后自动解除', () => {
        const player = makeActor(1, 0, 0)
        const enemy = makeActor(2, 0, 5)
        const others = [enemy]
        const lockOn = createPlayerLockOn(makeSource(player, others), makeCamera(0))

        lockOn.toggle()
        expect(lockOn.getAimPoint()).toBeDefined()
        others.length = 0
        expect(lockOn.getAimPoint()).toBeUndefined()
    })

    it('无玩家时切换锁定为空操作', () => {
        const enemy = makeActor(1, 0, 5)
        const lockOn = createPlayerLockOn(makeSource(undefined, [enemy]), makeCamera(0))
        lockOn.toggle()
        expect(lockOn.getAimPoint()).toBeUndefined()
    })
})
