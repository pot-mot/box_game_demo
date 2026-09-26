import {describe, expect, it} from 'vitest'
import {ATTACK_CLIP_JSON} from '../../../../character/weapon/attack_clip_data.ts'
import {ATTACK_POSE_EDITS} from '../../../../character/weapon/attack_pose_edits.ts'
import {getAttackClipById} from './attack_clips.ts'

describe('攻击动作逐段姿势修订', () => {
    it('每个攻击段的修订时间、关节轨道都对应现有 clip 关键帧', () => {
        expect(Object.keys(ATTACK_POSE_EDITS)).toHaveLength(35)
        for (const [clipId, edits] of Object.entries(ATTACK_POSE_EDITS)) {
            const clip = getAttackClipById(clipId)
            expect(ATTACK_CLIP_JSON[clipId], `${clipId} 缺少基础动画资产`).toBeDefined()
            for (const edit of edits) {
                for (const [jointId, expectedEuler] of Object.entries(edit.joints)) {
                    const track = clip.jointTracks.find(candidate => candidate.targetId === jointId)
                    const frame = track?.records.find(candidate => candidate.time === edit.time)
                    expect(frame, `${clipId} 缺少 ${jointId} @ ${edit.time}`).toBeDefined()
                    if (frame === undefined) throw new Error(`${clipId} 缺少 ${jointId} @ ${edit.time}`)
                    expect(Math.hypot(...frame.rotation)).toBeCloseTo(1, 6)
                    if (jointId === 'rightArmElbow' || jointId === 'leftArmElbow') {
                        expect(expectedEuler[0], `${clipId} 肘关节方向错误`).toBeLessThan(0)
                    }
                }
            }
        }
    })

    it('每段收招关键帧回到持械戒备（武器挂点握持屈角 / 肩肘与 idle 一致）', () => {
        for (const [clipId, edits] of Object.entries(ATTACK_POSE_EDITS)) {
            const last = edits[edits.length - 1]
            for (const jointId of ['rightWeaponMount', 'leftWeaponMount']) {
                const expectedEuler = last.joints[jointId]
                if (expectedEuler === undefined) continue
                expect(expectedEuler[0], `${clipId} 收招帧 ${jointId} 未回到握持屈角`).toBeCloseTo(1.7, 6)
            }
            expect(last.joints.rightArmShoulder?.[0], `${clipId} 收招帧右肩未回到戒备位`).toBeCloseTo(-0.45, 6)
            expect(last.joints.rightArmElbow?.[0], `${clipId} 收招帧右肘未回到戒备位`).toBeCloseTo(-0.85, 6)
        }
    })

    it('全部攻击姿势的武器挂点不偏离手部握点', () => {
        for (const clipId of Object.keys(ATTACK_CLIP_JSON)) {
            const clip = getAttackClipById(clipId)
            for (const jointId of ['rightWeaponMount', 'leftWeaponMount']) {
                const track = clip.jointTracks.find(candidate => candidate.targetId === jointId)
                if (track === undefined) continue
                for (const record of track.records) {
                    expect(record.position.length(), `${clipId} ${jointId} @ ${record.time}`).toBeLessThan(1e-6)
                }
            }
        }
    })
})
