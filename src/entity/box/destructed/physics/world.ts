import {type Scene} from 'three'
import {
    Body,
    BODY_TYPES,
    Box,
    Vec3,
    ConvexPolyhedron,
} from 'cannon-es'
import type {SharedWorld} from '../../../../physics/world.ts'
import {DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, DEBRIS_COLLISION_GROUP, DEBRIS_COLLISION_MASK} from '../../../../physics/constants.ts'
import type {DestructibleConfig, DestructibleBox, DestructibleDebris, DestructionEntityContext, CollisionRecord} from '../types'
import {
    IMPACT_FORCE_SCALE,
    DEBRIS_LIFETIME,
    COLLISION_COOLDOWN,
    MIN_FRAGMENT_COUNT,
    MAX_COLLISION_HISTORY,
    EJECT_VELOCITY_SCALE,
} from './constants.ts'
import {
    createDestructibleBoxMesh,
    applyDeformation,
    applyCracks,
    createDebrisFromFragment,
} from '../render'
import {findNonOverlappingY} from '../../base/physics'
import {computeFractureFromPoints} from '../geometry/voronoi_fracture.ts'
import {createDestructionPanel} from '../ui'
import type {PanelContext} from '../../base/ui'

let globalBoxId = 1

export const setupDestructibleBoxes = (scene: Scene, shared: SharedWorld): DestructionEntityContext => {
    const {world, boxMat} = shared

    const boxes: DestructibleBox[] = []
    const allDebris: DestructibleDebris[] = []
    let selectedId: number | undefined

    const add = (config: DestructibleConfig, x: number, y: number, z: number): DestructibleBox => {
        const id = globalBoxId++
        const halfH = config.height / 2
        const py = findNonOverlappingY(boxes, config, x, y, z, (b) => b.destroyed)

        const {mesh, edges} = createDestructibleBoxMesh(config)
        mesh.position.set(x, py, z)
        scene.add(mesh)

        const body = new Body({
            mass: config.mass,
            type: config.mass === 0 ? BODY_TYPES.STATIC : BODY_TYPES.DYNAMIC,
            material: boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        body.addShape(new Box(new Vec3(config.width / 2, halfH, config.depth / 2)))
        body.position.set(x, py, z)
        world.addBody(body)

        const _collisions: CollisionRecord[] = []
        const _collisionHistory: CollisionRecord[] = []
        const _cooldowns = new Map<number, number>()

        const onCollide = (e: any): void => {
            const contact = e.contact
            const isBi = contact.bi === body
            const otherBody = isBi ? contact.bj : contact.bi

            const otherId = otherBody.id
            if ((_cooldowns.get(otherId) || 0) > 0) return
            _cooldowns.set(otherId, COLLISION_COOLDOWN)

            const normal = isBi ? contact.ni.clone() : contact.ni.clone().negate()

            const point = new Vec3()
            if (isBi) {
                point.x = contact.bi.position.x + contact.ri.x
                point.y = contact.bi.position.y + contact.ri.y
                point.z = contact.bi.position.z + contact.ri.z
            } else {
                point.x = contact.bj.position.x + contact.rj.x
                point.y = contact.bj.position.y + contact.rj.y
                point.z = contact.bj.position.z + contact.rj.z
            }

            const vd = new Vec3()
            if (isBi) {
                vd.x = contact.bi.velocity.x - contact.bj.velocity.x
                vd.y = contact.bi.velocity.y - contact.bj.velocity.y
                vd.z = contact.bi.velocity.z - contact.bj.velocity.z
            } else {
                vd.x = contact.bj.velocity.x - contact.bi.velocity.x
                vd.y = contact.bj.velocity.y - contact.bi.velocity.y
                vd.z = contact.bj.velocity.z - contact.bi.velocity.z
            }
            const relVel = Math.abs(vd.x * normal.x + vd.y * normal.y + vd.z * normal.z)

            const record: CollisionRecord = {
                contactPoint: [point.x, point.y, point.z],
                normal: [normal.x, normal.y, normal.z],
                relativeVelocity: relVel,
            }

            _collisions.push(record)
            _collisionHistory.push(record)
            while (_collisionHistory.length > MAX_COLLISION_HISTORY) {
                _collisionHistory.shift()
            }
        }

        body.addEventListener('collide', onCollide)

        const pb: DestructibleBox = {
            id, mesh, edges, cracks: undefined,
            body, config: {...config},
            health: config.maxHealth,
            vertexOffsets: undefined,
            fragments: [],
            destroyed: false,
            debris: undefined,
            _collisions,
            _collisionHistory,
            _cooldowns,
            _onCollide: onCollide,
        }
        boxes.push(pb)
        return pb
    }

    const remove = (id: number): void => {
        const idx = boxes.findIndex(b => b.id === id)
        if (idx === -1) return
        const pb = boxes[idx]
        if (selectedId === id) select(undefined)

        if (pb._onCollide) pb.body.removeEventListener('collide', pb._onCollide)
        scene.remove(pb.mesh)
        pb.mesh.geometry.dispose()
        ;(pb.mesh.material as any).dispose()
        pb.mesh.remove(pb.edges)
        pb.edges.geometry.dispose()
        ;(pb.edges.material as any).dispose()
        if (pb.cracks) {
            pb.mesh.remove(pb.cracks)
            pb.cracks.geometry.dispose()
            ;(pb.cracks.material as any).dispose()
        }

        world.removeBody(pb.body)
        boxes.splice(idx, 1)
    }

    const select = (id: number | undefined): DestructibleBox | undefined => {
        selectedId = id
        if (id !== undefined) return boxes.find(b => b.id === id)
        return undefined
    }

    const getSelected = (): DestructibleBox | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    const spawnDebris = (pb: DestructibleBox, collisionPoint: [number, number, number], ejectForce: number): void => {
        if (pb.destroyed || pb.fragments.length === 0) return

        pb.destroyed = true
        world.removeBody(pb.body)
        scene.remove(pb.mesh)
        pb.mesh.geometry.dispose()
        ;(pb.mesh.material as any).dispose()
        pb.mesh.remove(pb.edges)
        pb.edges.geometry.dispose()
        ;(pb.edges.material as any).dispose()
        if (pb.cracks) {
            pb.mesh.remove(pb.cracks)
            pb.cracks.geometry.dispose()
            ;(pb.cracks.material as any).dispose()
        }

        const debrisList: DestructibleDebris[] = []

        for (const frag of pb.fragments) {
            if (frag.renderIndices.length < 3) continue

            const {mesh, edges} = createDebrisFromFragment(frag)
            scene.add(mesh)

            const body = new Body({
                mass: Math.max(pb.config.mass * frag.massRatio, 0.01),
                material: boxMat,
                collisionFilterGroup: DEBRIS_COLLISION_GROUP,
                collisionFilterMask: DEBRIS_COLLISION_MASK,
            })

            const hull = new ConvexPolyhedron({
                vertices: frag.hullVertices,
                faces: frag.hullFaces,
            })
            body.addShape(hull)
            const worldCentroid = new Vec3(
                pb.body.position.x + frag.centroid[0],
                pb.body.position.y + frag.centroid[1],
                pb.body.position.z + frag.centroid[2],
            )
            body.position.copy(worldCentroid)
            body.quaternion.copy(pb.body.quaternion)
            mesh.position.copy(body.position as any)
            mesh.quaternion.copy(body.quaternion as any)

            const cp = new Vec3(collisionPoint[0], collisionPoint[1], collisionPoint[2])
            const dir = new Vec3(
                worldCentroid.x - cp.x,
                worldCentroid.y - cp.y,
                worldCentroid.z - cp.z,
            )
            const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
            if (dirLen > 0.001) {
                dir.x /= dirLen; dir.y /= dirLen; dir.z /= dirLen
                const force = ejectForce * frag.massRatio
                const impulse = new Vec3(dir.x * force, dir.y * force, dir.z * force)
                body.applyImpulse(impulse, worldCentroid)
            }

            world.addBody(body)
            const debris = {mesh, edges, body, lifetime: DEBRIS_LIFETIME}
            debrisList.push(debris)
        }

        pb.debris = debrisList
        allDebris.push(...debrisList)
    }

    const updatePhysics = (dt: number): void => {
        for (const pb of boxes) {
            if (pb.destroyed) continue
            const cols = pb._collisions
            if (cols.length === 0) continue

            for (const col of cols) {
                const impact = col.relativeVelocity * pb.config.mass * IMPACT_FORCE_SCALE
                pb.health -= impact
                if (pb.health > 0) {
                    const intensity = 1 - pb.health / pb.config.maxHealth
                    applyDeformation(pb, col.contactPoint, col.normal, intensity)
                    applyCracks(pb, col.contactPoint, col.normal, intensity)
                }
            }

            if (pb.health <= 0 && !pb.destroyed) {
                const lastCol = cols[cols.length - 1]
                const history = pb._collisionHistory

                const invQuat = pb.body.quaternion.clone().inverse()
                const localSeeds: Vec3[] = []
                for (const h of history) {
                    const offset = new Vec3(
                        h.contactPoint[0] - pb.body.position.x,
                        h.contactPoint[1] - pb.body.position.y,
                        h.contactPoint[2] - pb.body.position.z,
                    )
                    localSeeds.push(invQuat.vmult(offset))
                }

                pb.fragments = computeFractureFromPoints(
                    [pb.config.width, pb.config.height, pb.config.depth],
                    localSeeds,
                    MIN_FRAGMENT_COUNT,
                )

                const avgSpeed = history.length > 0
                    ? history.reduce((s, c) => s + c.relativeVelocity, 0) / history.length
                    : 5
                const dynamicEjectForce = avgSpeed * EJECT_VELOCITY_SCALE

                spawnDebris(pb, lastCol ? lastCol.contactPoint : [0, 0, 0], dynamicEjectForce)
            }
            cols.length = 0
        }

        for (const pb of boxes) {
            const cooldowns = pb._cooldowns
            for (const [key, val] of cooldowns) {
                const next = val - dt
                if (next <= 0) cooldowns.delete(key)
                else cooldowns.set(key, next)
            }
        }

        for (let i = allDebris.length - 1; i >= 0; i--) {
            const d = allDebris[i]
            d.lifetime -= dt
            if (d.lifetime <= 0) {
                scene.remove(d.mesh)
                d.mesh.geometry.dispose()
                ;(d.mesh.material as any).dispose()
                d.mesh.remove(d.edges)
                d.edges.geometry.dispose()
                ;(d.edges.material as any).dispose()
                world.removeBody(d.body)
                allDebris.splice(i, 1)
            }
        }

        for (let i = boxes.length - 1; i >= 0; i--) {
            const pb = boxes[i]
            if (!pb.destroyed) continue
            if (pb.debris) {
                pb.debris = pb.debris.filter(d => allDebris.includes(d))
            }
            if (!pb.debris || pb.debris.length === 0) {
                if (selectedId === pb.id) select(undefined)
                if (pb._onCollide) pb.body.removeEventListener('collide', pb._onCollide)
                boxes.splice(i, 1)
            }
        }
    }

    const ctx: DestructionEntityContext = {
        add,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => boxes,
        getMeshes: () => boxes.map(b => b.mesh),
        getDebris: () => allDebris,
        updatePhysics,
        panel: undefined as unknown as PanelContext,
    }
    ctx.panel = createDestructionPanel(ctx)
    return ctx
}
