import {alignYTo, type CreaturePartSpec} from '../creature_runtime/model.ts'
import type {HurtBlockProfile} from '../../../../character/hurt_blocks.ts'

/**
 * wyvern 配色（半写实，固定）：暗苔绿鳞、浅腹、近黑角爪、暗红翅膜。
 * 造型按飞龙解剖：宽矮胸躯 + 收腹、S 形颈、宽矮长颅 + 双角 + 利齿、三节尾 + 尾鳍、
 * **反曲后足**（髋在体侧、抬至背高；髋→膝 前→跗 后）、**巨翼**（三节臂 + 腕端勾爪撑地 + 四指翅膜，参考蝙蝠翼）。
 */
const SCALE = 0x3f5a34
const SCALE_DARK = 0x2e4227
const BELLY = 0x6d8452
const HORN = 0x241f19
const MEMBRANE = 0x4a3540

/** 由关节局部「起 → 止」向量生成锥管部件（起点在关节原点） */
const seg = (jointId: string, to: readonly [number, number, number], rTop: number, rBottom: number, material: CreaturePartSpec['material'], color?: number): CreaturePartSpec => ({
    jointId,
    shape: {kind: 'tube', rTop, rBottom, h: Math.hypot(to[0], to[1], to[2]), sides: 10},
    material,
    ...(color !== undefined ? {color} : {}),
    offset: [to[0] / 2, to[1] / 2, to[2] / 2],
    rot: alignYTo(to[0], to[1], to[2]),
})

/** 单侧巨翼（放大 2.5×）：上臂 / 前臂 / 腕勾爪 + 四指 + 翅膜；sign = -1 左翼 / +1 右翼 */
const wing = (sign: number): CreaturePartSpec[] => {
    const base = sign < 0 ? 'wingLBase' : 'wingRBase'
    const elbow = sign < 0 ? 'wingLElbow' : 'wingRElbow'
    const wrist = sign < 0 ? 'wingLWrist' : 'wingRWrist'
    const toElbow: readonly [number, number, number] = [sign * 0.34, 0.62, -0.3]
    const toWrist: readonly [number, number, number] = [sign * -0.12, -1.77, 0.72]
    /* 四指指尖（腕局部坐标，放大 2.5×；折叠态沿体侧向后上收起，展开时腕部旋转外张） */
    const fingers: readonly (readonly [number, number, number])[] = sign < 0
        ? [[-0.2, 1.95, -1.25], [-0.375, 1.85, -1.05], [-0.55, 1.7, -0.85], [-0.7, 1.5, -0.65]]
        : [[0.2, 1.95, -1.25], [0.375, 1.85, -1.05], [0.55, 1.7, -0.85], [0.7, 1.5, -0.65]]
    const clawDir: readonly [number, number, number] = [sign * 0.1, -0.95, 0.3]
    return [
        seg(base, toElbow, 0.09, 0.13, 'scale', SCALE),
        seg(elbow, toWrist, 0.06, 0.09, 'scale', SCALE),
        /* 腕端勾爪：向下撑地（常态四足着地） */
        {jointId: wrist, shape: {kind: 'cone', r: 0.07, h: 0.3, segments: 8}, material: 'claw', color: HORN, offset: [sign * 0.04, -0.02, 0.06], rot: alignYTo(clawDir[0], clawDir[1], clawDir[2])},
        /* 四指骨 */
        ...fingers.map(tip => seg(wrist, tip, 0.03, 0.06, 'scale', SCALE_DARK)),
        /* 翅膜（腕 → 四指指尖的扇面） */
        {jointId: wrist, shape: {kind: 'fan', points: [[0, 0, 0], ...fingers]}, material: 'membrane', color: MEMBRANE},
    ]
}

/** 反曲后足：大腿（髋在体侧、前伸）→ 小腿（后）→ 跗 + 趾爪（着地） */
const leg = (hip: string, knee: string, hock: string): CreaturePartSpec[] => [
    seg(hip, [0, -0.5, 0.26], 0.11, 0.16, 'scale', SCALE),
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.2, ry: 0.24, rz: 0.26, widthSegments: 12, heightSegments: 10}, material: 'scale', color: SCALE, offset: [0, -0.18, 0.1]},
    seg(knee, [0, -0.5, -0.36], 0.08, 0.11, 'scale', SCALE_DARK),
    {jointId: hock, shape: {kind: 'ellipsoid', rx: 0.11, ry: 0.06, rz: 0.16, widthSegments: 10, heightSegments: 6}, material: 'claw', color: HORN, offset: [0, 0.02, 0.16]},
    {jointId: hock, shape: {kind: 'cone', r: 0.032, h: 0.14, segments: 6}, material: 'claw', color: HORN, offset: [-0.07, 0.0, 0.27], rot: [1.75, 0, 0]},
    {jointId: hock, shape: {kind: 'cone', r: 0.032, h: 0.14, segments: 6}, material: 'claw', color: HORN, offset: [0.07, 0.0, 0.27], rot: [1.75, 0, 0]},
    {jointId: hock, shape: {kind: 'cone', r: 0.032, h: 0.14, segments: 6}, material: 'claw', color: HORN, offset: [0, 0.0, 0.3], rot: [1.75, 0, 0]},
]

/** wyvern 半写实部件（宽矮胸躯、S 形颈、宽矮长颅、三节尾 + 尾鳍、反曲后足、巨翼） */
export const WYVERN_PARTS: readonly CreaturePartSpec[] = [
    /* 胸躯（宽矮，前） + 后胯（后） + 腹鳞 */
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.42, ry: 0.28, rz: 0.42, widthSegments: 14, heightSegments: 12}, material: 'scale', color: SCALE, offset: [0, 0.0, 0.15]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.38, ry: 0.24, rz: 0.38, widthSegments: 14, heightSegments: 12}, material: 'scale', color: SCALE, offset: [0, -0.03, -0.45]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.3, ry: 0.14, rz: 0.6, widthSegments: 12, heightSegments: 8}, material: 'belly', color: BELLY, offset: [0, -0.18, -0.12]},
    /* S 形长颈：下段自肩部（身体前方）连到颈中，上段连到头顶 */
    {jointId: 'withers', shape: {kind: 'tube', rTop: 0.17, rBottom: 0.24, h: 0.25, sides: 12}, material: 'scale', color: SCALE, offset: [0, 0.1, 0.075], rot: alignYTo(0, 0.2, 0.15)},
    {jointId: 'neck', shape: {kind: 'tube', rTop: 0.14, rBottom: 0.17, h: 0.43, sides: 12}, material: 'scale', color: SCALE, offset: [0, 0.15, 0.15], rot: alignYTo(0, 0.3, 0.3)},
    /* 宽矮长颅 + 吻部 + 双角 + 牙 + 眼 + 眉脊 */
    {jointId: 'head', shape: {kind: 'ellipsoid', rx: 0.24, ry: 0.13, rz: 0.22, widthSegments: 14, heightSegments: 10}, material: 'scale', color: SCALE, offset: [0, 0.07, 0.16]},
    {jointId: 'head', shape: {kind: 'tube', rTop: 0.1, rBottom: 0.18, h: 0.4, sides: 10, depthRatio: 0.6}, material: 'scale', color: SCALE, offset: [0, -0.02, 0.44], rot: alignYTo(0, 0, 1)},
    {jointId: 'head', shape: {kind: 'cone', r: 0.06, h: 0.32, segments: 6}, material: 'horn', color: HORN, offset: [-0.14, 0.24, -0.02], rot: [0.7, 0, 0.4]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.06, h: 0.32, segments: 6}, material: 'horn', color: HORN, offset: [0.14, 0.24, -0.02], rot: [0.7, 0, -0.4]},
    {jointId: 'head', shape: {kind: 'box', w: 0.3, h: 0.05, d: 0.18}, material: 'scale', color: SCALE_DARK, offset: [0, 0.17, 0.26]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.024, h: 0.1, segments: 6}, material: 'tooth', offset: [-0.1, -0.04, 0.46], rot: [Math.PI, 0, 0]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.024, h: 0.1, segments: 6}, material: 'tooth', offset: [0.1, -0.04, 0.46], rot: [Math.PI, 0, 0]},
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
    /* 三节尾 + 尾鳍 */
    {jointId: 'tailA', shape: {kind: 'tube', rTop: 0.16, rBottom: 0.22, h: 0.5, sides: 10}, material: 'scale', color: SCALE, offset: [0, -0.05, -0.25], rot: alignYTo(0, -0.1, -0.4)},
    {jointId: 'tailB', shape: {kind: 'tube', rTop: 0.1, rBottom: 0.16, h: 0.5, sides: 10}, material: 'scale', color: SCALE, offset: [0, -0.05, -0.25], rot: alignYTo(0, -0.1, -0.5)},
    {jointId: 'tailC', shape: {kind: 'tube', rTop: 0.05, rBottom: 0.1, h: 0.45, sides: 8}, material: 'scale', color: SCALE_DARK, offset: [0, -0.03, -0.22], rot: alignYTo(0, -0.05, -0.45)},
    {jointId: 'tailC', shape: {kind: 'fan', points: [[0, 0.08, 0], [-0.2, 0.0, -0.2], [-0.06, -0.02, -0.36], [0.06, -0.02, -0.36], [0.2, 0.0, -0.2]]}, material: 'membrane', color: MEMBRANE},
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
    /* 尾部受击箱覆盖整条尾（tailA→tailB→tailC，沿关节局部 -Z 延伸约 1.4） */
    {id: 'tail', jointId: 'tailA', shape: {kind: 'box', half: {x: 0.16, y: 0.16, z: 0.72}}, offsetLocal: {x: 0, y: -0.08, z: -0.68}},
    /* 双翼受击箱明显收窄：仅覆盖上臂 / 前臂段（原 0.5×1.2×0.8 过大，翼膜不必整体受击） */
    {id: 'wingLeft', jointId: 'wingLBase', shape: {kind: 'box', half: {x: 0.3, y: 0.55, z: 0.45}}, offsetLocal: {x: -0.12, y: -0.35, z: 0.12}},
    {id: 'wingRight', jointId: 'wingRBase', shape: {kind: 'box', half: {x: 0.3, y: 0.55, z: 0.45}}, offsetLocal: {x: 0.12, y: -0.35, z: 0.12}},
    {id: 'leftLeg', jointId: 'lHip', shape: {kind: 'box', half: {x: 0.18, y: 0.55, z: 0.22}}, offsetLocal: {x: 0, y: -0.5, z: 0}},
    {id: 'rightLeg', jointId: 'rHip', shape: {kind: 'box', half: {x: 0.18, y: 0.55, z: 0.22}}, offsetLocal: {x: 0, y: -0.5, z: 0}},
]
