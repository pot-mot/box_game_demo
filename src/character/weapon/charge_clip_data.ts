import type {ClipJSON} from '../../skeleton/anim/serialization.ts'

/**
 * 专用蓄力姿势 base clip（近战重击蓄力）—— 与攻击 clip 同构：base 只放关节静止位置 + 恒等旋转，
 * 真实姿势由 `charge_pose_edits.ts` 的欧拉修订提供（进度 0 = 蓄力起始位 → 1 = 满蓄力位）。
 * 运行时按住蓄力时按 `combat.attackCharge` 定位到本 clip 对应进度，使后摆 / 举械幅度随蓄力连续增长。
 *
 * 关节静止位置与 `attack_clip_data.ts` 同源（预设骨架）。仅覆盖蓄力会动的双臂关节，
 * 其余关节（脊柱 / 下肢 / 根）保留骨架当前值。
 */
const JOINT_POSITION: Readonly<Record<string, readonly [number, number, number]>> = {
    rightArmShoulder: [0.145, 0.36, 0],
    rightArmElbow: [0, -0.18, 0],
    rightWristPivot: [0, 0, 0],
    rightWeaponMount: [0, 0, 0],
    leftArmShoulder: [-0.145, 0.36, 0],
    leftArmElbow: [0, -0.18, 0],
    leftWristPivot: [0, 0, 0],
    leftWeaponMount: [0, 0, 0],
}

const chargeClip = (id: string): ClipJSON => ({
    name: id,
    duration: 1,
    loop: false,
    jointTracks: Object.entries(JOINT_POSITION).map(([jointId, position]) => ({
        targetId: jointId,
        interpolation: {type: 'linear'},
        records: [
            {time: 0, position: [position[0], position[1], position[2]], rotation: [0, 0, 0, 1]},
            {time: 1, position: [position[0], position[1], position[2]], rotation: [0, 0, 0, 1]},
        ],
    })),
    boneTracks: [],
    eventTracks: [],
})

/** 近战三种持握模式的专用蓄力姿势 base clip（键 = `meleeChargePoseId(holdMode)`） */
export const CHARGE_CLIP_JSON: Readonly<Record<string, ClipJSON>> = {
    charge_melee_one_handed: chargeClip('charge_melee_one_handed'),
    charge_melee_two_handed: chargeClip('charge_melee_two_handed'),
    charge_melee_dual_wield: chargeClip('charge_melee_dual_wield'),
}
