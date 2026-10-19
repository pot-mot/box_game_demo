import {type Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import type {PhysicsEnv} from '../../../physics/env.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../physics/constants.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {createColliderForBody, quatVmult, setBodyMass} from '../../../physics/rapier_utils.ts'
import {applyRenderPose, captureBodyRenderPose} from '../../../physics/render_interpolation.ts'
import type {VelocitySnapshots} from '../../../physics/velocity_snapshots.ts'
import type {FragmentEntityContext} from '../../fragment/common/types'
import type {XYZ} from '../base/types'
import type {EntityPanelInfo} from '../base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../base/types/event_emitter'
import {clampHealth, clampHealthOnMaxChange} from '../base/types/health'
import {createWireframe, cleanupWireframe} from '../base/render'
import {findNonOverlappingY} from '../base/physics'
import type {Box, BoxConfig, BoxAddOptions, BoxEntityContext, CollisionRecord} from '../types'
import type {EntityType} from '../../constants.ts'
import {badgeOf, BOX_TRAIT_IDS, type BoxTraitId} from '../constants.ts'
import {DESTRUCTIBLE_COLLISION_COOLDOWN, DESTRUCTIBLE_DEFAULTS} from '../physics/constants.ts'
import {DEFAULT_BOX_CONFIG} from '../validation.ts'
import {
    createBoxMesh,
    updateBoxMeshSize,
    updateBoxMaterial,
    disposeBoxMesh,
    updateBurnUniform,
    updateParticles,
    createParticleData,
    createParticlePoints,
    disposeParticlePoints,
} from '../render'
import {
    createDestructibleRuntime,
    recordDestructibleCollision,
    applyDestructibleImpacts,
    buildFragments,
    ejectForceOf,
} from '../physics/traits/destructible.ts'
import {createElasticRuntime, consumeElasticCooldown, applyElasticImpact, stepElastic} from '../physics/traits/elastic.ts'
import {applyMagnetAttraction} from '../physics/traits/magnet.ts'
import {stepBurning, burningMassScale} from '../physics/traits/burning.ts'
import {formatRowText, createBoxPanel} from '../ui'

const TYPE: EntityType = 'box' as const

/** 当前启用的特性标识（按 `BOX_TRAIT_IDS` 顺序） */
const enabledTraits = (config: BoxConfig): BoxTraitId[] =>
    BOX_TRAIT_IDS.filter(id => config[id] !== undefined)

export interface BoxSetupDeps {
    fragmentCtx: FragmentEntityContext
    velocitySnapshots: VelocitySnapshots
    physicsEnv: PhysicsEnv
}

export const setupBoxes = (
    scene: Scene,
    shared: SharedWorld,
    deps: BoxSetupDeps,
): BoxEntityContext => {
    const {world, eventBus} = shared
    const {fragmentCtx, velocitySnapshots, physicsEnv} = deps

    const boxes: Box[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    const rebuildPanelInfo = (): void => {
        panelInfo.length = 0
        for (const box of boxes) {
            const badges = badgeOf(enabledTraits(box.config))
            panelInfo.push({
                id: box.id,
                type: TYPE,
                badgeLabel: badges.label,
                badgeColor: badges.color,
                rowText: box.rowText,
            })
        }
    }

    const refreshRowText = (box: Box): void => {
        box.rowText = formatRowText(box)
        box.emitter.emit('infoUpdate')
    }

    // ── 碰撞事件：单订阅按特性分发 ──

    eventBus.subscribe((h1, h2, started) => {
        if (!started) return
        for (const box of boxes) {
            const myHandle = box.mainCollider.handle
            if (myHandle !== h1 && myHandle !== h2) continue
            const otherHandle = myHandle === h1 ? h2 : h1
            const otherCollider = world.getCollider(otherHandle)
            if (otherCollider === null) continue
            const otherBody = otherCollider.parent()
            if (otherBody === null) continue
            const otherBodyHandle = otherBody.handle

            const dest = box.runtime.destructible
            if (dest !== undefined && !dest.destroyed) {
                if ((dest.cooldowns.get(otherBodyHandle) ?? 0) <= 0) {
                    dest.cooldowns.set(otherBodyHandle, DESTRUCTIBLE_COLLISION_COOLDOWN)
                    world.contactPair(box.mainCollider, otherCollider, (manifold, flipped) => {
                        const n = manifold.normal()
                        /* manifold.normal() 指向内部顺序 collider1 → collider2；flipped 时取反得到「本箱 → 对方」的确定性法线 */
                        const normal: [number, number, number] = flipped
                            ? [-n.x, -n.y, -n.z]
                            : [n.x, n.y, n.z]
                        const solverPt = manifold.solverContactPoint(0)
                        const contactPoint: [number, number, number] = solverPt !== null && solverPt !== undefined
                            ? [solverPt.x, solverPt.y, solverPt.z]
                            : [0, 0, 0]
                        const ourVel = velocitySnapshots.get(box.body.handle) ?? box.body.linvel()
                        const otherVel = velocitySnapshots.get(otherBodyHandle) ?? otherBody.linvel()
                        const relVel = Math.abs(
                            (ourVel.x - otherVel.x) * normal[0] +
                            (ourVel.y - otherVel.y) * normal[1] +
                            (ourVel.z - otherVel.z) * normal[2],
                        )
                        const record: CollisionRecord = {contactPoint, normal, relativeVelocity: relVel}
                        recordDestructibleCollision(dest, record)
                    })
                }
            }

            const elastic = box.runtime.elastic
            if (elastic !== undefined && box.config.mass !== 0) {
                if (consumeElasticCooldown(elastic, otherBodyHandle)) {
                    world.contactPair(box.mainCollider, otherCollider, (manifold, flipped) => {
                        const n = manifold.normal()
                        const normal = flipped
                            ? {x: -n.x, y: -n.y, z: -n.z}
                            : {x: n.x, y: n.y, z: n.z}
                        const ourVel = velocitySnapshots.get(box.body.handle) ?? box.body.linvel()
                        const otherVel = velocitySnapshots.get(otherBodyHandle) ?? otherBody.linvel()
                        const relVel = Math.abs(
                            (ourVel.x - otherVel.x) * normal.x +
                            (ourVel.y - otherVel.y) * normal.y +
                            (ourVel.z - otherVel.z) * normal.z,
                        )
                        const rot = box.body.rotation()
                        const invRot = {x: -rot.x, y: -rot.y, z: -rot.z, w: rot.w}
                        const localN = {x: 0, y: 0, z: 0}
                        quatVmult(localN, invRot, normal)
                        applyElasticImpact(elastic, localN, relVel)
                    })
                }
            }
        }
    })

    // ── 特性运行时生命周期 ──

    const attachBurning = (box: Box, config: BoxConfig, options?: BoxAddOptions): void => {
        if (config.burning === undefined || box.runtime.burning !== undefined) return
        const particleData = createParticleData()
        const particles = createParticlePoints()
        particles.position.set(box.mesh.position.x, box.mesh.position.y, box.mesh.position.z)
        scene.add(particles)
        box.runtime.burning = {
            health: options?.burning?.health ?? config.burning.maxHealth,
            maxHealth: config.burning.maxHealth,
            burnProgress: 0,
            particles,
            particleData,
        }
    }

    const detachBurning = (box: Box): void => {
        const burn = box.runtime.burning
        if (burn === undefined) return
        scene.remove(burn.particles)
        disposeParticlePoints(burn.particles)
        box.runtime.burning = undefined
    }

    const attachTraits = (box: Box, config: BoxConfig, options?: BoxAddOptions): void => {
        const runtime: Box['runtime'] = {}
        if (config.destructible !== undefined) {
            runtime.destructible = createDestructibleRuntime(config.destructible.maxHealth, options?.destructible)
        }
        if (config.magnet !== undefined) runtime.magnet = {}
        if (config.elastic !== undefined) {
            runtime.elastic = createElasticRuntime(config.height, options?.elastic)
        }
        box.runtime = runtime
        attachBurning(box, config, options)
    }

    // ── 增删改查 ──

    const add = (
        config: BoxConfig,
        x: number,
        y: number,
        z: number,
        quat?: {x: number; y: number; z: number; w: number},
        options?: BoxAddOptions,
    ): Box => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(boxes, config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2
        const {mesh, edges} = createBoxMesh(config)
        mesh.position.set(x, adjustedY, z)
        scene.add(mesh)

        const isStatic = config.mass === 0
        const bodyDesc = isStatic ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()
        bodyDesc.setTranslation(x, adjustedY, z)
        const body = world.createRigidBody(bodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.cuboid(hw, hh, hd)
            .setFriction(0.5)
            /* 密度 0：质量完全由附加质量决定，与箱子尺寸解耦 */
            .setDensity(0)
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box'))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        const mainCollider = createColliderForBody(world, colliderDesc, body)
        if (!isStatic) {
            setBodyMass(body, config.mass)
        }

        if (quat) {
            body.setRotation({x: quat.x, y: quat.y, z: quat.z, w: quat.w}, false)
            mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        }

        const emitter = createEmitter<EntityEventMap>()
        const box: Box = {
            id, mesh, edges, wireframe: undefined,
            body, mainCollider, config: {...config},
            runtime: {}, emitter, rowText: '',
        }
        attachTraits(box, box.config, options)
        refreshRowText(box)
        emitter.on('infoUpdate', rebuildPanelInfo)
        boxes.push(box)
        rebuildPanelInfo()
        return box
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_BOX_CONFIG, x, y, z)
    }

    const disposeBox = (box: Box): void => {
        cleanupWireframe(box)
        scene.remove(box.mesh)
        disposeBoxMesh(box)
        detachBurning(box)
        world.removeRigidBody(box.body)
    }

    const remove = (id: number): void => {
        const idx = boxes.findIndex(b => b.id === id)
        if (idx === -1) return
        const box = boxes[idx]
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        disposeBox(box)
        boxes.splice(idx, 1)
        for (const b of boxes) {
            if (b.body.bodyType() === RAPIER.RigidBodyType.Dynamic) b.body.wakeUp()
        }
        rebuildPanelInfo()
    }

    // ── 选中管理 ──

    const select = (id: number | undefined): Box | undefined => {
        if (selectedId !== undefined) {
            const prev = boxes.find(b => b.id === selectedId)
            if (prev) cleanupWireframe(prev)
        }
        selectedId = id
        sourceEvents.emit('select', id)
        if (id !== undefined) {
            const box = boxes.find(b => b.id === id)
            if (box) {
                const line = createWireframe(box.mesh.geometry)
                box.mesh.add(line)
                box.wireframe = line
                return box
            }
        }
        return undefined
    }

    const getSelected = (): Box | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    // ── 配置更新 ──

    const rebuildCollider = (box: Box, config: BoxConfig): void => {
        world.removeCollider(box.mainCollider, true)
        const colliderDesc = RAPIER.ColliderDesc.cuboid(config.width / 2, config.height / 2, config.depth / 2)
            .setFriction(0.5)
            .setDensity(0)
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box'))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        box.mainCollider = createColliderForBody(world, colliderDesc, box.body)
    }

    const syncTraits = (box: Box, config: BoxConfig, partial: Partial<BoxConfig>): void => {
        const runtime = box.runtime
        /* destructible */
        if ('destructible' in partial) {
            if (config.destructible === undefined) {
                runtime.destructible = undefined
            } else if (runtime.destructible === undefined) {
                runtime.destructible = createDestructibleRuntime(config.destructible.maxHealth)
            } else if (partial.destructible?.maxHealth !== undefined) {
                clampHealthOnMaxChange(runtime.destructible, config.destructible.maxHealth)
            }
        }
        /* burning */
        if ('burning' in partial) {
            if (config.burning === undefined) {
                detachBurning(box)
            } else {
                attachBurning(box, config)
                if (runtime.burning !== undefined && partial.burning?.maxHealth !== undefined) {
                    clampHealthOnMaxChange(runtime.burning, config.burning.maxHealth)
                }
            }
        }
        /* magnet */
        if ('magnet' in partial) {
            runtime.magnet = config.magnet !== undefined ? {} : undefined
        }
        /* elastic */
        if ('elastic' in partial) {
            if (config.elastic === undefined) {
                runtime.elastic = undefined
            } else if (runtime.elastic === undefined) {
                runtime.elastic = createElasticRuntime(config.height)
            }
        }
    }

    const updateConfig = (id: number, partial: Partial<BoxConfig>): void => {
        const box = boxes.find(b => b.id === id)
        if (box === undefined) return
        const old = box.config
        const config: BoxConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        const changedMaterial = partial.material !== undefined && partial.material !== old.material

        syncTraits(box, config, partial)

        if (changedSize) {
            const hh = config.height / 2
            updateBoxMeshSize(box, config, box.runtime.elastic?.def)
            rebuildCollider(box, config)
            const pos = box.body.translation()
            const oldBottom = pos.y - old.height / 2
            const newBottom = pos.y - hh
            if (newBottom < oldBottom || newBottom < GROUND_Y) {
                const target = Math.max(oldBottom, GROUND_Y)
                box.body.setTranslation({x: pos.x, y: target + hh, z: pos.z}, true)
                box.mesh.position.y = target + hh
            }
            if (box.wireframe) {
                cleanupWireframe(box)
                box.wireframe = createWireframe(box.mesh.geometry)
                box.mesh.add(box.wireframe)
            }
        }
        if (changedMass) {
            if (config.mass === 0) {
                box.body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
            } else {
                box.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
                setBodyMass(box.body, config.mass)
                box.body.wakeUp()
            }
        }
        if (changedMaterial) {
            updateBoxMaterial(box, config.material)
        }
        box.config = config
        refreshRowText(box)
    }

    const setTransform = (id: number, pos: XYZ, rotDeg: XYZ): void => {
        const box = boxes.find(b => b.id === id)
        if (box === undefined) return
        box.mesh.position.set(pos.x, pos.y, pos.z)
        box.body.setTranslation({x: pos.x, y: pos.y, z: pos.z}, true)
        box.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        box.body.setRotation(
            {x: box.mesh.quaternion.x, y: box.mesh.quaternion.y, z: box.mesh.quaternion.z, w: box.mesh.quaternion.w},
            true,
        )
        if (box.runtime.burning !== undefined) {
            box.runtime.burning.particles.position.set(pos.x, pos.y, pos.z)
        }
        if (box.body.bodyType() === RAPIER.RigidBodyType.Dynamic) box.body.wakeUp()
        refreshRowText(box)
    }

    const setTraitHealth = (id: number, trait: 'destructible' | 'burning', health: number): void => {
        const box = boxes.find(b => b.id === id)
        if (box === undefined) return
        const rt = box.runtime[trait]
        if (rt === undefined) return
        clampHealth(rt, health)
        refreshRowText(box)
    }

    // ── 物理推进（preSync） ──

    const destroyBox = (box: Box, collisionPoint: [number, number, number], ejectForce: number): void => {
        const dest = box.runtime.destructible
        if (dest === undefined || dest.destroyed) return
        dest.destroyed = true

        const wasSelected = selectedId === box.id
        const bodyPos = box.body.translation()
        const bodyRot = box.body.rotation()

        disposeBox(box)
        const idx = boxes.indexOf(box)
        if (idx !== -1) boxes.splice(idx, 1)

        for (let fi = 0; fi < dest.fragments.length; fi++) {
            const frag = dest.fragments[fi]
            if (frag.renderIndices.length < 3) continue
            const label = `#box${box.id}-${fi}`
            const worldCentroid = {
                x: bodyPos.x + frag.centroid[0],
                y: bodyPos.y + frag.centroid[1],
                z: bodyPos.z + frag.centroid[2],
            }
            const quat = {x: bodyRot.x, y: bodyRot.y, z: bodyRot.z, w: bodyRot.w}
            const dir = {
                x: worldCentroid.x - collisionPoint[0],
                y: worldCentroid.y - collisionPoint[1],
                z: worldCentroid.z - collisionPoint[2],
            }
            const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
            let impulse: {x: number; y: number; z: number} | undefined
            if (dirLen > 0.001) {
                const invLen = 1 / dirLen
                const force = ejectForce * frag.massRatio
                impulse = {x: dir.x * invLen * force, y: dir.y * invLen * force, z: dir.z * invLen * force}
            }
            fragmentCtx.add(frag, label, worldCentroid, quat, impulse, box.config.material)
        }

        sourceEvents.emit('delete', box.id, wasSelected)
        if (wasSelected) select(undefined)
        rebuildPanelInfo()
    }

    const updatePhysics = (dt: number): void => {
        for (let i = boxes.length - 1; i >= 0; i--) {
            const box = boxes[i]

            /* 可破坏：结算碰撞伤害 / 冷却 / 碎裂 */
            const dest = box.runtime.destructible
            if (dest !== undefined && !dest.destroyed) {
                const cols = dest.collisions
                if (cols.length > 0) {
                    applyDestructibleImpacts(dest, box.config.mass)
                    refreshRowText(box)
                    if (dest.health <= 0) {
                        const lastCol = cols[cols.length - 1]
                        const bodyPos = box.body.translation()
                        const bodyRot = box.body.rotation()
                        dest.fragments = buildFragments(
                            [box.config.width, box.config.height, box.config.depth],
                            dest.collisionHistory,
                            bodyPos,
                            bodyRot,
                            box.config.destructible?.fragmentCount ?? DESTRUCTIBLE_DEFAULTS.fragmentCount,
                        )
                        destroyBox(box, lastCol ? lastCol.contactPoint : [0, 0, 0], ejectForceOf(dest.collisionHistory))
                        cols.length = 0
                        continue
                    }
                    cols.length = 0
                }
                for (const [key, val] of dest.cooldowns) {
                    const next = val - dt
                    if (next <= 0) dest.cooldowns.delete(key)
                    else dest.cooldowns.set(key, next)
                }
            }

            /* 燃烧：生命递减 / 形变着色 / 质量衰减 / 粒子 */
            const burn = box.runtime.burning
            if (burn !== undefined) {
                stepBurning(burn, dt)
                updateBurnUniform(box, burn.burnProgress, dt)
                if (box.body.bodyType() === RAPIER.RigidBodyType.Dynamic && box.config.mass > 0) {
                    setBodyMass(box.body, box.config.mass * burningMassScale(burn.burnProgress))
                }
                updateParticles(burn.particleData, burn.particles, dt, box.config, burn.burnProgress)
                refreshRowText(box)
                if (burn.health <= 0) {
                    const wasSelected = selectedId === box.id
                    disposeBox(box)
                    boxes.splice(i, 1)
                    sourceEvents.emit('delete', box.id, wasSelected)
                    if (wasSelected) select(undefined)
                    rebuildPanelInfo()
                    continue
                }
            }
        }
    }

    const applyMagnet = (): void => {
        const magnets = boxes.filter(b => b.runtime.magnet !== undefined)
        if (magnets.length === 0) return
        const magnetBodyIds = new Set<number>(magnets.map(b => b.body.handle))
        const allBodies = physicsEnv.getAllBodies()
        for (const box of magnets) {
            const cfg = box.config.magnet
            if (cfg === undefined) continue
            const pos = box.body.translation()
            applyMagnetAttraction(pos, cfg.attractionRadius, cfg.attractionStrength, allBodies, magnetBodyIds)
        }
    }

    const stepElasticAll = (dt: number): void => {
        for (const box of boxes) {
            const elastic = box.runtime.elastic
            if (elastic !== undefined) stepElastic(elastic, box.config, box.config.mass, dt)
        }
    }

    const preSync = (dt: number, _time: number): void => {
        updatePhysics(dt)
        applyMagnet()
        stepElasticAll(dt)
    }

    // ── 同步 ──

    /** 每个物理步末记录箱体真实位姿，供渲染帧滞后一拍插值 */
    const captureRenderState = (): void => {
        for (const box of boxes) captureBodyRenderPose(box.mesh, box.body)
    }

    const syncPositions = (alpha = 1): void => {
        for (const box of boxes) {
            if (!applyRenderPose(box.mesh, alpha)) {
                const pos = box.body.translation()
                box.mesh.position.set(pos.x, pos.y, pos.z)
                const rot = box.body.rotation()
                box.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
            }
            if (box.runtime.burning !== undefined) {
                box.runtime.burning.particles.position.copy(box.mesh.position)
            }
            const elastic = box.runtime.elastic
            if (elastic !== undefined) {
                updateBoxMeshSize(box, box.config, elastic.def)
            }
            box.rowText = formatRowText(box)
        }
        rebuildPanelInfo()
    }

    // ── 上下文 ──

    const ctxWithoutPanel: Omit<BoxEntityContext, 'panel'> = {
        type: TYPE,
        events: sourceEvents,
        panelInfo,
        add,
        spawnAt,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => boxes,
        getEntityList: () => boxes,
        getMeshes: () => boxes.map(b => b.mesh),
        syncPositions,
        captureRenderState,
        updateConfig,
        setTransform,
        setTraitHealth,
        updatePhysics,
        preSync,
    }
    return {
        ...ctxWithoutPanel,
        panel: createBoxPanel(ctxWithoutPanel),
    }
}
