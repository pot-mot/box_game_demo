import {BoxGeometry, CanvasTexture, Mesh, MeshStandardMaterial, NearestFilter} from 'three'
import {
    BACK_DARKEN_RATIO,
    FACE_CANVAS_SIZE,
    MODEL_ROUGHNESS,
    SIDE_DARKEN_RATIO,
    darkenColor,
} from './constants.ts'

/** 方块人部件调色板 */
export interface BoxPartPalette {
    readonly skinColor: number
    readonly hairColor: number
    readonly bodyColor: number
    readonly legColor: number
}

/** 可跟踪的方块部件（几何/材质生命周期由调用方统一管理） */
export interface TrackedBoxPart {
    readonly mesh: Mesh
    readonly geometry: BoxGeometry
    readonly materials: readonly MeshStandardMaterial[]
}

/**
 * 创建六面独立材质的 BoxGeometry 部件（正面亮 / 侧面暗 / 背面最暗）。
 * BoxGeometry 面序：0=+X右, 1=-X左, 2=+Y顶, 3=-Y底, 4=+Z前, 5=-Z后
 */
export const createBoxMaterial = (color: number, map?: CanvasTexture): MeshStandardMaterial => {
    /* 仅在 map 非 undefined 时传入该字段 —— 显式传 {map: undefined} 会触发
     * Three.js setValues 的 "parameter 'map' has value of undefined" 警告 */
    if (map === undefined) {
        return new MeshStandardMaterial({color, roughness: MODEL_ROUGHNESS, metalness: 0.1})
    }
    return new MeshStandardMaterial({color, roughness: MODEL_ROUGHNESS, metalness: 0.1, map})
}

/** 创建正面亮 / 侧面暗 / 背面最暗的多材质 Box 部件 */
export const createTwoFaceBoxPart = (w: number, h: number, d: number, frontColor: number): TrackedBoxPart => {
    const geometry = new BoxGeometry(w, h, d)
    const sideColor = darkenColor(frontColor, SIDE_DARKEN_RATIO)
    const backColor2 = darkenColor(frontColor, BACK_DARKEN_RATIO)
    const materials = [
        createBoxMaterial(sideColor),
        createBoxMaterial(sideColor),
        createBoxMaterial(frontColor),
        createBoxMaterial(darkenColor(frontColor, 0.6)),
        createBoxMaterial(frontColor),
        createBoxMaterial(backColor2),
    ]
    const mesh = new Mesh(geometry, materials)
    mesh.castShadow = true
    return {mesh, geometry, materials}
}

/** 创建头部部件：前面=脸部 CanvasTexture，其他面=头发色 */
export const createHeadBoxPart = (w: number, h: number, d: number, palette: BoxPartPalette): TrackedBoxPart => {
    const geometry = new BoxGeometry(w, h, d)
    const faceTexture = drawFaceCanvas(palette.skinColor)

    const materials = [
        createBoxMaterial(palette.hairColor),
        createBoxMaterial(palette.hairColor),
        createBoxMaterial(palette.hairColor),
        createBoxMaterial(palette.skinColor),
        createBoxMaterial(palette.skinColor, faceTexture),
        createBoxMaterial(darkenColor(palette.hairColor, 0.8)),
    ]
    const mesh = new Mesh(geometry, materials)
    mesh.castShadow = true
    return {mesh, geometry, materials}
}

/** Canvas 绘制像素风脸部 */
export const drawFaceCanvas = (skinColor: number): CanvasTexture => {
    const size = FACE_CANVAS_SIZE
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const r = (skinColor >> 16) & 0xff
    const g = (skinColor >> 8) & 0xff
    const b = skinColor & 0xff
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, size, size)

    const ex = 38
    const ey = 46
    const ew = 11
    const eh = 13

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(ex, ey, ew, eh, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size - ex, ey, ew, eh, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.ellipse(ex + 2, ey + 1, 5, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size - ex - 2, ey + 1, 5, 6, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#332020'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(size / 2, 70, 16, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()

    const texture = new CanvasTexture(canvas)
    texture.minFilter = NearestFilter
    texture.magFilter = NearestFilter
    return texture
}

/** 安全获取 mesh 的 6 面材质数组，非 MeshStandardMaterial 时返回 undefined */
const getBoxMaterials = (mesh: Mesh): MeshStandardMaterial[] | undefined => {
    const materials = mesh.material
    if (Array.isArray(materials) && materials.length >= 6 && materials[0] instanceof MeshStandardMaterial) {
        return materials as MeshStandardMaterial[]
    }
    return undefined
}

/** 按 frontColor 原地更新 twoFaceBox 的 6 面材质颜色 */
export const recolorTwoFaceBoxPart = (mesh: Mesh, frontColor: number): void => {
    const materials = getBoxMaterials(mesh)
    if (materials === undefined) return
    const sideColor = darkenColor(frontColor, SIDE_DARKEN_RATIO)
    const backColor = darkenColor(frontColor, BACK_DARKEN_RATIO)
    materials[0].color.set(sideColor)
    materials[1].color.set(sideColor)
    materials[2].color.set(frontColor)
    materials[3].color.set(darkenColor(frontColor, 0.6))
    materials[4].color.set(frontColor)
    materials[5].color.set(backColor)
}

/** 按新调色板原地更新头部部件材质颜色（含脸部纹理重建） */
export const recolorHeadBoxPart = (mesh: Mesh, palette: BoxPartPalette): void => {
    const materials = getBoxMaterials(mesh)
    if (materials === undefined) return
    materials[0].color.set(palette.hairColor)
    materials[1].color.set(palette.hairColor)
    materials[2].color.set(palette.hairColor)
    materials[3].color.set(palette.skinColor)
    materials[4].color.set(palette.skinColor)
    materials[5].color.set(darkenColor(palette.hairColor, 0.8))

    const oldTexture = materials[4].map
    if (oldTexture !== null) oldTexture.dispose()
    materials[4].map = drawFaceCanvas(palette.skinColor)
    materials[4].needsUpdate = true
}

/** 释放部件几何与全部材质 */
export const disposeBoxPart = (part: TrackedBoxPart): void => {
    part.mesh.removeFromParent()
    part.geometry.dispose()
    for (const material of part.materials) material.dispose()
}