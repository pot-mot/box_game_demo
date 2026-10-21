import type {ScriptedMotion} from '../authoring/motion.ts'
import {mergePoses} from '../authoring/pose_compose.ts'
import {
    wyvernBodyLean,
    wyvernHeadLook,
    wyvernJaw,
    wyvernLegLift,
    wyvernTailLift,
    wyvernTailWag,
    wyvernWingClaw,
    wyvernWings,
} from './rig.ts'

const TAU = Math.PI * 2

export const WYVERN_SCRIPT_MOTIONS: readonly ScriptedMotion[] = [
    {
        id: 'wing_fold',
        nameKey: 'bone_edit.script.wyvern.wing_fold',
        duration: 2.4,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU
            const spread = 0.35 + (Math.sin(phase) * 0.5 + 0.5) * 0.65
            return mergePoses(
                wyvernWings(spread, Math.cos(phase) * 0.08),
                wyvernHeadLook(Math.sin(phase * 0.5) * 0.08, -0.04),
                wyvernTailWag(phase * 0.7, 0.12),
                wyvernJaw(Math.max(0, Math.sin(phase * 0.5) - 0.92) * 0.1),
            )
        },
    },
    {
        id: 'roar',
        nameKey: 'bone_edit.script.wyvern.roar',
        duration: 2.2,
        loop: false,
        pose: (t, total) => {
            const k = Math.sin(Math.min(1, t / total) * Math.PI)
            return mergePoses(
                wyvernBodyLean(-0.12 * k),
                wyvernHeadLook(0, -0.5 * k),
                wyvernJaw(0.75 * k),
                wyvernWings(0.55 + 0.4 * k, 0.02),
                wyvernWingClaw('l', 0.25 * k),
                wyvernWingClaw('r', 0.25 * k),
                wyvernTailLift(0.22 * k),
            )
        },
    },
    {
        id: 'stalk',
        nameKey: 'bone_edit.script.wyvern.stalk',
        duration: 1.8,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU
            const left = Math.max(0, Math.sin(phase))
            const right = Math.max(0, Math.sin(phase + Math.PI))
            return mergePoses(
                wyvernBodyLean(0.05 + Math.sin(phase * 2) * 0.012, Math.sin(phase) * 0.018),
                wyvernHeadLook(-Math.sin(phase) * 0.06, -0.02),
                wyvernLegLift('l', left * 0.4, left * 0.55),
                wyvernLegLift('r', right * 0.4, right * 0.55),
                wyvernWings(0.22 + Math.sin(phase * 2) * 0.03, 0.04),
                wyvernTailWag(phase * 0.8, 0.13),
            )
        },
    },
]
