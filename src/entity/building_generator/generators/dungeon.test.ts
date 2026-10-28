import {describe, it, expect} from 'vitest'
import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import {generateDungeonLayout, writeDungeon} from './dungeon.ts'
import type {BlockWriter} from './structures.ts'

const config = {recipe: 'dungeon', seed: 42, sizeX: 44, sizeY: 20, sizeZ: 44}

describe('地牢布局', () => {
    it('生成多层、多个不规则且不重叠的房间', () => {
        const layout = generateDungeonLayout(config)
        expect(layout.levels).toBeGreaterThanOrEqual(2)
        expect(layout.rooms.length).toBeGreaterThanOrEqual(layout.levels * 3)
        expect(layout.doors.length).toBeGreaterThan(0)
        expect(layout.anchors.some(anchor => anchor.id.startsWith('door_'))).toBe(true)
        for (const level of Array.from({length: layout.levels}, (_, i) => i)) {
            const rooms = layout.rooms.filter(room => room.level === level)
            const occupied = new Set<string>()
            for (const room of rooms) {
                for (const [x, z] of room.list) {
                    const key = `${x},${z}`
                    expect(occupied.has(key)).toBe(false)
                    occupied.add(key)
                    expect(x).toBeGreaterThanOrEqual(3)
                    expect(z).toBeGreaterThanOrEqual(3)
                    expect(x).toBeLessThan(layout.size - 3)
                    expect(z).toBeLessThan(layout.size - 3)
                }
            }
        }
    })

    it('同种子布局确定，且存在垂直交通', () => {
        const a = generateDungeonLayout(config)
        const b = generateDungeonLayout(config)
        expect(a.rooms.map(room => room.id)).toEqual(b.rooms.map(room => room.id))
        expect(a.doors.map(door => door.position)).toEqual(b.doors.map(door => door.position))
        expect(a.elevators.length + a.spirals.length).toBeGreaterThan(0)
    })

    it('写入体素且包含房间地板与墙体', () => {
        const blocks = new Map<string, SurfaceMaterialId>()
        const writer: BlockWriter = {
            set: (x, y, z, material) => { blocks.set(`${x},${y},${z}`, material) },
            clear: (x, y, z) => { blocks.delete(`${x},${y},${z}`) },
        }
        writeDungeon(config, writer)
        expect(blocks.size).toBeGreaterThan(1000)
        expect([...blocks.values()].some(material => material === 'brick')).toBe(true)
        expect([...blocks.values()].some(material => material === 'rock')).toBe(true)
    })
})
