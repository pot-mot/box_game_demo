import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest'
import {Mesh, MeshStandardMaterial} from 'three'
import type {BoxPartPalette} from '../../../../render/box_parts.ts'
import {LIMB_RACES, createLimbMesh, type ArmorMeshResult, type LimbMeshConfig} from './armor_mesh.ts'
import {factionColorOf, SELECT_PALETTE} from '../../appearance/constants.ts'

/* happy-dom 不支持 canvas 2d：注入最小桩使种族脸部纹理生成可在测试下运行（与 panel_info.test.ts 同法） */
const originalGetContext = HTMLCanvasElement.prototype.getContext
const canvasCtxStub = (): Record<string, unknown> => ({
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '',
    fillRect: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {},
    arc: () => {}, ellipse: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    quadraticCurveTo: () => {},
})

beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(), configurable: true, writable: true,
    })
})
afterAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext, configurable: true, writable: true,
    })
})

const PALETTE_A: BoxPartPalette = {skinColor: 0xf0c8a0, hairColor: 0x3a2218, bodyColor: 0xe06040, legColor: 0x303050}

const RACE_COLOR = {skeleton: 0xe6e2d3, orc: 0x6f9a4a, elf: 0xe8d3b0} as const

const config = (race: LimbMeshConfig['race']): LimbMeshConfig => ({race, color: RACE_COLOR[race]})

/** 部件数量（仅统计可见网格） */
const partCount = (result: ArmorMeshResult): number =>
    result.group.children.filter(child => child instanceof Mesh).length

/** 收集组内全部标准材质颜色（用于阵营重着色断言） */
const materialColors = (result: ArmorMeshResult): number[] => {
    const colors: number[] = []
    result.group.traverse(obj => {
        if (!(obj instanceof Mesh)) return
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const material of materials) {
            if (material instanceof MeshStandardMaterial) colors.push(material.color.getHex())
        }
    })
    return colors
}

describe('createLimbMesh（种族肢体）', () => {
    it('三族在全部肢体关节均生成部件，cleanup 后清空', () => {
        const joints = ['headNeck', 'spine', 'rightArmShoulder', 'rightArmElbow', 'rightHandPivot', 'leftLegHip', 'rightLegKnee']
        for (const race of LIMB_RACES) {
            for (const jointId of joints) {
                const result = createLimbMesh(config(race), jointId, PALETTE_A)
                expect(partCount(result), `${race}@${jointId}`).toBeGreaterThan(0)
                result.cleanup()
                expect(result.group.children, `${race}@${jointId} cleanup`).toHaveLength(0)
            }
        }
    })

    it('未知关节返回空 group（骨架被编辑后安全跳过，不抛错）', () => {
        const result = createLimbMesh(config('orc'), 'unknownJoint', PALETTE_A)
        expect(result.group.children).toHaveLength(0)
        result.cleanup()
    })

    it('cleanup 释放脸部纹理与材质（Material.dispose 不释放 map，须单独 trackTexture）', () => {
        const result = createLimbMesh(config('orc'), 'headNeck', PALETTE_A)
        const head = result.group.children.find(child => child instanceof Mesh) as Mesh
        const materials = Array.isArray(head.material) ? head.material : [head.material]
        const faceMaterial = materials[4] as MeshStandardMaterial
        const map = faceMaterial.map
        expect(map).not.toBeNull()

        const textureDispose = vi.spyOn(map!, 'dispose')
        const materialDispose = vi.spyOn(faceMaterial, 'dispose')
        result.cleanup()
        expect(textureDispose).toHaveBeenCalledTimes(1)
        expect(materialDispose).toHaveBeenCalledTimes(1)
    })

    it('阵营色唯一映射：肢体披挂色 = factionColorOf(faction) = 同阵营人类身体色', () => {
        /* 0 红 / 1 蓝 的顺序与人类一致，且同一 faction 数字处处同色 */
        for (let faction = 0; faction < 6; faction++) {
            const palette = SELECT_PALETTE(faction)
            expect(palette.bodyColor).toBe(factionColorOf(faction))
        }
        /* 肢体阵营色来自调色板 bodyColor（与人类身体同源），换阵营后随之改变 */
        const palette0 = SELECT_PALETTE(0)
        const palette1 = SELECT_PALETTE(1)
        expect(palette0.bodyColor).not.toBe(palette1.bodyColor)
        const a = createLimbMesh(config('orc'), 'spine', palette0)
        const b = createLimbMesh(config('orc'), 'spine', palette1)
        /* 兽人躯干含阵营色腰带：不同阵营 → 材质颜色集合不同 */
        expect(materialColors(a)).not.toEqual(materialColors(b))
        a.cleanup()
        b.cleanup()
    })
})
