import type {AuthoredAttackClip} from './types.ts'
import {SHORT_SWORD_CLIPS} from './short_sword.ts'
import {LONG_SWORD_CLIPS} from './long_sword.ts'
import {HEAVY_SWORD_CLIPS} from './heavy_sword.ts'
import {SPEAR_CLIPS} from './spear.ts'
import {DUAL_AXE_CLIPS} from './dual_axe.ts'
import {WAR_HAMMER_CLIPS} from './war_hammer.ts'
import {SHIELD_CLIPS} from './shields.ts'
import {RANGED_CLIPS} from './ranged.ts'
import {UNARMED_CLIPS} from './unarmed.ts'

/** 全武器攻击段作者数据（键 = 段 id） */
export const ATTACK_CLIPS: Readonly<Record<string, AuthoredAttackClip>> = {
    ...SHORT_SWORD_CLIPS,
    ...LONG_SWORD_CLIPS,
    ...HEAVY_SWORD_CLIPS,
    ...SPEAR_CLIPS,
    ...DUAL_AXE_CLIPS,
    ...WAR_HAMMER_CLIPS,
    ...SHIELD_CLIPS,
    ...RANGED_CLIPS,
    ...UNARMED_CLIPS,
}
