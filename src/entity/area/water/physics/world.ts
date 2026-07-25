import {type Scene, ShaderMaterial} from 'three'
import type {WaterBlockConfig, WaterBlock, WaterEntityContext} from '../types/index.ts'
import type {EntityPanelInfo} from '../../../box/base/types/entity_info.ts'
import type {PhysicsEnv} from '../../../../physics/env.ts'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../../box/base/types/event_emitter.ts'
import {createWaterBlockMesh, updateWaterBlockMeshSize, disposeWaterBlockMesh} from '../render/index.ts'
import {createWireframe, cleanupWireframe} from '../../../box/base/render/index.ts'
import {setupWaterPhysics} from './forces.ts'
import {formatRowText, createWaterPanel} from '../ui/index.ts'
import {DEFAULT_WATER_CONFIG} from './constants.ts'
import type {EntityType} from '../../../constants.ts'

const TYPE: EntityType = 'area/water' as const
const BADGE_LABEL = 'W'
const BADGE_COLOR = '#484'

export const setupWaterBlocks = (scene: Scene, physicsEnv: PhysicsEnv): WaterEntityContext => {
    const blocks: WaterBlock[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    const waterPhysicsUpdate = setupWaterPhysics(
        () => physicsEnv.getAllBodies(),
        () => blocks.map(w => ({config: w.config, position: w.mesh.position})),
    )

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
        const emitter = createEmitter<EntityEventMap>()
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
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
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

    const updateTime = (time: number): void => {
        const t = time * 0.001
        for (const wb of blocks) {
            const uniforms = (wb.mesh.material as ShaderMaterial).uniforms
            if (uniforms) uniforms.uTime.value = t
        }
    }

    const select = (id: number | undefined): WaterBlock | undefined => {
        if (selectedId !== undefined) {
            const prev = blocks.find(b => b.id === selectedId)
            if (prev) cleanupWireframe(prev)
        }
        selectedId = id
        sourceEvents.emit('select', id)
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

    const syncPositions = (): void => {
        for (const wb of blocks) {
            wb.rowText = formatRowText(wb)
        }
        rebuildPanelInfo()
    }

    const preSync = (_dt: number, _time: number): void => {
        waterPhysicsUpdate()
    }

    const ctx: WaterEntityContext = {
        type: TYPE as any,
        events: sourceEvents as any,
        panelInfo: panelInfo as any,
        add: add as any,
        spawnAt: spawnAt as any,
        remove: remove as any,
        select: select as any,
        getSelected: getSelected as any,
        getSelectedId: getSelectedId as any,
        getAll: () => blocks as any,
        getEntityList: () => blocks as any,
        getMeshes: () => blocks.map(b => b.mesh) as any,
        resize: resize as any,
        setPosition: setPosition as any,
        updateTime: updateTime as any,
        syncPositions: syncPositions as any,
        preSync: preSync as any,
        panel: undefined as any,
    }
    ;(ctx as any).panel = createWaterPanel(ctx as any)
    return ctx
}
