import {type Scene, type PerspectiveCamera, Sprite, SpriteMaterial, CanvasTexture} from 'three'
import type {CharacterEntity} from '../../character/types.ts'
import {CHARACTER_BASE_SIZE} from '../../entity/character/constants.ts'

const BAR_W = 128
const BAR_H = 16
const DISPLAY_RADIUS = 5
/** 固定世界空间宽度，消除透视 */
const FIXED_SCALE = 2.5

interface BarEntry {
    sprite: Sprite
    lastHealth: number
    lastMaxHealth: number
    characterId: number
}

const drawBar = (ctx: CanvasRenderingContext2D, health: number, maxHealth: number): void => {
    ctx.clearRect(0, 0, BAR_W, BAR_H)

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, 0, BAR_W, BAR_H)

    const ratio = Math.max(0, health / maxHealth)
    const w = Math.max(2, BAR_W * ratio)

    if (ratio > 0.5) ctx.fillStyle = '#4caf50'
    else if (ratio > 0.25) ctx.fillStyle = '#ff9800'
    else ctx.fillStyle = '#f44336'
    ctx.fillRect(0, 0, w, BAR_H)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${health}/${maxHealth}`, BAR_W / 2, BAR_H / 2)
}

export const setupHealthBars = (
    scene: Scene,
    getPlayerCharacter: () => CharacterEntity | undefined,
    getAllCharacters: () => readonly CharacterEntity[],
): {
    update: (camera: PerspectiveCamera, dt: number) => void
} => {
    const bars = new Map<number, BarEntry>()

    const update = (_camera: PerspectiveCamera, _dt: number): void => {
        const player = getPlayerCharacter()
        const allChars = getAllCharacters()
        const visible = new Set<number>()

        if (player) {
            const ppos = player.body.position
            for (const c of allChars) {
                if (c.combat.isDead || c.id === player.id) continue
                const dx = c.body.position.x - ppos.x
                const dy = c.body.position.y - ppos.y
                const dz = c.body.position.z - ppos.z
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
                if (dist > DISPLAY_RADIUS) continue
                visible.add(c.id)

                let entry = bars.get(c.id)
                if (!entry) {
                    const canvas = document.createElement('canvas')
                    canvas.width = BAR_W
                    canvas.height = BAR_H
                    const tex = new CanvasTexture(canvas)
                    const mat = new SpriteMaterial({map: tex, depthTest: false, depthWrite: false, transparent: true})
                    const sprite = new Sprite(mat)
                    sprite.renderOrder = 999
                    scene.add(sprite)
                    entry = {sprite, lastHealth: -1, lastMaxHealth: -1, characterId: c.id}
                    bars.set(c.id, entry)
                }

                if (c.combat.health !== entry.lastHealth || c.combat.maxHealth !== entry.lastMaxHealth) {
                    if (entry.sprite.material instanceof SpriteMaterial) {
                        const canvas = entry.sprite.material.map?.image
                        if (canvas instanceof HTMLCanvasElement) {
                            const ctx = canvas.getContext('2d')
                            if (ctx) drawBar(ctx, c.combat.health, c.combat.maxHealth)
                        }
                        entry.sprite.material.map!.needsUpdate = true
                    }
                    entry.lastHealth = c.combat.health
                    entry.lastMaxHealth = c.combat.maxHealth
                }

                entry.sprite.position.set(
                    c.body.position.x,
                    c.body.position.y + CHARACTER_BASE_SIZE.height * c.config.scale + 0.3,
                    c.body.position.z,
                )
                entry.sprite.scale.set(FIXED_SCALE, FIXED_SCALE * (BAR_H / BAR_W), 1)
            }
        }

        for (const [id, entry] of bars) {
            if (!visible.has(id)) {
                scene.remove(entry.sprite)
                const mat = entry.sprite.material
                if (mat instanceof SpriteMaterial && mat.map) mat.map.dispose()
                mat.dispose()
                bars.delete(id)
            }
        }
    }

    return {update}
}
