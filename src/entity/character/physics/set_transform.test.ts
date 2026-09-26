import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene, Euler, Quaternion, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩 */
const canvasCtxStub = (): Record<string, unknown> => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    fillRect: () => {},
    beginPath: () => {},
    fill: () => {},
    stroke: () => {},
    arc: () => {},
    ellipse: () => {},
})

const originalGetContext = HTMLCanvasElement.prototype.getContext

const patchCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(),
        configurable: true,
        writable: true,
    })
}

const restoreCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext,
        configurable: true,
        writable: true,
    })
}

const meleeSaveConfig = (overrides?: Partial<CharacterSaveConfig>): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    attack: {
        weaponId: 'long_sword',
        damage: 3,
    },
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
    ...overrides,
})

describe('角色 setTransform 瞬移与朝向映射', () => {
    let system: CharacterEntitySystem
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
        await RAPIER.init()
        patchCanvas2d()
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterAll(() => {
        restoreCanvas2d()
        warnSpy.mockRestore()
    })

    beforeEach(() => {
        const scene = new Scene()
        const shared = createSharedWorld()
        system = setupCharacterEntities(scene, shared)
    })

    it('setTransform 将 rotDeg.y 映射为角色朝向（getFacing 度数归一）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.setTransform(id, {x: 1, y: 2, z: 3}, {x: 0, y: 90, z: 0})
        expect(system.getFacing(id)).toBeCloseTo(90, 6)
        const entity = system.getAll().find(e => e.id === id)
        expect(entity).toBeDefined()
        /* mesh 只绕 Y 轴旋转（角色竖直胶囊锁定旋转） */
        expect(entity!.mesh.rotation.y).toBeCloseTo(Math.PI / 2, 6)
        expect(entity!.mesh.rotation.x).toBeCloseTo(0, 6)
        expect(entity!.mesh.rotation.z).toBeCloseTo(0, 6)
        /* 位置同步 */
        expect(entity!.mesh.position.x).toBeCloseTo(1, 6)
        expect(entity!.mesh.position.y).toBeCloseTo(2, 6)
        expect(entity!.mesh.position.z).toBeCloseTo(3, 6)
    })

    it('setTransform 保留 X/Z 倾斜并按合成旋转求水平朝向', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.setTransform(id, {x: 0, y: 0, z: 0}, {x: 15, y: 90, z: -10})
        const entity = system.getAll().find(e => e.id === id)
        expect(entity).toBeDefined()
        /*
         * rotDeg 为 XYZ 欧拉角，合成为完整旋转（X/Z 视觉倾斜不清零）；
         * 朝向取合成旋转后前向量在水平面的投影，而非退化的欧拉 y 分量。
         */
        const expectedQuat = new Quaternion().setFromEuler(new Euler(
            15 * Math.PI / 180, 90 * Math.PI / 180, -10 * Math.PI / 180, 'XYZ',
        ))
        expect(entity!.mesh.quaternion.x).toBeCloseTo(expectedQuat.x, 6)
        expect(entity!.mesh.quaternion.y).toBeCloseTo(expectedQuat.y, 6)
        expect(entity!.mesh.quaternion.z).toBeCloseTo(expectedQuat.z, 6)
        expect(entity!.mesh.quaternion.w).toBeCloseTo(expectedQuat.w, 6)
        const forward = new Vector3(0, 0, 1).applyQuaternion(expectedQuat)
        const expectedYawDeg = ((Math.atan2(forward.x, forward.z) * 180 / Math.PI) % 360 + 360) % 360
        expect(system.getFacing(id)).toBeCloseTo(expectedYawDeg, 4)
    })

    it('setTransform 纯绕 Y 旋转超过 90° 时朝向完整保留（不被欧拉退化压缩）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        /* 纯 Y 旋转 120°：欧拉 XYZ 会退化为 x=180,y=60,z=180，旧实现朝向被压缩到 60° */
        system.setTransform(id, {x: 0, y: 0, z: 0}, {x: 0, y: 120, z: 0})
        expect(system.getFacing(id)).toBeCloseTo(120, 4)
        system.setTransform(id, {x: 0, y: 0, z: 0}, {x: 0, y: 200, z: 0})
        expect(system.getFacing(id)).toBeCloseTo(200, 4)
    })

    it('setTransform 经 gizmo 四元数→XYZ 欧拉往返后仍保留完整朝向', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        /* 复现编辑期 gizmo 路径：四元数经 Euler('XYZ') 分解再传入 setTransform */
        for (const yawDeg of [120, 200, 270, 350]) {
            const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yawDeg * Math.PI / 180)
            const euler = new Euler().setFromQuaternion(quat, 'XYZ')
            system.setTransform(id, {x: 0, y: 0, z: 0}, {
                x: euler.x * 180 / Math.PI,
                y: euler.y * 180 / Math.PI,
                z: euler.z * 180 / Math.PI,
            })
            expect(system.getFacing(id)).toBeCloseTo(yawDeg, 3)
        }
    })

    it('setTransform 负角度与超过 360° 的角度归一化', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.setTransform(id, {x: 0, y: 0, z: 0}, {x: 0, y: -90, z: 0})
        expect(system.getFacing(id)).toBeCloseTo(270, 6)
        system.setTransform(id, {x: 0, y: 0, z: 0}, {x: 0, y: 450, z: 0})
        expect(system.getFacing(id)).toBeCloseTo(90, 6)
    })

    it('setTransform 对不存在的 id 无副作用', () => {
        system.setTransform(999, {x: 0, y: 0, z: 0}, {x: 0, y: 45, z: 0})
        expect(system.getAll()).toHaveLength(0)
    })
})
