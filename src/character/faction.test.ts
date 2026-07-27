import {describe, it, expect} from 'vitest'
import {
    type Faction,
    TENDENCIES,
    resolveTendency,
    createFactionEmitter,
    changeFaction,
} from './faction.ts'

describe('TENDENCIES.hostileAll', () => {
    const fn = TENDENCIES.hostileAll()

    it('攻击所有阵营包括自己', () => {
        expect(fn(1, 1)).toBe(true)
        expect(fn(1, 2)).toBe(true)
        expect(fn(5, 9)).toBe(true)
    })
})

describe('TENDENCIES.hostileExceptSelf', () => {
    const fn = TENDENCIES.hostileExceptSelf()

    it('不攻击自己', () => {
        expect(fn(1, 1)).toBe(false)
        expect(fn(3, 3)).toBe(false)
    })

    it('攻击非同阵营', () => {
        expect(fn(1, 2)).toBe(true)
        expect(fn(0, 5)).toBe(true)
    })
})

describe('TENDENCIES.hostileTo', () => {
    const fn = TENDENCIES.hostileTo(2, 3)

    it('攻击指定阵营', () => {
        expect(fn(0, 2)).toBe(true)
        expect(fn(0, 3)).toBe(true)
    })

    it('不攻击非指定阵营', () => {
        expect(fn(0, 1)).toBe(false)
        expect(fn(0, 5)).toBe(false)
    })

    it('可以攻击自己（如果自己在指定列表中）', () => {
        expect(fn(2, 2)).toBe(true)
    })
})

describe('TENDENCIES.hostileExcept', () => {
    const fn = TENDENCIES.hostileExcept(0)

    it('不攻击排除的阵营', () => {
        expect(fn(1, 0)).toBe(false)
    })

    it('攻击未排除的阵营', () => {
        expect(fn(1, 2)).toBe(true)
        expect(fn(1, 5)).toBe(true)
    })

    it('可以攻击自己（如果自己不在排除列表中）', () => {
        expect(fn(2, 2)).toBe(true)
    })
})

describe('TENDENCIES.pacifist', () => {
    const fn = TENDENCIES.pacifist()

    it('不攻击任何人', () => {
        expect(fn(1, 2)).toBe(false)
        expect(fn(3, 3)).toBe(false)
    })
})

describe('resolveTendency', () => {
    it('hostileAll', () => {
        const fn = resolveTendency({tendencyId: 'hostileAll'})
        expect(fn(1, 2)).toBe(true)
        expect(fn(1, 1)).toBe(true)
    })

    it('hostileExceptSelf', () => {
        const fn = resolveTendency({tendencyId: 'hostileExceptSelf'})
        expect(fn(1, 2)).toBe(true)
        expect(fn(1, 1)).toBe(false)
    })

    it('hostileTo with targetFactions', () => {
        const fn = resolveTendency({tendencyId: 'hostileTo', targetFactions: [2, 3]})
        expect(fn(0, 2)).toBe(true)
        expect(fn(0, 1)).toBe(false)
    })

    it('hostileExcept with targetFactions', () => {
        const fn = resolveTendency({tendencyId: 'hostileExcept', targetFactions: [0]})
        expect(fn(1, 0)).toBe(false)
        expect(fn(1, 2)).toBe(true)
    })

    it('pacifist', () => {
        const fn = resolveTendency({tendencyId: 'pacifist'})
        expect(fn(1, 2)).toBe(false)
    })
})

describe('createFactionEmitter', () => {
    it('触发并监听阵营变更', () => {
        const emitter = createFactionEmitter()
        const events: Array<{o: Faction; n: Faction}> = []
        const unsub = emitter.onFactionChange(ev => events.push({o: ev.oldFaction, n: ev.newFaction}))

        emitter.emitFactionChange({entityId: 1, oldFaction: 0, newFaction: 2})
        expect(events).toHaveLength(1)
        expect(events[0].n).toBe(2)

        unsub()
        emitter.emitFactionChange({entityId: 1, oldFaction: 2, newFaction: 3})
        expect(events).toHaveLength(1)
    })
})

describe('changeFaction', () => {
    it('切换阵营并广播', () => {
        const emitter = createFactionEmitter()
        const entity: {id: number; faction: Faction} = {id: 1, faction: 0}
        let newF: Faction | undefined
        emitter.onFactionChange(ev => { newF = ev.newFaction })

        changeFaction(entity, 5, emitter)
        expect(entity.faction).toBe(5)
        expect(newF).toBe(5)
    })

    it('同阵营不触发', () => {
        const emitter = createFactionEmitter()
        const entity: {id: number; faction: Faction} = {id: 1, faction: 0}
        let count = 0
        emitter.onFactionChange(() => { count++ })

        changeFaction(entity, 0, emitter)
        expect(count).toBe(0)
    })
})
