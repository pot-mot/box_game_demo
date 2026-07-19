import {type Scene} from 'three'
import type {WaterBlockConfig, WaterBlock, WaterEntityContext} from '../types'
import {createWaterBlockMesh, updateWaterBlockMeshSize, disposeWaterBlockMesh} from '../render'
import {createWaterPanel} from '../ui'
import type {PanelContext} from '../../base/ui'

export const setupWaterBlocks = (scene: Scene): WaterEntityContext => {
    const blocks: WaterBlock[] = []
    let nextId = 1
    let selectedId: number | undefined

    const add = (config: WaterBlockConfig, x: number, y: number, z: number): WaterBlock => {
        const id = nextId++
        const mesh = createWaterBlockMesh(config)
        mesh.position.set(x, y, z)
        scene.add(mesh)
        const wb: WaterBlock = {id, config: {...config}, mesh}
        blocks.push(wb)
        return wb
    }

    const remove = (id: number): void => {
        const idx = blocks.findIndex(b => b.id === id)
        if (idx === -1) return
        const wb = blocks[idx]
        if (selectedId === id) select(undefined)
        scene.remove(wb.mesh)
        disposeWaterBlockMesh(wb.mesh)
        blocks.splice(idx, 1)
    }

    const resize = (id: number, partial: Partial<WaterBlockConfig>): void => {
        const wb = blocks.find(b => b.id === id)
        if (!wb) return
        const cfg: WaterBlockConfig = {...wb.config, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        if (changedSize) updateWaterBlockMeshSize(wb.mesh, cfg)
        wb.config = cfg
    }

    const setPosition = (id: number, pos: {x: number; y: number; z: number}): void => {
        const wb = blocks.find(b => b.id === id)
        if (!wb) return
        wb.mesh.position.set(pos.x, pos.y, pos.z)
    }

    const updateTime = (time: number): void => {
        const t = time * 0.001
        for (const wb of blocks) {
            const uniforms = (wb.mesh.material as any).uniforms
            if (uniforms) uniforms.uTime.value = t
        }
    }

    const select = (id: number | undefined): WaterBlock | undefined => {
        selectedId = id
        if (id !== undefined) return blocks.find(b => b.id === id) ?? undefined
        return undefined
    }

    const getSelected = (): WaterBlock | undefined => {
        if (selectedId === undefined) return undefined
        return blocks.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    const ctx: WaterEntityContext = {
        add,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => blocks,
        getMeshes: () => blocks.map(b => b.mesh),
        resize,
        setPosition,
        updateTime,
        panel: undefined as unknown as PanelContext,
    }
    ctx.panel = createWaterPanel(ctx)
    return ctx
}
