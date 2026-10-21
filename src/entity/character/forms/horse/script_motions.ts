import type {ScriptedMotion} from '../authoring/motion.ts'
import {mergePoses} from '../authoring/pose_compose.ts'
import {
    horseBodyLean,
    horseEars,
    horseHeadNod,
    horseHeadTurn,
    horseLegLift,
    horseLowerJointPitch,
    horseTailSway,
    horseWithersBend,
} from './rig.ts'

const TAU = Math.PI * 2

export const HORSE_SCRIPT_MOTIONS: readonly ScriptedMotion[] = [
    {
        id: 'head_nod',
        nameKey: 'bone_edit.script.horse.head_nod',
        duration: 2.4,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU
            return mergePoses(
                horseHeadNod(0.12 + Math.sin(phase) * 0.14),
                horseHeadTurn(Math.sin(phase * 0.5) * 0.08, Math.cos(phase * 0.5) * 0.03),
                horseTailSway(phase * 0.5, 0.08),
                horseEars(Math.sin(phase) * 0.05),
            )
        },
    },
    {
        id: 'trot',
        nameKey: 'bone_edit.script.horse.trot',
        duration: 1.4,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU
            const diagonal = Math.sin(phase)
            const other = Math.sin(phase + Math.PI)
            const fl = Math.max(0, diagonal)
            const rr = Math.max(0, diagonal)
            const fr = Math.max(0, other)
            const rl = Math.max(0, other)
            return mergePoses(
                horseBodyLean(0.03 + Math.sin(phase * 2) * 0.012, Math.sin(phase) * 0.015),
                horseWithersBend(0.05),
                horseHeadNod(Math.sin(phase * 2) * 0.04),
                horseLegLift('fl', fl * 0.42, fl * 0.58),
                horseLegLift('rr', rr * 0.38, rr * 0.52),
                horseLegLift('fr', fr * 0.42, fr * 0.58),
                horseLegLift('rl', rl * 0.38, rl * 0.52),
                horseLowerJointPitch('fl', -fl * 0.35),
                horseLowerJointPitch('fr', -fr * 0.35),
                horseLowerJointPitch('rl', rl * 0.3),
                horseLowerJointPitch('rr', rr * 0.3),
                horseTailSway(phase * 0.7, 0.1),
            )
        },
    },
    {
        id: 'paw',
        nameKey: 'bone_edit.script.horse.paw',
        duration: 1.8,
        loop: true,
        pose: (t, total) => {
            const phase = (t / total) * TAU
            const lift = Math.max(0, Math.sin(phase))
            return mergePoses(
                horseBodyLean(-0.04 * lift),
                horseWithersBend(0.03),
                horseHeadNod(-0.05 * lift),
                horseLegLift('fr', lift * 0.55, lift * 0.72),
                horseLowerJointPitch('fr', -lift * 0.5),
                horseTailSway(phase * 0.8, 0.06),
                horseEars(Math.sin(phase * 2) * 0.04),
            )
        },
    },
]
