import {describe, it, expect} from 'vitest'
import {filterEquipLoadouts} from './equip.ts'
import {HUMANOID_BODY_FORM, WOLF_BODY_FORM} from './index.ts'

describe('filterEquipLoadouts（按体形过滤装备表）', () => {
    it('人形保留全部护甲 / 肢体槽条目', () => {
        const armor = {head: 'iron_helmet', chest: 'iron_plate'}
        const limb = {arms: 'orc_arms', legs: 'elf_legs'}
        const out = filterEquipLoadouts(HUMANOID_BODY_FORM.equipSlots, armor, limb)
        expect(out.armor).toEqual(armor)
        expect(out.limb).toEqual(limb)
    })

    it('狼无护甲 / 肢体槽：护甲与肢体条目全部丢弃', () => {
        const armor = {head: 'iron_helmet', legs: 'iron_greaves'}
        const limb = {arms: 'orc_arms', body: 'orc_body'}
        const out = filterEquipLoadouts(WOLF_BODY_FORM.equipSlots, armor, limb)
        expect(out.armor).toEqual({})
        expect(out.limb).toEqual({})
    })

    it('不在体形槽集合内的条目被丢弃（仅保留声明槽）', () => {
        const out = filterEquipLoadouts(
            {armor: ['head'], limb: [], weapon: true},
            {head: 'iron_helmet', chest: 'iron_plate'},
            {arms: 'orc_arms'},
        )
        expect(out.armor).toEqual({head: 'iron_helmet'})
        expect(out.limb).toEqual({})
    })
})
