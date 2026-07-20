export interface EntityTickHandler {
    preSync?(dt: number, time: number): void
    syncPositions(): void
    postSync?(dt: number, time: number): void
}
