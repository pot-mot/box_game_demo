import {type PerspectiveCamera, type Scene, type WebGLRenderer} from 'three'
import {setupSkeletonEntities, type SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import {setupMouseOrbit, setupKeyboardCamera} from '../camera_common.ts'
import {createAnimationStore, type AnimationStore} from './animation_store.ts'
import {setupBoneEditHistory, type BoneEditHistory} from './history.ts'
import {setupTimelinePanel, type TimelinePanel} from './timeline.ts'
import {setupBoneEditPointer} from './pointer.ts'
import {skeletonToDefinition, clipToJSON, type SkeletonDefinition, type ClipJSON} from '../../skeleton/anim/serialization.ts'
import {focusPanel} from '../../ui/entity_control_panel.ts'

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

    const updater = (dt: number): void => {
        void dt
        keyboardCamera.updater()
        timeline.updater(dt)
    }

    return {
        updater,
        setCameraOrientation: (yaw: number, pitch: number) => orbit.setOrientation(yaw, pitch),
        exit: () => window.location.reload(),
    }
}