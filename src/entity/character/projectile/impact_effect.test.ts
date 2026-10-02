import {describe, it, expect} from 'vitest'
import {Scene} from 'three'
import {createImpactEffects} from './impact_effect.ts'
import {
    EFFECT_CORE_DURATION, EFFECT_FRAGMENT_DURATION, EFFECT_HIT_DURATION, EFFECT_SMOKE_DURATION,
} from './constants.ts'

const EXPLOSION_LIFE = Math.max(EFFECT_CORE_DURATION, EFFECT_FRAGMENT_DURATION, EFFECT_SMOKE_DURATION)
const DT = 1 / 60

describe('命中 / 爆炸特效', () => {
    it('爆炸特效随生命期结束自动回收并摘除场景节点', () => {
        const scene = new Scene()
        const effects = createImpactEffects(scene)
        effects.explode(0, 1, 0, 2, 'frag', 0xffcc55)
        expect(effects.activeCount()).toBe(1)
        expect(scene.children).toHaveLength(1)

        for (let t = 0; t < EXPLOSION_LIFE + DT; t += DT) effects.update(DT)

        expect(effects.activeCount()).toBe(0)
        expect(scene.children).toHaveLength(0)
        effects.dispose()
    })

    it('命中闪光生命期明显短于爆炸', () => {
        const scene = new Scene()
        const effects = createImpactEffects(scene)
        effects.hit(0, 0, 0, 0xffd070)
        expect(effects.activeCount()).toBe(1)
        for (let t = 0; t < EFFECT_HIT_DURATION + DT; t += DT) effects.update(DT)
        expect(effects.activeCount()).toBe(0)
        effects.dispose()
    })

    it('多个特效可同时存在，结束后逐一回收（池化复用不泄漏场景节点）', () => {
        const scene = new Scene()
        const effects = createImpactEffects(scene)
        effects.explode(0, 0, 0, 2, 'frag', 0xffffff)
        effects.explode(1, 0, 0, 1.5, 'fire', 0xffffff)
        effects.explode(2, 0, 0, 1.2, 'magic', 0x44aaff)
        expect(effects.activeCount()).toBe(3)
        expect(scene.children).toHaveLength(3)

        for (let t = 0; t < EXPLOSION_LIFE + DT; t += DT) effects.update(DT)
        expect(effects.activeCount()).toBe(0)
        expect(scene.children).toHaveLength(0)

        /* 再触发一次复用空闲槽位 */
        effects.explode(0, 0, 0, 2, 'fire', 0xffffff)
        expect(effects.activeCount()).toBe(1)
        expect(scene.children).toHaveLength(1)
        effects.dispose()
    })

    it('clear 立即回收在飞特效并摘除场景节点（不播放完动画），空闲槽位可复用', () => {
        const scene = new Scene()
        const effects = createImpactEffects(scene)
        effects.explode(0, 0, 0, 2, 'frag', 0xffffff)
        effects.hit(0, 0, 0, 0xffd070)
        expect(effects.activeCount()).toBe(2)
        expect(scene.children).toHaveLength(2)

        effects.clear()
        expect(effects.activeCount()).toBe(0)
        expect(scene.children).toHaveLength(0)

        effects.explode(0, 0, 0, 1.2, 'magic', 0x44aaff)
        expect(effects.activeCount()).toBe(1)
        expect(scene.children).toHaveLength(1)
        effects.dispose()
    })

    it('dispose 清理在飞特效', () => {
        const scene = new Scene()
        const effects = createImpactEffects(scene)
        effects.explode(0, 0, 0, 2, 'frag', 0xffffff)
        effects.dispose()
        expect(scene.children).toHaveLength(0)
    })
})
