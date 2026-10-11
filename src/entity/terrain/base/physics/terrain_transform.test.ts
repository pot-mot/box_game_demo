import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../../physics/world.ts'
import {createTerrainContextImpl} from '.'
import {DEFAULT_TERRAIN_CONFIG} from '../validation.ts'
import flatGenerator from '../generators/flat.ts'
import type {BaseTerrainConfig, TerrainContext} from '../types'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩（地形纹理需要） */
const canvasCtxStub = (): Record<string, unknown> => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    fill: () => {},
    stroke: () => {},
    arc: () => {},
    ellipse: () => {},
})

const originalGetContext = HTMLCanvasElement.prototype.getContext

const patchCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(),
        configurable: true,
        writable: true,
    })
}

const restoreCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext,
        configurable: true,
        writable: true,
    })
}

const FLAT_CONFIG: BaseTerrainConfig = {...DEFAULT_TERRAIN_CONFIG, generatorId: 'flat'}

const makeContext = (): Omit<TerrainContext, 'panel'> => {
    const scene = new Scene()
    const shared = createSharedWorld()
    return createTerrainContextImpl(scene, shared, {
        type: 'terrain',
        badgeLabel: 'TR',
        badgeColor: '#684',
        generators: {flat: flatGenerator},
    })
}

describe('地形 Y 高度调整', () => {
    beforeAll(async () => {
        await RAPIER.init()
        patchCanvas2d()
    })

    afterAll(() => {
        restoreCanvas2d()
    })

    it('add 使用传入的 y 作为地形原点高度', () => {
        const ctx = makeContext()
        const e = ctx.add(FLAT_CONFIG, 1, 5, 2)
        expect(e.mesh.position.y).toBeCloseTo(5, 6)
        expect(e.body.translation().y).toBeCloseTo(5, 6)
    })

    it('setTransform 调整 y 高度并同步刚体', () => {
        const ctx = makeContext()
        const e = ctx.add(FLAT_CONFIG, 0, 0, 0)
        ctx.setTransform(e.id, {x: 3, y: 7, z: -1}, {x: 0, y: 0, z: 0})
        expect(e.mesh.position.y).toBeCloseTo(7, 6)
        expect(e.body.translation().y).toBeCloseTo(7, 6)
    })

    it('updatePosition 调整 y 高度并同步刚体', () => {
        const ctx = makeContext()
        const e = ctx.add(FLAT_CONFIG, 0, 0, 0)
        ctx.updatePosition(e.id, 2, 4, 6)
        expect(e.mesh.position.y).toBeCloseTo(4, 6)
        expect(e.body.translation().y).toBeCloseTo(4, 6)
    })

    it('getHeightAt 反映地形原点 y 偏移', () => {
        const ctx = makeContext()
        ctx.add(FLAT_CONFIG, 0, 5, 0)
        /* 平坦地形高度全为 minHeight=0，世界表面高度即原点 y */
        expect(ctx.getHeightAt(0, 0, 5)).toBeCloseTo(5, 6)
    })
})
