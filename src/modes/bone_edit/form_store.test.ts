import {describe, it, expect} from 'vitest'
import {createFormAnimationStores} from './form_store.ts'

describe('每体形独立动画库', () => {
    it('路由到当前体形 store，切换后彼此隔离', () => {
        const stores = createFormAnimationStores(['humanoid', 'wolf'], 'humanoid')
        stores.store.createEmpty('humanoid_clip')
        stores.setActive('wolf')
        expect(stores.store.current).toBeUndefined()
        stores.store.createEmpty('wolf_clip')
        expect([...stores.store.clips.keys()]).toEqual(['wolf_clip'])
        stores.setActive('humanoid')
        expect([...stores.store.clips.keys()]).toEqual(['humanoid_clip'])
        expect(stores.activeFormId).toBe('humanoid')
    })

    it('未知体形切换保持当前体形', () => {
        const stores = createFormAnimationStores(['humanoid'], 'humanoid')
        stores.setActive('unknown')
        expect(stores.activeFormId).toBe('humanoid')
    })
})
