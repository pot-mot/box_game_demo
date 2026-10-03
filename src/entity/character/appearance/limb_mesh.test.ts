import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest'
import {Box3, BoxGeometry, CylinderGeometry, Mesh, MeshStandardMaterial} from 'three'
import type {BoxPartPalette} from '../../../render/box_parts.ts'
import {ELF_GOLDEN_HAIR_COLOR, SKELETON_EYE_COLOR, SKELETON_HOLLOW_COLOR} from '../../../render/constants.ts'
import {LIMB_RACES, createLimbMesh, type ArmorMeshResult, type LimbMeshConfig} from './armor_mesh.ts'
import {factionColorOf, SELECT_PALETTE} from './constants.ts'

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
const PALETTE_B: BoxPartPalette = {skinColor: 0xf0c8a0, hairColor: 0x101010, bodyColor: 0x00ff00, legColor: 0x303050}

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

    it('种族粗壮度决定横向尺寸：骷髅 < 精灵 < 兽人', () => {
        /* 特征宽度：棱台按「对边宽 = max(radiusTop, radiusBottom) × √2」，方盒取 width。
         * （Box3.setFromObject 会把旋转后的 4 边圆柱按圆柱包围盒放大，不能直接比原始包围盒） */
        const characteristicWidth = (result: ArmorMeshResult): number => {
            let width = 0
            for (const child of result.group.children) {
                if (!(child instanceof Mesh)) continue
                if (child.geometry instanceof BoxGeometry) {
                    width = Math.max(width, child.geometry.parameters.width)
                } else if (child.geometry instanceof CylinderGeometry) {
                    const g = child.geometry
                    width = Math.max(width, Math.max(g.parameters.radiusTop, g.parameters.radiusBottom) * Math.SQRT2)
                }
            }
            return width
        }
        const sizes = LIMB_RACES.map(race => {
            const result = createLimbMesh(config(race), 'rightLegHip', PALETTE_A)
            const x = characteristicWidth(result)
            result.cleanup()
            return x
        })
        const skeleton = sizes[0]
        const orc = sizes[1]
        const elf = sizes[2]
        expect(skeleton).toBeLessThan(elf)
        expect(elf).toBeLessThan(orc)
    })

    it('肢体纵向严格对齐被顶替的人类部件（不沉入地面 / 不超出身高）', () => {
        /* 腿部从髋关节向下延伸：底面恰在小腿底面附近，不越过脚底 */
        const result = createLimbMesh(config('orc'), 'rightLegKnee', PALETTE_A)
        result.group.updateMatrixWorld(true)
        const box = new Box3().setFromObject(result.group)
        expect(box.min.y).toBeGreaterThanOrEqual(-0.4)
        expect(box.max.y).toBeLessThanOrEqual(1e-6)
        result.cleanup()
    })

    it('阵营调色板注入肢体：换阵营后材质颜色集合改变', () => {
        const a = createLimbMesh(config('orc'), 'spine', PALETTE_A)
        const b = createLimbMesh(config('orc'), 'spine', PALETTE_B)
        const colorsA = materialColors(a)
        const colorsB = materialColors(b)
        expect(colorsA.length).toBeGreaterThan(0)
        expect(colorsA).not.toEqual(colorsB)
        a.cleanup()
        b.cleanup()
    })

    it('accentColor 缺省时安全回退主色暗化，不抛错', () => {
        for (const race of LIMB_RACES) {
            const result = createLimbMesh({race, color: 0x123456}, 'spine', PALETTE_A)
            result.cleanup()
        }
    })

    it('头部主块带种族脸部纹理（前面材质有 map），三族纹理互不相同', () => {
        const maps: unknown[] = []
        for (const race of LIMB_RACES) {
            const result = createLimbMesh(config(race), 'headNeck', PALETTE_A)
            const head = result.group.children.find(child => child instanceof Mesh) as Mesh
            const materials = Array.isArray(head.material) ? head.material : [head.material]
            /* 前面（面序 4）为脸部贴图材质 */
            const faceMaterial = materials[4] as MeshStandardMaterial
            expect(faceMaterial.map, `${race} 脸纹`).not.toBeNull()
            maps.push(faceMaterial.map)
            result.cleanup()
        }
        expect(new Set(maps).size).toBe(LIMB_RACES.length)
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

    it('头部装饰丰富度：三族头部件数 > 仅一个主颅（种族特征几何）', () => {
        for (const race of LIMB_RACES) {
            const result = createLimbMesh(config(race), 'headNeck', PALETTE_A)
            expect(partCount(result), `${race} 头`).toBeGreaterThan(2)
            result.cleanup()
        }
    })

    it('兽人头部前突下颚带入獠牙几何（局部 +Z 前伸部件）', () => {
        const result = createLimbMesh(config('orc'), 'headNeck', PALETTE_A)
        const meshes = result.group.children.filter(child => child instanceof Mesh)
        expect(meshes.some(mesh => mesh.position.z > 0.05)).toBe(true)
        result.cleanup()
    })

    it('骷髅躯干为拆分骨骼结构（肋骨 / 脊柱 / 骨盆 / 锁骨），零件数远多于单块主躯', () => {
        const skeleton = createLimbMesh(config('skeleton'), 'spine', PALETTE_A)
        const orc = createLimbMesh(config('orc'), 'spine', PALETTE_A)
        /* 骷髅胸腔由多段骨骼拼成，部件数应明显多于兽人的实心主躯 */
        expect(partCount(skeleton)).toBeGreaterThan(partCount(orc) + 5)
        skeleton.cleanup()
        orc.cleanup()
    })

    it('骷髅头部：真实空洞（暗腔底板 + 留有开口的骨质框）+ 眉骨 + 眼窝红点 + 下颌分离', () => {
        const result = createLimbMesh(config('skeleton'), 'headNeck', PALETTE_A)
        const meshes = result.group.children.filter(child => child instanceof Mesh)
        const colors = materialColors(result)
        /* 骨腔暗部（空腔底板）与眼窝凶光红点 */
        expect(colors).toContain(SKELETON_HOLLOW_COLOR)
        expect(colors).toContain(SKELETON_EYE_COLOR)

        /* 种族基色（不是阵营色）：`LimbMeshConfig.color` */
        const boneColor = config('skeleton').color
        const hasColor = (mesh: Mesh, hex: number): boolean => {
            if (!(mesh.geometry instanceof BoxGeometry)) return false
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            return mats.some(m => m instanceof MeshStandardMaterial && m.color.getHex() === hex)
        }
        const isHollow = (mesh: Mesh): boolean => hasColor(mesh, SKELETON_HOLLOW_COLOR)
        const boneFront = (mesh: Mesh): boolean => hasColor(mesh, boneColor)

        /* 空腔底板：位于面颅之前、覆盖较大面积的一块暗色薄板（真实空洞的「底」） */
        const cavity = meshes.filter(mesh => mesh.position.z > 0.02 && isHollow(mesh))
        expect(cavity.length).toBeGreaterThan(0)
        const cavityZ = Math.min(...cavity.map(mesh => mesh.position.z))
        const cavityWidth = (mesh: Mesh): number => (mesh.geometry as BoxGeometry).parameters.width
        expect(Math.max(...cavity.map(cavityWidth))).toBeGreaterThan(0)

        /* 骨质框（骨色正脸块）只在特定位置出现，且在空腔底板**之前**（z 更大）→ 开口处露出空腔 */
        const boneFrontMaxZ = Math.max(
            0,
            ...meshes.filter(m => m.position.z > 0.02 && boneFront(m)).map(m => m.position.z),
        )
        expect(boneFrontMaxZ).toBeGreaterThan(cavityZ)

        /* 眉骨：前脸骨块宽度差异显著（眉骨 ≫ 鼻梁） */
        const frontBoneWidths = meshes.filter(m => m.position.z > 0.02 && boneFront(m)).map(m => (m.geometry as BoxGeometry).parameters.width)
        expect(Math.max(...frontBoneWidths)).toBeGreaterThan(Math.min(...frontBoneWidths) * 1.6)

        /* 下颌骨与上颅分离：骨色块的最低点明显低于空腔底板中心（下颌在下方独立成块） */
        const ys = meshes.filter(m => boneFront(m)).map(m => m.position.y)
        expect(Math.min(...ys)).toBeLessThan(Math.min(...cavity.map(m => m.position.y)))
        result.cleanup()
    })

    it('骷髅四肢为细骨干 + 两端加粗骨节（端部宽度大于中段）', () => {
        const result = createLimbMesh(config('skeleton'), 'rightLegHip', PALETTE_A)
        const solids = result.group.children.filter(
            (child): child is Mesh => child instanceof Mesh && child.geometry instanceof BoxGeometry,
        )
        /* 以部件自身 Y 范围的中点为界，分上端 / 中段 / 下端；端部骨节应比中段骨干宽 */
        const ys = solids.map(mesh => mesh.position.y)
        const span = Math.max(...ys) - Math.min(...ys)
        const midY = (Math.max(...ys) + Math.min(...ys)) / 2
        const width = (mesh: Mesh): number => (mesh.geometry as BoxGeometry).parameters.width
        const top = solids.filter(mesh => mesh.position.y > midY + span * 0.25)
        const middle = solids.filter(mesh => Math.abs(mesh.position.y - midY) <= span * 0.1)
        expect(Math.max(...top.map(width))).toBeGreaterThan(Math.max(...middle.map(width)))
        result.cleanup()
    })

    it('日式精灵：金发 + 后掠尖耳（耳部部件向 -Z 后方延伸）', () => {
        const result = createLimbMesh(config('elf'), 'headNeck', PALETTE_A)
        const colors = materialColors(result)
        /* 金发色出现在头部几何中 */
        expect(colors).toContain(ELF_GOLDEN_HAIR_COLOR)
        /* 尖耳绕 X 轴前倾（rx > 0）使锥尖指向 -Z 后方 */
        const meshes = result.group.children.filter(child => child instanceof Mesh)
        expect(meshes.some(mesh => mesh.rotation.x > 0.1)).toBe(true)
        result.cleanup()
    })

    it('精灵躯干为真棱台沙漏（每段上下底面不等宽），且无颈部金发块、无居中突出物', () => {
        const elf = createLimbMesh(config('elf'), 'spine', PALETTE_A)
        const orc = createLimbMesh(config('orc'), 'spine', PALETTE_A)
        /* 精灵躯干由多段棱台叠成（宽肩→细腰→张胯），零件数明显多于兽人单块主躯 */
        expect(partCount(elf)).toBeGreaterThan(partCount(orc) + 4)

        /* 真棱台：存在 4 边 `CylinderGeometry`，且每段 radiusTop ≠ radiusBottom（上下底面不等大） */
        const frusta = elf.group.children.filter(
            (child): child is Mesh => child instanceof Mesh && child.geometry instanceof CylinderGeometry,
        )
        expect(frusta.length).toBeGreaterThan(2)
        const tapered = frusta.filter(mesh => {
            const g = mesh.geometry as CylinderGeometry
            return Math.abs(g.parameters.radiusTop - g.parameters.radiusBottom) > 1e-6
        })
        expect(tapered.length).toBeGreaterThan(2)

        /* 沙漏收放：各段顶面半径存在「中段明显小于上下端」的层（细腰） */
        const radii = frusta.map(mesh => (mesh.geometry as CylinderGeometry).parameters.radiusTop)
        expect(Math.min(...radii)).toBeLessThan(Math.max(...radii) * 0.72)

        /* 居中突出物已移除：躯干前侧（投影中心 x≈0、z 明显前凸）无独立小方块突出 */
        const protrudingCenter = elf.group.children.filter((child): child is Mesh => {
            if (!(child instanceof Mesh) || !(child.geometry instanceof BoxGeometry)) return false
            const g = (child.geometry as BoxGeometry).parameters
            return Math.abs(child.position.x) < 1e-6 && child.position.z > 0.02 && g.depth > 0.08
        })
        expect(protrudingCenter).toHaveLength(0)

        /* 颈部（躯干顶部）不得含金发色部件（旧版披肩已移除，去除「胡子」） */
        expect(materialColors(elf)).not.toContain(ELF_GOLDEN_HAIR_COLOR)
        elf.cleanup()
        orc.cleanup()
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

    it('精灵四肢为真棱台锥形（上下底面不等宽），上端宽于关节', () => {
        const result = createLimbMesh(config('elf'), 'rightLegHip', PALETTE_A)
        const frusta = result.group.children.filter(
            (child): child is Mesh => child instanceof Mesh && child.geometry instanceof CylinderGeometry,
        )
        expect(frusta.length).toBeGreaterThan(2)
        const g = (mesh: Mesh): CylinderGeometry => mesh.geometry as CylinderGeometry
        /* 至少一段为上粗下细（radiusTop > radiusBottom） */
        expect(frusta.some(mesh => g(mesh).parameters.radiusTop > g(mesh).parameters.radiusBottom + 1e-6)).toBe(true)
        result.cleanup()
    })
})
