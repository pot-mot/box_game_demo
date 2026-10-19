import {type Mesh, type Object3D, type Scene, Quaternion, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {type SharedWorld, deleteMovingSupport, setMovingSupport} from '../../../physics/world.ts'
import {INTERACTABLE_COLLISION_GROUP, INTERACTABLE_COLLISION_MASK} from '../../../physics/constants.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {createColliderForBody} from '../../../physics/rapier_utils.ts'
import {applyRenderPose, captureObjectRenderPose} from '../../../physics/render_interpolation.ts'
import type {EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter, type SourceEventMap} from '../../box/base/types/event_emitter.ts'
import type {EntityType} from '../../constants.ts'
import type {InteractionTarget} from '../../../character/interaction/types.ts'
import {INTERACTION_MAX_DISTANCE} from '../../../character/interaction/types.ts'
import type {WorldDamageTarget} from '../../../character/combat/world_targets.ts'
import {
    type InteractableConfig,
    type InteractableContext,
    type InteractableEntity,
    type InteractableHooks,
    type InteractableRuntimeContext,
    type InteractableSaveEntry,
} from '../types.ts'
import {INTERACTABLE_LABELS} from '../kinds.ts'
import {translate} from '../../../i18n/index.ts'
import {BEHAVIORS, rollBreakDamage} from '../behaviors.ts'
import {CHEST_GRID_HEIGHT, CHEST_GRID_WIDTH, MIN_COLLIDER_THICKNESS} from '../constants.ts'
import {createInteractableMesh} from '../mesh.ts'
import {createInteractablePanel} from '../ui/panel.ts'
import {addItem, createInventory, inventoryFromSave, inventoryToSave} from '../../../inventory/inventory.ts'

const TYPE: EntityType = 'interactable'
const BADGE_LABEL = 'I'
const BADGE_COLOR = '#2a9d8f'

const _upAxis = new Vector3(0, 1, 0)
const _quat = new Quaternion()

const isKinematic = (config: InteractableConfig): boolean =>
    config.kind === 'gate' || config.kind === 'elevator'

const collectMeshes = (root: Object3D, out: Mesh[]): void => {
    root.traverse(obj => {
        if ((obj as Mesh).isMesh === true) out.push(obj as Mesh)
    })
}

export const setupInteractables = (scene: Scene, shared: SharedWorld): InteractableContext => {
    const {world} = shared
    const entities: InteractableEntity[] = []
    const byId = new Map<number, InteractableEntity>()
    const signals = new Map<string, boolean>()
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()
    let nextId = 1
    let selectedId: number | undefined
    let hooks: InteractableHooks = {}

    const rebuildPanelInfo = (): void => {
        panelInfo.length = 0
        for (const e of entities) {
            panelInfo.push({
                id: e.id,
                type: TYPE,
                badgeLabel: BADGE_LABEL,
                badgeColor: BADGE_COLOR,
                rowText: e.rowText,
                /* 行文本含本地化类型名：语言切换后由 element_list 按需重算 */
                rowTextOf: () => `#${e.id} ${translate(INTERACTABLE_LABELS[e.config.kind])}`,
            })
        }
    }

    const runtimeContext = (): InteractableRuntimeContext => ({
        setSignal,
        hooks,
        despawn: remove,
    })

    const setSignal = (channel: string, on: boolean): void => {
        if (channel === '') return
        signals.set(channel, on)
        for (const e of entities) {
            if (e.config.channel === channel) BEHAVIORS[e.config.kind].onSignal?.(e, on, runtimeContext())
        }
    }

    const add = (config: InteractableConfig, x: number, y: number, z: number, yawQuarter = 0): {id: number} => {
        const id = nextId++
        const created = createInteractableMesh(config)
        const group = created.group
        group.position.set(x, y, z)
        group.rotation.y = yawQuarter * Math.PI / 2
        scene.add(group)

        const bodyDesc = isKinematic(config)
            ? RAPIER.RigidBodyDesc.kinematicPositionBased()
            : RAPIER.RigidBodyDesc.fixed()
        bodyDesc.setTranslation(x, y, z)
        const body = world.createRigidBody(bodyDesc)
        _quat.setFromAxisAngle(_upAxis, yawQuarter * Math.PI / 2)
        body.setRotation({x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w}, false)

        const [w, h, d] = config.size
        const colliderDesc = RAPIER.ColliderDesc.cuboid(
            Math.max(w / 2, MIN_COLLIDER_THICKNESS),
            Math.max(h / 2, MIN_COLLIDER_THICKNESS),
            Math.max(d / 2, MIN_COLLIDER_THICKNESS),
        )
            .setTranslation(0, h / 2, 0)
            .setFriction(0.6)
            .setCollisionGroups(categoryCollisionGroups(INTERACTABLE_COLLISION_GROUP, INTERACTABLE_COLLISION_MASK, 'interactable'))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        const collider = createColliderForBody(world, colliderDesc, body)

        const e: InteractableEntity = {
            id,
            config: {...config, size: [w, h, d]},
            group,
            body,
            colliders: [collider],
            progress: 0,
            target: 0,
            on: false,
            paused: false,
            container: config.kind === 'chest' ? createInventory(CHEST_GRID_WIDTH, CHEST_GRID_HEIGHT) : createInventory(0, 0),
            health: config.kind === 'breakable' ? config.health : 1,
            dead: false,
            momentaryTimer: 0,
            base: {x, y, z},
            lastProgress: 0,
            meshDispose: created.dispose,
            rowText: '',
        }
        e.rowText = `#${id} ${translate(INTERACTABLE_LABELS[config.kind])}`
        /* 箱子默认放入少量物资（载入存档会以显式 container 覆盖） */
        if (config.kind === 'chest') {
            addItem(e.container, 'consumable_flask', 1)
            addItem(e.container, 'material_stone', 2)
        }
        entities.push(e)
        byId.set(id, e)
        rebuildPanelInfo()
        return {id}
    }

    const remove = (id: number): void => {
        const idx = entities.findIndex(e => e.id === id)
        if (idx === -1) return
        const e = entities[idx]
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        scene.remove(e.group)
        e.meshDispose()
        /* 移动支撑注册表清理（避免 handle 复用/残留速度） */
        deleteMovingSupport(shared, e.body.handle)
        lastSupportPos.delete(e.id)
        lastSupportRot.delete(e.id)
        animatedNodesById.delete(e.id)
        world.removeRigidBody(e.body)
        entities.splice(idx, 1)
        byId.delete(id)
        rebuildPanelInfo()
    }

    const select = (id: number | undefined): InteractableEntity | undefined => {
        selectedId = id
        sourceEvents.emit('select', id)
        if (id === undefined) return undefined
        return byId.get(id)
    }

    const getSelectedId = (): number | undefined => selectedId

    const getMeshes = (): Mesh[] => {
        const meshes: Mesh[] = []
        for (const e of entities) collectMeshes(e.group, meshes)
        return meshes
    }

    const setTransform = (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}): void => {
        const e = byId.get(id)
        if (e === undefined) return
        e.base.x = pos.x
        e.base.y = pos.y
        e.base.z = pos.z
        e.group.position.set(pos.x, pos.y, pos.z)
        e.group.rotation.y = rotDeg.y * Math.PI / 180
        e.body.setTranslation({x: pos.x, y: pos.y, z: pos.z}, true)
        _quat.setFromAxisAngle(_upAxis, e.group.rotation.y)
        e.body.setRotation({x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w}, true)
    }

    /**
     * 把运动学平台（闸门 / 升降梯）本帧的**实际位移/转动**换算为速度并注册到 `SharedWorld.movingSupports`，
     * 供角色系统对「真实接触支撑」的乘客叠加携带。
     * 平台以 `setTranslation` 瞬移（见 behaviors）：多物理子步下 `setNextKinematicTranslation` 会把整帧位移
     * 压进首个子步，顶到乘客产生冲量 → 上升抖动；故速度由逐帧位置/四元数差分得到，携带完全交给速度注册表。
     */
    const lastSupportPos = new Map<number, {x: number; y: number; z: number}>()
    const lastSupportRot = new Map<number, {x: number; y: number; z: number; w: number}>()
    const _supQ0 = new Quaternion()
    const _supQ1 = new Quaternion()
    const _supDelta = new Quaternion()
    const registerMovingSupport = (e: InteractableEntity, dt: number): void => {
        if (!(dt > 0)) return
        const body = e.body
        const cur = body.translation()
        const prev = lastSupportPos.get(e.id)
        const v = prev === undefined
            ? {x: 0, y: 0, z: 0}
            : {x: (cur.x - prev.x) / dt, y: (cur.y - prev.y) / dt, z: (cur.z - prev.z) / dt}
        let w = {x: 0, y: 0, z: 0}
        const r = body.rotation()
        const prevR = lastSupportRot.get(e.id)
        if (prevR !== undefined) {
            _supQ0.set(prevR.x, prevR.y, prevR.z, prevR.w)
            _supQ1.set(r.x, r.y, r.z, r.w)
            _supDelta.copy(_supQ1).multiply(_supQ0.invert())
            if (_supDelta.w < 0) _supDelta.set(-_supDelta.x, -_supDelta.y, -_supDelta.z, -_supDelta.w)
            const sinHalf = Math.sqrt(Math.max(0, 1 - _supDelta.w * _supDelta.w))
            if (sinHalf > 1e-6) {
                const angle = 2 * Math.acos(Math.min(1, _supDelta.w))
                const k = angle / dt / sinHalf
                w = {x: _supDelta.x * k, y: _supDelta.y * k, z: _supDelta.z * k}
            }
        }
        lastSupportPos.set(e.id, {x: cur.x, y: cur.y, z: cur.z})
        lastSupportRot.set(e.id, {x: r.x, y: r.y, z: r.z, w: r.w})
        setMovingSupport(shared, body.handle, {v, w})
    }

    const update = (dt: number): void => {
        const ctx = runtimeContext()
        for (const e of entities) {
            if (e.dead) continue
            BEHAVIORS[e.config.kind].update(dt, e, ctx)
            if (isKinematic(e.config)) registerMovingSupport(e, dt)
            e.lastProgress = e.progress
        }
    }

    const activate = (id: number): boolean => {
        const e = byId.get(id)
        if (e === undefined) return false
        const behavior = BEHAVIORS[e.config.kind]
        if (!behavior.interactable || behavior.interact === undefined) return false
        behavior.interact(e, runtimeContext())
        return true
    }

    const collectInteractionTargets = (actorX: number, actorY: number, actorZ: number, out: InteractionTarget[]): number => {
        let count = 0
        for (const e of entities) {
            if (e.dead) continue
            const behavior = BEHAVIORS[e.config.kind]
            if (!behavior.interactable) continue
            const prompt = behavior.prompt(e)
            if (prompt === undefined) continue
            /* 升降梯的交互锚点跟随平台当前位置（乘坐到高处仍可 F 停/启/反向） */
            const anchorY = e.config.kind === 'elevator'
                ? e.base.y + e.progress * e.config.travel + e.config.size[1] / 2
                : e.base.y
            const dx = e.base.x - actorX
            const dy = anchorY - actorY
            const dz = e.base.z - actorZ
            const dist = Math.hypot(dx, dz)
            if (dist > INTERACTION_MAX_DISTANCE || Math.abs(dy) > INTERACTION_MAX_DISTANCE) continue
            out.push({
                key: `interactable:${e.id}`,
                kind: e.config.kind,
                prompt,
                x: e.base.x,
                y: anchorY,
                z: e.base.z,
                score: dist,
            })
            count++
        }
        return count
    }

    const activateInteraction = (key: string): boolean => {
        if (!key.startsWith('interactable:')) return false
        const id = Number(key.slice('interactable:'.length))
        if (!Number.isFinite(id)) return false
        return activate(id)
    }

    const collectBreakableTargets = (): readonly WorldDamageTarget[] => {
        const targets: WorldDamageTarget[] = []
        for (const e of entities) {
            if (e.config.kind !== 'breakable' || e.dead) continue
            const [w, h, d] = e.config.size
            targets.push({
                key: -e.id,
                x: e.base.x,
                y: e.base.y + h / 2,
                z: e.base.z,
                hx: w / 2,
                hy: h / 2,
                hz: d / 2,
                yaw: e.group.rotation.y,
                dead: e.dead,
                onAttacked: (source, damageType, amount, _dirX, _dirZ) => {
                    const behavior = BEHAVIORS.breakable
                    return behavior.onAttacked?.(e, source, damageType, amount, runtimeContext()) ?? false
                },
            })
        }
        return targets
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add({kind: 'save_point', material: 'rusty_iron', size: [0.8, 1.2, 0.8], channel: '', name: '篝火'}, x, y, z)
    }

    /**
     * 行为直接驱动的可视节点名（闸门 / 升降梯 / 门扇 / 箱盖 / 拉杆等）。
     * 这些节点每步写**绝对**进度值，可安全插值；`flame` / `glow` 是持续累加旋转 / 缩放，
     * 若参与插值会被渲染写回污染相位，故排除。
     */
    const ANIMATED_NODE_NAMES = ['gate', 'platform', 'door', 'doorLeft', 'doorRight', 'lid', 'lever', 'ring'] as const

    /** 每个交互物的可动节点引用缓存（避免每物理步 / 每渲染帧 getObjectByName 递归遍历） */
    const animatedNodesById = new Map<number, Object3D[]>()
    const animatedNodesOf = (e: InteractableEntity): Object3D[] => {
        let nodes = animatedNodesById.get(e.id)
        if (nodes === undefined) {
            nodes = []
            for (const name of ANIMATED_NODE_NAMES) {
                const node = e.group.getObjectByName(name)
                if (node !== undefined) nodes.push(node)
            }
            animatedNodesById.set(e.id, nodes)
        }
        return nodes
    }

    /** 每个物理步末记录可动可视节点的真实变换，供渲染帧插值（运动平台 / 闸门不再 60Hz 台阶） */
    const captureRenderState = (): void => {
        for (const e of entities) {
            for (const node of animatedNodesOf(e)) captureObjectRenderPose(node)
        }
    }

    const syncPositions = (alpha = 1): void => {
        for (const e of entities) {
            for (const node of animatedNodesOf(e)) applyRenderPose(node, alpha)
        }
        /* 运动学闸门 / 升降梯：根节点保持基准，可动子节点由行为维护；此处只刷新列表行 */
        rebuildPanelInfo()
    }

    const preSync = (dt: number, _time: number): void => update(dt)

    const getSave = (): InteractableSaveEntry[] => entities.map(e => ({
        config: {...e.config, size: [...e.config.size] as [number, number, number]},
        position: [e.base.x, e.base.y, e.base.z],
        yawQuarter: Math.round(e.group.rotation.y / (Math.PI / 2)) & 3,
        progress: e.progress,
        target: e.target,
        on: e.on,
        container: inventoryToSave(e.container),
        health: e.health,
    }))

    const loadSave = (entries: readonly InteractableSaveEntry[]): void => {
        for (const e of [...entities]) remove(e.id)
        animatedNodesById.clear()
        signals.clear()
        for (const entry of entries) {
            const {id} = add(entry.config, entry.position[0], entry.position[1], entry.position[2], entry.yawQuarter)
            const e = byId.get(id)
            if (e === undefined) continue
            e.progress = entry.progress
            e.target = entry.target
            e.on = entry.on
            e.container = inventoryFromSave(entry.container)
            e.health = entry.health
        }
    }

    const setHooks = (next: InteractableHooks): void => {
        hooks = next
    }

    const ctxWithoutPanel: Omit<InteractableContext, 'panel'> = {
        type: TYPE,
        events: sourceEvents,
        panelInfo,
        add,
        activate,
        setSignal,
        setHooks,
        update,
        getAll: () => entities,
        getById: (id: number) => byId.get(id),
        collectInteractionTargets,
        activateInteraction,
        collectBreakableTargets,
        getSave,
        loadSave,
        spawnAt,
        remove,
        select,
        getSelectedId,
        getMeshes,
        getEntityList: () => entities.map(e => ({id: e.id, mesh: e.group})),
        syncPositions,
        captureRenderState,
        setTransform,
        preSync,
    }

    return {
        ...ctxWithoutPanel,
        panel: createInteractablePanel(ctxWithoutPanel),
    }
}

/** 供命中路径使用：可破坏目标（导出以便外部注册 world target provider） */
export const breakableRollDamage = rollBreakDamage
