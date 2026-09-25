import {Group} from 'three'
import {WEAPON_GRIP_POSES} from './constants.ts'
import {createWeaponMesh, type WeaponMeshConfig, type WeaponMeshResult} from './weapon_mesh.ts'

/**
 * 武器挂点装配（生产角色模型与骨骼动画编辑器共用）：
 * 按武器静态握持姿态建一个 mount Group（位置偏移 + 欧拉角），武器模型挂其下。
 * 握把中心在武器本地 Y 轴上，先旋转后平移，故按 rx 分解偏移
 * （m.y = -gripY·cos(rx)、m.z = -gripY·sin(rx)）使握把中心精确落于挂载关节（手腕 / 武器挂点）。
 * 挂到哪由调用方决定（生产挂右腕；编辑器挂右手武器挂点关节）。
 */
export interface WeaponMount {
    /** 挂点 Group（含静态握持姿态）；由调用方 `parent.add(mount)` */
    readonly mount: Group
    readonly result: WeaponMeshResult
    /** 静态握持前倾角 rx（rad，攻击 clip 生成用 gripTilt） */
    readonly gripTilt: number
}

export const createWeaponMount = (config: WeaponMeshConfig): WeaponMount => {
    const result = createWeaponMesh(config)
    const grip = WEAPON_GRIP_POSES[config.id]
    const mount = new Group()
    const cosR = Math.cos(grip.rx)
    const sinR = Math.sin(grip.rx)
    mount.position.set(grip.x, grip.y - result.gripY * cosR, grip.z - result.gripY * sinR)
    mount.rotation.set(grip.rx, grip.ry, grip.rz)
    mount.add(result.group)
    return {mount, result, gripTilt: grip.rx}
}
