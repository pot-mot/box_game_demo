import {describe, it, expect} from 'vitest'
import {Group} from 'three'
import {createInteractableMesh} from './mesh.ts'
import {defaultInteractableConfig} from './constants.ts'
import type {PushDoorConfig} from './types.ts'

describe('交互物外观：单推门门轴', () => {
    it('默认尺寸（薄 X / 宽 Z）门轴落在 Z 边，门扇自门轴侧铺开', () => {
        const {group, dispose} = createInteractableMesh(defaultInteractableConfig('push_door_single'))
        const door = group.getObjectByName('door')
        expect(door).toBeInstanceOf(Group)
        /* 默认 size = [0.15, 2, 1.2] → w < d → 铰链在 z = -d/2 = -0.6 */
        expect(door?.position.x).toBeCloseTo(0)
        expect(door?.position.z).toBeCloseTo(-0.6)
        const panel = door?.children[0]
        expect(panel?.position.z).toBeCloseTo(0.6)
        dispose()
    })

    it('宽 X 的门（w ≥ d）门轴落在 X 边', () => {
        const base = defaultInteractableConfig('push_door_single') as PushDoorConfig
        const {group, dispose} = createInteractableMesh({...base, size: [1.2, 2, 0.15]})
        const door = group.getObjectByName('door')
        expect(door?.position.x).toBeCloseTo(-0.6)
        expect(door?.position.z).toBeCloseTo(0)
        dispose()
    })
})
