import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {PerspectiveCamera, Raycaster, Scene, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../physics/world.ts'
import {collectWorldState} from '../../save_load/serialize.ts'
import {loadWorldFromData} from '../../save_load/deserialize.ts'
import type {EntityInfoSource} from '../box/base/types/entity_info.ts'
import {getBlock} from './grid/block_world.ts'
import {setupBuildingGenerator} from './world.ts'
import type {BuildingGeneratorContext} from './types/index.ts'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩（材质图集需要） */
const canvasCtxStub = (): Record<string, unknown> => ({
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    save: () => {},
    restore: () => {},
    translate: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => {},
    fill: () => {},
    fillRect: () => {},
})

const originalGetContext = HTMLCanvasElement.prototype.getContext

beforeAll(async () => {
    await RAPIER.init()
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(),
        configurable: true,
        writable: true,
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext,
        configurable: true,
        writable: true,
    })
})

const HOUSE = {recipe: 'house', seed: 7, sizeX: 8, sizeY: 5, sizeZ: 8}

describe('building_generator 建筑世界', () => {
    let ctx: BuildingGeneratorContext

    beforeEach(() => {
        ctx = setupBuildingGenerator(new Scene(), createSharedWorld())
    })

    it('生成建筑后分块渲染出网格', () => {
        const world = ctx.add(HOUSE, 0, 0, 0)
        expect(world.chunks.size).toBeGreaterThan(0)
        const camera = new PerspectiveCamera()
        camera.position.set(0, 1, 20)
        for (let i = 0; i < 10; i++) ctx.updateView(camera, 0.016)
        expect(ctx.getMeshes().length).toBeGreaterThan(0)
    })

    it('远处 chunk 渲染粗 LOD（细节拾取网格为空但场景有网格）', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 4, sizeY: 1, sizeZ: 4}, 0, 0, 0)
        const camera = new PerspectiveCamera()
        camera.position.set(0, 1, 150)
        for (let i = 0; i < 10; i++) ctx.updateView(camera, 0.016)
        expect(ctx.getMeshes().length).toBe(0)
        expect(world.group.children.length).toBeGreaterThan(0)
    })

    it('存档往返（编码 → 解码）保持体素数据一致', () => {
        ctx.add(HOUSE, 0, 0, 0)
        const saved = ctx.getSaveWorlds()
        expect(saved.length).toBe(1)
        expect(saved[0].chunks.length).toBeGreaterThan(0)

        const ctx2 = setupBuildingGenerator(new Scene(), createSharedWorld())
        ctx2.loadSaveWorlds(saved)
        expect(ctx2.getAll().length).toBe(1)
        expect(ctx2.getSaveWorlds()).toEqual(saved)
    })

    it('未知调色板材质安全丢弃而不抛错', () => {
        ctx.add(HOUSE, 0, 0, 0)
        const saved = ctx.getSaveWorlds()
        const ctx2 = setupBuildingGenerator(new Scene(), createSharedWorld())
        ctx2.loadSaveWorlds([{...saved[0], palette: []}])
        expect(ctx2.getAll().length).toBe(1)
        expect(ctx2.getAll()[0].chunks.size).toBe(0)
    })

    it('pickBlock 命中体素坐标与面法线', () => {
        ctx.add({recipe: 'platform', seed: 1, sizeX: 4, sizeY: 1, sizeZ: 4}, 0, 0, 0)
        const camera = new PerspectiveCamera()
        camera.position.set(2, 10, 2)
        ctx.updateView(camera, 0.016)

        const raycaster = new Raycaster(new Vector3(2, 10, 2), new Vector3(0, -1, 0))
        const pick = ctx.pickBlock(raycaster)
        expect(pick).toBeDefined()
        expect(pick!.block).toEqual([2, 0, 2])
        expect(pick!.normal).toEqual([0, 1, 0])
    })

    it('放置自由道具并随存档往返', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 2, sizeY: 1, sizeZ: 2}, 0, 0, 0)
        ctx.placeProp(world.id, 'door', 'wood', 0.5, 1.5, 0.5, 0)
        expect(world.props.length).toBe(1)
        expect(world.propGroup.children.length).toBe(1)

        const saved = ctx.getSaveWorlds()
        const ctx2 = setupBuildingGenerator(new Scene(), createSharedWorld())
        ctx2.loadSaveWorlds(saved)
        const loaded = ctx2.getAll()[0]
        expect(loaded.props.length).toBe(1)
        expect(loaded.props[0].kind).toBe('door')
        expect(loaded.propGroup.children.length).toBe(1)

        ctx2.removeProp(loaded.id, 0)
        expect(loaded.props.length).toBe(0)
        expect(loaded.propGroup.children.length).toBe(0)
    })

    it('区域填充与材质批量替换', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 2, sizeY: 1, sizeZ: 2}, 0, 0, 0)
        ctx.fillRegion(world.id, 0, 0, 0, 1, 0, 1, 'brick')
        expect(ctx.getBlockMaterial(world.id, 0, 0, 0)).toBe('brick')
        expect(ctx.getBlockMaterial(world.id, 1, 0, 1)).toBe('brick')
        ctx.replaceMaterial(world.id, 'brick', 'wood')
        expect(ctx.getBlockMaterial(world.id, 0, 0, 0)).toBe('wood')
        expect(ctx.getBlockMaterial(world.id, 0, 0, 0)).not.toBe('brick')
    })

    it('限定区域材质替换只影响范围内', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 1, sizeY: 1, sizeZ: 1}, 0, 0, 0)
        ctx.fillRegion(world.id, 0, 0, 0, 3, 0, 3, 'brick')
        ctx.replaceMaterialInRegion(world.id, 'brick', 'wood', 0, 0, 0, 1, 0, 1)
        expect(ctx.getBlockMaterial(world.id, 0, 0, 0)).toBe('wood')
        expect(ctx.getBlockMaterial(world.id, 1, 0, 1)).toBe('wood')
        expect(ctx.getBlockMaterial(world.id, 2, 0, 2)).toBe('brick')
    })

    it('编辑道具材质 / 朝向并重建网格', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 2, sizeY: 1, sizeZ: 2}, 0, 0, 0)
        ctx.placeProp(world.id, 'door', 'wood', 0.5, 0.5, 0.5, 0)
        ctx.updateProp(world.id, 0, {material: 'rusty_iron', yawQuarter: 2})
        expect(world.props[0].material).toBe('rusty_iron')
        expect(world.props[0].yawQuarter).toBe(2)
        expect(world.propGroup.children.length).toBe(1)
    })

    it('选中高亮与区域预览线框可见性', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 2, sizeY: 1, sizeZ: 2}, 0, 0, 0)
        ctx.select(world.id)
        const lines = world.group.children.filter(child => child.type === 'LineSegments')
        expect(lines.length).toBe(2)
        expect(lines.filter(line => line.visible).length).toBe(1)
        ctx.setRegionPreview(world.id, [0, 0, 0], [1, 0, 1])
        expect(lines.filter(line => line.visible).length).toBe(2)
        ctx.setRegionPreview(undefined)
        expect(lines.filter(line => line.visible).length).toBe(1)
    })

    it('边界体素写入失效相邻 chunk（跨 chunk 面剔除）', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 1, sizeY: 1, sizeZ: 1}, 0, 0, 0)
        world.dirty.clear()
        /* 局部 x=15 为 chunk 右边界，写入需同时失效 (0,0,0) 与 (1,0,0) */
        ctx.setBlock(world.id, 15, 0, 5, 'brick')
        expect(world.dirty.has('0,0,0')).toBe(true)
        expect(world.dirty.has('1,0,0')).toBe(true)

        world.dirty.clear()
        /* 擦除局部 x=0（chunk 左边界）需失效 (-1,0,0) */
        ctx.setBlock(world.id, 0, 0, 0)
        expect(world.dirty.has('-1,0,0')).toBe(true)
    })

    it('面板行文本在新增 chunk 后刷新', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 1, sizeY: 1, sizeZ: 1}, 0, 0, 0)
        const before = ctx.panelInfo.find(entry => entry.id === world.id)?.rowText
        expect(before).toContain('chunks:1')
        ctx.setBlock(world.id, 40, 0, 40, 'brick')
        const after = ctx.panelInfo.find(entry => entry.id === world.id)?.rowText
        expect(after).toContain('chunks:2')
    })

    it('应用配置重建体素并保留世界 id 与道具', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 2, sizeY: 1, sizeZ: 2}, 0, 0, 0)
        ctx.placeProp(world.id, 'door', 'wood', 0.5, 0.5, 0.5, 0)
        expect(ctx.getBlockMaterial(world.id, 5, 1, 5)).toBeUndefined()

        ctx.updateConfig(world.id, {recipe: 'wall', seed: 1, sizeX: 8, sizeY: 2, sizeZ: 1})

        expect(world.config.recipe).toBe('wall')
        /* 墙沿 x 铺开、厚度在 z=0，高 2 层 */
        expect(ctx.getBlockMaterial(world.id, 5, 1, 0)).toBeDefined()
        expect(ctx.getBlockMaterial(world.id, 5, 1, 5)).toBeUndefined()
        expect(world.props.length).toBe(1)
        expect(ctx.getAll().some(w => w.id === world.id)).toBe(true)
    })

    it('跨 chunk 放置后新块可正确拾取（网格顶点带 chunk 世界偏移）', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 4, sizeY: 1, sizeZ: 4}, 0, 0, 0)
        const camera = new PerspectiveCamera()
        camera.position.set(2, 20, 2)
        ctx.updateView(camera, 0.016)

        const down = (): Raycaster => new Raycaster(new Vector3(1.5, -20, 1.5), new Vector3(0, 1, 0))
        const first = ctx.pickBlock(down())
        expect(first).toBeDefined()
        const target: [number, number, number] = [
            first!.block[0] + first!.normal[0],
            first!.block[1] + first!.normal[1],
            first!.block[2] + first!.normal[2],
        ]
        /* 目标位于下方相邻 chunk（y=-1，chunk cy=-1） */
        expect(target[1]).toBe(-1)
        ctx.setBlock(world.id, target[0], target[1], target[2], 'brick')
        ctx.updateView(camera, 0.016)

        const second = ctx.pickBlock(down())
        expect(second).toBeDefined()
        expect(second!.block).toEqual(target)
    })

    it('预制体编排写入体素', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 2, sizeY: 1, sizeZ: 2}, 0, 0, 0)
        expect(ctx.getBlockMaterial(world.id, 5, 1, 5)).toBeUndefined()
        ctx.stampPrefab(world.id, {recipe: 'wall', seed: 1, sizeX: 4, sizeY: 2, sizeZ: 1}, 5, 1, 5)
        expect(ctx.getBlockMaterial(world.id, 5, 1, 5)).toBeDefined()
        expect(ctx.getBlockMaterial(world.id, 8, 1, 5)).toBeDefined()
    })

    it('setBlock 写入后经存档往返保留（含负坐标新 chunk）', () => {
        const world = ctx.add({recipe: 'platform', seed: 1, sizeX: 2, sizeY: 1, sizeZ: 2}, 0, 0, 0)
        ctx.setBlock(world.id, 10, 0, 10, 'brick')
        ctx.setBlock(world.id, -5, 0, -5, 'wood')

        const saved = ctx.getSaveWorlds()
        const ctx2 = setupBuildingGenerator(new Scene(), createSharedWorld())
        ctx2.loadSaveWorlds(saved)
        const chunks = ctx2.getAll()[0].chunks
        expect(getBlock(chunks, 10, 0, 10)).toBeGreaterThan(0)
        expect(getBlock(chunks, -5, 0, -5)).toBeGreaterThan(0)
    })

    it('经 collectWorldState / loadWorldFromData 完整往返（存档 v7 分派）', () => {
        ctx.add(HOUSE, 1, 0, 2)
        const systems = new Map<string, EntityInfoSource>([['building_generator', ctx]])
        const data = collectWorldState(systems, [], 'edit')
        expect(data.version).toBe(7)
        expect(data.entities.length).toBe(1)

        const ctx2 = setupBuildingGenerator(new Scene(), createSharedWorld())
        const systems2 = new Map<string, EntityInfoSource>([['building_generator', ctx2]])
        loadWorldFromData(data, systems2, [])
        expect(ctx2.getSaveWorlds()).toEqual(ctx.getSaveWorlds())
    })

    it('remove 清理世界与网格', () => {
        const world = ctx.add(HOUSE, 0, 0, 0)
        const camera = new PerspectiveCamera()
        camera.position.set(0, 1, 20)
        ctx.updateView(camera, 0.016)
        ctx.remove(world.id)
        expect(ctx.getAll().length).toBe(0)
        expect(ctx.getMeshes().length).toBe(0)
    })
})
