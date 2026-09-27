import {describe, it, expect} from 'vitest'
import {BoxGeometry, Mesh} from 'three'
import {ARMOR_MESH_IDS, createArmorMesh} from './armor_mesh.ts'
import {ARMOR_PAD} from './constants.ts'
import {PRESET_PART_SIZES} from '../skeleton/preset.ts'

const geometryOf = (mesh: Mesh): BoxGeometry => {
    if (!(mesh.geometry instanceof BoxGeometry)) throw new Error('护甲部件几何应为 BoxGeometry')
    return mesh.geometry
}

describe('createArmorMesh', () => {
    it('头部 / 躯干 / 臂部 / 腿部关节生成部件并挂在返回的 group 下', () => {
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
            expect(result.group.children.length, `${id}@${jointId}`).toBeGreaterThan(0)
            result.cleanup()
            expect(result.group.children).toHaveLength(0)
        }
    })

    it('未知关节返回空 group（骨架被编辑后安全跳过，不抛错）', () => {
        const result = createArmorMesh({id: 'vest', color: 0x888888}, 'unknownJoint')
        expect(result.group.children).toHaveLength(0)
        result.cleanup()
    })

    it('靴仅包小腿：膝关节生成、髋关节为空（关节白名单）', () => {
        const knee = createArmorMesh({id: 'boots', color: 0}, 'leftLegKnee')
        expect(knee.group.children.length).toBeGreaterThan(0)
        knee.cleanup()
        const hip = createArmorMesh({id: 'boots', color: 0}, 'leftLegHip')
        expect(hip.group.children).toHaveLength(0)
        hip.cleanup()
    })

    it('部件尺寸随关节基准身体部件变化（头部件小于躯干部件）', () => {
        const head = createArmorMesh({id: 'helmet', color: 0}, 'headNeck')
        const body = createArmorMesh({id: 'plate', color: 0}, 'spine')
        const headMesh = head.group.children[0]
        const bodyMesh = body.group.children[0]
        if (!(headMesh instanceof Mesh) || !(bodyMesh instanceof Mesh)) throw new Error('护甲部件应为 Mesh')
        expect(geometryOf(headMesh).parameters.width).toBeLessThan(geometryOf(bodyMesh).parameters.width)
        head.cleanup()
        body.cleanup()
    })

    it('包裹部件的宽 / 深外扩大于对应身体部件（不穿模）', () => {
        const plate = createArmorMesh({id: 'plate', color: 0}, 'spine')
        const plateMesh = plate.group.children[0]
        if (!(plateMesh instanceof Mesh)) throw new Error('护甲部件应为 Mesh')
        /* 胸甲主体 = 躯干尺寸 × 形状乘数 + 2×ARMOR_PAD，宽/深须大于躯干原部件 */
        expect(geometryOf(plateMesh).parameters.width).toBeGreaterThan(PRESET_PART_SIZES.bodyW + ARMOR_PAD * 2)
        expect(geometryOf(plateMesh).parameters.depth).toBeGreaterThan(PRESET_PART_SIZES.bodyD + ARMOR_PAD * 2)
        plate.cleanup()

        const helmet = createArmorMesh({id: 'helmet', color: 0}, 'headNeck')
        const helmetMesh = helmet.group.children[0]
        if (!(helmetMesh instanceof Mesh)) throw new Error('护甲部件应为 Mesh')
        expect(geometryOf(helmetMesh).parameters.width).toBeGreaterThan(PRESET_PART_SIZES.headW + ARMOR_PAD * 2)
        helmet.cleanup()

        const bracer = createArmorMesh({id: 'bracer', color: 0}, 'rightArmElbow')
        const bracerMesh = bracer.group.children[0]
        if (!(bracerMesh instanceof Mesh)) throw new Error('护甲部件应为 Mesh')
        expect(geometryOf(bracerMesh).parameters.width).toBeGreaterThan(PRESET_PART_SIZES.armW * 0.8 + ARMOR_PAD * 2)
        bracer.cleanup()
    })

    it('靴的脚尖装饰条向 +Z（前方）偏移', () => {
        const boots = createArmorMesh({id: 'boots', color: 0}, 'leftLegKnee')
        const toe = boots.group.children[1]
        if (!(toe instanceof Mesh)) throw new Error('护甲部件应为 Mesh')
        expect(toe.position.z).toBeGreaterThan(0)
        boots.cleanup()
    })

    it('带装饰的形状生成两个部件（主体 + 装饰条），无装饰生成一个', () => {
        const helmet = createArmorMesh({id: 'helmet', color: 0}, 'headNeck')
        expect(helmet.group.children).toHaveLength(2)
        const vest = createArmorMesh({id: 'vest', color: 0}, 'spine')
        expect(vest.group.children).toHaveLength(1)
        helmet.cleanup()
        vest.cleanup()
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
})
