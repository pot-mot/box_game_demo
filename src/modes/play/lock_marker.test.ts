import {describe, it, expect} from 'vitest'
import {Scene, Vector3} from 'three'
import {setupLockMarker} from './lock_marker.ts'

describe('setupLockMarker', () => {
    it('无锁定时隐藏，锁定时显示在给定标记点', () => {
        const scene = new Scene()
        const marker = setupLockMarker(scene)

        const node = scene.children[0]
        expect(node).toBeDefined()
        expect(node.visible).toBe(false)

        marker.update(new Vector3(1, 1.65, 3))
        expect(node.visible).toBe(true)
        expect(node.position.x).toBe(1)
        expect(node.position.y).toBe(1.65)
        expect(node.position.z).toBe(3)

        marker.update(undefined)
        expect(node.visible).toBe(false)
        /* 隐藏后位置保持不变，下一次显示由 update 覆盖 */
        expect(node.position.z).toBe(3)
    })
})
