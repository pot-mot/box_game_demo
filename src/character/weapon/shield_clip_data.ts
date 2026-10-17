import type {ClipJSON} from '../../skeleton/anim/serialization.ts'
import {MELEE_HEAVY_DURATION, MELEE_HEAVY_RECOVERY, MELEE_LIGHT_DURATION, MELEE_LIGHT_RECOVERY} from './melee_attacks.ts'

/**
 * 盾牌攻击基础关键帧（程序化生成，避免手写三档 × 四段的巨型字面量）。
 * 与其它近战段同构：base 只放关节静止位置 + 恒等旋转，真实姿态由 `attack_pose_edits.ts`
 * 的盾击 / 盾撞姿态供给（三档盾共享同一套姿态，仅握持角不同）。
 *
 * 三档盾均为单持（`shield_*_one_handed_{light_1,light_2,heavy_1,heavy_2}`），
 * 段时长与轻 / 重段默认值一致（轻 0.533s / 重 0.667s）。
 */

/** 参与盾击动作的关节静止局部位置（与预设骨架定义同源，顺序与真实近战段轨道一致） */
const JOINT_REST: Readonly<Record<string, readonly [number, number, number]>> = {
    rightArmShoulder: [-0.145, 0.36, 0],
    rightArmElbow: [0, -0.18, 0],
    rightWristPivot: [0, 0, 0],
    rightWeaponMount: [0, 0, 0],
    leftArmShoulder: [0.145, 0.36, 0],
    leftArmElbow: [0, -0.18, 0],
    leftWristPivot: [0, 0, 0],
    leftWeaponMount: [0, 0, 0],
    rightLegHip: [-0.04, 0.5, 0],
    rightLegKnee: [0, -0.25, 0],
    leftLegHip: [0.04, 0.5, 0],
    leftLegKnee: [0, -0.25, 0],
    headNeck: [0, 0.36, 0],
    spine: [0, 0.5, 0],
    root: [0, 0, 0],
}

/** 轻段关键帧时间（起手 / 打击顶点 / 收招） */
const SHIELD_LIGHT_TIMES = [0, MELEE_LIGHT_DURATION, MELEE_LIGHT_DURATION + MELEE_LIGHT_RECOVERY] as const
/** 重段关键帧时间（起手 / 打击顶点 / 收招） */
const SHIELD_HEAVY_TIMES = [0, MELEE_HEAVY_DURATION, MELEE_HEAVY_DURATION + MELEE_HEAVY_RECOVERY] as const

/** 命中窗口（on 早于 off 且落在时长内；与其它近战段同节奏） */
const SHIELD_LIGHT_HITBOX = [0.133, 0.253] as const
const SHIELD_HEAVY_HITBOX = [0.2, 0.38] as const

/** 盾段模板键 → 关键帧时间（同时供 `attack_pose_edits.ts` 复用，保证修订时间与基础轨道严格一致） */
export const SHIELD_SEGMENT_TIMES: Readonly<Record<string, readonly [number, number, number]>> = {
    light_1: SHIELD_LIGHT_TIMES,
    light_2: SHIELD_LIGHT_TIMES,
    heavy_1: SHIELD_HEAVY_TIMES,
    heavy_2: SHIELD_HEAVY_TIMES,
}

/** 三档盾的类 id（与 `melee_weapon.ts` 的 `MELEE_WEAPON_CLASSES` 保持同步） */
export const SHIELD_CLASS_IDS = ['shield_small', 'shield_medium', 'shield_large'] as const

const shieldClip = (id: string, times: readonly [number, number, number], hitbox: readonly [number, number]): ClipJSON => ({
    name: id,
    duration: times[2],
    loop: false,
    jointTracks: Object.entries(JOINT_REST).map(([jointId, position]) => ({
        targetId: jointId,
        interpolation: {type: 'bezier_quad', strategy: 'strike_peak'} as const,
        records: times.map(time => ({
            time,
            position: [position[0], position[1], position[2]] as [number, number, number],
            rotation: [0, 0, 0, 1] as [number, number, number, number],
        })),
    })),
    boneTracks: [],
    eventTracks: [{
        records: [
            {time: hitbox[0], eventName: 'hitbox_on', params: {weapon: 'main'}},
            {time: hitbox[1], eventName: 'hitbox_off', params: {weapon: 'main'}},
        ],
    }],
})

const buildShieldClips = (): Record<string, ClipJSON> => {
    const clips: Record<string, ClipJSON> = {}
    for (const classId of SHIELD_CLASS_IDS) {
        for (const [segmentKey, times] of Object.entries(SHIELD_SEGMENT_TIMES)) {
            const hitbox = segmentKey.startsWith('heavy') ? SHIELD_HEAVY_HITBOX : SHIELD_LIGHT_HITBOX
            const id = `${classId}_one_handed_${segmentKey}`
            clips[id] = shieldClip(id, times, hitbox)
        }
    }
    return clips
}

/** 盾牌攻击基础关键帧（键 = `{classId}_one_handed_{segmentKey}`），合入 `ATTACK_CLIP_JSON` */
export const SHIELD_ATTACK_CLIP_JSON: Readonly<Record<string, ClipJSON>> = buildShieldClips()
