import {BoxGeometry, CanvasTexture, Mesh, MeshStandardMaterial, NearestFilter} from 'three'
import {
    BACK_DARKEN_RATIO,
    BONE_IVORY_COLOR,
    ELF_GOLDEN_HAIR_COLOR,
    FACE_CANVAS_SIZE,
    MODEL_ROUGHNESS,
    SIDE_DARKEN_RATIO,
    darkenColor,
} from './constants.ts'

/** 种族脸部形状（骷髅 / 兽人 / 精灵）：render 层自持的联合类型，避免反向依赖 entity 层的 LimbRace */
export const RACE_FACE_KINDS = ['skeleton', 'orc', 'elf'] as const
export type RaceFaceKind = typeof RACE_FACE_KINDS[number]

/** 种族脸部纹理的语义（方块人种族肢体共用）：皮肤底色 + 面部主色（骷髅眼窝 / 兽人深色）+ 点缀色 */
export interface RaceFacePalette {
    /** 脸部底色（皮 / 骨 / 绿皮的亮面） */
    readonly baseColor: number
    /** 面部细节主色（眼窝 / 眉骨 / 嘴缝） */
    readonly faceColor: number
    /** 点缀色（兽人獠牙 / 精灵面部纹路） */
    readonly accentColor: number
}

/** 数值颜色 → CSS rgb 字符串 */
const colorToCss = (color: number): string =>
    `rgb(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff})`

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

/**
 * Canvas 绘制像素风**种族脸部**（骷髅眼窝 / 兽人獠牙 / 精灵纹路）：与 `drawFaceCanvas` 同风格，
 * 由种族肢体头部使用；文字与几何装饰仍由 `armor_mesh` 的种族 gen 负责。
 */
export const drawRaceFaceCanvas = (
    race: RaceFaceKind,
    palette: RaceFacePalette,
): CanvasTexture => {
    const size = FACE_CANVAS_SIZE
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = colorToCss(palette.baseColor)
    ctx.fillRect(0, 0, size, size)

    const ex = 38
    const ey = 46
    const ew = 11
    const eh = 13

    if (race === 'skeleton') {
        /* 骷髅：深色空洞眼窝（外圈骨缘 + 内腔暗影）+ 三角鼻 + 上颌牙列 */
        /* 眼窝：先画骨缘浅色外圈，再填深色内腔，强化「镂空」层次 */
        ctx.fillStyle = colorToCss(darkenColor(palette.baseColor, 0.7))
        ctx.beginPath()
        ctx.ellipse(ex, ey, ew * 1.4, eh * 1.15, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(size - ex, ey, ew * 1.4, eh * 1.15, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = colorToCss(palette.faceColor)
        ctx.beginPath()
        ctx.ellipse(ex, ey, ew * 1.15, eh, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(size - ex, ey, ew * 1.15, eh, 0, 0, Math.PI * 2)
        ctx.fill()
        /* 眼窝高光点（骨腔内微光） */
        ctx.fillStyle = colorToCss(darkenColor(palette.faceColor, 1.8))
        ctx.fillRect(ex - 1, ey - 2, 4, 4)
        ctx.fillRect(size - ex - 3, ey - 2, 4, 4)
        /* 鼻腔：倒三角 */
        ctx.fillStyle = colorToCss(palette.faceColor)
        ctx.beginPath()
        ctx.moveTo(size / 2 - 5, 56)
        ctx.lineTo(size / 2 + 5, 56)
        ctx.lineTo(size / 2, 72)
        ctx.closePath()
        ctx.fill()
        /* 上颌牙列：深底 + 象牙白牙缝 */
        ctx.fillStyle = colorToCss(darkenColor(palette.faceColor, 0.7))
        ctx.fillRect(size / 2 - 16, 74, 32, 14)
        ctx.fillStyle = colorToCss(BONE_IVORY_COLOR)
        for (let i = 0; i < 5; i++) ctx.fillRect(size / 2 - 15 + i * 7, 75, 4, 12)
        /* 颧骨 / 骨缝：竖向细线 */
        ctx.strokeStyle = colorToCss(darkenColor(palette.baseColor, 0.78))
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(size / 2 - 20, 58)
        ctx.lineTo(size / 2 - 24, 74)
        ctx.moveTo(size / 2 + 20, 58)
        ctx.lineTo(size / 2 + 24, 74)
        ctx.stroke()
    } else if (race === 'orc') {
        /* 兽人：小眼 + 粗眉骨 + 咧嘴獠牙 */
        ctx.fillStyle = colorToCss(palette.faceColor)
        ctx.beginPath()
        ctx.ellipse(ex + 2, ey + 2, ew * 0.7, eh * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(size - ex - 2, ey + 2, ew * 0.7, eh * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()
        /* 眉骨 */
        ctx.fillStyle = colorToCss(palette.accentColor)
        ctx.fillRect(ex - 9, ey - 11, 20, 5)
        ctx.fillRect(size - ex - 11, ey - 11, 20, 5)
        /* 嘴 + 上翘獠牙 */
        ctx.fillStyle = colorToCss(darkenColor(palette.faceColor, 0.8))
        ctx.fillRect(size / 2 - 12, 74, 24, 9)
        ctx.fillStyle = colorToCss(BONE_IVORY_COLOR)
        ctx.beginPath()
        ctx.moveTo(size / 2 - 9, 74)
        ctx.lineTo(size / 2 - 3, 74)
        ctx.lineTo(size / 2 - 6, 68)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(size / 2 + 3, 74)
        ctx.lineTo(size / 2 + 9, 74)
        ctx.lineTo(size / 2 + 6, 68)
        ctx.closePath()
        ctx.fill()
    } else {
        /* 日式精灵：大眼 + 睫毛 + 柔和小鼻小口 + 腮红（女性化），发色落地为金发 */
        const hairCss = colorToCss(ELF_GOLDEN_HAIR_COLOR)
        /* 眼：眼白 + 大虹膜 + 高光 */
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.ellipse(ex, ey + 1, ew * 1.25, eh * 0.95, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(size - ex, ey + 1, ew * 1.25, eh * 0.95, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = colorToCss(palette.faceColor)
        ctx.beginPath()
        ctx.ellipse(ex + 1, ey + 1, ew * 0.72, eh * 0.8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(size - ex - 1, ey + 1, ew * 0.72, eh * 0.8, 0, 0, Math.PI * 2)
        ctx.fill()
        /* 瞳孔高光 */
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(ex - 2, ey - 4, 4, 4)
        ctx.fillRect(size - ex - 2, ey - 4, 4, 4)
        /* 睫毛：上眼线上挑 + 外眼角加粗；下眼线细 */
        ctx.strokeStyle = colorToCss(darkenColor(palette.faceColor, 0.6))
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(ex - 13, ey - 4)
        ctx.quadraticCurveTo(ex, ey - 14, ex + 13, ey - 6)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(size - ex + 13, ey - 4)
        ctx.quadraticCurveTo(size - ex, ey - 14, size - ex - 13, ey - 6)
        ctx.stroke()
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(ex - 11, ey + 8)
        ctx.lineTo(ex + 10, ey + 8)
        ctx.moveTo(size - ex + 11, ey + 8)
        ctx.lineTo(size - ex - 10, ey + 8)
        ctx.stroke()
        /* 柔和小鼻 */
        ctx.strokeStyle = colorToCss(darkenColor(palette.baseColor, 0.75))
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(size / 2, 58)
        ctx.lineTo(size / 2 - 3, 66)
        ctx.lineTo(size / 2 + 3, 66)
        ctx.stroke()
        /* 小口（樱唇） */
        ctx.fillStyle = '#c96b6b'
        ctx.beginPath()
        ctx.ellipse(size / 2, 78, 5, 3, 0, 0, Math.PI * 2)
        ctx.fill()
        /* 腮红 */
        ctx.fillStyle = 'rgba(232,154,160,0.55)'
        ctx.beginPath()
        ctx.ellipse(ex + 6, 70, 6, 4, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(size - ex - 6, 70, 6, 4, 0, 0, Math.PI * 2)
        ctx.fill()
        /* 额前刘海（金发，压住额顶） */
        ctx.fillStyle = hairCss
        ctx.fillRect(0, 0, size, 26)
        ctx.beginPath()
        ctx.moveTo(ex - 10, 26)
        ctx.lineTo(ex + 4, 26)
        ctx.lineTo(ex - 3, 34)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(size - ex + 10, 26)
        ctx.lineTo(size - ex - 4, 26)
        ctx.lineTo(size - ex + 3, 34)
        ctx.closePath()
        ctx.fill()
    }

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