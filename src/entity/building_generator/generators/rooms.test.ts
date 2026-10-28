import {describe, it, expect} from 'vitest'
import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import {generateRoomBuildingLayout, writeRoomBuilding, HOUSE_ROOM_OPTIONS} from './rooms.ts'
import type {BlockWriter} from './structures.ts'

const config = {recipe: 'house', seed: 11, sizeX: 12, sizeY: 6, sizeZ: 12}

describe('基础不规则房间布局', () => {
    it('生成多个不重叠房间与随机地板高度', () => {
        const layout = generateRoomBuildingLayout(config, HOUSE_ROOM_OPTIONS)
        expect(layout.rooms.length).toBeGreaterThanOrEqual(2)
        const occupied = new Set<string>()
        for (const room of layout.rooms) {
            expect(room.floorY).toBeGreaterThanOrEqual(0)
            expect(room.floorY).toBeLessThanOrEqual(HOUSE_ROOM_OPTIONS.floorRange)
            for (const [x, z] of room.list) {
                const key = `${x},${z}`
                expect(occupied.has(key)).toBe(false)
                occupied.add(key)
                expect(x).toBeGreaterThan(0)
                expect(z).toBeGreaterThan(0)
                expect(x).toBeLessThan(config.sizeX)
                expect(z).toBeLessThan(config.sizeZ)
            }
        }
        expect(layout.door).toBeDefined()
        expect(layout.anchors.some(anchor => anchor.id === 'door')).toBe(true)
        expect(layout.anchors.some(anchor => anchor.id === 'roof')).toBe(true)
    })

    it('写入地板 / 墙 / 天花板并保留门洞', () => {
        const blocks = new Map<string, SurfaceMaterialId>()
        const writer: BlockWriter = {
            set: (x, y, z, material) => { blocks.set(`${x},${y},${z}`, material) },
            clear: (x, y, z) => { blocks.delete(`${x},${y},${z}`) },
        }
        const layout = generateRoomBuildingLayout(config, HOUSE_ROOM_OPTIONS)
        writeRoomBuilding(config, writer, layout, HOUSE_ROOM_OPTIONS)
        expect(blocks.size).toBeGreaterThan(0)
        expect([...blocks.values()].some(material => material === 'brick')).toBe(true)
        expect([...blocks.values()].some(material => material === 'tile')).toBe(true)
        const door = layout.door!
        expect(blocks.has(`${door.x},${door.floorY},${door.z}`)).toBe(false)
    })

    it('同种子布局确定', () => {
        const a = generateRoomBuildingLayout(config, HOUSE_ROOM_OPTIONS)
        const b = generateRoomBuildingLayout(config, HOUSE_ROOM_OPTIONS)
        expect(a.rooms.map(room => room.id)).toEqual(b.rooms.map(room => room.id))
        expect(a.rooms.map(room => room.floorY)).toEqual(b.rooms.map(room => room.floorY))
        expect(a.door?.x).toBe(b.door?.x)
    })
})
