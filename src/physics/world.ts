import {type Scene} from 'three'
import {
    World,
    Body,
    BODY_TYPES,
    Box,
    Plane,
    Vec3,
    Material as CannonMaterial,
    ContactMaterial,
    SAPBroadphase,
} from 'cannon-es'
import type {BoxConfig, PhysicsBox, PhysicsContext} from '../types/physics.ts'
import {
    createBoxMesh,
    updateBoxMeshSize,
    disposeBoxMesh,
    createWireframe,
    disposeWireframe,
} from '../render/box.ts'
import {
    GRAVITY,
    FIXED_TIME_STEP,
    MAX_SUB_STEPS,
    GROUND_Y,
    BOX_BOX_FRICTION,
    BOX_GROUND_FRICTION,
    OVERLAP_MAX_ATTEMPTS,
} from './constants.ts'

export function setupPhysicsWorld(scene: Scene): PhysicsContext {
    const world = new World()
    world.gravity.set(0, GRAVITY, 0)
    world.broadphase = new SAPBroadphase(world)
    world.allowSleep = true

    const boxMat = new CannonMaterial('box')
    const groundMat = new CannonMaterial('ground')
    const boxGroundContact = new ContactMaterial(boxMat, groundMat, {friction: BOX_GROUND_FRICTION})
    world.addContactMaterial(new ContactMaterial(boxMat, boxMat, {friction: BOX_BOX_FRICTION}))
    world.addContactMaterial(boxGroundContact)

    const groundBody = new Body({mass: 0, type: BODY_TYPES.STATIC})
    groundBody.addShape(new Plane())
    groundBody.position.set(0, GROUND_Y, 0)
    groundBody.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2)
    world.addBody(groundBody)

    const boxes: PhysicsBox[] = []
    let nextId = 1
    let selectedId: number | null = null

    const findNonOverlappingY = (config: BoxConfig, x: number, y: number, z: number): number => {
        let py = y
        const halfH = config.height / 2
        if (py - halfH < GROUND_Y) py = GROUND_Y + halfH
        for (let attempt = 0; attempt < OVERLAP_MAX_ATTEMPTS; attempt++) {
            let overlap = false
            const hx = config.width / 2
            const hz = config.depth / 2
            for (const other of boxes) {
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

    const addBox = (config: BoxConfig, x: number, y: number, z: number): PhysicsBox => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2

        const {mesh, edges} = createBoxMesh(config)
        mesh.position.set(x, adjustedY, z)
        scene.add(mesh)

        const body = new Body({
            mass: config.mass,
            type: config.mass === 0 ? BODY_TYPES.STATIC : BODY_TYPES.DYNAMIC,
            material: boxMat,
        })
        body.addShape(new Box(new Vec3(hw, hh, hd)))
        body.position.set(x, adjustedY, z)
        world.addBody(body)

        const pb: PhysicsBox = {id, mesh, body, config: {...config}, edges, wireframe: null}
        boxes.push(pb)
        return pb
    }

    const removeBox = (id: number): void => {
        const idx = boxes.findIndex(b => b.id === id)
        if (idx === -1) return
        const pb = boxes[idx]
        if (selectedId === id) selectBox(null)
        scene.remove(pb.mesh)
        disposeBoxMesh(pb)
        world.removeBody(pb.body)
        if (pb.wireframe) {
            pb.mesh.remove(pb.wireframe)
            disposeWireframe(pb.wireframe)
        }
        boxes.splice(idx, 1)
    }

    const updateBox = (id: number, partial: Partial<BoxConfig>): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        const old = pb.config
        const cfg: BoxConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        const changedFriction = partial.friction !== undefined && partial.friction !== old.friction

        if (changedSize) {
            const hh = cfg.height / 2
            updateBoxMeshSize(pb, cfg)

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

        if (changedFriction) {
            boxGroundContact.friction = cfg.friction
        }

        pb.config = cfg
    }

    const selectBox = (id: number | null): PhysicsBox | null => {
        if (selectedId !== null) {
            const prev = boxes.find(b => b.id === selectedId)
            if (prev && prev.wireframe) {
                prev.mesh.remove(prev.wireframe)
                disposeWireframe(prev.wireframe)
                prev.wireframe = null
            }
        }
        selectedId = id
        if (id !== null) {
            const pb = boxes.find(b => b.id === id)
            if (pb) {
                const line = createWireframe(pb.mesh.geometry)
                pb.mesh.add(line)
                pb.wireframe = line
                return pb
            }
        }
        return null
    }

    const getSelected = (): PhysicsBox | null => {
        if (selectedId === null) return null
        return boxes.find(b => b.id === selectedId) ?? null
    }

    const setBoxTransform = (
        id: number,
        pos: { x: number; y: number; z: number },
        rotDeg: { x: number; y: number; z: number },
    ): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        pb.mesh.position.set(pos.x, pos.y, pos.z)
        pb.body.position.set(pos.x, pos.y, pos.z)
        pb.mesh.rotation.set(
            rotDeg.x * Math.PI / 180,
            rotDeg.y * Math.PI / 180,
            rotDeg.z * Math.PI / 180,
        )
        pb.body.quaternion.set(
            pb.mesh.quaternion.x,
            pb.mesh.quaternion.y,
            pb.mesh.quaternion.z,
            pb.mesh.quaternion.w,
        )
        if (pb.body.type === BODY_TYPES.DYNAMIC) pb.body.wakeUp()
    }

    return {
        addBox,
        removeBox,
        updateBox,
        getBoxes: () => boxes,
        getBoxMeshes: () => boxes.map(b => b.mesh),
        setBoxTransform,
        selectBox,
        getSelected,
        selectedId,
        step: (dt: number) => world.step(FIXED_TIME_STEP, dt, MAX_SUB_STEPS),
    }
}
