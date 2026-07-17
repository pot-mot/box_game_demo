import type {Mesh, Vector3} from 'three'

export interface WaterBlockConfig {
    width: number
    height: number
    depth: number
}

export interface WaterBlock {
    id: number
    config: WaterBlockConfig
    mesh: Mesh
    position: Vector3
}

export interface WaterBoxContext {
    addBlock: (config: WaterBlockConfig, x: number, y: number, z: number) => WaterBlock
    removeBlock: (id: number) => void
    updateBlockSize: (id: number, partial: Partial<WaterBlockConfig>) => void
    setBlockPosition: (id: number, pos: {x: number; y: number; z: number}) => void
    getBlocks: () => WaterBlock[]
    getBlockMeshes: () => Mesh[]
    selectBlock: (id: number | undefined) => WaterBlock | undefined
    getSelected: () => WaterBlock | undefined
    selectedId: number | undefined
    update: (time: number) => void
}

export interface WaterPanelContext {
    showForBox: (config: WaterBlockConfig, pos: {x: number; y: number; z: number}) => void
    hide: () => void
}
