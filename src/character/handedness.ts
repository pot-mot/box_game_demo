/**
 * 惯用手（角色以哪只手为主手持械并主导攻击动作）。
 *
 * - `right` 右撇子（默认）：主手 = 解剖右手（`rightWeaponMount`，位于 -X），即 canonical 骨架原样；
 * - `left` 左撇子：主手 = 解剖左手（`leftWeaponMount`，位于 +X），
 *   动画在取用时对 canonical clip 施加**矢状面反射**（见 `skeleton/anim/mirror.ts`），外观按侧装配并镜像，
 *   运行时逐帧零额外开销。
 *
 * 惯用手是角色属性（随存档持久化），不是武器属性：它决定主 / 副手槽位与双手 IK 支撑侧。
 */

import type {StringLocaleKey} from '../i18n/index.ts'

export const HANDEDNESS = ['right', 'left'] as const
export type Handedness = typeof HANDEDNESS[number]

/** 默认惯用手（旧存档 / 缺省 = 右撇子，与 canonical 骨架一致） */
export const DEFAULT_HANDEDNESS: Handedness = 'right'

/** 惯用手本地化名键（面向玩家的面板标签） */
export const HANDEDNESS_LABELS: Readonly<Record<Handedness, StringLocaleKey>> = {
    right: 'handedness.right',
    left: 'handedness.left',
}

/** 运行时/存档校验：任意值是否可窄化为惯用手（旧存档安全回退用） */
export const isHandedness = (value: unknown): value is Handedness =>
    typeof value === 'string' && (HANDEDNESS as readonly string[]).includes(value)

/**
 * 主手侧：右撇子 = `right`、左撇子 = `left`。
 * 主手 = 持握主武器并主导攻击的手臂，其关节 id 由该侧拼接（`${mainHandSide}WeaponMount` 等）。
 */
export const mainHandSide = (handedness: Handedness): 'right' | 'left' =>
    handedness === 'left' ? 'left' : 'right'

/** 副手侧：与主手相反的手臂（副手武器 / 双手 IK 支撑手） */
export const offHandSide = (handedness: Handedness): 'right' | 'left' =>
    handedness === 'left' ? 'right' : 'left'
