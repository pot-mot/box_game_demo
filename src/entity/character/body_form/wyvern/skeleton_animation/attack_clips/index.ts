import type {AuthoredAttackClip} from '../../../common/skeleton_animation/authored_attack.ts'

/**
 * 双足飞龙攻击段作者数据（键 = 段 poseId）。
 *
 * 当前为空：所有段仍回退到 `pose_fns.ts` 的公式动画。
 * 新增条目后 `clips.ts` 会优先使用作者数据；未列出的段继续回退，便于逐武器增量迁移。
 */
export const ATTACK_CLIPS: Readonly<Record<string, AuthoredAttackClip>> = {}
