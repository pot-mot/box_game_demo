import {describe, expect, it, vi} from 'vitest'
import {createAnimationStore} from './animation_store.ts'
import type {BoneEditHistory} from './history.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import {setupTrackView, type TrackViewHost} from './timeline_tracks.ts'

const hostOf = (): TrackViewHost => {
    const store = createAnimationStore()
    store.createEmpty('测试动画')
    return {
        store,
        world: {getFocus: () => undefined} as unknown as SkeletonEntitiesContext,
        history: {} as BoneEditHistory,
        runtime: {
            rebuildPlayer: () => {},
            refreshControls: () => {},
            renderList: () => {},
            renderCanvas: () => {},
            addKeyframeAt: () => {},
            syncWeaponForCurrentClip: () => {},
        },
        getSelection: () => new Map(),
        setSelection: () => {},
        getPlayhead: () => 0,
        getPxPerSec: () => 120,
        setPxPerSec: () => {},
        onScrub: () => {},
        onCurveUpdate: () => {},
    }
}

describe('轨道视图显隐', () => {
    it('显示时恢复 flex 布局（防止 canvas 横排容器塌陷为 0 高）', () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
        const view = setupTrackView(hostOf())
        view.setVisible(false)
        expect(view.element.style.display).toBe('none')
        view.setVisible(true)
        expect(view.element.style.display).toBe('flex')
    })
})
