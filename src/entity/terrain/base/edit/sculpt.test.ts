import {describe, it, expect, vi, beforeEach} from 'vitest'
import {BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera} from 'three'
import {setupTerrainSculpt, type TerrainSculptSource} from './sculpt.ts'

type SculptFn = (id: number, x: number, y: number, z: number, direction: 1 | -1) => void

const makeMesh = (): Mesh => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial())
    mesh.updateMatrixWorld()
    return mesh
}

const makeCamera = (): PerspectiveCamera => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    return camera
}

const makeSource = (mesh: Mesh, selectedId: number | undefined, sculpt: SculptFn): TerrainSculptSource => ({
    getSelectedId: () => selectedId,
    getMeshes: () => [mesh],
    getEntityList: () => [{id: 7, mesh}],
    sculpt,
})

/** 在屏幕中心派发滚轮事件（射线穿过相机正中；happy-dom 的 WheelEvent 不携带鼠标坐标，故手动补全） */
const wheel = (dom: HTMLElement, deltaY: number): Event => {
    const e = new Event('wheel', {bubbles: true, cancelable: true})
    Object.defineProperty(e, 'deltaY', {value: deltaY})
    Object.defineProperty(e, 'clientX', {value: window.innerWidth / 2})
    Object.defineProperty(e, 'clientY', {value: window.innerHeight / 2})
    dom.dispatchEvent(e)
    return e
}

describe('地形雕刻：滚轮门控', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        /* happy-dom 默认视口尺寸可能为 0，固定以便按屏幕中心换算 NDC */
        Object.defineProperty(window, 'innerWidth', {value: 1024, configurable: true})
        Object.defineProperty(window, 'innerHeight', {value: 768, configurable: true})
    })

    it('未启用时滚轮不雕刻', () => {
        const mesh = makeMesh()
        const sculpt = vi.fn<SculptFn>()
        const dom = document.createElement('div')
        setupTerrainSculpt(makeCamera(), dom, [makeSource(mesh, 7, sculpt)])

        wheel(dom, 1)
        expect(sculpt).not.toHaveBeenCalled()
    })

    it('启用且选中地形后，滚轮按命中点升降（deltaY > 0 降一格）', () => {
        const mesh = makeMesh()
        const sculpt = vi.fn<SculptFn>()
        const dom = document.createElement('div')
        const controller = setupTerrainSculpt(makeCamera(), dom, [makeSource(mesh, 7, sculpt)])
        controller.setEnabled(true)

        const e = wheel(dom, 1)
        expect(e.defaultPrevented).toBe(true)
        expect(sculpt).toHaveBeenCalledTimes(1)
        const [id, , , , dir] = sculpt.mock.calls[0]
        expect(id).toBe(7)
        expect(dir).toBe(-1)
    })

    it('启用但未选中地形时不雕刻、不拦截滚轮', () => {
        const mesh = makeMesh()
        const sculpt = vi.fn<SculptFn>()
        const dom = document.createElement('div')
        const controller = setupTerrainSculpt(makeCamera(), dom, [makeSource(mesh, undefined, sculpt)])
        controller.setEnabled(true)

        const e = wheel(dom, 1)
        expect(sculpt).not.toHaveBeenCalled()
        expect(e.defaultPrevented).toBe(false)
    })

    it('dispose 后不再响应滚轮', () => {
        const mesh = makeMesh()
        const sculpt = vi.fn<SculptFn>()
        const dom = document.createElement('div')
        const controller = setupTerrainSculpt(makeCamera(), dom, [makeSource(mesh, 7, sculpt)])
        controller.setEnabled(true)
        controller.dispose()

        wheel(dom, 1)
        expect(sculpt).not.toHaveBeenCalled()
    })
})
