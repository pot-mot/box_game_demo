import {Sprite, SpriteMaterial, CanvasTexture} from 'three'
import {onLocaleChange} from '../../i18n/index.ts'
import {themeColor} from '../../ui/theme.ts'
import {
    LABEL_CANVAS_H,
    LABEL_CANVAS_W,
    LABEL_HEIGHT,
    LABEL_WORLD_H,
    LABEL_WORLD_W,
} from './constants.ts'

/** 头顶标签文字（调用方经 `translate` 解析后提供，语言切换时重新取值） */
export interface NameLabelText {
    readonly title: string
    readonly subtitle: string
}

export interface NameLabel {
    readonly sprite: Sprite
    dispose: () => void
}

/**
 * 头顶名称标签：Canvas 绘制「主标题 / 副标题」两行 + 圆角底板，
 * Sprite 始终面向相机。挂载到角色锚点（position.y 已在内部设置）。
 *
 * 调用方传入 `getText` 取值函数：创建时绘制一次，并订阅语言切换重新取值重绘，
 * 使标签文案随语言实时更新。`height` 可覆盖标签相对锚点的高度（体形展示按模型实际高度传入）。
 */
export const createNameLabel = (getText: () => NameLabelText, height: number = LABEL_HEIGHT): NameLabel => {
    const canvas = document.createElement('canvas')
    canvas.width = LABEL_CANVAS_W
    canvas.height = LABEL_CANVAS_H
    const g = canvas.getContext('2d')!

    const texture = new CanvasTexture(canvas)
    const material = new SpriteMaterial({map: texture, transparent: true})
    const sprite = new Sprite(material)
    sprite.scale.set(LABEL_WORLD_W, LABEL_WORLD_H, 1)
    sprite.position.y = height

    const draw = (): void => {
        const {title, subtitle} = getText()
        g.clearRect(0, 0, LABEL_CANVAS_W, LABEL_CANVAS_H)

        /* 圆角半透明底板 + 细描边 */
        g.beginPath()
        g.roundRect(6, 6, LABEL_CANVAS_W - 12, LABEL_CANVAS_H - 12, 20)
        g.fillStyle = themeColor('--dc-overlay', 'rgba(6,5,4,0.78)')
        g.fill()
        g.lineWidth = 3
        g.strokeStyle = themeColor('--dc-border', '#463d33')
        g.stroke()

        /* 主标题 */
        g.textAlign = 'center'
        g.fillStyle = themeColor('--dc-text', '#e8dfce')
        g.font = '600 58px "Microsoft YaHei", "PingFang SC", sans-serif'
        g.fillText(title, LABEL_CANVAS_W / 2, 72)

        /* 副标题 */
        g.fillStyle = themeColor('--dc-text-dim', '#a89e8e')
        g.font = '40px "Microsoft YaHei", "PingFang SC", sans-serif'
        g.fillText(subtitle, LABEL_CANVAS_W / 2, 128)

        texture.needsUpdate = true
    }
    draw()

    const unsubscribe = onLocaleChange(draw)

    const dispose = (): void => {
        unsubscribe()
        texture.dispose()
        material.dispose()
    }
    return {sprite, dispose}
}
