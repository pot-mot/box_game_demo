import type {Group} from 'three'
import {createWeaponMesh, type WeaponMeshConfig} from '../../entity/character/appearance/weapon_mesh.ts'

/**
 * 骨骼编辑器武器装载：「武器占两个骨骼位」的落地——
 * - **右手武器挂点**（`rightWeaponMount`）：武器主体挂其下，随右手动画（武器跟随手部）；
 * - **左手武器挂点**（`leftWeaponMount`）：双手武器的副握点，由左手链 IK 贴合武器（见 weapon_control.ts）。
 *
 * 武器模型复用生产装配（`createWeaponMesh`，已自带固有握持），直接挂在武器骨骼关节下；
 * 朝向由骨骼动画（`rightWeaponMount` / `leftWeaponMount` 轨道）控制，与游戏内一致。
 * 放在 modes/ 而非 entity/skeleton/：编辑器专用行为，避免 entity 之间相互引用。
 */
export interface SkeletonWeaponSpec {
    readonly weaponId: string
    readonly meshConfig: WeaponMeshConfig
    /** 副手（左手）武器网格；存在即双持（挂左手武器挂点） */
    readonly offhandMeshConfig?: WeaponMeshConfig
    /** 是否双手持握（左手需 IK 贴合武器） */
    readonly twoHanded: boolean
}

/** 已装载的副手武器（双持） */
export interface SkeletonWeaponOffhand {
    readonly weaponGroup: Group
    readonly gripX: number
    readonly gripY: number
    readonly gripZ: number
    readonly supportGripOffset: number
    readonly cleanup: () => void
}

/** 已装载的武器（含释放句柄） */
export interface SkeletonWeapon {
    readonly spec: SkeletonWeaponSpec
    /** 武器模型根 Group（已自带固有握持，直接挂在武器骨骼关节下；朝向由骨骼动画控制） */
    readonly weaponGroup: Group
    /** 握把中心在武器本地 Y 轴上的距离（命中/副握点计算用） */
    readonly gripX: number
    readonly gripY: number
    readonly gripZ: number
    /** 左手副握点相对主握把沿武器本地 +Y 的距离 */
    readonly supportGripOffset: number
    /** 副手武器（双持；否则 undefined） */
    readonly offhand: SkeletonWeaponOffhand | undefined
    /** 释放武器网格几何/材质并从场景图移除 */
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
    const result = createWeaponMesh(spec.meshConfig)
    parent.add(result.group)

    /* 双持：副手武器挂左手武器挂点（缺挂点回退左腕） */
    let offhand: SkeletonWeaponOffhand | undefined
    if (spec.offhandMeshConfig !== undefined) {
        const offhandParent = groups.get(LEFT_WEAPON_MOUNT_JOINT) ?? groups.get('leftWristPivot')
        if (offhandParent !== undefined) {
            const offResult = createWeaponMesh(spec.offhandMeshConfig)
            offhandParent.add(offResult.group)
            offhand = {
                weaponGroup: offResult.group,
                gripX: offResult.gripX,
                gripY: offResult.gripY,
                gripZ: offResult.gripZ,
                supportGripOffset: offResult.supportGripOffset,
                cleanup: offResult.cleanup,
            }
        }
    }

    return {
        spec,
        weaponGroup: result.group,
        gripX: result.gripX,
        gripY: result.gripY,
        gripZ: result.gripZ,
        supportGripOffset: result.supportGripOffset,
        offhand,
        dispose: (): void => {
            result.group.removeFromParent()
            result.cleanup()
            if (offhand !== undefined) {
                offhand.weaponGroup.removeFromParent()
                offhand.cleanup()
            }
        },
    }
}
