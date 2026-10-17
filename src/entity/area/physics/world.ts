import {type Mesh, type Scene, ShaderMaterial} from 'three'
import type {AreaConfig, Area, AreaEntityContext} from '../types'
import type {EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import type {PhysicsEnv} from '../../../physics/env.ts'
import type {RapQuaternion, RapVector3} from '../../../physics/rapier_utils.ts'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../box/base/types/event_emitter.ts'
import {createWireframe, cleanupWireframe} from '../../box/base/render'
import {createAreaMesh, updateAreaGeometry, updateAreaMaterial, disposeAreaMesh, isWaterArea} from '../render'
import {sampleOverlap} from './overlap.ts'
import {applyFields} from './fields/index.ts'
import {formatRowText, createAreaPanel} from '../ui'
import {DEFAULT_AREA_CONFIG} from '../validation.ts'
import {badgeOf, enabledFields} from '../constants.ts'
import type {EntityType} from '../../constants.ts'

const TYPE: EntityType = 'area' as const

const _areaPos: RapVector3 = {x: 0, y: 0, z: 0}
const _areaQuat: RapQuaternion = {x: 0, y: 0, z: 0, w: 1}

export const setupAreas = (scene: Scene, physicsEnv: PhysicsEnv): AreaEntityContext => {
    const areas: Area[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    /** 每帧对每个区域×刚体求重叠并施加全部启用场 */
    const physicsUpdate = (): void => {
        if (areas.length === 0) return
        const bodies = physicsEnv.getAllBodies()
        if (bodies.length === 0) return
        for (const area of areas) {
            if (enabledFields(area.config.fields).length === 0) continue
            _areaPos.x = area.transform.x
            _areaPos.y = area.transform.y
            _areaPos.z = area.transform.z
            _areaQuat.x = area.transform.qx
            _areaQuat.y = area.transform.qy
            _areaQuat.z = area.transform.qz
            _areaQuat.w = area.transform.qw
            for (const body of bodies) {
                const overlap = sampleOverlap(body, area.config.shape, _areaPos, _areaQuat)
                if (overlap === undefined) continue
                applyFields(
                    {body, overlap, areaPos: _areaPos, areaQuat: _areaQuat, env: physicsEnv.getEnvironment(body)},
                    area.config,
                )
            }
        }
    }

    const rebuildPanelInfo = (): void => {
        panelInfo.length = 0
        for (const a of areas) {
            const badge = badgeOf(a.config.fields)
            panelInfo.push({
                id: a.id,
                type: TYPE,
                badgeLabel: badge.label,
                badgeColor: badge.color,
                rowText: a.rowText,
            })
        }
    }

    const refreshRowText = (area: Area): void => {
        area.rowText = formatRowText(area)
        area.emitter.emit('infoUpdate')
    }

    const add = (config: AreaConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}): Area => {
        const id = nextId++
        const mesh = createAreaMesh(config)
        mesh.position.set(x, y, z)
        if (quat) mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        scene.add(mesh)

        const q = quat ?? {x: 0, y: 0, z: 0, w: 1}
        const emitter = createEmitter<EntityEventMap>()
        const area: Area = {
            id,
            config: structuredClone(config),
            mesh,
            transform: {x, y, z, qx: q.x, qy: q.y, qz: q.z, qw: q.w},
            emitter,
            rowText: '',
            wireframe: undefined,
        }
        refreshRowText(area)
        emitter.on('infoUpdate', rebuildPanelInfo)
        areas.push(area)
        rebuildPanelInfo()
        return area
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_AREA_CONFIG, x, y, z)
    }

    const remove = (id: number): void => {
        const idx = areas.findIndex(a => a.id === id)
        if (idx === -1) return
        const area = areas[idx]
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        cleanupWireframe(area)
        scene.remove(area.mesh)
        disposeAreaMesh(area.mesh)
        areas.splice(idx, 1)
        rebuildPanelInfo()
    }

    const rebuildWireframe = (area: Area): void => {
        if (!area.wireframe) return
        cleanupWireframe(area)
        area.wireframe = createWireframe(area.mesh.geometry)
        area.mesh.add(area.wireframe)
    }

    const updateConfig = (id: number, partial: Partial<AreaConfig>): void => {
        const area = areas.find(a => a.id === id)
        if (!area) return
        const next: AreaConfig = {...area.config, ...partial}
        const shapeChanged = partial.shape !== undefined
        const materialChanged = partial.material !== undefined && partial.material !== area.config.material
        if (shapeChanged) {
            updateAreaGeometry(area.mesh, next.shape)
            rebuildWireframe(area)
        }
        if (materialChanged) {
            updateAreaMaterial(area.mesh, next.material, next.shape)
        }
        area.config = next
        refreshRowText(area)
    }

    const setPosition = (id: number, pos: {x: number; y: number; z: number}): void => {
        const area = areas.find(a => a.id === id)
        if (!area) return
        area.mesh.position.set(pos.x, pos.y, pos.z)
        area.transform.x = pos.x
        area.transform.y = pos.y
        area.transform.z = pos.z
        refreshRowText(area)
    }

    const setTransform = (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}): void => {
        const area = areas.find(a => a.id === id)
        if (!area) return
        area.mesh.position.set(pos.x, pos.y, pos.z)
        area.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        area.transform.x = pos.x
        area.transform.y = pos.y
        area.transform.z = pos.z
        area.transform.qx = area.mesh.quaternion.x
        area.transform.qy = area.mesh.quaternion.y
        area.transform.qz = area.mesh.quaternion.z
        area.transform.qw = area.mesh.quaternion.w
        refreshRowText(area)
    }

    const updateTime = (time: number): void => {
        const t = time * 0.001
        for (const area of areas) {
            const mat = area.mesh.material
            if (mat instanceof ShaderMaterial && mat.uniforms.uTime) mat.uniforms.uTime.value = t
        }
    }

    const select = (id: number | undefined): Area | undefined => {
        if (selectedId !== undefined) {
            const prev = areas.find(a => a.id === selectedId)
            if (prev) cleanupWireframe(prev)
        }
        selectedId = id
        sourceEvents.emit('select', id)
        if (id !== undefined) {
            const area = areas.find(a => a.id === id)
            if (area) {
                const line = createWireframe(area.mesh.geometry)
                area.mesh.add(line)
                area.wireframe = line
                return area
            }
        }
        return undefined
    }

    const getSelected = (): Area | undefined => {
        if (selectedId === undefined) return undefined
        return areas.find(a => a.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    const syncPositions = (): void => {
        for (const area of areas) area.rowText = formatRowText(area)
        rebuildPanelInfo()
    }

    const preSync = (_dt: number, _time: number): void => {
        physicsUpdate()
    }

    const getRefractionMeshes = (): Mesh[] =>
        areas.filter(a => isWaterArea(a.config)).map(a => a.mesh)

    const ctxWithoutPanel: Omit<AreaEntityContext, 'panel'> = {
        type: TYPE,
        events: sourceEvents,
        panelInfo,
        add,
        spawnAt,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => areas,
        getEntityList: () => areas,
        getMeshes: () => areas.map(a => a.mesh),
        updateConfig,
        setPosition,
        setTransform,
        updateTime,
        getRefractionMeshes,
        syncPositions,
        preSync,
    }
    return {
        ...ctxWithoutPanel,
        panel: createAreaPanel(ctxWithoutPanel),
    }
}
