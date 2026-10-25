import {describe, it, expect} from 'vitest'
import {Vector3} from 'three'
import {createWeaponMesh, type WeaponMeshConfig} from './weapon_mesh.ts'

describe('程序化武器模型（weapon_mesh）', () => {
    it('每种武器的指定主握点都被烘焙到模型根节点原点', () => {
        const cases: readonly WeaponMeshConfig[] = [
            {id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322},
            {id: 'heavy_sword', bladeLen: 0.65, color: 0x555566, gripColor: 0x332211},
            {id: 'spear', poleLen: 1, headLen: 0.2, color: 0x886644, headColor: 0xaaaaaa},
            {id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322},
            {id: 'war_hammer', headSize: 0.35, color: 0x777777, gripColor: 0x443311},
            {id: 'bow', size: 0.7, color: 0x886633, stringColor: 0xddddcc},
            {id: 'crossbow', size: 0.5, color: 0x553322, metalColor: 0x888888},
            {id: 'shotgun', size: 0.6, color: 0x443322, metalColor: 0x666666},
            {id: 'staff', poleLen: 0.8, orbRadius: 0.12, color: 0x664422, orbColor: 0x44aaff},
            {id: 'magic_wand', len: 0.5, color: 0x886633, gemColor: 0xff44ff},
            {id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322},
            {id: 'grenade', radius: 0.1, color: 0x445522, bandColor: 0x333311},
            {id: 'molotov', size: 0.25, color: 0x446622, fireColor: 0xff8800},
            {id: 'throwing_dart', len: 0.5, color: 0x888888, tailColor: 0xcc3333},
        ]
        for (const config of cases) {
            const result = createWeaponMesh(config)
            const grip = result.group.localToWorld(new Vector3(result.gripX, result.gripY, result.gripZ))
            expect(grip.length(), `${config.id} 主握点偏离武器挂点`).toBeLessThan(1e-6)
            result.cleanup()
        }
    })

    it('长枪主握点位于枪杆中点', () => {
        const spear = createWeaponMesh({id: 'spear', poleLen: 1, headLen: 0.2, color: 0x886644, headColor: 0xaaaaaa})
        expect(spear.gripY).toBeCloseTo(0.5, 6)
        spear.cleanup()
    })

    it('远程武器不生成近战攻击箱，近战 / 天然武器保留', () => {
        const ranged: readonly WeaponMeshConfig[] = [
            {id: 'bow', size: 0.7, color: 0x886633, stringColor: 0xddddcc},
            {id: 'crossbow', size: 0.5, color: 0x553322, metalColor: 0x888888},
            {id: 'shotgun', size: 0.6, color: 0x443322, metalColor: 0x666666},
            {id: 'staff', poleLen: 0.8, orbRadius: 0.12, color: 0x664422, orbColor: 0x44aaff},
            {id: 'magic_wand', len: 0.5, color: 0x886633, gemColor: 0xff44ff},
            {id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322},
            {id: 'grenade', radius: 0.1, color: 0x445522, bandColor: 0x333311},
            {id: 'molotov', size: 0.25, color: 0x446622, fireColor: 0xff8800},
            {id: 'throwing_dart', len: 0.5, color: 0x888888, tailColor: 0xcc3333},
        ]
        for (const config of ranged) {
            const result = createWeaponMesh(config)
            expect(result.hitBox, config.id).toBeNull()
            result.cleanup()
        }
        const melee = createWeaponMesh({id: 'sword', bladeLen: 0.5, color: 0, gripColor: 0})
        expect(melee.hitBox).not.toBeNull()
        melee.cleanup()
    })
})
