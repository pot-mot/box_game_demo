import type {Group} from 'three'
import {createWeaponMount} from '../../entity/character/appearance/weapon_mount.ts'
import type {WeaponMeshConfig} from '../../entity/character/appearance/weapon_mesh.ts'

/**
 * 骨骼编辑器武器装载：「武器占两个骨骼位」的落地——
 * - **右手武器挂点**（`rightWeaponMount`）：武器主体挂其下，随右手动画（武器跟随手部）；
 * - **左手武器挂点**（`leftWeaponMount`）：双手武器的副握点，由左手链 IK 贴合武器（见 weapon_control.ts）。
 *
 * 武器网格与静态握持姿态复用生产装配（`createWeaponMount`），保证编辑器看到的就是游戏里的握持姿态。
 * 放在 modes/ 而非 entity/skeleton/：编辑器专用行为，避免 entity 之间相互引用。
 */
export interface SkeletonWeaponSpec {
    readonly weaponId: string
    readonly meshConfig: WeaponMeshConfig
    /** 是否双手持握（左手需 IK 贴合武器） */
    readonly twoHanded: boolean
}

/** 已装载的武器（含释放句柄） */
export interface SkeletonWeapon {
    readonly spec: SkeletonWeaponSpec
    /** 挂点 Group（挂在右手武器挂点关节下；握把中心落于该关节） */
    readonly mount: Group
    /** 武器模型根 Group（`mount` 的子级，随武器轴 +Y 从握把延伸） */
    readonly weaponGroup: Group
    /** 握把中心在武器本地 Y 轴上的距离（挂点偏移据此计算） */
    readonly gripY: number
    /** 释放武器网格几何/材质并从场景图移除挂点 */
    readonly dispose: () => void
}

/** 右手武器挂点关节 id（缺省回退右腕，兼容自定义骨架） */
export const RIGHT_WEAPON_MOUNT_JOINT = 'rightWeaponMount'
/** 左手武器挂点关节 id（缺省回退左腕，兼容自定义骨架） */
export const LEFT_WEAPON_MOUNT_JOINT = 'leftWeaponMount'

/**
 * 装载武器到右手挂点关节下；找不到挂点关节（自定义骨架）时回退右腕关节。
 * 返回 undefined 表示骨架缺少可用挂点。
 */
export const equipSkeletonWeapon = (
    groups: ReadonlyMap<string, Group>,
    spec: SkeletonWeaponSpec,
): SkeletonWeapon | undefined => {
    const parent = groups.get(RIGHT_WEAPON_MOUNT_JOINT) ?? groups.get('rightWristPivot')
    if (parent === undefined) return undefined
    const assembly = createWeaponMount(spec.meshConfig)
    parent.add(assembly.mount)
    return {
        spec,
        mount: assembly.mount,
        weaponGroup: assembly.result.group,
        gripY: assembly.result.gripY,
        dispose: (): void => {
            assembly.mount.removeFromParent()
            assembly.result.cleanup()
        },
    }
}
