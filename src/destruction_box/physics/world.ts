import {type Scene} from 'three'
import {
    Body,
    BODY_TYPES,
    Box,
    Vec3,
    ConvexPolyhedron,
} from 'cannon-es'
import type {SharedWorld} from '../../physics/world.ts'
import {GROUND_Y} from '../../physics/constants.ts'
import type {
    DestructibleConfig, DestructibleBox,
    DestructibleDebris, DestructionContext, CollisionRecord,
} from '../types/destruction.ts'
import {
    IMPACT_FORCE_SCALE,
    DEBRIS_LIFETIME,
    OVERLAP_MAX_ATTEMPTS,
} from './constants.ts'
import {
    createDestructibleBoxMesh,
    applyDeformation,
    applyCracks,
    createDebrisFromFragment,
} from '../render/box.ts'
import {computeVoronoiFracture} from '../geometry/voronoi_fracture.ts'

let globalBoxId = 1

export const setupDestructibleBoxes = (scene: Scene, shared: SharedWorld): DestructionContext => {
    const {world, boxMat} = shared

    const boxes: DestructibleBox[] = []
    const allDebris: DestructibleDebris[] = []
    let selectedId: number | undefined

    const findNonOverlappingY = (config: DestructibleConfig, x: number, y: number, z: number): number => {
        let py = Math.max(y, GROUND_Y + config.height / 2)
        const halfH = config.height / 2
        const hx = config.width / 2
        const hz = config.depth / 2
        for (let attempt = 0; attempt < OVERLAP_MAX_ATTEMPTS; attempt++) {
            let overlap = false
            for (const other of boxes) {
                if (other.destroyed) continue
                const ohx = other.config.width / 2
                const ohy = other.config.height / 2
                const ohz = other.config.depth / 2
                const dx = Math.abs(py - other.mesh.position.y)
                const dy = Math.abs(x - other.mesh.position.x)
                const dz = Math.abs(z - other.mesh.position.z)
                if (dx < halfH + ohy && dy < hx + ohx && dz < hz + ohz) {
                    overlap = true
                    py = other.mesh.position.y + ohy + halfH
                    break
                }
            }
            if (!overlap) break
        }
        return py
    }

    const add = (config: DestructibleConfig, x: number, y: number, z: number): DestructibleBox => {
        const id = globalBoxId++
        const halfH = config.height / 2
        const py = findNonOverlappingY(config, x, y, z)

        const {mesh, edges} = createDestructibleBoxMesh(config)
        mesh.position.set(x, py, z)
        scene.add(mesh)

        const body = new Body({
            mass: config.mass,
            type: config.mass === 0 ? BODY_TYPES.STATIC : BODY_TYPES.DYNAMIC,
            material: boxMat,
        })
        body.addShape(new Box(new Vec3(config.width / 2, halfH, config.depth / 2)))
        body.position.set(x, py, z)
        world.addBody(body)

        const fragments = computeVoronoiFracture(
            [config.width, config.height, config.depth],
            config.fragmentSeedCount,
            id,
        )

        const pb = {
            id, mesh, edges, cracks: undefined,
            body, config: {...config},
            health: config.maxHealth,
            vertexOffsets: undefined,
            fragments,
            destroyed: false,
            debris: undefined,
        }

        const collisions: CollisionRecord[] = []
        body.addEventListener('collide', (e: any) => {
            const contact = e.contact
            const isBi = contact.bi === body
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

            collisions.push({
                contactPoint: [point.x, point.y, point.z],
                normal: [normal.x, normal.y, normal.z],
                relativeVelocity: relVel,
            })
        })

        ;(pb as any)._collisions = collisions
        boxes.push(pb as any)
        return pb
    }

    const remove = (id: number): void => {
        const idx = boxes.findIndex(b => b.id === id)
        if (idx === -1) return
        const pb = boxes[idx] as DestructibleBox
        if (selectedId === id) select(undefined)

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

    const spawnDebris = (pb: DestructibleBox, collisionPoint: [number, number, number]): void => {
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
            mesh.position.copy(pb.mesh.position)
            mesh.quaternion.copy(pb.mesh.quaternion)
            scene.add(mesh)

            const body = new Body({
                mass: Math.max(pb.config.mass * frag.massRatio, 0.01),
                material: boxMat,
            })

            const hull = new ConvexPolyhedron({
                vertices: frag.hullVertices,
                faces: frag.hullFaces,
            })
            body.addShape(hull)
            body.position.copy(pb.body.position)
            body.quaternion.copy(pb.body.quaternion)

            const cp = new Vec3(collisionPoint[0], collisionPoint[1], collisionPoint[2])
            const dir = new Vec3(
                frag.centroid[0] - cp.x,
                frag.centroid[1] - cp.y,
                frag.centroid[2] - cp.z,
            )
            const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
            if (dirLen > 0.001) {
                dir.x /= dirLen; dir.y /= dirLen; dir.z /= dirLen
                const force = pb.config.ejectForce * frag.massRatio
                const impulse = new Vec3(dir.x * force, dir.y * force, dir.z * force)
                body.applyImpulse(impulse, new Vec3(frag.centroid[0], frag.centroid[1], frag.centroid[2]))
            }

            world.addBody(body)
            const debris = {mesh, edges, body, lifetime: DEBRIS_LIFETIME}
            debrisList.push(debris)
        }

        pb.debris = debrisList
        allDebris.push(...debrisList)
    }

    const update = (dt: number): void => {
        for (const pb of boxes) {
            if (pb.destroyed) continue
            const cols: CollisionRecord[] = (pb as any)._collisions || []
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
                spawnDebris(pb, lastCol ? lastCol.contactPoint : [0, 0, 0])
            }
            cols.length = 0
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
    }

    return {
        add,
        remove,
        select,
        getBoxes: () => boxes,
        getBoxMeshes: () => boxes.map(b => b.mesh),
        getSelected,
        selectedId,
        getDebris: () => allDebris,
        update,
    }
}
