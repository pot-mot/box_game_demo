import {type Scene, type PerspectiveCamera, Sprite, SpriteMaterial, CanvasTexture} from 'three'
import type {CharacterEntity} from '../../character/types.ts'
import {bodyFormOf} from '../../entity/character/body_form/index.ts'
import {themeColor} from '../../ui/theme.ts'

const BAR_W = 128
const BAR_H = 16
/** 韧性条高度（贴在血条下沿，与血条共用同一 canvas / sprite） */
const POISE_BAR_H = 4
/** 格挡槽条高度（仅持盾单位显示，位于韧性条下沿） */
const GUARD_BAR_H = 4
/** 韧性条重绘阈值：韧性连续回充，变化超过该值才重绘，避免每帧重画 canvas */
const POISE_DRAW_STEP = 0.25
const DISPLAY_RADIUS = 5
/** 固定世界空间宽度，消除透视 */
const FIXED_SCALE = 2.5

interface BarEntry {
    sprite: Sprite
    lastHealth: number
    lastMaxHealth: number
    lastPoise: number
    lastMaxPoise: number
    lastGuard: number
    lastMaxGuard: number
    characterId: number
}

const drawBar = (
    ctx: CanvasRenderingContext2D,
    health: number,
    maxHealth: number,
    poise: number,
    maxPoise: number,
    guard: number,
    guardMax: number,
): void => {
    ctx.clearRect(0, 0, BAR_W, BAR_H)

    const hasGuard = guardMax > 0
    const poiseTop = BAR_H - POISE_BAR_H - (hasGuard ? GUARD_BAR_H : 0)
    const hpRegionH = poiseTop

    ctx.fillStyle = themeColor('--dc-overlay', 'rgba(6,5,4,0.78)')
    ctx.fillRect(0, 0, BAR_W, hpRegionH)

    const ratio = Math.max(0, health / maxHealth)
    const w = Math.max(2, BAR_W * ratio)

    if (ratio > 0.5) ctx.fillStyle = themeColor('--dc-success', '#5a7d4a')
    else if (ratio > 0.25) ctx.fillStyle = themeColor('--dc-warning', '#d9a441')
    else ctx.fillStyle = themeColor('--dc-danger', '#b03030')
    ctx.fillRect(0, 0, w, hpRegionH)

    /* 韧性条：位于血条下沿，韧性归零触发倒地 */
    ctx.fillStyle = themeColor('--dc-overlay', 'rgba(6,5,4,0.78)')
    ctx.fillRect(0, poiseTop, BAR_W, POISE_BAR_H)
    const poiseRatio = maxPoise > 0 ? Math.max(0, Math.min(1, poise / maxPoise)) : 0
    ctx.fillStyle = themeColor('--dc-info', '#3f5f93')
    ctx.fillRect(0, poiseTop, Math.max(2, BAR_W * poiseRatio), POISE_BAR_H)

    /* 格挡槽条（仅持盾单位）：格挡消耗、归零触发破防 */
    if (hasGuard) {
        const guardTop = poiseTop + POISE_BAR_H
        ctx.fillStyle = themeColor('--dc-overlay', 'rgba(6,5,4,0.78)')
        ctx.fillRect(0, guardTop, BAR_W, GUARD_BAR_H)
        const guardRatio = Math.max(0, Math.min(1, guard / guardMax))
        ctx.fillStyle = themeColor('--dc-warning', '#d9a441')
        ctx.fillRect(0, guardTop, Math.max(2, BAR_W * guardRatio), GUARD_BAR_H)
    }

    ctx.fillStyle = themeColor('--dc-text', '#e8dfce')
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${health}/${maxHealth}`, BAR_W / 2, hpRegionH / 2)
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
            const ppos = player.body.translation()
            for (const c of allChars) {
                if (c.combat.isDead || c.id === player.id) continue
                const ct = c.body.translation()
                const dx = ct.x - ppos.x
                const dy = ct.y - ppos.y
                const dz = ct.z - ppos.z
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
                    entry = {sprite, lastHealth: -1, lastMaxHealth: -1, lastPoise: -1, lastMaxPoise: -1, lastGuard: -1, lastMaxGuard: -1, characterId: c.id}
                    bars.set(c.id, entry)
                }

                const guardMax = c.combat.block?.guardMax ?? 0
                if (c.combat.health !== entry.lastHealth || c.combat.maxHealth !== entry.lastMaxHealth
                    || c.combat.poiseMax !== entry.lastMaxPoise
                    || Math.abs(c.combat.poise - entry.lastPoise) >= POISE_DRAW_STEP
                    || guardMax !== entry.lastMaxGuard
                    || Math.abs(c.combat.guard - entry.lastGuard) >= POISE_DRAW_STEP) {
                    if (entry.sprite.material instanceof SpriteMaterial) {
                        const canvas = entry.sprite.material.map?.image
                        if (canvas instanceof HTMLCanvasElement) {
                            const ctx = canvas.getContext('2d')
                            if (ctx) drawBar(ctx, c.combat.health, c.combat.maxHealth, c.combat.poise, c.combat.poiseMax, c.combat.guard, guardMax)
                        }
                        entry.sprite.material.map!.needsUpdate = true
                    }
                    entry.lastHealth = c.combat.health
                    entry.lastMaxHealth = c.combat.maxHealth
                    entry.lastPoise = c.combat.poise
                    entry.lastMaxPoise = c.combat.poiseMax
                    entry.lastGuard = c.combat.guard
                    entry.lastMaxGuard = guardMax
                }

                const ct2 = c.body.translation()
                entry.sprite.position.set(
                    ct2.x,
                    ct2.y + bodyFormOf(c.config.bodyFormId).size.height * c.config.scale + 0.3,
                    ct2.z,
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
