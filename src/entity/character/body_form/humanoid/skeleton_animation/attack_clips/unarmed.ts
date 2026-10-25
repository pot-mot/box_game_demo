import type {AuthoredAttackClip} from './types.ts'

/**
 * 空手攻击作者数据。
 *
 * 空手复用短剑单持 / 双持段的关键帧（见 `weapons.ts` 的 `poseRef`），
 * 因此不再维护独立的空手空中条目。
 */
export const UNARMED_CLIPS: Readonly<Record<string, AuthoredAttackClip>> = {}
