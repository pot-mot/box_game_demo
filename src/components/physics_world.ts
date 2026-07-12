import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    BoxGeometry,
    BufferGeometry,
    MeshBasicMaterial,
    Mesh,
    GridHelper,
    EdgesGeometry,
    LineBasicMaterial,
    LineSegments,
    CanvasTexture,
} from 'three'
import {
    World,
    Body,
    BODY_TYPES,
    Box,
    Plane,
    Vec3,
    Material as CannonMaterial,
    ContactMaterial,
    SAPBroadphase
} from 'cannon-es'
import type {BoxConfig, PhysicsBox, PhysicsContext} from '../types/physics.ts'

const GROUND_Y = 0

let _gridTex: CanvasTexture | null = null

function gridTexture(): CanvasTexture {
    if (_gridTex) return _gridTex
    const size = 256
    const div = 4
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#777777'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = '#999999'
    ctx.lineWidth = 1
    const step = size / div
    for (let i = 0; i <= div; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke()
    }
    ctx.strokeStyle = '#bbbbbb'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, size, size)
    _gridTex = new CanvasTexture(canvas)
    return _gridTex
}

function makeEdgeLines(geo: BufferGeometry, color: number): LineSegments {
    const e = new EdgesGeometry(geo)
    return new LineSegments(e, new LineBasicMaterial({color}))
}

export const setupPhysicsWorld = (
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
): PhysicsContext => {
    const world = new World()
    world.gravity.set(0, -9.82, 0)
    world.broadphase = new SAPBroadphase(world)
    world.allowSleep = true

    const boxMat = new CannonMaterial('box')
    const groundMat = new CannonMaterial('ground')
    const boxGroundContact = new ContactMaterial(boxMat, groundMat, {friction: 0.3})
    world.addContactMaterial(new ContactMaterial(boxMat, boxMat, {friction: 0.5}))
    world.addContactMaterial(boxGroundContact)

    const groundBody = new Body({mass: 0, type: BODY_TYPES.STATIC})
    groundBody.addShape(new Plane())
    groundBody.position.set(0, GROUND_Y, 0)
    groundBody.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2)
    world.addBody(groundBody)

    const grid = new GridHelper(64, 64, 0x888888, 0x444444)
    grid.position.y = GROUND_Y
    scene.add(grid)

    const boxes: PhysicsBox[] = []
    let nextId = 1
    let selectedId: number | null = null

    const findNonOverlappingY = (config: BoxConfig, x: number, y: number, z: number): number => {
        let py = y
        const halfH = config.height / 2
        if (py - halfH < GROUND_Y) py = GROUND_Y + halfH
        for (let attempt = 0; attempt < 50; attempt++) {
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

        const geo = new BoxGeometry(config.width, config.height, config.depth)
        const mat = new MeshBasicMaterial({map: gridTexture()})
        const mesh = new Mesh(geo, mat)
        mesh.position.set(x, adjustedY, z)
        scene.add(mesh)

        const edges = makeEdgeLines(geo, 0x333333)
        mesh.add(edges)

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

    const syncBodyToMesh = () => {
        for (const pb of boxes) {
            pb.mesh.position.set(pb.body.position.x, pb.body.position.y, pb.body.position.z)
            pb.mesh.quaternion.set(pb.body.quaternion.x, pb.body.quaternion.y, pb.body.quaternion.z, pb.body.quaternion.w)
        }
    }

    const lastTime: { value: number } = {value: performance.now()}
    const tick = (time: number) => {
        requestAnimationFrame(tick)
        const delta = Math.min((time - lastTime.value) / 1000, 0.05)
        lastTime.value = time
        world.step(1 / 60, delta, 3)
        syncBodyToMesh()
        renderer.render(scene, camera)
    }
    tick(performance.now())

    const removeBox = (id: number) => {
        const idx = boxes.findIndex(b => b.id === id)
        if (idx === -1) return
        const pb = boxes[idx]
        if (selectedId === id) selectBox(null)
        scene.remove(pb.mesh)
        pb.mesh.geometry.dispose()
        ;(pb.mesh.material as MeshBasicMaterial).dispose()
        pb.mesh.remove(pb.edges)
        pb.edges.geometry.dispose()
        ;(pb.edges.material as LineBasicMaterial).dispose()
        world.removeBody(pb.body)
        if (pb.wireframe) {
            pb.mesh.remove(pb.wireframe)
            pb.wireframe.geometry.dispose()
            ;(pb.wireframe.material as LineBasicMaterial).dispose()
        }
        boxes.splice(idx, 1)
    }

    const updateWireframe = (pb: PhysicsBox) => {
        if (pb.wireframe) {
            pb.mesh.remove(pb.wireframe)
            pb.wireframe.geometry.dispose()
            ;(pb.wireframe.material as LineBasicMaterial).dispose()
            pb.wireframe = null
        }
        if (selectedId === pb.id) {
            const line = makeEdgeLines(pb.mesh.geometry, 0x00ffcc)
            pb.mesh.add(line)
            pb.wireframe = line
        }
    }

    const updateBox = (id: number, partial: Partial<BoxConfig>) => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        const old = pb.config
        const cfg: BoxConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        const changedFriction = partial.friction !== undefined && partial.friction !== old.friction

        if (changedSize) {
            const hw = cfg.width / 2
            const hh = cfg.height / 2
            const hd = cfg.depth / 2
            pb.mesh.geometry.dispose()
            pb.mesh.geometry = new BoxGeometry(cfg.width, cfg.height, cfg.depth)
            while (pb.body.shapes.length) pb.body.removeShape(pb.body.shapes[0])
            pb.body.addShape(new Box(new Vec3(hw, hh, hd)))
            pb.body.updateMassProperties()

            pb.mesh.remove(pb.edges)
            pb.edges.geometry.dispose()
            ;(pb.edges.material as LineBasicMaterial).dispose()
            pb.edges = makeEdgeLines(pb.mesh.geometry, 0x333333)
            pb.mesh.add(pb.edges)

            updateWireframe(pb)
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
                prev.wireframe.geometry.dispose()
                ;(prev.wireframe.material as LineBasicMaterial).dispose()
                prev.wireframe = null
            }
        }
        selectedId = id
        if (id !== null) {
            const pb = boxes.find(b => b.id === id)
            if (pb) {
                const line = makeEdgeLines(pb.mesh.geometry, 0x00ffcc)
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
    ) => {
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
    }
}
