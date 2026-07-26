import {CanvasTexture, RepeatWrapping, BoxGeometry, Color, type BufferAttribute} from 'three'
import {TEX_SIZE, TEX_DIV} from './constants.ts'

let _gridMask: CanvasTexture | undefined

/** 生成网格遮罩 CanvasTexture 单例（白线 + 透明底），供箱体 ShaderMaterial 使用 */
export const gridMaskTexture = (): CanvasTexture => {
    if (_gridMask) return _gridMask
    const canvas = document.createElement('canvas')
    canvas.width = TEX_SIZE
    canvas.height = TEX_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    const step = TEX_SIZE / TEX_DIV
    for (let i = 0; i <= TEX_DIV; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, TEX_SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(TEX_SIZE, i * step); ctx.stroke()
    }
    _gridMask = new CanvasTexture(canvas)
    _gridMask.wrapS = RepeatWrapping
    _gridMask.wrapT = RepeatWrapping
    return _gridMask
}

const _terrainTexCache = new Map<string, CanvasTexture>()

/** 生成带色网格 CanvasTexture（底色 + 网格线已烘焙），供地形 MeshBasicMaterial 使用 */
export const coloredGridTexture = (baseColor: number, gridColor: number): CanvasTexture => {
    const key = `${baseColor}_${gridColor}`
    const cached = _terrainTexCache.get(key)
    if (cached) return cached
    const canvas = document.createElement('canvas')
    canvas.width = TEX_SIZE
    canvas.height = TEX_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#' + new Color(baseColor).getHexString()
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
    ctx.strokeStyle = '#' + new Color(gridColor).getHexString()
    ctx.lineWidth = 1
    const step = TEX_SIZE / TEX_DIV
    for (let i = 0; i <= TEX_DIV; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, TEX_SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(TEX_SIZE, i * step); ctx.stroke()
    }
    const tex = new CanvasTexture(canvas)
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    _terrainTexCache.set(key, tex)
    return tex
}

/** 按 face 尺寸缩放 BoxGeometry 的 UV，使纹理以 tileSize 为单位平铺 */
export const scaleBoxUVs = (
    geometry: BoxGeometry,
    width: number,
    height: number,
    depth: number,
    tileSize: number,
): void => {
    const uvs = geometry.attributes.uv as BufferAttribute
    const scales: readonly [number, number][] = [
        [depth / tileSize, height / tileSize],   // +X
        [depth / tileSize, height / tileSize],   // -X
        [width / tileSize, depth / tileSize],    // +Y
        [width / tileSize, depth / tileSize],    // -Y
        [width / tileSize, height / tileSize],   // +Z
        [width / tileSize, height / tileSize],   // -Z
    ]
    for (let face = 0; face < 6; face++) {
        const [sU, sV] = scales[face]
        for (let v = 0; v < 4; v++) {
            const i = face * 4 + v
            uvs.setXY(i, uvs.getX(i) * sU, uvs.getY(i) * sV)
        }
    }
    uvs.needsUpdate = true
}
