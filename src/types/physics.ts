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
    /** Three.js 网格 */
    mesh: Mesh
    /** cannon-es 刚体 */
    body: Body
    config: BoxConfig
    /** 灰色边缘线（始终存在） */
    edges: LineSegments
    /** 选中线框（undefined = 未选中） */
    wireframe: LineSegments | undefined
}

/** 物理子系统对外暴露的公共 API */
export interface PhysicsContext {
    /** 创建箱子 */
    addBox: (config: BoxConfig, x: number, y: number, z: number) => PhysicsBox
    /** 删除箱子（清理 mesh、body 及其材质/几何体） */
    removeBox: (id: number) => void
    /** 局部更新箱子属性（尺寸/质量/摩擦系数） */
    updateBox: (id: number, config: Partial<BoxConfig>) => void
    /** 直接设置箱子的位置和旋转（角度制） */
    setBoxTransform: (id: number, pos: { x: number; y: number; z: number }, rotDeg: {
        x: number;
        y: number;
        z: number
    }) => void
    /** 获取所有箱子 */
    getBoxes: () => PhysicsBox[]
    /** 获取所有箱子的 Mesh 数组（用于 Raycaster 检测） */
    getBoxMeshes: () => Mesh[]
    /** 选中/取消选中箱子（切换青色线框） */
    selectBox: (id: number | undefined) => PhysicsBox | undefined
    /** 获取当前选中的箱子 */
    getSelected: () => PhysicsBox | undefined
    /** 当前选中的箱子 ID */
    selectedId: number | undefined
    /** 步进物理世界（由主循环每帧调用） */
    step: (dt: number) => void
}
