import {type Scene} from 'three'
import {
    Body,
    BODY_TYPES,
    Box,
    Vec3,
} from 'cannon-es'
import type {SharedWorld} from '../../../../physics/world.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'
import type {CommonBoxConfig, CommonBox, CommonEntityContext} from '../types'
import {createCommonBoxMesh, updateCommonBoxMeshSize, disposeCommonBoxMesh, createWireframe, disposeWireframe} from '../render'
import {findNonOverlappingY} from '../../base/physics'
import {createCommonPanel} from '../ui'
import type {PanelContext} from '../../ui'

export const setupCommonBoxes = (scene: Scene, shared: SharedWorld): CommonEntityContext => {
    const {world, boxMat} = shared

    const boxes: CommonBox[] = []
    let nextId = 1
    let selectedId: number | undefined

    const add = (config: CommonBoxConfig, x: number, y: number, z: number): CommonBox => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(boxes, config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2
        const {mesh, edges} = createCommonBoxMesh(config)
        mesh.position.set(x, adjustedY, z)
        scene.add(mesh)
        const body = new Body({
            mass: config.mass,
            type: config.mass === 0 ? BODY_TYPES.STATIC : BODY_TYPES.DYNAMIC,
            material: boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        body.addShape(new Box(new Vec3(hw, hh, hd)))
        body.position.set(x, adjustedY, z)
        world.addBody(body)
        const pb: CommonBox = {id, mesh, body, config: {...config}, edges, wireframe: undefined}
        boxes.push(pb)
        return pb
    }

    const remove = (id: number): void => {
        const idx = boxes.findIndex(b => b.id === id)
        if (idx === -1) return
        const pb = boxes[idx]
        if (selectedId === id) select(undefined)
        scene.remove(pb.mesh)
        disposeCommonBoxMesh(pb)
        world.removeBody(pb.body)
        if (pb.wireframe) {
            pb.mesh.remove(pb.wireframe)
            disposeWireframe(pb.wireframe)
        }
        boxes.splice(idx, 1)
        for (const b of boxes) {
            if (b.body.type === BODY_TYPES.DYNAMIC) b.body.wakeUp()
        }
    }

    const select = (id: number | undefined): CommonBox | undefined => {
        if (selectedId !== undefined) {
            const prev = boxes.find(b => b.id === selectedId)
            if (prev && prev.wireframe) {
                prev.mesh.remove(prev.wireframe)
                disposeWireframe(prev.wireframe)
                prev.wireframe = undefined
            }
        }
        selectedId = id
        if (id !== undefined) {
            const pb = boxes.find(b => b.id === id)
            if (pb) {
                const line = createWireframe(pb.mesh.geometry)
                pb.mesh.add(line)
                pb.wireframe = line
                return pb
            }
        }
        return undefined
    }

    const getSelected = (): CommonBox | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    const updateConfig = (id: number, partial: Partial<CommonBoxConfig>): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        const old = pb.config
        const cfg: CommonBoxConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        if (changedSize) {
            const hh = cfg.height / 2
            updateCommonBoxMeshSize(pb, cfg)
            while (pb.body.shapes.length) pb.body.removeShape(pb.body.shapes[0])
            pb.body.addShape(new Box(new Vec3(cfg.width / 2, hh, cfg.depth / 2)))
            pb.body.updateMassProperties()
            const oldBottom = pb.body.position.y - old.height / 2
            const newBottom = pb.body.position.y - hh
            if (newBottom < oldBottom || newBottom < GROUND_Y) {
                const target = Math.max(oldBottom, GROUND_Y)
                pb.body.position.y = target + hh
                pb.mesh.position.y = target + hh
            }
            if (pb.wireframe) {
                pb.mesh.remove(pb.wireframe)
                disposeWireframe(pb.wireframe)
                pb.wireframe = createWireframe(pb.mesh.geometry)
                pb.mesh.add(pb.wireframe)
            }
        }
        if (changedMass) {
            if (cfg.mass === 0) {
                pb.body.type = BODY_TYPES.STATIC
                pb.body.mass = 0
            } else {
                pb.body.type = BODY_TYPES.DYNAMIC
                pb.body.mass = cfg.mass
                pb.body.updateMassProperties()
                pb.body.wakeUp()
            }
        }
        pb.config = cfg
    }

    const setTransform = (
        id: number,
        pos: {x: number; y: number; z: number},
        rotDeg: {x: number; y: number; z: number},
    ): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        pb.mesh.position.set(pos.x, pos.y, pos.z)
        pb.body.position.set(pos.x, pos.y, pos.z)
        pb.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        pb.body.quaternion.set(pb.mesh.quaternion.x, pb.mesh.quaternion.y, pb.mesh.quaternion.z, pb.mesh.quaternion.w)
        if (pb.body.type === BODY_TYPES.DYNAMIC) pb.body.wakeUp()
    }

    const ctx: CommonEntityContext = {
        add,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => boxes,
        getMeshes: () => boxes.map(b => b.mesh),
        updateConfig,
        setTransform,
        panel: undefined as unknown as PanelContext,
    }
    ctx.panel = createCommonPanel(ctx)
    return ctx
}
