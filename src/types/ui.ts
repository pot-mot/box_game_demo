import type {BoxConfig} from './physics.ts'

/** 箱子控制面板的公共 API */
export interface PanelContext {
    /** 显示面板并填充当前选中箱子的数据 */
    showForBox: (config: BoxConfig, pos: { x: number; y: number; z: number }, rotDeg: {
        x: number;
        y: number;
        z: number
    }) => void
    /** 隐藏面板 */
    hide: () => void
}
