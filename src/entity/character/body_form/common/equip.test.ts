import {describe, it, expect} from 'vitest'
import {filterEquipmentState, hasEquipSlot} from './equip.ts'
import {resolveEquipmentMounts, validateEquipmentMounts} from './equipment.ts'
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

    it('提供体形 id 时丢弃同名槽位的跨体形护甲 / 肢体', () => {
        const state = {
            limb: {head: 'orc_head', claw: 'wolf_claw_wrap'},
            weapon: {},
            armor: {head: 'iron_helmet', torso: 'wolf_hide'},
        }
        expect(filterEquipmentState(WOLF_BODY_FORM.equipSlots, state, 'wolf')).toEqual({
            limb: {claw: 'wolf_claw_wrap'},
            weapon: {},
            armor: {torso: 'wolf_hide'},
        })
    })

    it('hasEquipSlot 按 kind + bodyPart 判定，不混淆同名部位', () => {
        expect(hasEquipSlot(HUMANOID_BODY_FORM.equipSlots, 'weapon', 'main_hand')).toBe(true)
        expect(hasEquipSlot(HUMANOID_BODY_FORM.equipSlots, 'limb', 'chest')).toBe(false)
        expect(hasEquipSlot(WOLF_BODY_FORM.equipSlots, 'armor', 'claw')).toBe(true)
    })
})

describe('装备逐关节挂载', () => {
    const slot = HUMANOID_BODY_FORM.equipSlots.find(candidate => candidate.kind === 'armor' && candidate.bodyPart === 'arms')!
    const piece = {id: 'test_arms', mesh: {id: 'bracer' as const, color: 0xffffff}}

    it('未声明 mounts 时按槽位关节派生，每个关节使用同一模型', () => {
        const mounts = resolveEquipmentMounts(piece, slot)
        expect(mounts.map(mount => mount.jointId)).toEqual(slot.mountJointIds)
        for (const mount of mounts) expect(mount.mesh).toBe(piece.mesh)
    })

    it('显式 mounts 可逐关节配置模型 / 偏移 / 旋转，并校验关节白名单', () => {
        const mounts = [
            {jointId: 'rightArmShoulder', mesh: {id: 'bracer' as const, color: 0xff0000}, offset: {x: 1, y: 2, z: 3}},
            {jointId: 'leftArmShoulder', mesh: {id: 'bracer' as const, color: 0x00ff00}, rotation: {x: 0, y: 1, z: 0}},
        ]
        expect(validateEquipmentMounts(piece, slot, mounts)).toEqual([])
        expect(validateEquipmentMounts(piece, slot, [{jointId: 'not_a_joint', mesh: piece.mesh}]).length).toBe(1)
    })
})
