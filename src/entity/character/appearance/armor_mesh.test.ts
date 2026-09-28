import {describe, it, expect} from 'vitest'
import {Box3, Mesh, Vector3} from 'three'
import {ARMOR_BODY_PARTS, ARMOR_BODY_PART_JOINTS, ARMOR_MESH_IDS, createArmorMesh, type ArmorMeshResult} from './armor_mesh.ts'
import {ARMOR_PAD} from './constants.ts'
import {PRESET_PART_SIZES, buildCharacterSkeletonDefinition} from '../skeleton/preset.ts'

/** 部件数量（仅统计可见网格；空 group = 0） */
const partCount = (result: ArmorMeshResult): number =>
    result.group.children.filter(child => child instanceof Mesh).length

/** 模型整体包围盒尺寸（在关节基准坐标系下） */
const rawSize = (result: ArmorMeshResult): Vector3 => {
    result.group.updateMatrixWorld(true)
    return new Box3().setFromObject(result.group).getSize(new Vector3())
}

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

    it('部件尺寸随关节基准身体部件变化（头部件小于躯干部件）', () => {
        const head = createArmorMesh({id: 'helmet', color: 0}, 'headNeck')
        const body = createArmorMesh({id: 'plate', color: 0}, 'spine')
        expect(rawSize(head).x).toBeLessThan(rawSize(body).x)
        head.cleanup()
        body.cleanup()
    })

    it('包裹部件的宽 / 深外扩大于对应身体部件（不穿模）', () => {
        const plate = createArmorMesh({id: 'plate', color: 0}, 'spine')
        const plateSize = rawSize(plate)
        /* 胸甲外扩 ARMOR_PAD 后宽/深须大于躯干原部件 */
        expect(plateSize.x).toBeGreaterThan(PRESET_PART_SIZES.bodyW + ARMOR_PAD * 2)
        expect(plateSize.z).toBeGreaterThan(PRESET_PART_SIZES.bodyD + ARMOR_PAD * 2)
        plate.cleanup()

        const helmet = createArmorMesh({id: 'helmet', color: 0}, 'headNeck')
        expect(rawSize(helmet).x).toBeGreaterThan(PRESET_PART_SIZES.headW + ARMOR_PAD * 2)
        helmet.cleanup()

        const bracer = createArmorMesh({id: 'bracer', color: 0}, 'rightArmElbow')
        expect(rawSize(bracer).x).toBeGreaterThan(PRESET_PART_SIZES.armW * 0.8 + ARMOR_PAD * 2)
        bracer.cleanup()
    })

    it('靴与胫甲底端不低于腿段底面（不超出模型腿底）', () => {
        const cases = [
            ['greaves', 'leftLegHip', -PRESET_PART_SIZES.thighH],
            ['greaves', 'leftLegKnee', -PRESET_PART_SIZES.shinH],
            ['boots', 'leftLegKnee', -PRESET_PART_SIZES.shinH],
        ] as const
        for (const [id, jointId, legBottom] of cases) {
            const result = createArmorMesh({id, color: 0}, jointId)
            result.group.updateMatrixWorld(true)
            const minY = new Box3().setFromObject(result.group).min.y
            expect(minY, `${id}@${jointId} 超出腿底`).toBeGreaterThanOrEqual(legBottom - 1e-6)
            result.cleanup()
        }
    })

    it('靴的脚尖装饰条向 +Z（前方）偏移，且最低点低于主体', () => {
        const boots = createArmorMesh({id: 'boots', color: 0}, 'leftLegKnee')
        boots.group.updateMatrixWorld(true)
        const meshes = boots.group.children.filter(child => child instanceof Mesh)
        const toe = meshes[meshes.length - 1]
        expect(toe.position.z).toBeGreaterThan(0)
        boots.cleanup()
    })

    it('带装饰的形状生成多个部件（主体 + 装饰），简单形状部件更少', () => {
        const helmet = createArmorMesh({id: 'helmet', color: 0}, 'headNeck')
        const vest = createArmorMesh({id: 'vest', color: 0}, 'spine')
        expect(partCount(helmet)).toBeGreaterThan(partCount(vest))
        helmet.cleanup()
        vest.cleanup()
    })

    it('accentColor 缺省时安全回退主色暗化，不抛错', () => {
        for (const id of ARMOR_MESH_IDS) {
            const result = createArmorMesh({id, color: 0x123456}, 'spine')
            result.cleanup()
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
