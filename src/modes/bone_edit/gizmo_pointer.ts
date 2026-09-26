/**
 * 骨骼编辑模式变换 Gizmo 指针交互。
 * 拦截 gizmo 部件的点击/拖拽，通过回调驱动 translateJointCascade / rotateJointCascade。
 * 与 setupBoneEditPointer 共存：gizmo 拖拽期间原有指针逻辑被跳过。
 */
import {Raycaster, Vector2, type PerspectiveCamera} from 'three'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import {translateJointCascade, rotateJointCascade} from '../../skeleton/skeleton.ts'
import type {TransformGizmo, DragState, GizmoDragCallbacks, GizmoPartType} from '../edit/transform_gizmo.ts'
import type {BoneEditHistory} from './history.ts'
import type {DragCoordinator} from './drag_state.ts'

export const setupBoneGizmoPointer = (
    world: SkeletonEntitiesContext,
    camera: PerspectiveCamera,
    gizmo: TransformGizmo,
    history: BoneEditHistory,
    setOrbitEnabled: (v: boolean) => void,
    coordinator: DragCoordinator,
): {
    /** 是否正在 gizmo 拖拽中（供外部检查拖拽状态） */
    isDragging: () => boolean
    /** 处理 pointerdown（返回 true 表示已消费事件） */
    handlePointerDown: (e: PointerEvent) => boolean
    /** 处理 pointermove */
    handlePointerMove: (e: PointerEvent) => void
    /** 处理 pointerup */
    handlePointerUp: (e: PointerEvent) => void
    /** 每帧调用：检测鼠标悬停的 gizmo 部件（拖拽中不检测） */
    getHoverPart: (cam: PerspectiveCamera) => GizmoPartType | undefined
    /** 每帧调用：当前拖拽中的部件 */
    getActivePart: () => GizmoPartType | undefined
    /** 中断拖拽：pointercancel / 窗口失焦时兜底清理 */
    handlePointerCancel: () => void
    /** 清理：移除事件监听器并复位状态 */
    destroy: () => void
} => {
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let dragState: DragState | undefined
    /** 最近一次指针屏幕坐标（hover 检测用，无拖拽时也更新；NaN 表示鼠标从未移动） */
    let lastPointer = {x: NaN, y: NaN}

    /** 射线检测 gizmo 部件 */
    const hitGizmo = (x: number, y: number) => {
        pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1)
        raycaster.setFromCamera(pointer, camera)
        return gizmo.hitTest(raycaster)
    }

    /** 构建拖拽回调：通过 translateJointCascade / rotateJointCascade 应用变换 */
    const buildCallbacks = (jointId: string): GizmoDragCallbacks => {
        const entity = world.getFocus()
        if (entity === undefined) {
            return {onTranslate: () => {}, onRotate: () => {}}
        }
        return {
            onTranslate: (newWorldPos) => {
                const skel = entity.skeleton
                const joint = skel.findJoint(jointId)
                if (joint === undefined) return
                const curWorld = skel.getWorldPosition(jointId)
                if (curWorld === undefined) return
                const delta = newWorldPos.clone().sub(curWorld)
                translateJointCascade(skel, joint, delta, world.getCascadeSettings())
                world.refresh()
            },
            onRotate: (newWorldQuat) => {
                const skel = entity.skeleton
                const joint = skel.findJoint(jointId)
                if (joint === undefined) return
                const curWorldQuat = skel.getWorldRotation(jointId)
                if (curWorldQuat === undefined) return
                /** 计算增量旋转 = newQuat * curQuat⁻¹ */
                const deltaQuat = newWorldQuat.clone().multiply(curWorldQuat.clone().invert())
                rotateJointCascade(skel, joint, deltaQuat, world.getCascadeSettings())
                world.refresh()
            },
        }
    }

    const handlePointerDown = (e: PointerEvent): boolean => {
        if (e.button !== 0) return false
        /** 安全重置：上一轮拖拽被中断（如切换标签页丢 pointerup）时清除标志 */
        if (coordinator.isGizmoActive() && dragState === undefined) {
            coordinator.setGizmoActive(false)
        }
        const partType = hitGizmo(e.clientX, e.clientY)
        if (partType === undefined) return false

        const selection = world.getSelection()
        if (selection === undefined || selection.kind !== 'joint') return false

        const entity = world.getFocus()
        if (entity === undefined) return false

        const jointWorldPos = entity.skeleton.getWorldPosition(selection.id)
        const jointWorldQuat = entity.skeleton.getWorldRotation(selection.id)
        if (jointWorldPos === undefined || jointWorldQuat === undefined) return false

        const callbacks = buildCallbacks(selection.id)
        dragState = gizmo.startDrag(
            partType, jointWorldPos, jointWorldQuat,
            callbacks, camera, raycaster,
        )
        if (dragState !== undefined) {
            coordinator.setGizmoActive(true)
            setOrbitEnabled(false)
            history.startEdit()
            return true
        }
        return false
    }

    const handlePointerMove = (e: PointerEvent): void => {
        /** 始终记录指针位置供 hover 检测 */
        lastPointer = {x: e.clientX, y: e.clientY}
        if (dragState === undefined) return
        e.preventDefault()
        pointer.set(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)
        gizmo.updateDrag(dragState, camera, raycaster)
    }

    /** 每帧调用：检测鼠标悬停的 gizmo 部件（拖拽中不检测） */
    const getHoverPart = (cam: PerspectiveCamera): GizmoPartType | undefined => {
        /* 鼠标从未移动时不检测，避免屏幕中心哨兵射线误命中 */
        if (dragState !== undefined || Number.isNaN(lastPointer.x)) return undefined
        pointer.set(
            (lastPointer.x / window.innerWidth) * 2 - 1,
            -(lastPointer.y / window.innerHeight) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, cam)
        return gizmo.hitTest(raycaster)
    }

    /** 每帧调用：当前拖拽中的部件 */
    const getActivePart = (): GizmoPartType | undefined => dragState?.partType

    const handlePointerUp = (e: PointerEvent): void => {
        if (dragState === undefined) return
        /** 仅左键释放结束拖拽（避免右键/中键释放提前终止） */
        if (e.button !== 0) return
        dragState = undefined
        coordinator.setGizmoActive(false)
        setOrbitEnabled(true)
        history.endEdit()
    }

    /** 中断拖拽：pointercancel/窗口失焦时结束拖拽，防止 dragState 残留 */
    const handlePointerCancel = (): void => {
        if (dragState === undefined) return
        dragState = undefined
        coordinator.setGizmoActive(false)
        setOrbitEnabled(true)
        history.endEdit()
    }

    return {
        isDragging: () => dragState !== undefined,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        getHoverPart,
        getActivePart,
        handlePointerCancel,
        destroy: () => {
            dragState = undefined
            coordinator.setGizmoActive(false)
        },
    }
}
