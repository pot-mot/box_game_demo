import {CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace, Color} from 'three'
import {SURFACE_MATERIAL_DEFS} from './defs.ts'
import {SURFACE_MATERIAL_INDEX, type SurfaceMaterialId} from './ids.ts'
import {drawMaterialTile} from './patterns.ts'
import {MATERIAL_PATTERN_SEED, MATERIAL_TILE_PX} from './constants.ts'
import {SURFACE_GRID_COLOR} from '../constants.ts'

const finishTexture = (canvas: HTMLCanvasElement): CanvasTexture => {
    const tex = new CanvasTexture(canvas)
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.magFilter = NearestFilter
    tex.minFilter = NearestFilter
    tex.generateMipmaps = false
    tex.colorSpace = SRGBColorSpace
    tex.needsUpdate = true
    return tex
}

/** 单块材质为可平铺纹理：贪心合并后 UV 以「格」为单位跨越，需 RepeatWrapping */
export const buildSurfaceTexture = (id: SurfaceMaterialId): CanvasTexture => {
    const canvas = document.createElement('canvas')
    canvas.width = MATERIAL_TILE_PX
    canvas.height = MATERIAL_TILE_PX
    const ctx = canvas.getContext('2d')
    if (ctx) {
        drawMaterialTile(ctx, SURFACE_MATERIAL_DEFS[id], 0, 0, MATERIAL_TILE_PX, MATERIAL_PATTERN_SEED + SURFACE_MATERIAL_INDEX[id])
    }
    return finishTexture(canvas)
}

/**
 * 箱子 / 碎片专用表面纹理：材质图案 + 每格网格线（烘焙进纹理，重复平铺即成网格）。
 * 与 `buildSurfaceTexture` 的区别仅在于叠加网格线边框，供 `MeshStandardMaterial` 直接使用
 * （不再需要自定义着色器叠加网格遮罩）。
 */
export const buildSurfaceGridTexture = (id: SurfaceMaterialId): CanvasTexture => {
    const canvas = document.createElement('canvas')
    canvas.width = MATERIAL_TILE_PX
    canvas.height = MATERIAL_TILE_PX
    const ctx = canvas.getContext('2d')
    if (ctx) {
        drawMaterialTile(ctx, SURFACE_MATERIAL_DEFS[id], 0, 0, MATERIAL_TILE_PX, MATERIAL_PATTERN_SEED + SURFACE_MATERIAL_INDEX[id])
        /* 平铺接缝处的边框线：只画左 / 上边缘，相邻格拼合即形成 1px 网格线 */
        ctx.globalAlpha = 0.6
        ctx.fillStyle = '#' + new Color(SURFACE_GRID_COLOR).getHexString()
        ctx.fillRect(0, 0, 1, MATERIAL_TILE_PX)
        ctx.fillRect(0, 0, MATERIAL_TILE_PX, 1)
        ctx.globalAlpha = 1
    }
    return finishTexture(canvas)
}
