import type {Mesh, LineSegments} from 'three'
import type {Body} from 'cannon-es'

/** 箱子的配置参数 */
export interface BoxConfig {
    width: number
    height: number
    depth: number
    mass: number
    friction: number
}

/** 运行时箱子的完整实体，包含物理 body + 渲染 mesh */
export interface PhysicsBox {
    id: number
    mesh: Mesh
    body: Body
    config: BoxConfig
    edges: LineSegments
    wireframe: LineSegments | undefined
}

/** 普通箱子子系统对外 API */
export interface CommonContext {
    addBox: (config: BoxConfig, x: number, y: number, z: number) => PhysicsBox
    removeBox: (id: number) => void
    updateBox: (id: number, config: Partial<BoxConfig>) => void
    setBoxTransform: (id: number, pos: { x: number; y: number; z: number }, rotDeg: {
        x: number;
        y: number;
        z: number
    }) => void
    getBoxes: () => PhysicsBox[]
    getBoxMeshes: () => Mesh[]
    selectBox: (id: number | undefined) => PhysicsBox | undefined
    getSelected: () => PhysicsBox | undefined
    selectedId: number | undefined
}
