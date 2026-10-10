import {Sprite, SpriteMaterial, CanvasTexture} from 'three'
import {onLocaleChange} from '../../i18n/index.ts'
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
 * 使标签文案随语言实时更新。
 */
export const createNameLabel = (getText: () => NameLabelText): NameLabel => {
    const canvas = document.createElement('canvas')
    canvas.width = LABEL_CANVAS_W
    canvas.height = LABEL_CANVAS_H
    const g = canvas.getContext('2d')!

    const texture = new CanvasTexture(canvas)
    const material = new SpriteMaterial({map: texture, transparent: true})
    const sprite = new Sprite(material)
    sprite.scale.set(LABEL_WORLD_W, LABEL_WORLD_H, 1)
    sprite.position.y = LABEL_HEIGHT

    const draw = (): void => {
        const {title, subtitle} = getText()
        g.clearRect(0, 0, LABEL_CANVAS_W, LABEL_CANVAS_H)

        /* 圆角半透明底板 + 细描边 */
        g.beginPath()
        g.roundRect(6, 6, LABEL_CANVAS_W - 12, LABEL_CANVAS_H - 12, 20)
        g.fillStyle = 'rgba(10, 12, 18, 0.78)'
        g.fill()
        g.lineWidth = 3
        g.strokeStyle = 'rgba(255, 255, 255, 0.16)'
        g.stroke()

        /* 主标题 */
        g.textAlign = 'center'
        g.fillStyle = '#f2ede2'
        g.font = '600 58px "Microsoft YaHei", "PingFang SC", sans-serif'
        g.fillText(title, LABEL_CANVAS_W / 2, 72)

        /* 副标题 */
        g.fillStyle = '#8f9bb0'
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
