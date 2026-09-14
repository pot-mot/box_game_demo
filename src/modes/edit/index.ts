import {type PerspectiveCamera, type Scene, type WebGLRenderer, type Object3D} from 'three'
import type {EntityInfoSource} from '../../entity/box/base/types/entity_info.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import type {SpawnMode} from '../../types/spawnMode.ts'
import {setupMouseOrbit, setupKeyboardCamera} from '../camera_common.ts'
import {setupSpawnModeManager} from './spawn_mode.ts'
import {setupPointerInteraction} from './pointer_interaction.ts'
import {setupSpawnModePanel} from '../../ui/spawn_mode_panel.ts'
import {setupElementListPanel} from '../../ui/element_list_panel.ts'
import {setupExecutePanel, type ExecutePanel} from './execute_panel.ts'
import {createTransformGizmo} from './transform_gizmo.ts'
import {getCurrentPanel} from '../../ui/entity_control_panel.ts'
import {GIZMO_SCALE_FACTOR} from './constants.ts'
import {CHARACTER_ENTITY_TYPE} from '../../entity/constants.ts'

export interface EditModeController {
    updater: (dt: number) => void
    setCameraOrientation: (yaw: number, pitch: number) => void
    spawnMode: {
        getSpawnMode: () => SpawnMode
        setSpawnMode: (mode: SpawnMode) => void
    }
    execute: Omit<ExecutePanel, 'update'>
}

export const setupEditMode = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    scene: Scene,
    systems: EntityInfoSource[],
    terrainSources: TerrainContext[],
    _terrainSource: TerrainContext,
    excludeFromBackground: (obj: Object3D) => void,
): EditModeController => {
    // 编辑控制
    const orbit = setupMouseOrbit(camera, renderer.domElement)
    const keyboardCamera = setupKeyboardCamera(camera)
    const spawnMode = setupSpawnModeManager()

    // 变换 Gizmo
    const gizmo = createTransformGizmo()
    scene.add(gizmo.group)
    /* 折射背景渲染时排除 gizmo，避免水面上出现残影镜像 */
    excludeFromBackground(gizmo.group)

    const pointer = setupPointerInteraction(camera, renderer, systems, spawnMode.getSpawnMode, terrainSources, gizmo, orbit.setEnabled)

    keyboardCamera.setEnabled(true)

    // 执行面板
    const executePanel = setupExecutePanel()

    // UI 面板
    const spawnModePanelUpdate = setupSpawnModePanel(spawnMode.getSpawnMode, spawnMode.setSpawnMode)
    const elementListPanelUpdate = setupElementListPanel(systems)

    const updater = (_dt: number): void => {
        keyboardCamera.updater()
        executePanel.update()
        spawnModePanelUpdate()
        elementListPanelUpdate()

        /** 更新 gizmo 位置/旋转跟随选中实体 */
        let hasSelection = false
        let isCharacter = false
        for (const source of systems) {
            const selId = source.getSelectedId()
            if (selId !== undefined) {
                const entity = source.getEntityList().find(e => e.id === selId)
                if (entity) {
                    gizmo.group.position.copy(entity.mesh.position)
                    /** gizmo 每帧对齐实体当前旋转：圆弧实时反映旋转角度（拖拽中也跟随） */
                    gizmo.group.quaternion.copy(entity.mesh.quaternion)
                    /** 根据相机距离缩放 gizmo 保持视觉一致（圆弧随整体缩放） */
                    const dist = camera.position.distanceTo(entity.mesh.position)
                    const scale = dist * GIZMO_SCALE_FACTOR
                    gizmo.group.scale.setScalar(scale)
                    isCharacter = source.type === CHARACTER_ENTITY_TYPE
                    hasSelection = true
                }
                break
            }
        }
        gizmo.setVisible(hasSelection)
        /** 角色仅支持水平面（Y 轴）旋转，隐藏 X/Z 圆弧 */
        gizmo.setRotateAxisVisible('x', !isCharacter)
        gizmo.setRotateAxisVisible('z', !isCharacter)
        /** 每帧刷新 hover/选中高亮透明度 */
        gizmo.setHoverPart(pointer.getHoverPart(camera))
        gizmo.setActivePart(pointer.getActivePart())

        /** 每帧刷新面板输入值（拖拽中实时同步 xyz/角度；输入框聚焦时由 refreshValues 焦点保护跳过） */
        const panel = getCurrentPanel()
        panel?.update?.()
    }

    return {
        updater,
        setCameraOrientation: (yaw: number, pitch: number) => { orbit.setOrientation(yaw, pitch) },
        spawnMode: {
            getSpawnMode: spawnMode.getSpawnMode,
            setSpawnMode: spawnMode.setSpawnMode,
        },
        execute: {
            isExecuting: executePanel.isExecuting,
            pendingSteps: executePanel.pendingSteps,
            onToggle: executePanel.onToggle,
            onReset: executePanel.onReset,
            enqueueSteps: executePanel.enqueueSteps,
            consumeStep: executePanel.consumeStep,
            forceStop: executePanel.forceStop,
        },
    }
}
