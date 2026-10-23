import type {ScriptedMotion} from '../../common/authoring/motion.ts'
import {mergePoses} from '../../common/authoring/pose_compose.ts'
import {
    wolfBodyLean,
    wolfEars,
    wolfHeadLook,
    wolfJaw,
    wolfLegLift,
    wolfTailLift,
    wolfTailWag,
} from './rig.ts'

const TAU = Math.PI * 2

export const WOLF_SCRIPT_MOTIONS: readonly ScriptedMotion[] = [
    {
        id: 'tail_wag',
        nameKey: 'bone_edit.script.wolf.tail_wag',
        duration: 2,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU * 2
            return mergePoses(
                wolfHeadLook(Math.sin(phase * 0.5) * 0.12, -0.04),
                wolfTailWag(phase, 0.18),
                wolfEars(0.04 + Math.sin(phase * 0.5) * 0.03),
                wolfJaw(Math.max(0, Math.sin(phase * 0.5) - 0.9) * 0.12),
            )
        },
    },
    {
        id: 'prowl',
        nameKey: 'bone_edit.script.wolf.prowl',
        duration: 1.6,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU
            const fl = Math.max(0, Math.sin(phase))
            const rr = Math.max(0, Math.sin(phase))
            const fr = Math.max(0, Math.sin(phase + Math.PI))
            const rl = Math.max(0, Math.sin(phase + Math.PI))
            return mergePoses(
                wolfBodyLean(0.06 + Math.sin(phase * 2) * 0.015, Math.sin(phase) * 0.02),
                wolfHeadLook(-Math.sin(phase) * 0.06, -0.03),
                wolfLegLift('fl', fl * 0.34, fl * 0.48),
                wolfLegLift('rr', rr * 0.3, rr * 0.42),
                wolfLegLift('fr', fr * 0.34, fr * 0.48),
                wolfLegLift('rl', rl * 0.3, rl * 0.42),
                wolfTailWag(phase * 0.8, 0.14),
                wolfEars(0.05),
            )
        },
    },
    {
        id: 'howl',
        nameKey: 'bone_edit.script.wolf.howl',
        duration: 2.2,
        loop: false,
        pose: (t, total) => {
            const k = Math.sin(Math.min(1, t / total) * Math.PI)
            return mergePoses(
                wolfBodyLean(-0.1 * k),
                wolfHeadLook(0, -0.55 * k),
                wolfJaw(0.62 * k),
                wolfEars(-0.22 * k),
                wolfTailLift(0.18 * k),
            )
        },
    },
]
