import {Plane, Quaternion, Raycaster, Vector2, Vector3, type PerspectiveCamera} from 'three'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import {resolveIkChain, solveCcd} from '../../skeleton/ik.ts'
import {DEFAULT_IK_MAX_ITERATIONS, DEFAULT_IK_TOLERANCE} from '../../skeleton/constants.ts'
import {rotateBone} from '../../skeleton/bone.ts'
import {rotateJointCascade, translateJointCascade} from '../../skeleton/skeleton.ts'
import type {BoneEditHistory} from './history.ts'
import {DRAG_CLICK_THRESHOLD} from './constants.ts'
import {isGizmoActive} from './gizmo_pointer.ts'

/** 骨骼段拖拽旋转灵敏度（rad/px） */
const ROT_SENSITIVITY = 0.012

/** 命中信息：gizmo → 关节；外观部件 → 骨骼段（或挂载关节）；旋转指针 → 关节（rotHandle） */
export interface PickHit {
    readonly kind: 'joint' | 'bone'
    readonly jointId: string
    readonly boneId: string | undefined
    /** 命中选中关节的方向三角形指针（旋转拖拽手柄） */
    readonly rotHandle?: boolean
}

/** 视窗指针交互：拾取/拖拽/IK 牵引（全鼠标，无新增快捷键） */
export const setupBoneEditPointer = (
    world: SkeletonEntitiesContext,
    camera: PerspectiveCamera,
    history: BoneEditHistory,
    getIkEnabled: () => boolean,
    onPicked: (hit: PickHit) => void,
): {destroy: () => void} => {
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const plane = new Plane()

    let dragJoint: {jointId: string; grabOffset: Vector3} | undefined
    let dragBone: {boneId: string} | undefined
    let dragRotateJoint: {jointId: string} | undefined
    let downPos = {x: 0, y: 0}
    let moved = false

    const pick = (x: number, y: number): PickHit | undefined => {
        ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1)
        raycaster.setFromCamera(ndc, camera)
        /* 陷阱：禁止递归，避免命中 LineSegments 等子对象 */
        const hits = raycaster.intersectObjects([...world.getMeshes()], false)
        for (const hit of hits) {
            const userData = hit.object.userData
            const jointId = userData?.jointId
            if (typeof jointId === 'string') {
                if (userData?.rotHandle === true) {
                    return {kind: 'joint', jointId, boneId: undefined, rotHandle: true}
                }
                return {kind: 'joint', jointId, boneId: undefined}
            }
            const boneId = userData?.boneId
            if (typeof boneId === 'string') {
                return {kind: 'bone', jointId: String(userData.jointId ?? ''), boneId}
            }
        }
        return undefined
    }

    /** 过 point 且法线为相机视线的拖拽平面 */
    const dragPlaneThrough = (point: Vector3): void => {
        const normal = camera.getWorldDirection(new Vector3())
        plane.setFromNormalAndCoplanarPoint(normal, point)
    }

    const rayPlaneTarget = (x: number, y: number): Vector3 | undefined => {
        ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1)
        raycaster.setFromCamera(ndc, camera)
        const out = new Vector3()
        return raycaster.ray.intersectPlane(plane, out) !== null ? out : undefined
    }

    const applyJointDrag = (worldPos: Vector3): void => {
        const entity = world.getFocus()
        if (entity === undefined || dragJoint === undefined) return
        const skeleton = entity.skeleton
        const joint = skeleton.findJoint(dragJoint.jointId)
        if (joint === undefined) return
        const finalPos = worldPos.clone().sub(dragJoint.grabOffset)
        if (getIkEnabled()) {
            /* IK 模式：链根固定，末端追目标（resolveIkChain 回溯 IK 根） */
            const chain = resolveIkChain(joint)
            if (chain.length > 1) {
                solveCcd(skeleton, chain, finalPos, {
                    maxIterations: DEFAULT_IK_MAX_ITERATIONS,
                    tolerance: DEFAULT_IK_TOLERANCE,
                })
                world.refresh()
                return
            }
        }
        /* 平移模式：目标世界位置 → 世界位移 → 级联平移（级联范围外后代保持世界变换） */
        const currentWorld = skeleton.getWorldPosition(joint.id)
        if (currentWorld === undefined) return
        translateJointCascade(skeleton, joint, finalPos.clone().sub(currentWorld), world.getCascadeSettings())
        world.refresh()
    }

    /** 旋转指针拖拽：绕相机右轴/上轴旋转选中关节（级联按设置传播到子节点） */
    const applyJointRotationDrag = (dx: number, dy: number): void => {
        const entity = world.getFocus()
        if (entity === undefined || dragRotateJoint === undefined) return
        const skeleton = entity.skeleton
        const joint = skeleton.findJoint(dragRotateJoint.jointId)
        if (joint === undefined) return
        const cameraDir = camera.getWorldDirection(new Vector3())
        const right = new Vector3().crossVectors(cameraDir, camera.up).normalize()
        /* 世界预乘旋转：先绕相机右轴，再绕相机上轴（与骨骼段拖拽手感一致） */
        const qRight = new Quaternion().setFromAxisAngle(right, -dx * ROT_SENSITIVITY)
        const qUp = new Quaternion().setFromAxisAngle(camera.up, -dy * ROT_SENSITIVITY)
        rotateJointCascade(skeleton, joint, qUp.multiply(qRight), world.getCascadeSettings())
        world.refresh()
    }

    const applyBoneDrag = (dx: number, dy: number): void => {
        const entity = world.getFocus()
        if (entity === undefined || dragBone === undefined) return
        const skeleton = entity.skeleton
        const bone = skeleton.findBone(dragBone.boneId)
        if (bone === undefined) return
        const cameraDir = camera.getWorldDirection(new Vector3())
        const right = new Vector3().crossVectors(cameraDir, camera.up).normalize()
        if (dx !== 0) rotateBone(skeleton, bone, right, -dx * ROT_SENSITIVITY)
        if (dy !== 0) rotateBone(skeleton, bone, camera.up, -dy * ROT_SENSITIVITY)
        world.refresh()
    }

    const onMouseDown = (e: MouseEvent): void => {
        if (e.button !== 0) return
        /** gizmo 拖拽进行中，跳过原有指针逻辑 */
        if (isGizmoActive()) return
        downPos = {x: e.clientX, y: e.clientY}
        moved = false
        const hit = pick(e.clientX, e.clientY)
        if (hit === undefined) return
        const entity = world.getFocus()
        if (entity === undefined) return
        const skeleton = entity.skeleton

        if (hit.kind === 'joint') {
            if (hit.rotHandle === true) {
                /* 旋转指针：进入旋转拖拽 */
                dragRotateJoint = {jointId: hit.jointId}
                history.startEdit()
                return
            }
            const joint = skeleton.findJoint(hit.jointId)
            const jointWorld = skeleton.getWorldPosition(hit.jointId)
            if (joint === undefined || jointWorld === undefined) return
            dragJoint = {jointId: hit.jointId, grabOffset: new Vector3()}
            dragPlaneThrough(jointWorld)
            const startTarget = rayPlaneTarget(e.clientX, e.clientY)
            if (startTarget !== undefined) {
                dragJoint.grabOffset.copy(jointWorld.clone().sub(startTarget))
            }
            history.startEdit()
        } else if (hit.boneId !== undefined) {
            dragBone = {boneId: hit.boneId}
            history.startEdit()
        }
    }

    const onMouseMove = (e: MouseEvent): void => {
        if (dragJoint === undefined && dragBone === undefined && dragRotateJoint === undefined) return
        if (!moved) {
            const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
            if (dist < DRAG_CLICK_THRESHOLD) return
            moved = true
        }
        if (dragRotateJoint !== undefined) {
            applyJointRotationDrag(e.movementX, e.movementY)
        } else if (dragJoint !== undefined) {
            const target = rayPlaneTarget(e.clientX, e.clientY)
            if (target !== undefined) applyJointDrag(target)
        } else if (dragBone !== undefined) {
            applyBoneDrag(e.movementX, e.movementY)
        }
    }

    const onMouseUp = (e: MouseEvent): void => {
        if (dragJoint !== undefined || dragBone !== undefined || dragRotateJoint !== undefined) {
            if (!moved) {
                /* 未拖拽 = 点击选中 */
                const hit = pick(e.clientX, e.clientY)
                if (hit !== undefined) onPicked(hit)
            }
            history.endEdit()
        }
        dragJoint = undefined
        dragBone = undefined
        dragRotateJoint = undefined
        moved = false
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return {
        destroy: () => {
            window.removeEventListener('mousedown', onMouseDown)
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        },
    }
}