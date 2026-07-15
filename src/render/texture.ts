import {CanvasTexture} from 'three'
import {
    TEX_SIZE, TEX_DIV, TEX_FILL, TEX_GRID, TEX_ACCENT,
} from './constants.ts'

let _gridTex: CanvasTexture | undefined

/** 生成棋盘格 CanvasTexture 单例，所有箱子共享 */
export const gridTexture = (): CanvasTexture => {
    if (_gridTex) return _gridTex
    const canvas = document.createElement('canvas')
    canvas.width = TEX_SIZE
    canvas.height = TEX_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = TEX_FILL
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)
    ctx.strokeStyle = TEX_GRID
    ctx.lineWidth = 1
    const step = TEX_SIZE / TEX_DIV
    for (let i = 0; i <= TEX_DIV; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, TEX_SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(TEX_SIZE, i * step); ctx.stroke()
    }
    ctx.strokeStyle = TEX_ACCENT
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, TEX_SIZE, TEX_SIZE)
    _gridTex = new CanvasTexture(canvas)
    return _gridTex
}
