import {describe, it, expect} from 'vitest'
import {validateBlueprint, hasErrors} from '../blueprint.ts'
import {solveDioramaPlan, canMaterialize} from '../plan.ts'
import {createDungeonBlueprint} from './dungeon.ts'

describe('地下城箱庭配方', () => {
    it('蓝图与槽位全部通过校验', () => {
        const blueprint = createDungeonBlueprint(42)
        const diagnostics = validateBlueprint(blueprint)
        expect(hasErrors(diagnostics)).toBe(false)
        const plan = solveDioramaPlan(blueprint)
        expect(canMaterialize(plan)).toBe(true)
        expect(blueprint.population.some(rule => rule.kind === 'interactable')).toBe(true)
    })

    it('包含多层连接与门 / 闸门 / 开关', () => {
        const blueprint = createDungeonBlueprint(7)
        const kinds = blueprint.population
            .filter(rule => rule.kind === 'interactable')
            .map(rule => rule.kind === 'interactable' ? rule.config.kind : '')
        expect(kinds.some(kind => kind === 'push_door_single' || kind === 'push_door_double')).toBe(true)
        expect(kinds.some(kind => kind === 'gate')).toBe(true)
        expect(kinds.some(kind => kind === 'elevator' || kind === 'switch')).toBe(true)
    })
})
