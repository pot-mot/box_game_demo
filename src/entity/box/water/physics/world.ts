import {type Scene, ShaderMaterial} from 'three'
import type {WaterBlockConfig, WaterBlock, WaterEntityContext} from '../types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter} from '../../base/types/event_emitter'
import {createWaterBlockMesh, updateWaterBlockMeshSize, disposeWaterBlockMesh} from '../render'
import {createWireframe, cleanupWireframe} from '../../base/render'
import {formatRowText, createWaterPanel} from '../ui'
import type {PanelContext} from '../../base/ui'
import {DEFAULT_WATER_CONFIG} from './constants.ts'

// ── 常量 ──

const TYPE = 'water' as const
const BADGE_LABEL = 'W'
const BADGE_COLOR = '#484'

// ── 初始化 ──

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

    // ── 增删改查 ──

    const add = (config: WaterBlockConfig, x: number, y: number, z: number): WaterBlock => {
        const id = nextId++
        const mesh = createWaterBlockMesh(config)
        mesh.position.set(x, y, z)
        scene.add(mesh)
        const emitter = createEmitter()
        const wb: WaterBlock = {id, config: {...config}, mesh, emitter, rowText: '', wireframe: undefined}
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
        cleanupWireframe(wb)
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
        if (changedSize) {
            updateWaterBlockMeshSize(wb.mesh, cfg)
            if (wb.wireframe) {
                cleanupWireframe(wb)
                wb.wireframe = createWireframe(wb.mesh.geometry)
                wb.mesh.add(wb.wireframe)
            }
        }
        wb.config = cfg
        refreshRowText(wb)
    }

    const setPosition = (id: number, pos: {x: number; y: number; z: number}): void => {
        const wb = blocks.find(b => b.id === id)
        if (!wb) return
        wb.mesh.position.set(pos.x, pos.y, pos.z)
        refreshRowText(wb)
    }

    // ── 时间更新 ──

    const updateTime = (time: number): void => {
        const t = time * 0.001
        for (const wb of blocks) {
            const uniforms = (wb.mesh.material as ShaderMaterial).uniforms
            if (uniforms) uniforms.uTime.value = t
        }
    }

    // ── 选中管理 ──

    const select = (id: number | undefined): WaterBlock | undefined => {
        if (selectedId !== undefined) {
            const prev = blocks.find(b => b.id === selectedId)
            if (prev) cleanupWireframe(prev)
        }
        selectedId = id
        if (id !== undefined) {
            const wb = blocks.find(b => b.id === id)
            if (wb) {
                const line = createWireframe(wb.mesh.geometry)
                wb.mesh.add(line)
                wb.wireframe = line
                return wb
            }
        }
        return undefined
    }

    const getSelected = (): WaterBlock | undefined => {
        if (selectedId === undefined) return undefined
        return blocks.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    // ── 同步 ──

    const syncPositions = (): void => {
        for (const wb of blocks) {
            wb.rowText = formatRowText(wb)
        }
        rebuildPanelInfo()
    }

    // ── 上下文 ──

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
