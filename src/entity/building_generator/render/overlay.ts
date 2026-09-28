import {BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments} from 'three'
import {VOXEL_SIZE} from '../constants.ts'

/** 选中高亮线框颜色 */
export const SELECTION_OUTLINE_COLOR = 0x35d0ff
/** 区域预览线框颜色 */
export const REGION_PREVIEW_COLOR = 0xffcc33

let _unitEdges: EdgesGeometry | undefined

/** 单位立方体线框几何（共享单例；由缩放表示任意长方体） */
const unitBoxEdges = (): EdgesGeometry => {
    if (_unitEdges === undefined) {
        const box = new BoxGeometry(1, 1, 1)
        _unitEdges = new EdgesGeometry(box)
        box.dispose()
    }
    return _unitEdges
}

/* 线框材质共享单例（永不释放；与 hitbox 调试线材质同策略） */
const selectionMaterial = new LineBasicMaterial({color: SELECTION_OUTLINE_COLOR, transparent: true, opacity: 0.9})
const previewMaterial = new LineBasicMaterial({color: REGION_PREVIEW_COLOR, transparent: true, opacity: 0.85, depthTest: false})

/** 创建盒线框（初始不可见、不参与视锥剔除） */
export const createBoxOutline = (kind: 'selection' | 'preview'): LineSegments => {
    const line = new LineSegments(unitBoxEdges(), kind === 'selection' ? selectionMaterial : previewMaterial)
    line.visible = false
    line.frustumCulled = false
    return line
}

/** 以体素范围（含边界）更新线框盒；min / max 为局部体素坐标 */
export const setBoxOutline = (
    outline: LineSegments,
    min: readonly [number, number, number],
    max: readonly [number, number, number],
): void => {
    const sizeX = (max[0] - min[0] + 1) * VOXEL_SIZE
    const sizeY = (max[1] - min[1] + 1) * VOXEL_SIZE
    const sizeZ = (max[2] - min[2] + 1) * VOXEL_SIZE
    outline.position.set(
        min[0] * VOXEL_SIZE + sizeX / 2,
        min[1] * VOXEL_SIZE + sizeY / 2,
        min[2] * VOXEL_SIZE + sizeZ / 2,
    )
    outline.scale.set(sizeX, sizeY, sizeZ)
    outline.visible = true
    outline.updateMatrixWorld()
}

/** 隐藏线框盒 */
export const hideBoxOutline = (outline: LineSegments): void => {
    outline.visible = false
}
