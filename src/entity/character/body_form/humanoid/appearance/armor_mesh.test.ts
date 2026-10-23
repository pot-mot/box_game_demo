import {describe, it, expect} from 'vitest'
import {Mesh} from 'three'
import {ARMOR_BODY_PARTS, ARMOR_BODY_PART_JOINTS, ARMOR_MESH_IDS, createArmorMesh, type ArmorMeshResult} from './armor_mesh.ts'
import {buildCharacterSkeletonDefinition} from '../skeleton/skeleton.ts'

/** 部件数量（仅统计可见网格；空 group = 0） */
const partCount = (result: ArmorMeshResult): number =>
    result.group.children.filter(child => child instanceof Mesh).length

describe('createArmorMesh（独立 gen 构建的护甲部件）', () => {
    it('各槽位关节生成部件并挂在返回的 group 下，cleanup 后清空', () => {
        const cases = [
            ['helmet', 'headNeck'],
            ['plate', 'spine'],
            ['bracer', 'leftArmElbow'],
            ['bracer', 'rightArmElbow'],
            ['greaves', 'leftLegHip'],
            ['greaves', 'rightLegKnee'],
            ['boots', 'leftLegKnee'],
        ] as const
        for (const [id, jointId] of cases) {
            const result = createArmorMesh({id, color: 0x888888}, jointId)
            expect(partCount(result), `${id}@${jointId}`).toBeGreaterThan(0)
            result.cleanup()
            expect(result.group.children, `${id}@${jointId} cleanup`).toHaveLength(0)
        }
    })

    it('未知关节返回空 group（骨架被编辑后安全跳过，不抛错）', () => {
        const result = createArmorMesh({id: 'vest', color: 0x888888}, 'unknownJoint')
        expect(result.group.children).toHaveLength(0)
        result.cleanup()
    })

    it('靴仅包小腿：膝关节生成、髋关节为空（关节白名单）', () => {
        const knee = createArmorMesh({id: 'boots', color: 0}, 'leftLegKnee')
        expect(partCount(knee)).toBeGreaterThan(0)
        knee.cleanup()
        const hip = createArmorMesh({id: 'boots', color: 0}, 'leftLegHip')
        expect(hip.group.children).toHaveLength(0)
        hip.cleanup()
    })

    it('accentColor 缺省时安全回退主色暗化，并可完整清理', () => {
        for (const id of ARMOR_MESH_IDS) {
            const result = createArmorMesh({id, color: 0x123456}, 'spine')
            expect(() => result.cleanup(), id).not.toThrow()
            expect(result.group.children, id).toHaveLength(0)
        }
    })

    it('全部形状 id 均可在全部关节安全构建并清理（白名单关节可空）', () => {
        for (const id of ARMOR_MESH_IDS) {
            for (const jointId of ['headNeck', 'spine', 'rightArmElbow', 'leftLegHip', 'rightLegKnee']) {
                const result = createArmorMesh({id, color: 0x123456, accentColor: 0x654321}, jointId)
                result.cleanup()
                expect(result.group.children).toHaveLength(0)
            }
        }
    })

    it('hideBodyParts 仅声明顶替部位，不影响护甲几何产出', () => {
        const withFlag = createArmorMesh({id: 'helmet', color: 0x888888, hideBodyParts: ['head']}, 'headNeck')
        const without = createArmorMesh({id: 'helmet', color: 0x888888}, 'headNeck')
        expect(partCount(withFlag)).toBe(partCount(without))
        withFlag.cleanup()
        without.cleanup()
    })

    it('身体部位 → 关节映射完备：每个部位都指向预设骨架中的关节', () => {
        const jointIds = new Set(buildCharacterSkeletonDefinition().joints.map(joint => joint.id))
        for (const bodyPart of ARMOR_BODY_PARTS) {
            const jointId = ARMOR_BODY_PART_JOINTS[bodyPart]
            expect(jointIds.has(jointId), `${bodyPart} → ${jointId}`).toBe(true)
        }
    })
})
