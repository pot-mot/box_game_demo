import {describe, it, expect} from 'vitest'
import {filterEquipmentState, hasEquipSlot} from './equip.ts'
import {HUMANOID_BODY_FORM, WOLF_BODY_FORM} from '../index.ts'

describe('filterEquipmentState（按体形过滤装备状态）', () => {
    it('人形保留全部已声明槽位条目', () => {
        const state = {
            limb: {arms: 'orc_arms', legs: 'elf_legs'},
            weapon: {main_hand: 'long_sword'},
            armor: {head: 'iron_helmet', chest: 'iron_plate'},
        }
        expect(filterEquipmentState(HUMANOID_BODY_FORM.equipSlots, state)).toEqual(state)
    })

    it('狼丢弃人形专属槽位，保留自身声明的爪 / 头 / 躯干 / 腿 / 尾', () => {
        const state = {
            limb: {claw: 'wolf_claw_wrap', tail: 'wolf_tail_guard'},
            weapon: {main_hand: 'long_sword', claw: 'wolf_bite'},
            armor: {chest: 'iron_plate', torso: 'wolf_hide'},
        }
        expect(filterEquipmentState(WOLF_BODY_FORM.equipSlots, state)).toEqual({
            limb: {claw: 'wolf_claw_wrap', tail: 'wolf_tail_guard'},
            weapon: {claw: 'wolf_bite'},
            armor: {torso: 'wolf_hide'},
        })
    })

    it('hasEquipSlot 按 kind + bodyPart 判定，不混淆同名部位', () => {
        expect(hasEquipSlot(HUMANOID_BODY_FORM.equipSlots, 'weapon', 'main_hand')).toBe(true)
        expect(hasEquipSlot(HUMANOID_BODY_FORM.equipSlots, 'limb', 'chest')).toBe(false)
        expect(hasEquipSlot(WOLF_BODY_FORM.equipSlots, 'armor', 'claw')).toBe(true)
    })
})
