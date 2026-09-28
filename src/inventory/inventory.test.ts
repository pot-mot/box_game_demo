import {describe, it, expect} from 'vitest'
import {addItem, createInventory, equipStack, unequipSlot, removeAt, inventoryToSave, inventoryFromSave, createInstanceId, transferStack} from './inventory.ts'

describe('背包增删与堆叠', () => {
    it('可堆叠材料合并到未满堆叠', () => {
        const inv = createInventory()
        expect(addItem(inv, 'material_stone', 3).ok).toBe(true)
        expect(addItem(inv, 'material_stone', 2).ok).toBe(true)
        expect(inv.stacks.length).toBe(1)
        expect(inv.stacks[0].count).toBe(5)
    })

    it('武器不可堆叠，逐件占格', () => {
        const inv = createInventory()
        addItem(inv, 'weapon_long_sword', 1)
        addItem(inv, 'weapon_long_sword', 1)
        expect(inv.stacks.length).toBe(2)
    })

    it('未知 defId 拒绝添加', () => {
        const inv = createInventory()
        expect(addItem(inv, 'no_such_item', 1)).toEqual({ok: false, reason: 'unknown'})
    })

    it('背包塞满后添加失败并回滚已加入堆叠', () => {
        const inv = createInventory(1, 1)
        addItem(inv, 'material_stone', 1)
        const result = addItem(inv, 'weapon_short_sword', 1)
        expect(result.ok).toBe(false)
        expect(inv.stacks.length).toBe(1)
    })
})

describe('装备与卸下', () => {
    it('武器装备到主手、护甲装备到对应槽位', () => {
        const inv = createInventory()
        const w = addItem(inv, 'weapon_long_sword', 1).instanceId!
        const a = addItem(inv, 'armor_iron_helmet', 1).instanceId!
        expect(equipStack(inv, w, 'main_hand')).toBe(true)
        expect(equipStack(inv, a, 'head')).toBe(true)
        expect(inv.equipment.main_hand).toBe(w)
        expect(inv.equipment.head).toBe(a)
        expect(inv.stacks.find(s => s.instanceId === w)?.grid).toBeUndefined()
    })

    it('护甲不能装备到错误槽位', () => {
        const inv = createInventory()
        const a = addItem(inv, 'armor_iron_helmet', 1).instanceId!
        expect(equipStack(inv, a, 'legs')).toBe(false)
    })

    it('卸下后回到背包格位', () => {
        const inv = createInventory()
        const w = addItem(inv, 'weapon_long_sword', 1).instanceId!
        equipStack(inv, w, 'main_hand')
        expect(unequipSlot(inv, 'main_hand')).toBe(true)
        expect(inv.equipment.main_hand).toBeUndefined()
        expect(inv.stacks.find(s => s.instanceId === w)?.grid).toBeDefined()
    })

    it('移除装备中的物品同步清理装备映射', () => {
        const inv = createInventory()
        const w = addItem(inv, 'weapon_long_sword', 1).instanceId!
        equipStack(inv, w, 'main_hand')
        removeAt(inv, w)
        expect(inv.equipment.main_hand).toBeUndefined()
    })
})

describe('背包存档往返', () => {
    it('合法背包往返保持结构与装备', () => {
        const inv = createInventory(6, 4)
        const w = addItem(inv, 'weapon_long_sword', 1, () => 'w1').instanceId!
        addItem(inv, 'material_stone', 4, () => 'm1')
        equipStack(inv, w, 'main_hand')
        const restored = inventoryFromSave(inventoryToSave(inv))
        expect(restored.width).toBe(6)
        expect(restored.equipment.main_hand).toBe('w1')
        expect(restored.stacks.find(s => s.instanceId === 'm1')?.count).toBe(4)
    })

    it('未知 defId / 非法格位安全回退，不抛错', () => {
        const data = {
            width: 4,
            height: 4,
            items: [
                {instanceId: 'x', defId: 'no_such', count: 1},
                {instanceId: 'y', defId: 'material_stone', count: 1, grid: {x: 99, y: 99, rot: 9}},
            ],
            equipment: {},
        }
        const inv = inventoryFromSave(data)
        expect(inv.stacks.some(s => s.defId === 'no_such')).toBe(false)
        /* 非法格位物品被重新自动归位（而非丢弃） */
        expect(inv.stacks.find(s => s.instanceId === 'y')?.grid).toBeDefined()
    })

    it('createInstanceId 生成唯一键', () => {
        expect(createInstanceId()).not.toBe(createInstanceId())
    })
})

describe('跨容器转移（箱子存取）', () => {
    it('背包 → 箱子 → 背包 往返保留实例与数量', () => {
        const bag = createInventory()
        const chest = createInventory(6, 4)
        const id = addItem(bag, 'weapon_long_sword', 1, () => 'w1').instanceId!
        expect(transferStack(bag, chest, id)).toBe(true)
        expect(bag.stacks.length).toBe(0)
        expect(chest.stacks.find(s => s.instanceId === id)?.grid).toBeDefined()
        expect(transferStack(chest, bag, id)).toBe(true)
        expect(chest.stacks.length).toBe(0)
        expect(bag.stacks.find(s => s.instanceId === id)?.grid).toBeDefined()
    })

    it('装备中的物品转移时解除装备映射', () => {
        const bag = createInventory()
        const chest = createInventory(6, 4)
        const id = addItem(bag, 'weapon_long_sword', 1, () => 'w1').instanceId!
        equipStack(bag, id, 'main_hand')
        expect(transferStack(bag, chest, id)).toBe(true)
        expect(bag.equipment.main_hand).toBeUndefined()
        expect(chest.stacks.some(s => s.instanceId === id)).toBe(true)
    })

    it('目标容器无空间时转移失败且源不变', () => {
        const bag = createInventory()
        const chest = createInventory(1, 1)
        addItem(chest, 'material_stone', 1)
        const id = addItem(bag, 'weapon_long_sword', 1, () => 'w1').instanceId!
        expect(transferStack(bag, chest, id)).toBe(false)
        expect(bag.stacks.some(s => s.instanceId === id)).toBe(true)
    })
})
