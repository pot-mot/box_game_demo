import type {ScriptedMotion} from '../authoring/motion.ts'
import {mergePoses} from '../authoring/pose_compose.ts'
import {armSwing, headTurn, legLift, rightArmWave, spineBend} from './rig.ts'

const TAU = Math.PI * 2

export const HUMANOID_SCRIPT_MOTIONS: readonly ScriptedMotion[] = [
    {
        id: 'wave',
        nameKey: 'bone_edit.script.humanoid.wave',
        duration: 2,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU
            const wave = Math.sin(phase * 3) * 0.22
            return mergePoses(
                headTurn(0.08, -0.04, 0.03),
                rightArmWave(1.15, 0.42, wave),
            )
        },
    },
    {
        id: 'bow',
        nameKey: 'bone_edit.script.humanoid.bow',
        duration: 1.8,
        loop: false,
        pose: (t, total) => {
            const k = Math.sin(Math.min(1, t / total) * Math.PI)
            return mergePoses(
                spineBend(0.42 * k),
                headTurn(0, 0.18 * k),
                armSwing('right', 0.28 * k, -0.22 * k),
                armSwing('left', 0.28 * k, -0.22 * k),
            )
        },
    },
    {
        id: 'march',
        nameKey: 'bone_edit.script.humanoid.march',
        duration: 1.2,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU
            const left = Math.sin(phase)
            const right = -left
            const leftLift = Math.max(0, left) * 0.55
            const rightLift = Math.max(0, right) * 0.55
            return mergePoses(
                legLift('left', leftLift, leftLift * 1.15),
                legLift('right', rightLift, rightLift * 1.15),
                armSwing('right', left * 0.35, 0.18),
                armSwing('left', right * 0.35, 0.18),
                spineBend(0.03, left * 0.05),
                headTurn(Math.sin(phase * 0.5) * 0.05, 0.02),
            )
        },
    },
]
