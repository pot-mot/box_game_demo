import {Euler, type Group} from 'three'
import {createWeaponMesh, type WeaponMeshConfig} from '../../entity/character/appearance/weapon_mesh.ts'
import {DEFAULT_HANDEDNESS, mainHandSide, offHandSide, type Handedness} from '../../character/handedness.ts'

/**
 * 骨骼编辑器武器装载：「武器占两个骨骼位」的落地——
 * - **主手武器挂点**（右撇子 = `rightWeaponMount`，左撇子 = `leftWeaponMount`）：武器主体挂其下，随主手动画；
 * - **副手武器挂点**（与主手相反侧）：双手武器的副握点，由副手臂链 IK 贴合武器（见 weapon_control.ts）。
 *
 * 武器模型复用生产装配（`createWeaponMesh`，已自带固有握持），直接挂在武器骨骼关节下；
 * 左撇子时与生产一致：改挂副手侧挂点并对**非对称武器网格**施加矢状面镜像（`scale.x = -1`）。
 * 朝向由骨骼动画（武器挂点关节轨道）控制，与游戏内一致。
 * 放在 modes/ 而非 entity/skeleton/：编辑器专用行为，避免 entity 之间相互引用。
 */
export interface SkeletonWeaponSpec {
    readonly weaponId: string
    readonly meshConfig: WeaponMeshConfig
    /** 副手（左手）武器网格；存在即双持（挂左手武器挂点） */
    readonly offhandMeshConfig?: WeaponMeshConfig
    /** 是否双手持握（仅用于展示/动作来源标记，不再自动求解副手 IK） */
    readonly twoHanded: boolean
    /** 专属挂点关节 id（生物体形用；缺省 = 按惯用手取手部武器挂点） */
    readonly mountJointId?: string
    /** 挂点局部旋转覆盖（生物体形用；应用到武器网格，避免改动骨架关节） */
    readonly mountRotation?: readonly [number, number, number]
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

/** 某侧武器挂点关节 id */
const mountIdOf = (side: 'left' | 'right'): string =>
    side === 'left' ? LEFT_WEAPON_MOUNT_JOINT : RIGHT_WEAPON_MOUNT_JOINT
/** 某侧腕关节 id（缺挂点时的回退） */
const wristIdOf = (side: 'left' | 'right'): string => `${side}WristPivot`

/**
 * 装载武器到主手挂点关节下；找不到挂点关节（自定义骨架）时回退主手腕关节。
 * 左撇子（`handedness === 'left'`）与生产一致：改挂副手侧挂点并对非对称武器网格施加矢状面镜像。
 * 返回 undefined 表示骨架缺少可用挂点。
 */
export const equipSkeletonWeapon = (
    groups: ReadonlyMap<string, Group>,
    spec: SkeletonWeaponSpec,
    handedness: Handedness = DEFAULT_HANDEDNESS,
): SkeletonWeapon | undefined => {
    const mirrorScaleX = handedness === 'left' ? -1 : 1
    const parent = spec.mountJointId !== undefined
        ? groups.get(spec.mountJointId)
        : groups.get(mountIdOf(mainHandSide(handedness))) ?? groups.get(wristIdOf(mainHandSide(handedness)))
    if (parent === undefined) return undefined
    const result = createWeaponMesh(spec.meshConfig)
    result.group.scale.x = mirrorScaleX
    if (spec.mountRotation !== undefined) {
        result.group.quaternion.setFromEuler(new Euler(
            spec.mountRotation[0],
            spec.mountRotation[1],
            spec.mountRotation[2],
        ))
    }
    parent.add(result.group)

    /* 双持：副手武器挂副手侧武器挂点（缺挂点回退副手侧腕） */
    let offhand: SkeletonWeaponOffhand | undefined
    if (spec.offhandMeshConfig !== undefined) {
        const offhandParent = groups.get(mountIdOf(offHandSide(handedness))) ?? groups.get(wristIdOf(offHandSide(handedness)))
        if (offhandParent !== undefined) {
            const offResult = createWeaponMesh(spec.offhandMeshConfig)
            offResult.group.scale.x = mirrorScaleX
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
