import {afterAll, beforeAll, describe, it, expect} from 'vitest'
import {Group, Mesh, MeshStandardMaterial, Scene} from 'three'
import {createCreatureActor} from './creature_actor.ts'
import {CREATURE_EQUIPMENT_SHOWCASE_TABS} from './constants.ts'
import {bodyFormOf} from '../../entity/character/body_form/index.ts'
import {weaponPresetOrDefault} from '../../character/weapon/catalog.ts'
import {EMPTY_EQUIPMENT_STATE} from '../../character/equipment/types.ts'
import {SHOWCASE_ACTIONS} from './actor_handle.ts'
import {CREATURE_SURFACE_TILE_SIZE} from '../../entity/character/appearance/constants.ts'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩（花色纹理 / 脸部纹理用） */
const canvasCtxStub = (): Record<string, unknown> => ({
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '',
    fillRect: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {},
    arc: () => {}, ellipse: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    quadraticCurveTo: () => {},
})
const originalGetContext = HTMLCanvasElement.prototype.getContext

/** 场景图里的可见网格数（用于确认护甲外观确实挂载） */
const meshCount = (group: Group): number => {
    let count = 0
    group.traverse(object => { if (object instanceof Mesh) count += 1 })
    return count
}

/** 材质颜色集合（用于确认逐槽位肢体直接替换原模型材质） */
const materialColors = (group: Group): number[] => {
    const colors: number[] = []
    group.traverse(object => {
        if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return
        colors.push(object.material.color.getHex())
    })
    return colors
}

const loadoutOf = (pieces: readonly {readonly slot: string; readonly id: string}[]): Readonly<Record<string, string>> =>
    Object.fromEntries(pieces.map(piece => [piece.slot, piece.id]))

describe('展示模式：非人形体形全套装备展示角色', () => {
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
    it('每个体形 Tab 都有可展示的护甲套装 / 逐槽位肢体 / 武器', () => {
        expect(CREATURE_EQUIPMENT_SHOWCASE_TABS.map(tab => tab.bodyFormId)).toEqual(['wyvern', 'horse', 'wolf'])
        for (const tab of CREATURE_EQUIPMENT_SHOWCASE_TABS) {
            const form = bodyFormOf(tab.bodyFormId)
            expect(form.id).toBe(tab.bodyFormId)
            expect((form.armorPieces ?? []).length, tab.bodyFormId).toBeGreaterThan(0)
            expect((form.armorSets ?? []).length, tab.bodyFormId).toBeGreaterThan(1)
            expect((form.limbPieces ?? []).length, tab.bodyFormId).toBeGreaterThan(0)
            expect(form.weapons.length, tab.bodyFormId).toBeGreaterThan(0)
        }
    })

    it('护甲套装挂载后外观网格增加；肢体按槽位替换原模型材质色（色相不偏移）', () => {
        for (const tab of CREATURE_EQUIPMENT_SHOWCASE_TABS) {
            const form = bodyFormOf(tab.bodyFormId)
            const scene = new Scene()
            const base = createCreatureActor({
                id: 0, scene, x: 0, z: 0, name: tab.bodyFormId, subtitle: '', bodyFormId: tab.bodyFormId,
            })
            const baseMeshes = meshCount(base.anchor)
            const baseColors = materialColors(base.anchor)

            const armorSet = form.armorSets?.[0]
            if (armorSet === undefined) throw new Error(`${tab.bodyFormId} 缺少护甲套装`)
            const armored = createCreatureActor({
                id: 1, scene, x: 0, z: 0, name: tab.bodyFormId, subtitle: '', bodyFormId: tab.bodyFormId,
                equipment: {...EMPTY_EQUIPMENT_STATE, armor: armorSet.armor},
            })
            expect(meshCount(armored.anchor), tab.bodyFormId).toBeGreaterThan(baseMeshes)

            const limb = form.limbPieces?.find(piece => piece.slot !== 'wing_claw') ?? form.limbPieces?.[0]
            if (limb === undefined) throw new Error(`${tab.bodyFormId} 缺少肢体配色`)
            const limbed = createCreatureActor({
                id: 2, scene, x: 0, z: 0, name: tab.bodyFormId, subtitle: '', bodyFormId: tab.bodyFormId,
                equipment: {...EMPTY_EQUIPMENT_STATE, limb: loadoutOf([limb])},
            })
            expect(meshCount(limbed.anchor), tab.bodyFormId).toBe(baseMeshes)
            expect(materialColors(limbed.anchor), tab.bodyFormId).not.toEqual(baseColors)
            expect(materialColors(limbed.anchor), `${tab.bodyFormId}:${limb.id}`).toContain(limb.mesh.color)
            const textured = (() => {
                let found = false
                limbed.anchor.traverse(object => {
                    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return
                    if (object.material.color.getHex() === limb.mesh.color && object.material.map !== null) found = true
                })
                return found
            })()
            expect(textured, `${tab.bodyFormId}:${limb.id} 表面花纹`).toBe(true)

            for (const action of SHOWCASE_ACTIONS) {
                armored.setAction(action)
                expect(armored.state).toBe(action)
                armored.update(1 / 60)
            }

            base.dispose()
            armored.dispose()
            limbed.dispose()
        }
    })

    it('生物表面花纹 UV 密度在全身上下保持一致', () => {
        const surfaceMaterialOf: Readonly<Record<string, string>> = {wolf: 'fur', horse: 'hide', wyvern: 'scale'}
        /** 逐三角形边计算 UV 长度 / 3D 长度，取中位数（排除投影轴切换处的少量接缝边） */
        const medianUvDensity = (object: Mesh): number | undefined => {
            const position = object.geometry.getAttribute('position')
            const uv = object.geometry.getAttribute('uv')
            if (position === undefined || uv === undefined) return undefined
            const indices = object.geometry.index
            const count = indices === null ? position.count : indices.count
            const vertexAt = (i: number): number => indices === null ? i : indices.getX(i)
            const densities: number[] = []
            const edge = (a: number, b: number): void => {
                const dx = position.getX(a) - position.getX(b)
                const dy = position.getY(a) - position.getY(b)
                const dz = position.getZ(a) - position.getZ(b)
                const dist = Math.hypot(dx, dy, dz)
                if (dist < 1e-6) return
                const du = uv.getX(a) - uv.getX(b)
                const dv = uv.getY(a) - uv.getY(b)
                densities.push(Math.hypot(du, dv) / dist)
            }
            for (let i = 0; i + 2 < count; i += 3) {
                const a = vertexAt(i)
                const b = vertexAt(i + 1)
                const c = vertexAt(i + 2)
                edge(a, b)
                edge(b, c)
                edge(c, a)
            }
            if (densities.length === 0) return undefined
            densities.sort((left, right) => left - right)
            return densities[Math.floor(densities.length / 2)]
        }
        for (const tab of CREATURE_EQUIPMENT_SHOWCASE_TABS) {
            const model = bodyFormOf(tab.bodyFormId).createModel({speed: 3, jumpHeight: 2, scale: 1}, 0)
            const surfaceMaterial = surfaceMaterialOf[tab.bodyFormId]
            const densities: number[] = []
            model.group.traverse(object => {
                if (!(object instanceof Mesh) || object.userData.materialId !== surfaceMaterial) return
                const density = medianUvDensity(object)
                if (density !== undefined) densities.push(density)
            })
            expect(densities.length, tab.bodyFormId).toBeGreaterThan(0)
            const min = Math.min(...densities)
            const max = Math.max(...densities)
            expect(max / min, tab.bodyFormId).toBeLessThan(1.05)
            expect(min, tab.bodyFormId).toBeGreaterThan(1 / CREATURE_SURFACE_TILE_SIZE * 0.9)
            expect(max, tab.bodyFormId).toBeLessThan(1 / CREATURE_SURFACE_TILE_SIZE * 1.1)
            model.dispose()
        }
    })

    it('可装配各体形默认武器并释放', () => {
        for (const tab of CREATURE_EQUIPMENT_SHOWCASE_TABS) {
            const form = bodyFormOf(tab.bodyFormId)
            const weaponId = Object.values(form.defaultWeaponLoadout)[0]
            if (weaponId === undefined) throw new Error(`${tab.bodyFormId} 未声明默认武器`)
            const actor = createCreatureActor({
                id: 0, scene: new Scene(), x: 0, z: 0, name: tab.bodyFormId, subtitle: '', bodyFormId: tab.bodyFormId,
                weapon: weaponPresetOrDefault(weaponId),
            })
            expect(actor.anchor.parent).not.toBeNull()
            actor.dispose()
        }
    })
})
