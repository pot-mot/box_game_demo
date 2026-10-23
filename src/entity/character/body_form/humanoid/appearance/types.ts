import type {Group, Mesh} from 'three'
import type {HumanoidModel} from '../../../appearance/types.ts'

/** 人形外观模型：在公共契约之上暴露全部人形关节 pivot 供人形动画系统直接操纵 */
export interface CharacterModel extends HumanoidModel {
    /** 躯干关节（髋部 pivot）：旋转带动 躯干+双臂+头（拧腰/前倾动力链） */
    readonly spine: Group

    readonly headNeck: Group
    readonly head: Mesh

    readonly body: Mesh

    readonly rightArmShoulder: Group
    readonly rightUpperArm: Mesh
    readonly rightArmElbow: Group
    readonly rightForearm: Mesh
    readonly rightHandPivot: Group
    /** 右腕动态关节（动画器驱动刃面朝向/攻击对齐，静止时为单位变换，武器挂其下） */
    readonly rightWristPivot: Group

    readonly leftArmShoulder: Group
    readonly leftUpperArm: Mesh
    readonly leftArmElbow: Group
    readonly leftForearm: Mesh
    readonly leftHandPivot: Group
    /** 左腕动态关节（双持副手武器挂其下） */
    readonly leftWristPivot: Group

    /** 右手武器挂点（主手武器模型直接挂其下；可被动画驱动，控制武器朝向） */
    readonly rightWeaponMount: Group
    /** 左手武器挂点（副手武器/双手 IK 末端；可被动画驱动） */
    readonly leftWeaponMount: Group
    /** 背部武器挂点（双手共持时副手武器挂背；仅视觉挂点，无 clip 轨道） */
    readonly backWeaponMount: Group

    readonly rightLegHip: Group
    readonly rightThigh: Mesh
    readonly rightLegKnee: Group
    readonly rightShin: Mesh

    readonly leftLegHip: Group
    readonly leftThigh: Mesh
    readonly leftLegKnee: Group
    readonly leftShin: Mesh
}
