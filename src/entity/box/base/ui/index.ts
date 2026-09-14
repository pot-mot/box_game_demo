export interface PanelContext {
    render: (container: HTMLElement) => void
    destroy: () => void
    /** 刷新面板中的输入值（gizmo 拖拽/物理模拟后同步） */
    update?: () => void
}
