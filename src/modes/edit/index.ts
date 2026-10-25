import {type PerspectiveCamera, type Scene, type WebGLRenderer, type Object3D} from 'three'
import type {EntityInfoSource} from '../../entity/box/base/types/entity_info.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import type {BuildingGeneratorContext} from '../../entity/building_generator/types/index.ts'
import {createBuildingBrush} from '../../entity/building_generator/edit/brush.ts'
import {setupBuildingBrushPanel} from '../../entity/building_generator/ui/brush_panel.ts'
import type {SpawnMode} from '../../types/spawnMode.ts'
import {setupSpawnModeManager} from './spawn_mode.ts'
import {setupPointerInteraction} from './pointer_interaction.ts'
import {setupSpawnModePanel} from '../../ui/spawn_mode_panel.ts'
import {setupElementListPanel} from '../../ui/element_list_panel.ts'
import {setupEditDebugPanel, type EditDebugViewSource} from './debug_view_panel.ts'
import {setupExecutePanel, type ExecutePanel} from './execute_panel.ts'
import {createTransformGizmo} from './transform_gizmo.ts'
import {getCurrentPanel} from '../../ui/entity_control_panel.ts'
import {createCameraControl} from '../control/camera_control.ts'
import {setupTerrainSculpt} from '../../entity/terrain/base/edit/sculpt.ts'
import {setupTerrainSculptPanel} from '../../entity/terrain/base/ui/sculpt_panel.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../input/types.ts'
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
    building: BuildingGeneratorContext,
    excludeFromBackground: (obj: Object3D) => void,
    characterDebug: EditDebugViewSource,
): EditModeController => {
    // 编辑控制
    const cameraControl = createCameraControl(camera, renderer.domElement, {
        pointerActions: MOUSE_ACTIONS_BY_MODE.edit,
        keyboardFreeFlight: true,
        panEnabled: true,
        zoomEnabled: true,
    })
    /* 以当前相机位姿初始化偏航/俯仰（保持主渲染器默认第一人称视角，而非轨道相机默认观察点） */
    cameraControl.setOrientation(camera.rotation.y, camera.rotation.x)
    const spawnMode = setupSpawnModeManager()

    // 变换 Gizmo
    const gizmo = createTransformGizmo()
    scene.add(gizmo.group)
    /* 折射背景渲染时排除 gizmo，避免水面上出现残影镜像 */
    excludeFromBackground(gizmo.group)

    const pointer = setupPointerInteraction(camera, renderer, systems, spawnMode.getSpawnMode, gizmo, cameraControl.setEnabled)

    /* 建造笔刷：启用时关闭实体选中 / 生成交互（相机旋转仍可用，拖拽不触发放置） */
    const brush = createBuildingBrush(building, camera, renderer.domElement)
    setupBuildingBrushPanel(brush, building, (enabled) => {
        pointer.setEnabled(!enabled)
    })

    /* 地形雕刻：仅在选中地形且主动勾选时拦截滚轮，勾选期间只关闭相机缩放、保留旋转 / 平移与实体选中 */
    const terrainSculpt = setupTerrainSculpt(camera, renderer.domElement, terrainSources)
    setupTerrainSculptPanel(terrainSculpt, terrainSources, (enabled) => {
        cameraControl.setZoomEnabled(!enabled)
    })

    // 执行面板
    const executePanel = setupExecutePanel()

    // UI 面板
    const spawnModePanelUpdate = setupSpawnModePanel(spawnMode.getSpawnMode, spawnMode.setSpawnMode)
    setupEditDebugPanel(characterDebug)
    const elementListPanelUpdate = setupElementListPanel(systems, {top: 216})

    const updater = (dt: number): void => {
        cameraControl.update(dt)
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
        setCameraOrientation: (yaw: number, pitch: number) => { cameraControl.setOrientation(yaw, pitch) },
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
