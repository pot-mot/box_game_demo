import {alignYTo, type CreaturePartSpec} from '../creature_runtime/model.ts'
import type {HurtBlockProfile} from '../../../../character/hurt_blocks.ts'

/**
 * wyvern 配色（半写实，固定）：暗苔绿鳞、浅腹、近黑角爪、暗红翅膜。
 * 造型按飞龙解剖：宽矮胸躯 + 收腹、S 形颈、宽矮长颅 + 双角 + 利齿、四节尾 + 尾鳍、
 * 反曲后足、巨翼（三节臂 + 翼指 + 腕端三爪）。
 */
const SCALE = 0x3f5a34
const SCALE_DARK = 0x2e4227
const BELLY = 0x6d8452
const HORN = 0x241f19
const MEMBRANE = 0x4a3540

/** 由关节局部「起 → 止」向量生成锥管部件（起点在关节原点） */
const seg = (
    jointId: string,
    to: readonly [number, number, number],
    rTop: number,
    rBottom: number,
    material: CreaturePartSpec['material'],
    color?: number,
): CreaturePartSpec => ({
    jointId,
    shape: {kind: 'tube', rTop, rBottom, h: Math.hypot(to[0], to[1], to[2]), sides: 10},
    material,
    ...(color !== undefined ? {color} : {}),
    offset: [to[0] / 2, to[1] / 2, to[2] / 2],
    rot: alignYTo(to[0], to[1], to[2]),
})

/** 单侧巨翼：上臂 / 前臂 / 腕爪 + 四指 + 翅膜 */
const wing = (sign: number): CreaturePartSpec[] => {
    const S = sign < 0 ? 'L' : 'R'
    const base = `wing${S}Base`
    const elbow = `wing${S}Elbow`
    const wrist = `wing${S}Wrist`
    const claw = `wing${S}Claw`
    const toElbow: readonly [number, number, number] = [sign * 0.34, 0.55, -0.28]
    const toWrist: readonly [number, number, number] = [sign * -0.16, -1.45, 0.42]
    const fingers: readonly {joint: string; to: readonly [number, number, number]}[] = [
        {joint: `wing${S}FingerA`, to: [sign * 0.1, 1.7, -1.05]},
        {joint: `wing${S}FingerB`, to: [sign * 0.32, 1.6, -0.85]},
        {joint: `wing${S}FingerC`, to: [sign * 0.52, 1.42, -0.62]},
        {joint: `wing${S}FingerD`, to: [sign * 0.68, 1.2, -0.4]},
    ]
    const clawDir: readonly [number, number, number] = [sign * 0.12, -0.9, 0.36]
    return [
        seg(base, toElbow, 0.1, 0.14, 'scale', SCALE),
        seg(elbow, toWrist, 0.065, 0.095, 'scale', SCALE),
        /* 腕端勾爪（常态撑地） */
        seg(wrist, [0, -0.18, 0.1], 0.07, 0.08, 'scale', SCALE_DARK),
        {jointId: claw, shape: {kind: 'cone', r: 0.075, h: 0.32, segments: 8}, material: 'claw', color: HORN, offset: [sign * 0.04, -0.04, 0.08], rot: alignYTo(clawDir[0], clawDir[1], clawDir[2])},
        {jointId: claw, shape: {kind: 'cone', r: 0.04, h: 0.2, segments: 6}, material: 'claw', color: HORN, offset: [sign * 0.09, -0.02, 0.05], rot: [1.4, 0, sign * 0.35]},
        {jointId: claw, shape: {kind: 'cone', r: 0.04, h: 0.2, segments: 6}, material: 'claw', color: HORN, offset: [sign * -0.03, -0.03, 0.11], rot: [1.55, 0, sign * -0.2]},
        /* 四指骨 */
        ...fingers.map(finger => seg(finger.joint, finger.to, 0.028, 0.058, 'scale', SCALE_DARK)),
        /* 翅膜（骨骼驱动）：翼根→翼肘→翼腕→四指末端，随翼指张合实时拉伸 */
        {
            jointId: wrist,
            shape: {
                kind: 'wing_membrane',
                shoulderJointId: base,
                elbowJointId: elbow,
                wristJointId: wrist,
                fingers: fingers.map(finger => ({jointId: finger.joint, tip: finger.to})),
            },
            material: 'membrane',
            color: MEMBRANE,
        },
    ]
}

/** 反曲后足：大腿 → 小腿 → 跗 + 趾爪 */
const leg = (hip: string, knee: string, hock: string): CreaturePartSpec[] => [
    seg(hip, [0, -0.5, 0.26], 0.11, 0.17, 'scale', SCALE),
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.21, ry: 0.25, rz: 0.27, widthSegments: 12, heightSegments: 10}, material: 'scale', color: SCALE, offset: [0, -0.18, 0.1]},
    seg(knee, [0, -0.5, -0.36], 0.08, 0.12, 'scale', SCALE_DARK),
    {jointId: hock, shape: {kind: 'ellipsoid', rx: 0.115, ry: 0.065, rz: 0.17, widthSegments: 10, heightSegments: 6}, material: 'claw', color: HORN, offset: [0, 0.02, 0.16]},
    {jointId: hock, shape: {kind: 'cone', r: 0.034, h: 0.15, segments: 6}, material: 'claw', color: HORN, offset: [-0.07, 0.0, 0.27], rot: [1.75, 0, 0]},
    {jointId: hock, shape: {kind: 'cone', r: 0.034, h: 0.15, segments: 6}, material: 'claw', color: HORN, offset: [0.07, 0.0, 0.27], rot: [1.75, 0, 0]},
    {jointId: hock, shape: {kind: 'cone', r: 0.034, h: 0.15, segments: 6}, material: 'claw', color: HORN, offset: [0, 0.0, 0.3], rot: [1.75, 0, 0]},
]

/** wyvern 半写实部件 */
export const WYVERN_PARTS: readonly CreaturePartSpec[] = [
    /* 胸躯 + 后胯 + 腹鳞 */
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.43, ry: 0.29, rz: 0.43, widthSegments: 14, heightSegments: 12}, material: 'scale', color: SCALE, offset: [0, 0.0, 0.15]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.38, ry: 0.24, rz: 0.38, widthSegments: 14, heightSegments: 12}, material: 'scale', color: SCALE, offset: [0, -0.03, -0.45]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.3, ry: 0.14, rz: 0.6, widthSegments: 12, heightSegments: 8}, material: 'belly', color: BELLY, offset: [0, -0.18, -0.12]},
    /* 背脊棘 */
    {jointId: 'body', shape: {kind: 'cone', r: 0.055, h: 0.18, segments: 5}, material: 'horn', color: HORN, offset: [0, 0.27, 0.0], rot: [-0.2, 0, 0]},
    {jointId: 'body', shape: {kind: 'cone', r: 0.05, h: 0.16, segments: 5}, material: 'horn', color: HORN, offset: [0, 0.25, -0.3], rot: [-0.15, 0, 0]},
    /* S 形长颈 */
    {jointId: 'withers', shape: {kind: 'tube', rTop: 0.17, rBottom: 0.25, h: 0.26, sides: 12}, material: 'scale', color: SCALE, offset: [0, 0.1, 0.075], rot: alignYTo(0, 0.2, 0.15)},
    {jointId: 'neck', shape: {kind: 'tube', rTop: 0.14, rBottom: 0.17, h: 0.43, sides: 12}, material: 'scale', color: SCALE, offset: [0, 0.15, 0.15], rot: alignYTo(0, 0.3, 0.3)},
    /* 长颅 + 吻部 + 双角 + 眉脊 + 牙 + 眼 */
    {jointId: 'head', shape: {kind: 'ellipsoid', rx: 0.25, ry: 0.14, rz: 0.23, widthSegments: 14, heightSegments: 10}, material: 'scale', color: SCALE, offset: [0, 0.07, 0.16]},
    {jointId: 'head', shape: {kind: 'tube', rTop: 0.1, rBottom: 0.18, h: 0.4, sides: 10, depthRatio: 0.6}, material: 'scale', color: SCALE, offset: [0, -0.02, 0.44], rot: alignYTo(0, 0, 1)},
    {jointId: 'head', shape: {kind: 'cone', r: 0.06, h: 0.34, segments: 6}, material: 'horn', color: HORN, offset: [-0.14, 0.25, -0.02], rot: [0.7, 0, 0.4]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.06, h: 0.34, segments: 6}, material: 'horn', color: HORN, offset: [0.14, 0.25, -0.02], rot: [0.7, 0, -0.4]},
    {jointId: 'head', shape: {kind: 'box', w: 0.31, h: 0.055, d: 0.18}, material: 'scale', color: SCALE_DARK, offset: [0, 0.17, 0.26]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.026, h: 0.11, segments: 6}, material: 'tooth', offset: [-0.1, -0.04, 0.46], rot: [Math.PI, 0, 0]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.026, h: 0.11, segments: 6}, material: 'tooth', offset: [0.1, -0.04, 0.46], rot: [Math.PI, 0, 0]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.036, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8c878, offset: [-0.17, 0.1, 0.32]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.036, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8c878, offset: [0.17, 0.1, 0.32]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.02, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0xc4631e, offset: [-0.173, 0.1, 0.336]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.02, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0xc4631e, offset: [0.173, 0.1, 0.336]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.009, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [-0.176, 0.1, 0.35]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.009, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [0.176, 0.1, 0.35]},
    /* 下颚 + 下齿列 */
    {jointId: 'jaw', shape: {kind: 'tube', rTop: 0.12, rBottom: 0.14, h: 0.4, sides: 10, depthRatio: 0.55}, material: 'belly', color: BELLY, offset: [0, -0.03, 0.19], rot: alignYTo(0, 0, 1)},
    {jointId: 'jaw', shape: {kind: 'cone', r: 0.02, h: 0.08, segments: 6}, material: 'tooth', offset: [-0.08, 0.05, 0.27]},
    {jointId: 'jaw', shape: {kind: 'cone', r: 0.02, h: 0.08, segments: 6}, material: 'tooth', offset: [0.08, 0.05, 0.27]},
    /* 四节尾 + 尾鳍 */
    {jointId: 'tailA', shape: {kind: 'tube', rTop: 0.16, rBottom: 0.22, h: 0.5, sides: 10}, material: 'scale', color: SCALE, offset: [0, -0.05, -0.25], rot: alignYTo(0, -0.1, -0.5)},
    {jointId: 'tailB', shape: {kind: 'tube', rTop: 0.1, rBottom: 0.16, h: 0.5, sides: 10}, material: 'scale', color: SCALE, offset: [0, -0.05, -0.25], rot: alignYTo(0, -0.1, -0.5)},
    {jointId: 'tailC', shape: {kind: 'tube', rTop: 0.065, rBottom: 0.1, h: 0.45, sides: 8}, material: 'scale', color: SCALE_DARK, offset: [0, -0.03, -0.22], rot: alignYTo(0, -0.05, -0.45)},
    {jointId: 'tailD', shape: {kind: 'cone', r: 0.075, h: 0.34, segments: 8}, material: 'scale', color: SCALE_DARK, offset: [0, 0, -0.17], rot: alignYTo(0, 0, -0.4)},
    {jointId: 'tailD', shape: {kind: 'fan', points: [[0, 0.1, 0], [-0.2, 0.0, -0.2], [-0.06, -0.02, -0.36], [0.06, -0.02, -0.36], [0.2, 0.0, -0.2]]}, material: 'membrane', color: MEMBRANE},
    /* 反曲后足 */
    ...leg('lHip', 'lKnee', 'lHock'),
    ...leg('rHip', 'rKnee', 'rHock'),
    /* 双翼 */
    ...wing(-1),
    ...wing(1),
]

/** wyvern 受击子块（头 / 颈 / 躯干 / 尾 / 双翼 / 双足） */
export const WYVERN_HURT_BLOCKS: HurtBlockProfile = [
    {id: 'head', jointId: 'head', shape: {kind: 'box', half: {x: 0.22, y: 0.14, z: 0.28}}, offsetLocal: {x: 0, y: 0.04, z: 0.22}},
    {id: 'neck', jointId: 'neck', shape: {kind: 'box', half: {x: 0.18, y: 0.24, z: 0.24}}},
    {id: 'torso', jointId: 'body', shape: {kind: 'box', half: {x: 0.4, y: 0.3, z: 0.5}}},
    {id: 'tail', jointId: 'tailA', shape: {kind: 'box', half: {x: 0.16, y: 0.16, z: 0.62}}, offsetLocal: {x: 0, y: -0.08, z: -0.62}},
    {id: 'wingLeft', jointId: 'wingLBase', shape: {kind: 'box', half: {x: 0.28, y: 0.5, z: 0.42}}, offsetLocal: {x: -0.1, y: -0.32, z: 0.1}},
    {id: 'wingRight', jointId: 'wingRBase', shape: {kind: 'box', half: {x: 0.28, y: 0.5, z: 0.42}}, offsetLocal: {x: 0.1, y: -0.32, z: 0.1}},
    {id: 'leftLeg', jointId: 'lHip', shape: {kind: 'box', half: {x: 0.18, y: 0.5, z: 0.22}}, offsetLocal: {x: 0, y: -0.45, z: 0}},
    {id: 'rightLeg', jointId: 'rHip', shape: {kind: 'box', half: {x: 0.18, y: 0.5, z: 0.22}}, offsetLocal: {x: 0, y: -0.45, z: 0}},
]
