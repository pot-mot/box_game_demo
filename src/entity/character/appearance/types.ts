import type {Group, Mesh} from 'three'

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

    /** 切换武器（会先移除旧武器） */
    equipWeapon: (type: 'melee' | 'ranged') => void

    /** 移除当前武器 */
    removeWeapon: () => void

    /** 释放所有几何体和材质 */
    dispose: () => void
}

/** 动画上下文，由 animation system 每帧传入 */
export interface AnimationContext {
    readonly stateTime: number
    readonly horizontalSpeed: number
}

/** 单个状态的动画处理器 */
export interface AnimationHandler {
    enter: (model: CharacterModel, ctx: AnimationContext) => void
    update: (dt: number, model: CharacterModel, ctx: AnimationContext) => void
    exit: (model: CharacterModel, ctx: AnimationContext) => void
}
