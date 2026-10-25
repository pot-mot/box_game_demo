import {describe, it, expect} from 'vitest'
import {Group} from 'three'
import {applyShowcaseRootPosture} from './root_posture.ts'
import {bodyFormOf} from '../../entity/character/body_form/index.ts'

describe('展示台根姿态', () => {
    it('竖直体形游泳时叠加俯卧前倾与身体中心补偿', () => {
        const group = new Group()
        applyShowcaseRootPosture(group, 'swimming', 0.5, true)
        expect(group.quaternion.w).toBeLessThan(1)
        expect(group.position.lengthSq()).toBeGreaterThan(0)
    })

    it('俯卧体形游泳不再叠加向地面的旋转', () => {
        const group = new Group()
        applyShowcaseRootPosture(group, 'swimming', 0.45, false)
        expect(group.quaternion.x).toBe(0)
        expect(group.quaternion.y).toBe(0)
        expect(group.quaternion.z).toBe(0)
        expect(group.position.lengthSq()).toBe(0)
    })

    it('离开游泳后根姿态归零', () => {
        const group = new Group()
        applyShowcaseRootPosture(group, 'swimming', 0.5, true)
        applyShowcaseRootPosture(group, 'idle', 0.5, true)
        expect(group.quaternion.x).toBe(0)
        expect(group.quaternion.y).toBe(0)
        expect(group.quaternion.z).toBe(0)
        expect(group.position.lengthSq()).toBe(0)
    })

    it('非人形体形声明俯卧根姿态，人形保持竖直', () => {
        expect(bodyFormOf('humanoid').uprightRoot).not.toBe(false)
        for (const id of ['wolf', 'horse', 'wyvern']) {
            expect(bodyFormOf(id).uprightRoot, id).toBe(false)
        }
    })
})
