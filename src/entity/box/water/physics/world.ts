import {type Scene} from 'three'
import type {WaterBlockConfig, WaterBlock, WaterEntityContext} from '../types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter} from '../../base/types/event_emitter'
import {createWaterBlockMesh, updateWaterBlockMeshSize, disposeWaterBlockMesh} from '../render'
import {formatRowText, createWaterPanel} from '../ui'
import type {PanelContext} from '../../base/ui'
import {DEFAULT_WATER_CONFIG} from './constants.ts'

const TYPE = 'water' as const
const BADGE_LABEL = 'W'
const BADGE_COLOR = '#484'

export const setupWaterBlocks = (scene: Scene): WaterEntityContext => {
    const blocks: WaterBlock[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []

    const rebuildPanelInfo = () => {
        panelInfo.length = 0
        for (const b of blocks) {
            panelInfo.push({
                id: b.id,
                type: TYPE,
                badgeLabel: BADGE_LABEL,
                badgeColor: BADGE_COLOR,
                rowText: b.rowText,
            })
        }
    }

    const refreshRowText = (block: WaterBlock): void => {
        block.rowText = formatRowText(block)
        block.emitter.emit('infoUpdate')
    }

    const add = (config: WaterBlockConfig, x: number, y: number, z: number): WaterBlock => {
        const id = nextId++
        const mesh = createWaterBlockMesh(config)
        mesh.position.set(x, y, z)
        scene.add(mesh)
        const emitter = createEmitter()
        const wb: WaterBlock = {id, config: {...config}, mesh, emitter, rowText: ''}
        refreshRowText(wb)
        emitter.on('infoUpdate', rebuildPanelInfo)
        blocks.push(wb)
        rebuildPanelInfo()
        return wb
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_WATER_CONFIG, x, y, z)
    }

    const remove = (id: number): void => {
        const idx = blocks.findIndex(b => b.id === id)
        if (idx === -1) return
        const wb = blocks[idx]
        if (selectedId === id) select(undefined)
        scene.remove(wb.mesh)
        disposeWaterBlockMesh(wb.mesh)
        blocks.splice(idx, 1)
        rebuildPanelInfo()
    }

    const resize = (id: number, partial: Partial<WaterBlockConfig>): void => {
        const wb = blocks.find(b => b.id === id)
        if (!wb) return
        const cfg: WaterBlockConfig = {...wb.config, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        if (changedSize) updateWaterBlockMeshSize(wb.mesh, cfg)
        wb.config = cfg
        refreshRowText(wb)
    }

    const setPosition = (id: number, pos: {x: number; y: number; z: number}): void => {
        const wb = blocks.find(b => b.id === id)
        if (!wb) return
        wb.mesh.position.set(pos.x, pos.y, pos.z)
        refreshRowText(wb)
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

    const syncPositions = (): void => {
        for (const wb of blocks) {
            wb.rowText = formatRowText(wb)
        }
        rebuildPanelInfo()
    }

    const ctx: WaterEntityContext = {
        type: TYPE,
        panelInfo,
        add,
        spawnAt,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => blocks,
        getEntityList: () => blocks,
        getMeshes: () => blocks.map(b => b.mesh),
        resize,
        setPosition,
        updateTime,
        syncPositions,
        panel: undefined as unknown as PanelContext,
    }
    ctx.panel = createWaterPanel(ctx)
    return ctx
}
