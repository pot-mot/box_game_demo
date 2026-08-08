import type {Group, Mesh} from 'three'
import type { WeaponMeshConfig } from './weapon_mesh.ts'

/** 角色配色 palette */
export interface CharacterColorPalette {
    readonly skinColor: number
    readonly hairColor: number
    readonly bodyColor: number
    readonly legColor: number
}

/** 方块人外观模型，暴露所有关节 pivot 供动画系统直接操纵 */
export interface CharacterModel {
    readonly group: Group

    readonly headNeck: Group
    readonly head: Mesh

    readonly body: Mesh

    readonly rightArmShoulder: Group
    readonly rightUpperArm: Mesh
    readonly rightArmElbow: Group
    readonly rightForearm: Mesh
    readonly rightHandPivot: Group

    readonly leftArmShoulder: Group
    readonly leftUpperArm: Mesh
    readonly leftArmElbow: Group
    readonly leftForearm: Mesh
    readonly leftHandPivot: Group

    readonly rightLegHip: Group
    readonly rightThigh: Mesh
    readonly rightLegKnee: Group
    readonly rightShin: Mesh

    readonly leftLegHip: Group
    readonly leftThigh: Mesh
    readonly leftLegKnee: Group
    readonly leftShin: Mesh

    /** 切换武器（传入武器 mesh 配置，会先移除旧武器） */
    equipWeapon: (meshConfig: WeaponMeshConfig) => void

    /** 移除当前武器 */
    removeWeapon: () => void

    /** 当前武器命中检测标记点（null = 未装备），供 melee_executor 使用 */
    readonly weaponMesh: Mesh | null

    /** 根据新调色板原地更新所有部位材质颜色（不重建几何体） */
    recolor: (palette: CharacterColorPalette) => void

    /** 释放所有几何体和材质 */
    dispose: () => void
}

/** 动画上下文，由 animation system 每帧传入 */
export interface AnimationContext {
    readonly stateTime: number
    readonly horizontalSpeed: number
    /** 累计水平位移（m）：由动画系统按平滑速度积分，单调递增，供位移驱动动画使用 */
    readonly horizontalTravel: number
    /** 近战挥砍倾斜角（rad），0=垂直砍，±PI/2=横砍 */
    readonly swingTilt: number
}

/** 单个状态的动画处理器 */
export interface AnimationHandler {
    enter: (model: CharacterModel, ctx: AnimationContext) => void
    update: (dt: number, model: CharacterModel, ctx: AnimationContext) => void
    exit: (model: CharacterModel, ctx: AnimationContext) => void
}
