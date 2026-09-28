import {CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace} from 'three'
import {SURFACE_MATERIAL_DEFS} from './defs.ts'
import {SURFACE_MATERIAL_INDEX, type SurfaceMaterialId} from './ids.ts'
import {drawMaterialTile} from './patterns.ts'
import {MATERIAL_PATTERN_SEED, MATERIAL_TILE_PX} from './constants.ts'

/** 单块材质为可平铺纹理：贪心合并后 UV 以「格」为单位跨越，需 RepeatWrapping */
export const buildSurfaceTexture = (id: SurfaceMaterialId): CanvasTexture => {
    const canvas = document.createElement('canvas')
    canvas.width = MATERIAL_TILE_PX
    canvas.height = MATERIAL_TILE_PX
    const ctx = canvas.getContext('2d')
    if (ctx) {
        drawMaterialTile(ctx, SURFACE_MATERIAL_DEFS[id], 0, 0, MATERIAL_TILE_PX, MATERIAL_PATTERN_SEED + SURFACE_MATERIAL_INDEX[id])
    }
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
