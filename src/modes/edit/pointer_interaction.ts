import {Raycaster, Vector2, Vector3, Euler, type PerspectiveCamera, type WebGLRenderer, type Mesh} from 'three'
import type {SpawnMode} from '../../types/spawnMode.ts'
import type {EntityInfoSource} from '../../entity/box/base/types/entity_info.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import {SPAWN_DIST, CLICK_THRESHOLD} from './constants.ts'
import {getInputRegistry} from '../../input/registry.ts'
import {focusPanel} from '../../ui/entity_control_panel.ts'
import type {TransformGizmo, DragState, GizmoPartType} from './transform_gizmo.ts'

/**
 * 指针交互（左键选中 + 「生成物体」绑定生成 + 滚轮雕刻）。
 * 生成键取自操作设置中的「生成物体」绑定（默认右键，可改为其它鼠标键或键盘键）。
 * 返回 setEnabled 控制开关，用于编辑/游玩模式切换。
 */
export const setupPointerInteraction = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    sources: EntityInfoSource[],
    getSpawnMode: () => SpawnMode,
    terrainSources?: TerrainContext[],
    gizmo?: TransformGizmo,
    setOrbitEnabled?: (v: boolean) => void,
): {
    setEnabled: (v: boolean) => void
    isDragging: () => boolean
    getHoverPart: (camera: PerspectiveCamera) => GizmoPartType | undefined
    getActivePart: () => GizmoPartType | undefined
} => {
    const sourcesByType = new Map(sources.map(s => [s.type, s]))
    const input = getInputRegistry()
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let pointerDownPos = {x: 0, y: 0}
    /** 最近一次 pointerdown 是否发生在 canvas 内（window 上的 pointerup 据此过滤外部点击） */
    let downInside = false
    /** 最近一次指针屏幕坐标（hover 检测用，无拖拽时也更新） */
    let lastPointer = {x: NaN, y: NaN}
    let enabled = true
    let dragState: DragState | undefined
    const dragRaycaster = new Raycaster()

    /** 中断拖拽：pointercancel / 窗口失焦时兜底清理，防止 dragState 残留 */
    const cancelDrag = (): void => {
        if (dragState === undefined) return
        dragState = undefined
        setOrbitEnabled?.(true)
    }

    const handlePointerDown = (e: PointerEvent) => {
        if (!enabled) return
        /** 仅左键按下标记 canvas 内起点（右键/中键不参与选中流程） */
        downInside = e.button === 0
        renderer.domElement.focus()
        if (e.button === 0) {
            pointerDownPos = {x: e.clientX, y: e.clientY}
            /** 检查是否点击了 gizmo 部件 */
            if (gizmo) {
                pointer.set(
                    (e.clientX / window.innerWidth) * 2 - 1,
                    -(e.clientY / window.innerHeight) * 2 + 1,
                )
                dragRaycaster.setFromCamera(pointer, camera)
                const partType = gizmo.hitTest(dragRaycaster)
                if (partType) {
                    /** 找到当前选中的实体 */
                    for (const source of sources) {
                        const selId = source.getSelectedId()
                        if (selId !== undefined) {
                            const entity = source.getEntityList().find(e => e.id === selId)
                            if (entity) {
                                const worldPos = entity.mesh.position.clone()
                                const worldQuat = entity.mesh.quaternion.clone()
                                dragState = gizmo.startDrag(
                                    partType, worldPos, worldQuat,
                                    {
                                        onTranslate: (newPos) => {
                                            const rot = entity.mesh.rotation
                                            source.setTransform(selId,
                                                {x: newPos.x, y: newPos.y, z: newPos.z},
                                                {x: rot.x * 180 / Math.PI, y: rot.y * 180 / Math.PI, z: rot.z * 180 / Math.PI},
                                            )
                                        },
                                        onRotate: (newQuat) => {
                                            const euler = new Euler().setFromQuaternion(newQuat, 'XYZ')
                                            /** 实时读取当前位置（避免捕获过期快照） */
                                            const curPos = entity.mesh.position
                                            source.setTransform(selId,
                                                {x: curPos.x, y: curPos.y, z: curPos.z},
                                                {x: euler.x * 180 / Math.PI, y: euler.y * 180 / Math.PI, z: euler.z * 180 / Math.PI},
                                            )
                                        },
                                    },
                                    camera, dragRaycaster,
                                )
                                if (dragState) {
                                    setOrbitEnabled?.(false)
                                    return
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    const handlePointerUp = (e: PointerEvent) => {
        if (!enabled) return
        if (e.button !== 0) return
        /* canvas 外的点击（面板按钮等）不参与选中/清空逻辑 */
        if (!downInside) {
            downInside = false
            return
        }
        downInside = false
        /** 如果正在拖拽 gizmo，结束拖拽 */
        if (dragState) {
            dragState = undefined
            setOrbitEnabled?.(true)
            return
        }
        const dx = e.clientX - pointerDownPos.x
        const dy = e.clientY - pointerDownPos.y
        if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD) return

        pointer.x = (e.clientX / window.innerWidth) * 2 - 1
        pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(pointer, camera)

        const allMeshes = sources.flatMap(s => s.getMeshes())
        if (allMeshes.length === 0) {
            sources.forEach(s => s.select(undefined))
            focusPanel(undefined)
            return
        }

        const hits = raycaster.intersectObjects(allMeshes, false)
        if (hits.length > 0) {
            const hitMesh = hits[0].object as Mesh
            for (const source of sources) {
                const entity = source.getEntityList().find(e => e.mesh === hitMesh)
                if (entity) {
                    sources.forEach(s => s.select(undefined))
                    source.select(entity.id)
                    focusPanel(source.panel)
                    return
                }
            }
        }

        sources.forEach(s => s.select(undefined))
        focusPanel(undefined)
    }

    const handleWheel = (e: WheelEvent) => {
        if (!enabled) return
        if (!terrainSources || terrainSources.length === 0) return
        const hasTerrainSelected = terrainSources.some(ts => ts.getSelectedId() !== undefined)
        if (!hasTerrainSelected) return
        e.preventDefault()

        pointer.x = (e.clientX / window.innerWidth) * 2 - 1
        pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(pointer, camera)

        const terrainMeshes = terrainSources.flatMap(s => s.getMeshes())
        if (terrainMeshes.length === 0) return
        const hits = raycaster.intersectObjects(terrainMeshes, false)
        if (hits.length === 0) return

        const hitMesh = hits[0].object as Mesh
        const hitPoint = hits[0].point
        for (const ts of terrainSources) {
            const entity = ts.getEntityList().find(e => e.mesh === hitMesh)
            if (entity) {
                const dir = e.deltaY > 0 ? -1 : 1
                ts.sculpt(entity.id, hitPoint.x, hitPoint.y, hitPoint.z, dir as 1 | -1)
                return
            }
        }
    }

    /** 在给定屏幕坐标处生成一个当前类型的实体 */
    const spawnAtScreen = (clientX: number, clientY: number): void => {
        const mode = getSpawnMode()
        const source = sourcesByType.get(mode)
        if (!source) return

        pointer.x = (clientX / window.innerWidth) * 2 - 1
        pointer.y = -(clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(pointer, camera)

        const allMeshes = sources.flatMap(s => s.getMeshes())
        const hits = allMeshes.length > 0 ? raycaster.intersectObjects(allMeshes, false) : []
        let spawnPos: Vector3

        if (hits.length > 0 && hits[0].distance <= SPAWN_DIST) {
            spawnPos = hits[0].point
        } else {
            spawnPos = new Vector3()
            raycaster.ray.at(SPAWN_DIST, spawnPos)
        }

        source.spawnAt(spawnPos.x, spawnPos.y, spawnPos.z)
    }

    /** 「生成物体」绑定为鼠标键：在指针处生成（gizmo 拖拽中屏蔽，避免拖拽过程意外创建实体） */
    const handleSpawnPointerDown = (e: PointerEvent) => {
        if (!enabled || dragState) return
        if (!input.matchesMouseButton('spawn_entity', e.button)) return
        e.preventDefault()
        spawnAtScreen(e.clientX, e.clientY)
    }

    /** 「生成物体」绑定为键盘键：在最后记录的指针位置生成（指针从未进入画布时取屏幕中心） */
    const handleSpawnKey = () => {
        if (!enabled || dragState) return
        if (Number.isNaN(lastPointer.x)) {
            spawnAtScreen(window.innerWidth / 2, window.innerHeight / 2)
        } else {
            spawnAtScreen(lastPointer.x, lastPointer.y)
        }
    }

    /** 屏蔽画布右键菜单（生成改由「生成物体」绑定在 pointerdown 触发） */
    const handleContextMenu = (e: MouseEvent) => {
        if (!enabled) return
        e.preventDefault()
    }

    const handlePointerMove = (e: PointerEvent) => {
        /** 始终记录指针位置供 hover 检测 */
        lastPointer = {x: e.clientX, y: e.clientY}
        if (!dragState || !gizmo) return
        e.preventDefault()
        pointer.set(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1,
        )
        dragRaycaster.setFromCamera(pointer, camera)
        gizmo.updateDrag(dragState, camera, dragRaycaster)
    }

    /** 每帧调用：检测鼠标悬停的 gizmo 部件（拖拽中不检测） */
    const getHoverPart = (cam: PerspectiveCamera): GizmoPartType | undefined => {
        /* 鼠标从未移动时不检测，避免屏幕中心哨兵射线误命中 */
        if (!gizmo || dragState || Number.isNaN(lastPointer.x)) return undefined
        pointer.set(
            (lastPointer.x / window.innerWidth) * 2 - 1,
            -(lastPointer.y / window.innerHeight) * 2 + 1,
        )
        dragRaycaster.setFromCamera(pointer, cam)
        return gizmo.hitTest(dragRaycaster)
    }

    /** 每帧调用：当前拖拽中的部件 */
    const getActivePart = (): GizmoPartType | undefined => dragState?.partType

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerdown', handleSpawnPointerDown)
    /* move/up 注册到 window：拖拽拖出 canvas 后仍能跟踪与结束 */
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointermove', handlePointerMove)
    /* pointercancel/失焦兜底：释放事件丢失时结束拖拽，防止幽灵拖拽与相机锁死 */
    window.addEventListener('pointercancel', cancelDrag)
    window.addEventListener('blur', cancelDrag)
    renderer.domElement.addEventListener('wheel', handleWheel)
    renderer.domElement.addEventListener('contextmenu', handleContextMenu)
    /* 键盘绑定「生成物体」时按动作回调触发 */
    input.onActionDown('spawn_entity', handleSpawnKey)

    return {
        setEnabled: (v: boolean) => { enabled = v },
        isDragging: () => dragState !== undefined,
        getHoverPart,
        getActivePart,
    }
}
