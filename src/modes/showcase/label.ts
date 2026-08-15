import {Sprite, SpriteMaterial, CanvasTexture} from 'three'
import {
    LABEL_CANVAS_H,
    LABEL_CANVAS_W,
    LABEL_HEIGHT,
    LABEL_WORLD_H,
    LABEL_WORLD_W,
} from './constants.ts'

export interface NameLabel {
    readonly sprite: Sprite
    dispose: () => void
}

/**
 * 头顶名称标签：Canvas 绘制「技能名 / 武器名」两行 + 圆角底板，
 * Sprite 始终面向相机。挂载到角色锚点（position.y 已在内部设置）。
 */
export const createNameLabel = (title: string, subtitle: string): NameLabel => {
    const canvas = document.createElement('canvas')
    canvas.width = LABEL_CANVAS_W
    canvas.height = LABEL_CANVAS_H
    const g = canvas.getContext('2d')!

    /* 圆角半透明底板 + 细描边 */
    g.beginPath()
    g.roundRect(6, 6, LABEL_CANVAS_W - 12, LABEL_CANVAS_H - 12, 20)
    g.fillStyle = 'rgba(10, 12, 18, 0.78)'
    g.fill()
    g.lineWidth = 3
    g.strokeStyle = 'rgba(255, 255, 255, 0.16)'
    g.stroke()

    /* 主标题：技能名 */
    g.textAlign = 'center'
    g.fillStyle = '#f2ede2'
    g.font = '600 58px "Microsoft YaHei", "PingFang SC", sans-serif'
    g.fillText(title, LABEL_CANVAS_W / 2, 72)

    /* 副标题：武器名 */
    g.fillStyle = '#8f9bb0'
    g.font = '40px "Microsoft YaHei", "PingFang SC", sans-serif'
    g.fillText(subtitle, LABEL_CANVAS_W / 2, 128)

    const texture = new CanvasTexture(canvas)
    const material = new SpriteMaterial({map: texture, transparent: true})
    const sprite = new Sprite(material)
    sprite.scale.set(LABEL_WORLD_W, LABEL_WORLD_H, 1)
    sprite.position.y = LABEL_HEIGHT

    const dispose = (): void => {
        texture.dispose()
        material.dispose()
    }
    return {sprite, dispose}
}
