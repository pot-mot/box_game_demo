import type {SurfaceMaterialDef} from './defs.ts'

/** mulberry32 伪随机（固定种子保证纹理图集内容稳定可复现） */
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

/** 调整颜色明暗（factor < 1 变暗，> 1 变亮） */
const shade = (color: number, factor: number): string => {
    const r = clamp255(((color >> 16) & 0xff) * factor)
    const g = clamp255(((color >> 8) & 0xff) * factor)
    const b = clamp255((color & 0xff) * factor)
    return `rgb(${r},${g},${b})`
}

const baseCss = (color: number): string => shade(color, 1)

/** 在 (ox, oy) 处绘制一块 size×size 的材质图案 */
export const drawMaterialTile = (
    ctx: CanvasRenderingContext2D,
    def: SurfaceMaterialDef,
    ox: number,
    oy: number,
    size: number,
    seed: number,
): void => {
    const rng = createRng(seed)
    ctx.save()
    ctx.translate(ox, oy)
    ctx.fillStyle = baseCss(def.baseColor)
    ctx.fillRect(0, 0, size, size)
    switch (def.pattern) {
        case 'rock': drawRock(ctx, def, size, rng); break
        case 'soil': drawSoil(ctx, def, size, rng); break
        case 'brick': drawBrick(ctx, def, size, rng); break
        case 'wood': drawWood(ctx, def, size, rng); break
        case 'rust': drawRust(ctx, def, size, rng); break
        case 'tile': drawTile(ctx, def, size, rng); break
        case 'cloth': drawCloth(ctx, def, size, rng); break
    }
    ctx.restore()
}

type Rng = () => number

const drawRock = (ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef, size: number, rng: Rng): void => {
    for (let i = 0; i < 900; i++) {
        const f = 0.82 + rng() * 0.36
        ctx.fillStyle = shade(def.baseColor, f)
        const r = 1 + rng() * 2.5
        ctx.fillRect(rng() * size, rng() * size, r, r)
    }
    ctx.strokeStyle = shade(def.baseColor, 0.6)
    ctx.lineWidth = 1
    for (let c = 0; c < 5; c++) {
        ctx.beginPath()
        let x = rng() * size
        let y = rng() * size
        ctx.moveTo(x, y)
        for (let s = 0; s < 5; s++) {
            x += (rng() - 0.5) * size * 0.35
            y += (rng() - 0.5) * size * 0.35
            ctx.lineTo(x, y)
        }
        ctx.stroke()
    }
}

const drawSoil = (ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef, size: number, rng: Rng): void => {
    for (let i = 0; i < 2400; i++) {
        const f = rng() > 0.5 ? 0.8 + rng() * 0.25 : 1.0 + rng() * 0.2
        ctx.fillStyle = shade(def.baseColor, f)
        ctx.fillRect(rng() * size, rng() * size, 1, 1)
    }
    for (let i = 0; i < 26; i++) {
        ctx.fillStyle = shade(def.baseColor, 0.7 + rng() * 0.5)
        const r = 1.5 + rng() * 3
        ctx.beginPath()
        ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2)
        ctx.fill()
    }
}

const drawBrick = (ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef, size: number, rng: Rng): void => {
    /* 灰浆底 */
    ctx.fillStyle = shade(def.baseColor, 0.55)
    ctx.fillRect(0, 0, size, size)
    const rows = 4
    const bh = size / rows
    const bw = size / 2
    const gap = Math.max(1, size / 64)
    for (let r = 0; r < rows; r++) {
        const offset = r % 2 === 0 ? 0 : -bw / 2
        for (let c = -1; c <= 2; c++) {
            const x = c * bw + offset
            const y = r * bh
            ctx.fillStyle = shade(def.baseColor, 0.85 + rng() * 0.3)
            ctx.fillRect(x + gap, y + gap, bw - gap * 2, bh - gap * 2)
        }
    }
}

const drawWood = (ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef, size: number, rng: Rng): void => {
    const planks = 4
    const pw = size / planks
    for (let p = 0; p < planks; p++) {
        const f = 0.85 + rng() * 0.3
        ctx.fillStyle = shade(def.baseColor, f)
        ctx.fillRect(p * pw, 0, pw, size)
        ctx.strokeStyle = shade(def.baseColor, 0.55)
        ctx.lineWidth = Math.max(1, size / 96)
        ctx.beginPath()
        ctx.moveTo((p + 1) * pw, 0)
        ctx.lineTo((p + 1) * pw, size)
        ctx.stroke()
        ctx.strokeStyle = shade(def.baseColor, 0.7)
        ctx.lineWidth = 1
        for (let g = 0; g < 6; g++) {
            const gx = p * pw + (0.2 + 0.6 * rng()) * pw
            ctx.beginPath()
            ctx.moveTo(gx, 0)
            ctx.lineTo(gx + (rng() - 0.5) * 6, size)
            ctx.stroke()
        }
    }
}

const drawRust = (ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef, size: number, rng: Rng): void => {
    ctx.fillStyle = shade(def.baseColor, 0.7)
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 40; i++) {
        const cx = rng() * size
        const cy = rng() * size
        const cr = 3 + rng() * 14
        const rust = rng() > 0.5 ? 0xd07a34 : 0x8a4a22
        for (let j = 0; j < 10; j++) {
            ctx.fillStyle = shade(rust, 0.7 + rng() * 0.5)
            const a = rng() * Math.PI * 2
            const d = rng() * cr
            ctx.beginPath()
            ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rng() * 3, 0, Math.PI * 2)
            ctx.fill()
        }
    }
    ctx.strokeStyle = shade(0xc9c9c9, 0.9)
    ctx.lineWidth = 1
    for (let i = 0; i < 24; i++) {
        const x = rng() * size
        const y = rng() * size
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (rng() - 0.5) * 20, y + (rng() - 0.5) * 20)
        ctx.stroke()
    }
}

const drawTile = (ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef, size: number, rng: Rng): void => {
    ctx.fillStyle = shade(def.baseColor, 0.5)
    ctx.fillRect(0, 0, size, size)
    const n = 4
    const t = size / n
    const gap = Math.max(1, size / 64)
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            ctx.fillStyle = shade(def.baseColor, 0.9 + rng() * 0.2)
            ctx.fillRect(c * t + gap, r * t + gap, t - gap * 2, t - gap * 2)
        }
    }
}

const drawCloth = (ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef, size: number, rng: Rng): void => {
    for (let i = 0; i < 900; i++) {
        ctx.fillStyle = shade(def.baseColor, 0.85 + rng() * 0.3)
        ctx.fillRect(rng() * size, rng() * size, 1, 1)
    }
    const step = Math.max(3, Math.floor(size / 32))
    ctx.lineWidth = 1
    for (let i = 0; i < size; i += step) {
        ctx.strokeStyle = shade(def.baseColor, 0.8)
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke()
        ctx.strokeStyle = shade(def.baseColor, 1.15)
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke()
    }
}
