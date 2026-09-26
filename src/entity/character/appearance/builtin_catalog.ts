/**
 * 内置动作目录的生产侧入口。
 *
 * 骨骼动画编辑器（`modes/bone_edit/builtin_clips.ts`）经此消费生产动画生成器与武器握持姿态，
 * 不再直接 import 外观内部模块（`clips/*`、`constants.ts`），降低模式层对生产内部结构的耦合。
 */
export {getBaseClip, fallingSpeedTier} from './clips/base_clips.ts'
export {getAttackClip} from './clips/attack_clips.ts'
export {WEAPON_GRIP_POSES} from './constants.ts'
