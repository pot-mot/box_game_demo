import {describe, it, expect} from 'vitest'
import {Box3, Vector3} from 'three'
import {createWeaponMesh, type WeaponMeshConfig} from './weapon_mesh.ts'

/** 计算武器模型的**固有尺寸**（在武器 Group 本地、忽略烘焙握持旋转） */
const rawSize = (config: WeaponMeshConfig): Vector3 => {
    const result = createWeaponMesh(config)
    /* 固有握持旋转烘焙在 Group 上，测量固有时先归零，避免倾斜影响坐标轴判断 */
    result.group.rotation.set(0, 0, 0)
    result.group.position.set(0, 0, 0)
    result.group.updateMatrixWorld(true)
    const size = new Box3().setFromObject(result.group).getSize(new Vector3())
    result.cleanup()
    return size
}

/** 各可见部件的 Y 轴区间（用于校验握把—护手—刃/柄—头相互重叠连接） */
const yIntervals = (config: WeaponMeshConfig): readonly (readonly [number, number])[] => {
    const result = createWeaponMesh(config)
    result.group.rotation.set(0, 0, 0)
    result.group.position.set(0, 0, 0)
    result.group.updateMatrixWorld(true)
    const intervals: (readonly [number, number])[] = []
    for (const child of result.group.children) {
        if (!child.visible) continue
        const box = new Box3().setFromObject(child)
        intervals.push([box.min.y, box.max.y])
    }
    result.cleanup()
    return intervals.sort((a, b) => a[0] - b[0])
}

/** 区间并集是否无空隙（相邻部件有重叠或相接） */
const isConnectedAlongY = (intervals: readonly (readonly [number, number])[]): boolean => {
    let reach = intervals.length > 0 ? intervals[0][1] : 0
    for (let i = 1; i < intervals.length; i++) {
        if (intervals[i][0] > reach + 1e-6) return false
        reach = Math.max(reach, intervals[i][1])
    }
    return true
}

describe('程序化武器模型（weapon_mesh）', () => {
    it('长弓立于本地 Y-Z 平面：弓臂沿 Z 竖立、弓面最薄，而非沿 Y 前伸', () => {
        const size = rawSize({id: 'bow', size: 0.7, color: 0x886633, stringColor: 0xddddcc})
        /* 武器本地 +Y = 射向（前方），±Z = 世界上下；弓臂应沿 Z 展开为最大尺寸 */
        expect(size.z).toBeGreaterThan(0.6)
        expect(size.z).toBeGreaterThan(size.y)
        expect(size.z).toBeGreaterThan(size.x)
        /* 弓面法向（本地 X）应最薄：弓是一张立在 Y-Z 平面内的薄片 */
        expect(size.x).toBeLessThan(0.1)
    })

    it('弩沿射向（本地 +Y）细长：木身/枪托不横跨 X，且高度（Z）最薄', () => {
        const size = rawSize({id: 'crossbow', size: 0.5, color: 0x553322, metalColor: 0x888888})
        /* 木身沿 Y 贯穿，射向尺寸应接近模型总长；旧的横向平板会明显偏短 */
        expect(size.y).toBeGreaterThan(0.45)
        expect(size.y).toBeGreaterThan(size.x)
        expect(size.z).toBeLessThan(size.y)
    })

    it('霰弹枪沿射向（本地 +Y）细长：后托/枪管共轴，而非竖直鳍片', () => {
        const size = rawSize({id: 'shotgun', size: 0.6, color: 0x443322, metalColor: 0x666666})
        expect(size.y).toBeGreaterThan(0.54)
        expect(size.y).toBeGreaterThan(size.x)
        expect(size.z).toBeLessThan(size.y)
    })

    it('剑/斧刃面竖向：宽沿本地 Z（世界上下）、薄沿本地 X，而非躺平为横向', () => {
        const cases: readonly WeaponMeshConfig[] = [
            {id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322},
            {id: 'heavy_sword', bladeLen: 0.65, color: 0x555566, gripColor: 0x332211},
            {id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322},
            {id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322},
        ]
        for (const config of cases) {
            const size = rawSize(config)
            expect(size.z, `${config.id} 刃面未竖向`).toBeGreaterThan(size.x)
        }
    })

    it('双斧刃几何关于本地矢状面（X=0）对称：左手武器即右手的镜像', () => {
        const result = createWeaponMesh({id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322})
        result.group.rotation.set(0, 0, 0)
        result.group.position.set(0, 0, 0)
        result.group.updateMatrixWorld(true)
        const box = new Box3().setFromObject(result.group)
        expect(box.min.x).toBeCloseTo(-box.max.x, 6)
        result.cleanup()
    })

    it('各部件沿本地 Y 相互重叠连接，无脱离', () => {
        const cases: readonly WeaponMeshConfig[] = [
            {id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322},
            {id: 'heavy_sword', bladeLen: 0.65, color: 0x555566, gripColor: 0x332211},
            {id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322},
            {id: 'grenade', radius: 0.1, color: 0x445522, bandColor: 0x333311},
            {id: 'molotov', size: 0.2, color: 0x446622, fireColor: 0xff8800},
        ]
        for (const config of cases) {
            expect(isConnectedAlongY(yIntervals(config)), `${config.id} 部件未连接`).toBe(true)
        }
    })
})
