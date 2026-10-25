import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'

const originalGetContext = HTMLCanvasElement.prototype.getContext
const patch = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => ({fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', fillRect: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {}, arc: () => {}, ellipse: () => {}}),
        configurable: true,
        writable: true,
    })
}

describe('默认生成角色', () => {
    let system: CharacterEntitySystem
    beforeAll(async () => { await RAPIER.init(); patch() })
    afterAll(() => { Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {value: originalGetContext, configurable: true, writable: true}) })
    it('双手均为空手', () => {
        system = setupCharacterEntities(new Scene(), createSharedWorld())
        system.spawnAt(0, 1, 0)
        const entity = system.getAll()[0]!
        expect(entity.state.combat.weapon.id).toBe('unarmed')
        expect(entity.state.combat.offhand?.weapon.id).toBe('unarmed')
    })
})
