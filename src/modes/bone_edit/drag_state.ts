/**
 * 拖拽互斥协调器：gizmo 拖拽进行中时骨骼指针跳过处理，避免两个指针模块争夺同一事件。
 * 由模式装配创建并注入两个指针模块，取代原先的模块级可变标志（显式依赖、可测试、可多实例）。
 */
export interface DragCoordinator {
    readonly isGizmoActive: () => boolean
    readonly setGizmoActive: (active: boolean) => void
}

export const createDragCoordinator = (): DragCoordinator => {
    let gizmoActive = false
    return {
        isGizmoActive: () => gizmoActive,
        setGizmoActive: (active) => { gizmoActive = active },
    }
}
