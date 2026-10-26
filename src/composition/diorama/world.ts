import {Group, type Scene} from 'three'
import {createEmitter, type SourceEventMap} from '../../entity/box/base/types/event_emitter.ts'
import type {EntityPanelInfo} from '../../entity/box/base/types/entity_info.ts'
import type {OwnedRef} from '../../types/ownership_store.ts'
import {createDioramaPanel} from './ui/panel.ts'
import {cloneBlueprint, hasErrors, validateBlueprint} from './blueprint.ts'
import {canMaterialize, solveDioramaPlan} from './plan.ts'
import {generatePopulation} from './population.ts'
import {materializeDiorama} from './materialize.ts'
import {deleteOwnedEntities, transformOwnedEntities} from './ownership.ts'
import {createDioramaBlueprint} from './recipes/index.ts'
import {
    type DioramaBlueprint,
    type DioramaContext,
    type DioramaDiagnostic,
    type DioramaEntity,
    type DioramaOptions,
    type DioramaPorts,
} from './types.ts'

const TYPE = 'diorama' as const
const BADGE_LABEL = 'D'
const BADGE_COLOR = '#8a6d3b'
const DEFAULT_RECIPE_ID = 'fortress'

/** 稳定且跨存档不冲突的箱庭 id */
const createDioramaId = (id: number, seed: number): string => {
    const uuid = globalThis.crypto?.randomUUID?.()
    return uuid === undefined
        ? `diorama-${id}-${(seed >>> 0).toString(36)}-${Date.now().toString(36)}`
        : `diorama-${uuid}`
}

export const setupDioramas = (scene: Scene, ports: DioramaPorts, options: DioramaOptions = {}): DioramaContext => {
    const entities: DioramaEntity[] = []
    const byId = new Map<number, DioramaEntity>()
    const panelInfo: EntityPanelInfo[] = []
    const events = createEmitter<SourceEventMap>()
    let nextId = 1
    let selectedId: number | undefined
    let spawnCounter = 0

    const refreshPanelInfo = (): void => {
        panelInfo.length = 0
        for (const entity of entities) {
            panelInfo.push({
                id: entity.id,
                type: TYPE,
                badgeLabel: BADGE_LABEL,
                badgeColor: BADGE_COLOR,
                rowText: `#${entity.id} ${entity.blueprint.recipeId} (${entity.origin[0].toFixed(1)}, ${entity.origin[1].toFixed(1)}, ${entity.origin[2].toFixed(1)}) diagnostics:${entity.diagnostics.length}`,
            })
        }
    }

    const planAndPopulate = (
        blueprint: DioramaBlueprint,
        origin: readonly [number, number, number],
        yawQuarter: number,
        dioramaId: string,
    ): {diagnostics: DioramaDiagnostic[]; refs: OwnedRef[]} => {
        const plan = solveDioramaPlan(blueprint, {x: origin[0], y: origin[1], z: origin[2]}, yawQuarter)
        if (!canMaterialize(plan)) {
            return {diagnostics: [...plan.diagnostics], refs: []}
        }
        const population = generatePopulation(
            blueprint,
            plan,
            ports.terrain === undefined
                ? undefined
                : (x, z, refY) => ports.terrain?.getHeightAt(x, z, refY),
        )
        const diagnostics: DioramaDiagnostic[] = [...plan.diagnostics, ...population.diagnostics]
        if (hasErrors(diagnostics)) {
            return {diagnostics, refs: []}
        }
        const created = materializeDiorama(ports, plan, dioramaId, population.spawns)
        diagnostics.push(...created.diagnostics)
        return {diagnostics, refs: [...created.refs]}
    }

    const add = (
        blueprint: DioramaBlueprint,
        x: number,
        y: number,
        z: number,
        yawQuarter = 0,
        dioramaId?: string,
        materialize = true,
    ): DioramaEntity => {
        const id = nextId++
        const copied = cloneBlueprint(blueprint)
        const root = new Group()
        root.name = `diorama-${id}`
        root.position.set(x, y, z)
        root.rotation.y = (((yawQuarter % 4) + 4) % 4) * Math.PI / 2
        scene.add(root)
        const requested = dioramaId ?? createDioramaId(id, copied.seed)
        const stableId = entities.some(item => item.dioramaId === requested) ? `${requested}-${id}` : requested
        const entity: DioramaEntity = {
            id,
            dioramaId: stableId,
            blueprint: copied,
            seed: copied.seed,
            origin: [x, y, z],
            yawQuarter: ((yawQuarter % 4) + 4) % 4,
            root,
            diagnostics: [],
        }
        entity.diagnostics = materialize
            ? planAndPopulate(copied, entity.origin, entity.yawQuarter, stableId).diagnostics
            : validateBlueprint(copied)
        entities.push(entity)
        byId.set(id, entity)
        refreshPanelInfo()
        return entity
    }

    const selected = (): DioramaEntity | undefined =>
        selectedId === undefined ? undefined : byId.get(selectedId)

    const select = (id: number | undefined): void => {
        selectedId = id
    }

    const getSelectedId = (): number | undefined => selectedId
    const getSelected = (): DioramaEntity | undefined => selected()

    const removeEntity = (id: number): void => {
        const index = entities.findIndex(entity => entity.id === id)
        if (index === -1) return
        const entity = entities[index]
        const wasSelected = selectedId === id
        events.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        deleteOwnedEntities(ports.ownership, ports, entity.dioramaId)
        scene.remove(entity.root)
        entities.splice(index, 1)
        byId.delete(id)
        refreshPanelInfo()
    }

    const rebuild = (id: number, blueprint: DioramaBlueprint): readonly DioramaDiagnostic[] => {
        const entity = byId.get(id)
        if (entity === undefined) return []
        const copied = cloneBlueprint(blueprint)
        const validation = validateBlueprint(copied)
        if (hasErrors(validation)) {
            entity.diagnostics = validation
            refreshPanelInfo()
            return validation
        }
        const plan = solveDioramaPlan(copied, {x: entity.origin[0], y: entity.origin[1], z: entity.origin[2]}, entity.yawQuarter)
        if (!canMaterialize(plan)) {
            entity.diagnostics = plan.diagnostics
            refreshPanelInfo()
            return plan.diagnostics
        }
        deleteOwnedEntities(ports.ownership, ports, entity.dioramaId)
        const result = planAndPopulate(copied, entity.origin, entity.yawQuarter, entity.dioramaId)
        entity.blueprint = copied
        entity.seed = copied.seed
        entity.diagnostics = result.diagnostics
        refreshPanelInfo()
        return result.diagnostics
    }

    const setTransform = (
        id: number,
        pos: {x: number; y: number; z: number},
        rotDeg: {x: number; y: number; z: number},
    ): void => {
        const entity = byId.get(id)
        if (entity === undefined) return
        const newYaw = ((Math.round(rotDeg.y / 90) % 4) + 4) % 4
        transformOwnedEntities(
            ports.ownership,
            ports,
            entity.dioramaId,
            {x: entity.origin[0], y: entity.origin[1], z: entity.origin[2]},
            entity.yawQuarter,
            pos,
            newYaw,
        )
        entity.origin = [pos.x, pos.y, pos.z]
        entity.yawQuarter = newYaw
        entity.root.position.set(pos.x, pos.y, pos.z)
        entity.root.rotation.y = newYaw * Math.PI / 2
        refreshPanelInfo()
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        spawnCounter++
        const seed = (spawnCounter * 2654435761) >>> 0
        const blueprint = createDioramaBlueprint(DEFAULT_RECIPE_ID, seed)
        if (blueprint === undefined) return
        const entity = add(blueprint, x, y, z, 0)
        select(entity.id)
    }

    const ctxWithoutPanel: Omit<DioramaContext, 'panel'> = {
        type: TYPE,
        events,
        panelInfo,
        add,
        getById: (id: number) => byId.get(id),
        getAll: () => entities,
        rebuild,
        removeCascade: removeEntity,
        getDiagnostics: (id: number) => byId.get(id)?.diagnostics ?? [],
        remove: removeEntity,
        select,
        getSelectedId,
        getSelected,
        getMeshes: () => [],
        getEntityList: () => entities.map(entity => ({id: entity.id, mesh: entity.root})),
        spawnAt,
        syncPositions: () => {},
        setTransform,
    }

    return {
        ...ctxWithoutPanel,
        panel: createDioramaPanel(ctxWithoutPanel, options),
    }
}

