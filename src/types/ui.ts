import type {BoxConfig} from './physics.ts'

export interface PanelContext {
    showForBox: (config: BoxConfig, pos: { x: number; y: number; z: number }, rotDeg: {
        x: number;
        y: number;
        z: number
    }) => void
    hide: () => void
}
