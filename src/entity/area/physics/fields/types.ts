import type RAPIER from '@dimforge/rapier3d-compat'
import type {BodyEnvironment} from '../../../../physics/environment.ts'
import type {RapQuaternion, RapVector3} from '../../../../physics/rapier_utils.ts'
import type {OverlapResult} from '../overlap.ts'
import type {AreaConfig} from '../../types/index.ts'

/** 浮力场配置 */
export type FloatFieldConfig = NonNullable<AreaConfig['fields']['float']>
/** 风场配置 */
export type WindFieldConfig = NonNullable<AreaConfig['fields']['wind']>
/** 方向重力场配置 */
export type GravityFieldConfig = NonNullable<AreaConfig['fields']['gravity']>

/** 场求解上下文（每帧对每个区域×刚体重建一次） */
export interface AreaFieldContext {
    body: RAPIER.RigidBody
    /** 区域与刚体的重叠结果 */
    overlap: OverlapResult
    /** 区域世界位置 */
    areaPos: RapVector3
    /** 区域世界旋转（局部 +Y 为该区域「上」） */
    areaQuat: RapQuaternion
    /** 角色的环境场累加器（仅角色有；普通刚体为 undefined） */
    env: BodyEnvironment | undefined
}
