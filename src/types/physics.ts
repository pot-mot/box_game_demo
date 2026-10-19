export interface EntityTickHandler {
    preSync?(dt: number, time: number): void
    /** 每个物理步末记录渲染插值状态（前一物理状态 / 当前物理状态） */
    captureRenderState?(): void
    /** 渲染帧写变换：alpha ∈ [0,1) 为两个物理状态之间的插值系数 */
    syncPositions(alpha?: number): void
    postSync?(dt: number, time: number): void
}
