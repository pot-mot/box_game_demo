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

/** 初始化 cannon-es 物理世界并返回箱子管理 API */
export const setupPhysicsWorld = (scene: Scene): PhysicsContext => {
    // --- 物理世界 ---
    const world = new World()
    world.gravity.set(0, GRAVITY, 0)
    world.broadphase = new SAPBroadphase(world)
    world.allowSleep = true

    // --- 接触材质（箱-箱、箱-地面） ---
    const boxMat = new CannonMaterial('box')
    const groundMat = new CannonMaterial('ground')
    const boxGroundContact = new ContactMaterial(boxMat, groundMat, {friction: BOX_GROUND_FRICTION})
    world.addContactMaterial(new ContactMaterial(boxMat, boxMat, {friction: BOX_BOX_FRICTION}))
    world.addContactMaterial(boxGroundContact)

    // --- 静态地面（Plane 绕 X 轴旋转使其法线朝上） ---
    const groundBody = new Body({mass: 0, type: BODY_TYPES.STATIC})
    groundBody.addShape(new Plane())
    groundBody.position.set(0, GROUND_Y, 0)
    groundBody.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2)
    world.addBody(groundBody)

    const boxes: PhysicsBox[] = []
    let nextId = 1
    let selectedId: number | undefined

    /** 垂直扫描已有箱子，找到一个不与任何箱子重叠的 Y 位置 */
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
                // AABB 重叠检测
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

    /** 创建一个新箱子（自动避让重叠） */
    const addBox = (config: BoxConfig, x: number, y: number, z: number): PhysicsBox => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2

        // 网格
        const {mesh, edges} = createBoxMesh(config)
        mesh.position.set(x, adjustedY, z)
        scene.add(mesh)

        // 刚体
        const body = new Body({
            mass: config.mass,
            type: config.mass === 0 ? BODY_TYPES.STATIC : BODY_TYPES.DYNAMIC,
            material: boxMat,
        })
        body.addShape(new Box(new Vec3(hw, hh, hd)))
        body.position.set(x, adjustedY, z)
        world.addBody(body)

        const pb: PhysicsBox = {id, mesh, body, config: {...config}, edges, wireframe: undefined}
        boxes.push(pb)
        return pb
    }

    /** 删除箱子并清理所有 GPU 资源 */
    const removeBox = (id: number): void => {
        const idx = boxes.findIndex(b => b.id === id)
        if (idx === -1) return
        const pb = boxes[idx]
        if (selectedId === id) selectBox(undefined)

        scene.remove(pb.mesh)
        disposeBoxMesh(pb)
        world.removeBody(pb.body)
        if (pb.wireframe) {
            pb.mesh.remove(pb.wireframe)
            disposeWireframe(pb.wireframe)
        }
        boxes.splice(idx, 1)

        // 唤醒所有剩余 dynamic body，使其在失去支撑后受重力下落
        for (const b of boxes) {
            if (b.body.type === BODY_TYPES.DYNAMIC) {
                b.body.wakeUp()
            }
        }
    }

    /** 部分更新箱子属性（尺寸/质量/摩擦系数），必要时重建几何体和碰撞体 */
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

            // 重建 cannon 碰撞体
            while (pb.body.shapes.length) pb.body.removeShape(pb.body.shapes[0])
            pb.body.addShape(new Box(new Vec3(cfg.width / 2, hh, cfg.depth / 2)))
            pb.body.updateMassProperties()

            // 防止箱底陷入地面：调高后若底部低于原底部或地面，向上抬升
            const oldBottom = pb.body.position.y - old.height / 2
            const newBottom = pb.body.position.y - hh
            if (newBottom < oldBottom || newBottom < GROUND_Y) {
                const target = Math.max(oldBottom, GROUND_Y)
                pb.body.position.y = target + hh
                pb.mesh.position.y = target + hh
            }

            // 刷新选中线框（几何体已变）
            if (pb.wireframe) {
                pb.mesh.remove(pb.wireframe)
                disposeWireframe(pb.wireframe)
                pb.wireframe = createWireframe(pb.mesh.geometry)
                pb.mesh.add(pb.wireframe)
            }
        }

        // 质量变化：0 → STATIC，非 0 → DYNAMIC
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

    /** 选中/取消选中箱子，同步切换青色线框 */
    const selectBox = (id: number | undefined): PhysicsBox | undefined => {
        // 清除旧选中线框
        if (selectedId !== undefined) {
            const prev = boxes.find(b => b.id === selectedId)
            if (prev && prev.wireframe) {
                prev.mesh.remove(prev.wireframe)
                disposeWireframe(prev.wireframe)
                prev.wireframe = undefined
            }
        }
        selectedId = id
        // 为新选中箱子添加青色线框
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

    const getSelected = (): PhysicsBox | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    /** 直接设置箱子的位置和旋转（角度制），mesh 与 body 同时更新 */
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
