import {
    AdditiveBlending, BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
    RingGeometry, SphereGeometry, type Scene,
} from 'three'
import type {ExplosionStyle} from '../../../character/weapon/projectile_visual.ts'
import {createObjectPool, type ObjectPool} from './pool.ts'
import {
    EFFECT_CORE_DURATION, EFFECT_CORE_START_RATIO, EFFECT_FRAGMENT_COUNT,
    EFFECT_FRAGMENT_DURATION, EFFECT_FRAGMENT_SPEED, EFFECT_GRAVITY, EFFECT_HIT_DURATION,
    EFFECT_HIT_RADIUS, EFFECT_POOL_MAX, EFFECT_SMOKE_COUNT, EFFECT_SMOKE_DURATION,
    EFFECT_SMOKE_RISE,
} from './constants.ts'

/**
 * 命中 / 爆炸特效 —— 范围伤害在命中点生成火光 / 碎片 / 魔法爆散，
 * 非范围命中也补一个小闪光。全部走对象池，几何为模块级单例、材质随槽位创建。
 *
 * 视觉分层（每槽位一套网格）：
 * - `core`：加色火球 / 魔法球（扩散 + 淡出）；
 * - `ring`：冲击环（仅魔法）；
 * - `particles`：碎片 / 火星（抛撒 + 重力）；
 * - `smoke`：烟团（上浮 + 膨胀）。
 */

/** 特效种类：三种爆炸风格 + 命中闪光 */
type EffectKind = ExplosionStyle | 'hit'

interface EffectSlot {
    readonly root: Group
    readonly core: Mesh
    readonly coreMat: MeshBasicMaterial
    readonly ring: Mesh
    readonly ringMat: MeshBasicMaterial
    readonly particles: readonly Mesh[]
    readonly debrisMat: MeshBasicMaterial
    readonly smoke: readonly Mesh[]
    readonly smokeMat: MeshBasicMaterial
    readonly particleVel: Float32Array
    readonly smokeVel: Float32Array
    active: boolean
    elapsed: number
    life: number
    coreLife: number
    coreStart: number
    coreEnd: number
    debrisScale: number
    smokeBase: number
    ringEnd: number
    showRing: boolean
    showDebris: boolean
    showSmoke: boolean
}

const UNIT_SPHERE = new SphereGeometry(1, 12, 8)
const UNIT_RING = new RingGeometry(0.82, 1, 24)
const UNIT_BOX = new BoxGeometry(1, 1, 1)

/** 风格配色 */
const STYLE_COLORS: Record<ExplosionStyle, {core: number; debris: number; smoke: number}> = {
    fire: {core: 0xff8822, debris: 0xffb347, smoke: 0x555555},
    frag: {core: 0xffcc55, debris: 0x8a8a8a, smoke: 0x6b6b6b},
    magic: {core: 0xffffff, debris: 0xffffff, smoke: 0xffffff},
}

const randRange = (min: number, max: number): number => min + Math.random() * (max - min)

const createSlot = (): EffectSlot => {
    const root = new Group()
    const coreMat = new MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false,
    })
    const core = new Mesh(UNIT_SPHERE, coreMat)
    root.add(core)

    const ringMat = new MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending,
        depthWrite: false, side: DoubleSide,
    })
    const ring = new Mesh(UNIT_RING, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.visible = false
    root.add(ring)

    const debrisMat = new MeshBasicMaterial({color: 0x888888, transparent: true, opacity: 0, depthWrite: false})
    const particles: Mesh[] = []
    for (let i = 0; i < EFFECT_FRAGMENT_COUNT; i++) {
        const p = new Mesh(UNIT_BOX, debrisMat)
        p.visible = false
        root.add(p)
        particles.push(p)
    }

    const smokeMat = new MeshBasicMaterial({color: 0x666666, transparent: true, opacity: 0, depthWrite: false})
    const smoke: Mesh[] = []
    for (let i = 0; i < EFFECT_SMOKE_COUNT; i++) {
        const s = new Mesh(UNIT_SPHERE, smokeMat)
        s.visible = false
        root.add(s)
        smoke.push(s)
    }

    return {
        root, core, coreMat, ring, ringMat, particles, debrisMat, smoke, smokeMat,
        particleVel: new Float32Array(EFFECT_FRAGMENT_COUNT * 3),
        smokeVel: new Float32Array(EFFECT_SMOKE_COUNT * 3),
        active: false, elapsed: 0, life: 0, coreLife: EFFECT_CORE_DURATION,
        coreStart: 0, coreEnd: 0, debrisScale: 0.05, smokeBase: 0.05, ringEnd: 0,
        showRing: false, showDebris: false, showSmoke: false,
    }
}

/** 命中 / 爆炸特效池 */
export interface ImpactEffects {
    /** 范围伤害爆炸：火光 / 碎片 / 魔法爆散 */
    readonly explode: (x: number, y: number, z: number, radius: number, style: ExplosionStyle, color: number) => void
    /** 非范围命中闪光 */
    readonly hit: (x: number, y: number, z: number, color: number) => void
    readonly update: (dt: number) => void
    /** 清除全部在飞特效并归还池（世界还原 / 载入存档） */
    readonly clear: () => void
    readonly activeCount: () => number
    readonly dispose: () => void
}

export const createImpactEffects = (scene: Scene): ImpactEffects => {
    const spawnParticle = (slot: EffectSlot, idx: number, speed: number, scale: number): void => {
        const base = idx * 3
        /* 球面随机方向（略去极点偏置） */
        const theta = Math.random() * Math.PI * 2
        const cosPhi = randRange(-0.6, 1)
        const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi))
        slot.particleVel[base] = Math.cos(theta) * sinPhi * speed
        slot.particleVel[base + 1] = cosPhi * speed * 0.8 + speed * 0.4
        slot.particleVel[base + 2] = Math.sin(theta) * sinPhi * speed
        const m = slot.particles[idx]
        m.position.set(0, 0, 0)
        m.scale.setScalar(scale)
        m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
        m.visible = true
    }

    const activate = (
        slot: EffectSlot, kind: EffectKind, x: number, y: number, z: number, radius: number, color: number,
    ): void => {
        slot.root.position.set(x, y, z)
        slot.elapsed = 0

        /* 复用前清空上一次特效的可见状态 */
        slot.core.visible = false
        slot.ring.visible = false
        for (const p of slot.particles) p.visible = false
        for (const s of slot.smoke) s.visible = false
        slot.coreMat.opacity = 0
        slot.ringMat.opacity = 0
        slot.debrisMat.opacity = 0
        slot.smokeMat.opacity = 0

        if (kind === 'hit') {
            slot.life = EFFECT_HIT_DURATION
            slot.coreLife = EFFECT_HIT_DURATION
            slot.coreStart = EFFECT_HIT_RADIUS * 0.2
            slot.coreEnd = EFFECT_HIT_RADIUS
            slot.coreMat.color.setHex(color)
            slot.showRing = false
            slot.showDebris = false
            slot.showSmoke = false
        } else {
            const colors = STYLE_COLORS[kind]
            const coreColor = kind === 'magic' ? color : colors.core
            slot.life = Math.max(EFFECT_CORE_DURATION, EFFECT_FRAGMENT_DURATION, EFFECT_SMOKE_DURATION)
            slot.coreLife = EFFECT_CORE_DURATION
            slot.coreStart = radius * EFFECT_CORE_START_RATIO
            slot.coreEnd = radius
            slot.coreMat.color.setHex(coreColor)
            slot.showRing = kind === 'magic'
            slot.showDebris = kind !== 'magic'
            slot.showSmoke = kind !== 'magic'
            slot.ringEnd = radius * 1.25
            slot.ringMat.color.setHex(color)
            slot.debrisScale = kind === 'fire' ? 0.035 : 0.06
            slot.debrisMat.color.setHex(colors.debris)
            slot.smokeBase = radius * 0.35
            slot.smokeMat.color.setHex(colors.smoke)

            for (let i = 0; i < slot.particles.length; i++) {
                spawnParticle(slot, i, EFFECT_FRAGMENT_SPEED * (0.6 + radius * 0.5), slot.debrisScale)
            }
            for (let i = 0; i < slot.smoke.length; i++) {
                const base = i * 3
                slot.smokeVel[base] = randRange(-0.4, 0.4)
                slot.smokeVel[base + 1] = EFFECT_SMOKE_RISE * randRange(0.5, 1.5)
                slot.smokeVel[base + 2] = randRange(-0.4, 0.4)
                const s = slot.smoke[i]
                s.position.set(randRange(-0.2, 0.2), randRange(-0.1, 0.3), randRange(-0.2, 0.2))
                s.scale.setScalar(slot.smokeBase)
                s.visible = true
            }
        }

        slot.core.visible = true
        slot.ring.visible = slot.showRing
    }

    const tick = (slot: EffectSlot, dt: number): void => {
        slot.elapsed += dt
        const e = slot.elapsed
        if (e >= slot.life) return

        /* 火球：扩散 + 淡出 */
        const coreT = Math.min(1, e / slot.coreLife)
        const coreScale = slot.coreStart + (slot.coreEnd - slot.coreStart) * (1 - (1 - coreT) * (1 - coreT))
        slot.core.scale.setScalar(coreScale)
        slot.coreMat.opacity = 0.85 * (1 - coreT)
        slot.core.visible = coreT < 1

        if (slot.showRing) {
            const ringT = Math.min(1, e / slot.coreLife)
            slot.ring.scale.setScalar(slot.ringEnd * (0.2 + ringT * 0.8))
            slot.ringMat.opacity = 0.7 * (1 - ringT)
            slot.ring.visible = ringT < 1
        }

        if (slot.showDebris) {
            const dT = Math.min(1, e / EFFECT_FRAGMENT_DURATION)
            for (let i = 0; i < slot.particles.length; i++) {
                const base = i * 3
                slot.particleVel[base + 1] += EFFECT_GRAVITY * dt
                const m = slot.particles[i]
                m.position.x += slot.particleVel[base] * dt
                m.position.y += slot.particleVel[base + 1] * dt
                m.position.z += slot.particleVel[base + 2] * dt
                m.scale.setScalar(slot.debrisScale * (1 - dT * 0.5))
                m.visible = dT < 1
            }
            slot.debrisMat.opacity = 1 - dT
        }

        if (slot.showSmoke) {
            const sT = Math.min(1, e / EFFECT_SMOKE_DURATION)
            for (let i = 0; i < slot.smoke.length; i++) {
                const base = i * 3
                const s = slot.smoke[i]
                s.position.x += slot.smokeVel[base] * dt
                s.position.y += slot.smokeVel[base + 1] * dt
                s.position.z += slot.smokeVel[base + 2] * dt
                s.scale.setScalar(slot.smokeBase * (1 + sT * 2))
                s.visible = sT < 1
            }
            slot.smokeMat.opacity = 0.4 * (1 - sT)
        }
    }

    const pool: ObjectPool<EffectSlot> = createObjectPool<EffectSlot>(
        createSlot,
        (slot) => {
            scene.remove(slot.root)
            slot.active = false
        },
        (slot) => {
            scene.remove(slot.root)
            slot.coreMat.dispose()
            slot.ringMat.dispose()
            slot.debrisMat.dispose()
            slot.smokeMat.dispose()
        },
        EFFECT_POOL_MAX,
    )

    let activeCount = 0
    const active: EffectSlot[] = []

    const acquire = (): EffectSlot => {
        const slot = pool.acquire()
        slot.active = true
        activeCount++
        active.push(slot)
        scene.add(slot.root)
        return slot
    }

    const explode = (x: number, y: number, z: number, radius: number, style: ExplosionStyle, color: number): void => {
        activate(acquire(), style, x, y, z, radius, color)
    }

    const hit = (x: number, y: number, z: number, color: number): void => {
        activate(acquire(), 'hit', x, y, z, EFFECT_HIT_RADIUS, color)
    }

    const update = (dt: number): void => {
        for (let i = active.length - 1; i >= 0; i--) {
            const slot = active[i]
            tick(slot, dt)
            if (slot.elapsed >= slot.life) {
                slot.active = false
                active.splice(i, 1)
                activeCount--
                pool.release(slot)
            }
        }
    }

    /** 立即回收全部在飞特效（不播放完动画），归还池化栈 */
    const clear = (): void => {
        for (const slot of active) {
            slot.active = false
            pool.release(slot)
        }
        active.length = 0
        activeCount = 0
    }

    return {
        explode,
        hit,
        update,
        clear,
        activeCount: () => activeCount,
        dispose: () => {
            for (const slot of active) {
                scene.remove(slot.root)
                slot.coreMat.dispose()
                slot.ringMat.dispose()
                slot.debrisMat.dispose()
                slot.smokeMat.dispose()
            }
            active.length = 0
            activeCount = 0
            pool.dispose()
        },
    }
}
