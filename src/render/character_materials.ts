import {CanvasTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type MeshStandardMaterialParameters, type Side} from 'three'

/**
 * 角色统一材质库（低多面体风格）：一套命名材质同时服务生物解剖（皮毛 / 鳞片 / 翅膜…）�? * 硬表面装备（金属 / 皮革 / 布料 / 木料…）。材质一�?*逐实�?*创建（受击闪�?/ 无敌半透明�? * `combat_vfx/material_effects` 会原地改�?color / emissive / opacity，共享单例会串色），
 * 但底�?*程序纹理按需单例复用**（只读，不随实例释放）�? */

/** 材质 id（常量数�?+ 索引类型推导，禁 enum�?*/
export const CHARACTER_MATERIAL_IDS = [
    /* ── 生物解剖 ── */
    'fur', 'mane', 'hide', 'scale', 'belly', 'membrane', 'claw', 'tooth', 'horn', 'hoof', 'eye', 'nose',
    /* ── 硬表面装�?/ 角色表面 ── */
    'metal', 'dark_metal', 'gold', 'leather', 'cloth', 'wood', 'bone', 'gem', 'glass', 'stone', 'skin', 'hair',
] as const
export type CharacterMaterialId = typeof CHARACTER_MATERIAL_IDS[number]

/** 运行时校验字符串是否为合法材质 id（外部数据 / 场景 userData 容错） */
export const isCharacterMaterialId = (value: string): value is CharacterMaterialId =>
    (CHARACTER_MATERIAL_IDS as readonly string[]).includes(value)

/** 程序纹理图案种类（多个材�?id 可共享同一图案纹理�?*/
export type CharacterPatternKind = 'fur' | 'mane' | 'scale' | 'membrane' | 'hide' | 'leather' | 'cloth' | 'wood' | 'metal'

interface CharacterMaterialDef {
    /** 缺省基色（可�?`createCharacterMaterial` �?color 覆盖�?*/
    readonly baseColor: number
    readonly roughness: number
    readonly metalness: number
    /** 低多面体棱面：默认开启（低多边形美术风格�?*/
    readonly flatShading: boolean
    readonly pattern?: CharacterPatternKind
    readonly side?: Side
    readonly emissive?: number
}

const DEFS: Readonly<Record<CharacterMaterialId, CharacterMaterialDef>> = {
    /* ── 生物解剖 ── */
    fur: {baseColor: 0x6b6b6b, roughness: 0.95, metalness: 0.0, flatShading: false, pattern: 'fur'},
    mane: {baseColor: 0x4a4744, roughness: 0.9, metalness: 0.0, flatShading: false, pattern: 'mane'},
    hide: {baseColor: 0x8a6a4a, roughness: 0.85, metalness: 0.0, flatShading: false, pattern: 'hide'},
    scale: {baseColor: 0x4a6b3a, roughness: 0.55, metalness: 0.15, flatShading: false, pattern: 'scale'},
    belly: {baseColor: 0x7a9a5a, roughness: 0.6, metalness: 0.1, flatShading: false, pattern: 'scale'},
    membrane: {baseColor: 0x6a4a5a, roughness: 0.7, metalness: 0.0, flatShading: false, pattern: 'membrane', side: DoubleSide},
    claw: {baseColor: 0x2f2a24, roughness: 0.35, metalness: 0.2, flatShading: false},
    tooth: {baseColor: 0xf0ead0, roughness: 0.4, metalness: 0.0, flatShading: false},
    horn: {baseColor: 0x2f2a24, roughness: 0.45, metalness: 0.1, flatShading: false},
    hoof: {baseColor: 0x2f2a24, roughness: 0.5, metalness: 0.1, flatShading: false},
    eye: {baseColor: 0x140f08, roughness: 0.2, metalness: 0.0, flatShading: false},
    nose: {baseColor: 0x201814, roughness: 0.5, metalness: 0.0, flatShading: false},
    /* ── 硬表面装�?/ 角色表面 ── */
    metal: {baseColor: 0x8a8f98, roughness: 0.4, metalness: 0.75, flatShading: false, pattern: 'metal'},
    dark_metal: {baseColor: 0x5a5f68, roughness: 0.5, metalness: 0.7, flatShading: false, pattern: 'metal'},
    gold: {baseColor: 0xcaa64a, roughness: 0.35, metalness: 0.85, flatShading: false},
    leather: {baseColor: 0x7a5230, roughness: 0.8, metalness: 0.0, flatShading: false, pattern: 'leather'},
    cloth: {baseColor: 0x8b7d5a, roughness: 0.95, metalness: 0.0, flatShading: false, pattern: 'cloth'},
    wood: {baseColor: 0x8a5a2b, roughness: 0.8, metalness: 0.0, flatShading: false, pattern: 'wood'},
    bone: {baseColor: 0xe6e2d3, roughness: 0.55, metalness: 0.0, flatShading: false},
    gem: {baseColor: 0x44aaff, roughness: 0.15, metalness: 0.3, flatShading: false, emissive: 0x102a44},
    glass: {baseColor: 0xbfe0e0, roughness: 0.12, metalness: 0.1, flatShading: false},
    stone: {baseColor: 0x8a8a86, roughness: 0.95, metalness: 0.0, flatShading: false},
    skin: {baseColor: 0xf0c8a0, roughness: 0.75, metalness: 0.0, flatShading: false},
    hair: {baseColor: 0x3a2218, roughness: 0.85, metalness: 0.0, flatShading: false},
}

/** 纹理边长（像素，可平铺） */
const CHARACTER_TEXTURE_PX = 128
/** 程序纹理随机种子（固定值保证内容稳定可复现�?*/
const CHARACTER_PATTERN_SEED = 20261101

/** mulberry32 伪随机（固定种子，纹理内容可复现�?*/
const createRng = (seed: number): (() => number) => {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6D2B79F5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

/** 按明暗系数生�?CSS 颜色 */
const shade = (color: number, factor: number): string => {
    const r = clamp255(((color >> 16) & 0xff) * factor)
    const g = clamp255(((color >> 8) & 0xff) * factor)
    const b = clamp255((color & 0xff) * factor)
    return `rgb(${r},${g},${b})`
}

/** 在画布上绘制指定图案（低多面体表面细节） */
const drawPattern = (ctx: CanvasRenderingContext2D, kind: CharacterPatternKind, size: number, base: number = DEFS_BY_PATTERN[kind]): void => {
    const rng = createRng(CHARACTER_PATTERN_SEED + kind.length * 97)
    ctx.fillStyle = shade(base, 1)
    ctx.fillRect(0, 0, size, size)
    switch (kind) {
        case 'fur': {
            /* 短促毛簇：密集斜向短�?*/
            for (let i = 0; i < 1600; i++) {
                const x = rng() * size
                const y = rng() * size
                const len = 2 + rng() * 4
                ctx.strokeStyle = shade(base, 0.72 + rng() * 0.56)
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(x + (rng() - 0.5) * 2, y + len)
                ctx.stroke()
            }
            break
        }
        case 'mane': {
            /* 粗长毛束：竖向长�?+ 束状阴影 */
            for (let i = 0; i < 220; i++) {
                const x = rng() * size
                const y = rng() * size
                ctx.strokeStyle = shade(base, 0.6 + rng() * 0.7)
                ctx.lineWidth = 1 + rng() * 2
                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(x + (rng() - 0.5) * 5, y + 10 + rng() * 22)
                ctx.stroke()
            }
            break
        }
        case 'scale': {
            /* 叠瓦鳞片：交错半圆行 */
            const rowH = size / 6
            const colW = size / 5
            for (let row = -1; row < 7; row++) {
                const offset = row % 2 === 0 ? 0 : colW / 2
                for (let col = -1; col < 6; col++) {
                    const cx = col * colW + offset + colW / 2
                    const cy = row * rowH + rowH / 2
                    ctx.fillStyle = shade(base, 0.8 + rng() * 0.4)
                    ctx.beginPath()
                    ctx.arc(cx, cy, colW * 0.55, 0, Math.PI)
                    ctx.fill()
                    ctx.strokeStyle = shade(base, 0.55)
                    ctx.lineWidth = 1
                    ctx.stroke()
                }
            }
            break
        }
        case 'membrane': {
            /* 翅膜：分支脉�?*/
            for (let i = 0; i < 10; i++) {
                ctx.strokeStyle = shade(base, 0.55 + rng() * 0.3)
                ctx.lineWidth = 1
                ctx.beginPath()
                let x = rng() * size
                let y = rng() * size
                ctx.moveTo(x, y)
                for (let s = 0; s < 5; s++) {
                    x += (rng() - 0.5) * size * 0.4
                    y += (rng() - 0.5) * size * 0.4
                    ctx.lineTo(x, y)
                }
                ctx.stroke()
            }
            for (let i = 0; i < 300; i++) {
                ctx.fillStyle = shade(base, 0.85 + rng() * 0.3)
                ctx.fillRect(rng() * size, rng() * size, 1, 1)
            }
            break
        }
        case 'hide': {
            /* 兽皮：细腻斑�?*/
            for (let i = 0; i < 1400; i++) {
                ctx.fillStyle = shade(base, 0.85 + rng() * 0.3)
                ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2)
            }
            break
        }
        case 'leather': {
            /* 皮革：细密颗�?*/
            for (let i = 0; i < 2600; i++) {
                ctx.fillStyle = shade(base, 0.82 + rng() * 0.36)
                ctx.fillRect(rng() * size, rng() * size, 1, 1)
            }
            break
        }
        case 'cloth': {
            /* 织物：纵横交�?*/
            const step = Math.max(3, Math.floor(size / 40))
            for (let i = 0; i < size; i += step) {
                ctx.strokeStyle = shade(base, 0.82)
                ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke()
                ctx.strokeStyle = shade(base, 1.12)
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke()
            }
            break
        }
        case 'wood': {
            /* 木纹：竖向纹�?*/
            const planks = 4
            const pw = size / planks
            for (let p = 0; p < planks; p++) {
                ctx.fillStyle = shade(base, 0.88 + rng() * 0.24)
                ctx.fillRect(p * pw, 0, pw, size)
                ctx.strokeStyle = shade(base, 0.6)
                ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo((p + 1) * pw, 0); ctx.lineTo((p + 1) * pw, size); ctx.stroke()
                for (let g = 0; g < 5; g++) {
                    const gx = p * pw + (0.2 + 0.6 * rng()) * pw
                    ctx.strokeStyle = shade(base, 0.7)
                    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx + (rng() - 0.5) * 6, size); ctx.stroke()
                }
            }
            break
        }
        case 'metal': {
            /* 金属：横向拉�?+ 高光 */
            for (let i = 0; i < 200; i++) {
                const y = rng() * size
                ctx.strokeStyle = shade(base, 0.8 + rng() * 0.5)
                ctx.lineWidth = 1
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke()
            }
            break
        }
    }
}

/** 图案 �?取色基准色（与材�?def 分离：图案可被多 id 复用�?*/
const DEFS_BY_PATTERN: Readonly<Record<CharacterPatternKind, number>> = {
    fur: 0x6b6b6b, mane: 0x4a4744, scale: 0x4a6b3a, membrane: 0x6a4a5a,
    hide: 0x8a6a4a, leather: 0x7a5230, cloth: 0x8b7d5a, wood: 0x8a5a2b, metal: 0x8a8f98,
}

let _textures: Map<string, CanvasTexture | null> | undefined

/**
 * 中性花纹底色：仅提供明暗纹理，不携带色相。
 * 供「换色材质」使用——材质 `color` 决定色相，贴图只贡献鳞片 / 毛发 / 皮肤细节。
 */
const NEUTRAL_PATTERN_BASE = 0xffffff

/**
 * 取图案共享纹理单例（可平铺）；无 2D 上下文（如 happy-dom 测试环境）时返回 undefined。
 * `neutral = true` 时生成无彩色（白色基准）图案，只保留明暗细节，避免换色时把底图色相乘进来。
 * 单例只读，**不得**随实例释放；测试经 `disposeCharacterMaterialTextures` 统一清理。
 */
export const getCharacterMaterialTexture = (kind: CharacterPatternKind, neutral = false): CanvasTexture | undefined => {
    if (_textures === undefined) _textures = new Map()
    const cacheKey = neutral ? `${kind}:neutral` : kind
    const cached = _textures.get(cacheKey)
    if (cached !== undefined) return cached ?? undefined
    const canvas = document.createElement('canvas')
    canvas.width = CHARACTER_TEXTURE_PX
    canvas.height = CHARACTER_TEXTURE_PX
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
        _textures.set(cacheKey, null)
        return undefined
    }
    /* 部分测试环境（happy-dom）仅提供不完整的 2D 上下文：绘制失败时安全回退为无纹理 */
    try {
        drawPattern(ctx, kind, CHARACTER_TEXTURE_PX, neutral ? NEUTRAL_PATTERN_BASE : undefined)
    } catch {
        _textures.set(cacheKey, null)
        return undefined
    }
    const tex = new CanvasTexture(canvas)
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.magFilter = LinearFilter
    tex.minFilter = LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.colorSpace = SRGBColorSpace
    tex.needsUpdate = true
    _textures.set(cacheKey, tex)
    return tex
}

/** 创建一�?*逐实�?*材质（可被受�?无敌效果原地改写）；可�?color 覆盖缺省基色 */
export const createCharacterMaterial = (
    id: CharacterMaterialId,
    color?: number,
    options?: {readonly neutralPattern?: boolean},
): MeshStandardMaterial => {
    const def = DEFS[id]
    const params: MeshStandardMaterialParameters = {
        color: color ?? def.baseColor,
        roughness: def.roughness,
        metalness: def.metalness,
        flatShading: def.flatShading,
    }
    if (def.side !== undefined) params.side = def.side
    if (def.emissive !== undefined) params.emissive = def.emissive
    if (def.pattern !== undefined) {
        const tex = getCharacterMaterialTexture(def.pattern, options?.neutralPattern === true)
        if (tex !== undefined) params.map = tex
    }
    return new MeshStandardMaterial(params)
}

/** 释放全部共享纹理（仅测试 / 销毁渲染器时调用；共享纹理不得随实例释放） */
export const disposeCharacterMaterialTextures = (): void => {
    if (_textures === undefined) return
    for (const tex of _textures.values()) tex?.dispose()
    _textures = undefined
}
