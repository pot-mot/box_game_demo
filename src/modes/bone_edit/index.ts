import {type PerspectiveCamera, type Scene, type WebGLRenderer, type Object3D} from 'three'
import {setupSkeletonEntities, type SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import {setupMouseOrbit, setupKeyboardCamera} from '../camera_common.ts'
import {createAnimationStore, type AnimationStore} from './animation_store.ts'
import {setupBoneEditHistory, type BoneEditHistory} from './history.ts'
import {setupTimelinePanel, type TimelinePanel} from './timeline.ts'
import {setupBoneEditPointer} from './pointer.ts'
import {setupBoneGizmoPointer} from './gizmo_pointer.ts'
import {createTransformGizmo} from '../edit/transform_gizmo.ts'
import {GIZMO_SCALE_FACTOR} from './constants.ts'
import {skeletonToDefinition, clipToJSON, type SkeletonDefinition, type ClipJSON} from '../../skeleton/anim/serialization.ts'
import {focusPanel, getCurrentPanel} from '../../ui/entity_control_panel.ts'

/** 骨骼动画编辑模式控制器 */
export interface BoneEditModeController {
    updater: (dt: number) => void
    setCameraOrientation: (yaw: number, pitch: number) => void
    exit: () => void
}

/** 编辑快照：聚焦骨架定义 + 动画库 JSON + 当前动画名 */
interface ModeSnapshot {
    readonly skeleton: SkeletonDefinition
    readonly clips: readonly ClipJSON[]
    readonly currentClipName: string | undefined
}

/**
 * 骨骼动画编辑模式（启动屏第 4 按钮）：
 * 上方渲染视窗（轨道相机 + 键盘相机 + 指针交互），下方动画关键帧轨道面板；
 * 物理世界冻结；不注册存档快捷键（独立资产 JSON 导入导出）。
 */
export const setupBoneEditMode = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    scene: Scene,
    excludeFromBackground: (obj: Object3D) => void,
): BoneEditModeController => {
    /* 骨架实体（多骨架 + 聚焦） */
    const world: SkeletonEntitiesContext = setupSkeletonEntities(scene)
    world.addPreset()

    /* 动画库 */
    const store: AnimationStore = createAnimationStore()

    /* 相机（共享模块：modes/camera_common.ts） */
    const orbit = setupMouseOrbit(camera, renderer.domElement)
    const keyboardCamera = setupKeyboardCamera(camera)
    keyboardCamera.setEnabled(true)

    /* 时间轴面板（含 IK 开关状态） */
    let timeline: TimelinePanel

    /* 撤销/重做：快照 = 骨架定义 + 动画库（applyState 在 undo/redo 时执行） */
    const snapshotOf = (): ModeSnapshot => {
        const skeleton = world.getFocus()?.skeleton
        if (skeleton === undefined) {
            return {skeleton: {joints: [], bones: []}, clips: [], currentClipName: undefined}
        }
        return {
            skeleton: skeletonToDefinition(skeleton),
            clips: [...store.clips.values()].map(clipToJSON),
            currentClipName: store.currentName,
        }
    }
    const applySnapshot = (state: ModeSnapshot): void => {
        /* 重建聚焦骨架 + 恢复动画库 */
        const focus = world.getFocus()
        if (focus !== undefined) world.remove(focus.id)
        world.addFromDefinition(state.skeleton)
        timeline.applyLibrary(state.clips, state.currentClipName)
    }
    const history: BoneEditHistory = setupBoneEditHistory(snapshotOf, applySnapshot)

    timeline = setupTimelinePanel(world, store, history)

    /* 变换 Gizmo */
    const gizmo = createTransformGizmo()
    scene.add(gizmo.group)
    /* 折射背景渲染时排除 gizmo，避免水面上出现残影镜像 */
    excludeFromBackground(gizmo.group)

    /* 指针交互（拾取/拖拽/IK 牵引） */
    const onPicked = (hit: {kind: 'joint' | 'bone'; jointId: string; boneId: string | undefined}): void => {
        if (hit.kind === 'joint') {
            world.select({kind: 'joint', id: hit.jointId})
        } else if (hit.boneId !== undefined) {
            world.select({kind: 'bone', id: hit.boneId})
        }
        focusPanel(world.panel)
    }
    setupBoneEditPointer(world, camera, history, () => timeline.isIkEnabled(), onPicked)

    /* Gizmo 指针交互（拦截 gizmo 部件拖拽） */
    const gizmoPointer = setupBoneGizmoPointer(world, camera, gizmo, history, orbit.setEnabled)

    /* Gizmo 指针事件（在原有指针之前拦截） */
    renderer.domElement.addEventListener('pointerdown', gizmoPointer.handlePointerDown)
    window.addEventListener('pointermove', gizmoPointer.handlePointerMove)
    window.addEventListener('pointerup', gizmoPointer.handlePointerUp)
    /* pointercancel/失焦兜底：释放事件丢失时结束拖拽 */
    window.addEventListener('pointercancel', gizmoPointer.handlePointerCancel)
    window.addEventListener('blur', gizmoPointer.handlePointerCancel)

    /** 退出清理：移除 gizmo 指针监听器 + 释放几何/材质 */
    const exit = (): void => {
        gizmoPointer.destroy()
        renderer.domElement.removeEventListener('pointerdown', gizmoPointer.handlePointerDown)
        window.removeEventListener('pointermove', gizmoPointer.handlePointerMove)
        window.removeEventListener('pointerup', gizmoPointer.handlePointerUp)
        window.removeEventListener('pointercancel', gizmoPointer.handlePointerCancel)
        window.removeEventListener('blur', gizmoPointer.handlePointerCancel)
        gizmo.dispose()
        window.location.reload()
    }

    const updater = (dt: number): void => {
        void dt
        keyboardCamera.updater()
        timeline.updater(dt)

        /** 更新 gizmo 位置/旋转跟随选中关节 */
        const selection = world.getSelection()
        const entity = world.getFocus()
        let hasSelection = false
        if (selection !== undefined && selection.kind === 'joint' && entity !== undefined) {
            entity.skeleton.updateWorldTransforms()
            const jointWorldPos = entity.skeleton.getWorldPosition(selection.id)
            const jointWorldQuat = entity.skeleton.getWorldRotation(selection.id)
            if (jointWorldPos !== undefined) {
                gizmo.group.position.copy(jointWorldPos)
                /** gizmo 每帧对齐关节当前旋转：圆弧实时反映旋转角度（拖拽中也跟随） */
                if (jointWorldQuat !== undefined) {
                    gizmo.group.quaternion.copy(jointWorldQuat)
                }
                const dist = camera.position.distanceTo(jointWorldPos)
                const scale = dist * GIZMO_SCALE_FACTOR
                gizmo.group.scale.setScalar(scale)
                hasSelection = true
            }
        }
        gizmo.setVisible(hasSelection)
        /** 每帧刷新 hover/选中高亮透明度 */
        gizmo.setHoverPart(gizmoPointer.getHoverPart(camera))
        gizmo.setActivePart(gizmoPointer.getActivePart())

        /** 每帧刷新面板（拖拽中实时同步数值；输入框聚焦时由 refreshValues 焦点保护跳过） */
        const panel = getCurrentPanel()
        panel?.update?.()
    }

    return {
        updater,
        setCameraOrientation: (yaw: number, pitch: number) => orbit.setOrientation(yaw, pitch),
        exit,
    }
}