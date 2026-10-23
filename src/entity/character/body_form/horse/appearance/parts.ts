import {alignYTo, type CreaturePartSpec} from '../../common/creature_runtime/model.ts'

/**
 * 马配色（半写实，固定）：深栗褐毛、浅腹、近黑鬃尾、铁灰蹄。
 * 造型按马解剖：深胸长桶、拱形长颈 + 颈脊鬃毛、长口鼻、立耳、飘尾、长腿 + 铁蹄。
 */
const COAT = 0x6b5340
const COAT_DARK = 0x4a382a
const MANE = 0x2a1f16
const BELLY = 0x8a7360
const IRON = 0x3b3f42
const IRON_DARK = 0x25282b

/** 铁蹄：蹄壳 + 蹄缘 + 钉头（蹄底落在地面 y=0） */
const ironHoof = (foot: string): CreaturePartSpec[] => [
    {jointId: foot, shape: {kind: 'frustum', wTop: 0.15, wBottom: 0.18, h: 0.13, depthRatio: 1.35}, material: 'dark_metal', color: IRON, offset: [0, 0.065, 0.025]},
    {jointId: foot, shape: {kind: 'frustum', wTop: 0.17, wBottom: 0.185, h: 0.035, depthRatio: 1.4}, material: 'metal', color: IRON_DARK, offset: [0, 0.018, 0.025]},
    {jointId: foot, shape: {kind: 'sphere', r: 0.014, widthSegments: 6, heightSegments: 4}, material: 'metal', color: IRON_DARK, offset: [-0.065, 0.045, 0.09]},
    {jointId: foot, shape: {kind: 'sphere', r: 0.014, widthSegments: 6, heightSegments: 4}, material: 'metal', color: IRON_DARK, offset: [0.065, 0.045, 0.09]},
    {jointId: foot, shape: {kind: 'sphere', r: 0.014, widthSegments: 6, heightSegments: 4}, material: 'metal', color: IRON_DARK, offset: [0, 0.045, 0.11]},
]

/** 前肢：肩 / 上臂肌肉体块 + 前臂 + 球节 + 铁蹄 */
const foreleg = (hip: string, knee: string, fetlock: string, foot: string): CreaturePartSpec[] => [
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.145, ry: 0.25, rz: 0.155, widthSegments: 12, heightSegments: 10}, material: 'hide', color: COAT, offset: [0, -0.2, 0.0]},
    {jointId: knee, shape: {kind: 'tube', rTop: 0.082, rBottom: 0.058, h: 0.42, sides: 10}, material: 'hide', color: COAT_DARK, offset: [0, -0.2, 0]},
    {jointId: fetlock, shape: {kind: 'tube', rTop: 0.055, rBottom: 0.045, h: 0.17, sides: 8}, material: 'hide', color: COAT_DARK, offset: [0, -0.08, 0]},
    ...ironHoof(foot),
]

/** 后肢：大腿 / 后臀肌肉体块 + 胫管 + 飞节 + 铁蹄 */
const hindleg = (hip: string, knee: string, hock: string, foot: string): CreaturePartSpec[] => [
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.175, ry: 0.27, rz: 0.2, widthSegments: 12, heightSegments: 10}, material: 'hide', color: COAT, offset: [0, -0.18, -0.06]},
    {jointId: knee, shape: {kind: 'tube', rTop: 0.085, rBottom: 0.06, h: 0.36, sides: 10}, material: 'hide', color: COAT_DARK, offset: [0, -0.17, 0.01]},
    {jointId: hock, shape: {kind: 'tube', rTop: 0.06, rBottom: 0.045, h: 0.2, sides: 8}, material: 'hide', color: COAT_DARK, offset: [0, -0.08, 0]},
    ...ironHoof(foot),
]

/** 马半写实部件（胸 + 桶 + 后臀、拱颈 + 鬃毛、长口鼻、飘尾、长腿 + 铁蹄） */
export const HORSE_PARTS: readonly CreaturePartSpec[] = [
    /* 躯干：胸 + 桶 + 后臀 */
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.3, ry: 0.35, rz: 0.3, widthSegments: 14, heightSegments: 12}, material: 'hide', color: COAT, offset: [0, 0.0, 0.28]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.3, ry: 0.33, rz: 0.42, widthSegments: 14, heightSegments: 12}, material: 'hide', color: COAT, offset: [0, 0.0, -0.12]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.31, ry: 0.35, rz: 0.3, widthSegments: 14, heightSegments: 12}, material: 'hide', color: COAT, offset: [0, 0.0, -0.52]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.23, ry: 0.17, rz: 0.62, widthSegments: 12, heightSegments: 8}, material: 'hide', color: BELLY, offset: [0, -0.24, -0.1]},
    /* 拱形长颈 */
    {jointId: 'withers', shape: {kind: 'tube', rTop: 0.17, rBottom: 0.27, h: 0.37, sides: 12}, material: 'hide', color: COAT, offset: [0, 0.155, 0.06], rot: alignYTo(0, 0.31, 0.12)},
    {jointId: 'neck', shape: {kind: 'tube', rTop: 0.135, rBottom: 0.17, h: 0.37, sides: 12}, material: 'hide', color: COAT, offset: [0, 0.135, 0.105], rot: alignYTo(0, 0.27, 0.21)},
    /* 颈脊鬃毛（两段） */
    {jointId: 'withers', shape: {kind: 'tube', rTop: 0.045, rBottom: 0.085, h: 0.37, sides: 8, depthRatio: 0.32}, material: 'mane', color: MANE, offset: [0, 0.22, -0.09], rot: alignYTo(0, 0.31, 0.12)},
    {jointId: 'neck', shape: {kind: 'tube', rTop: 0.035, rBottom: 0.055, h: 0.37, sides: 8, depthRatio: 0.32}, material: 'mane', color: MANE, offset: [0, 0.225, -0.01], rot: alignYTo(0, 0.27, 0.21)},
    /* 头：颅骨 + 长口鼻 + 下颚 + 立耳 + 眼 + 鼻孔 */
    {jointId: 'head', shape: {kind: 'ellipsoid', rx: 0.13, ry: 0.15, rz: 0.15, widthSegments: 14, heightSegments: 10}, material: 'hide', color: COAT, offset: [0, 0.03, 0.03]},
    {jointId: 'head', shape: {kind: 'tube', rTop: 0.075, rBottom: 0.13, h: 0.42, sides: 12, depthRatio: 0.85}, material: 'hide', color: COAT, offset: [0, -0.01, 0.34], rot: alignYTo(0, 0, 1)},
    {jointId: 'head', shape: {kind: 'tube', rTop: 0.08, rBottom: 0.1, h: 0.38, sides: 10, depthRatio: 0.7}, material: 'hide', color: COAT_DARK, offset: [0, -0.09, 0.3], rot: alignYTo(0, 0, 1)},
    {jointId: 'earL', shape: {kind: 'cone', r: 0.06, h: 0.18, segments: 6}, material: 'hide', color: COAT_DARK, offset: [0, 0.07, 0], rot: [0, 0, 0.16]},
    {jointId: 'earR', shape: {kind: 'cone', r: 0.06, h: 0.18, segments: 6}, material: 'hide', color: COAT_DARK, offset: [0, 0.07, 0], rot: [0, 0, -0.16]},
    /* 眼：眼白 + 虹膜 + 瞳孔 */
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8cfc0, offset: [-0.12, 0.08, 0.14]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8cfc0, offset: [0.12, 0.08, 0.14]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.018, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0x6b4a1e, offset: [-0.123, 0.08, 0.154]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.018, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0x6b4a1e, offset: [0.123, 0.08, 0.154]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.009, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [-0.125, 0.08, 0.166]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.009, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [0.125, 0.08, 0.166]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 8, heightSegments: 6}, material: 'nose', offset: [-0.05, -0.04, 0.53]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 8, heightSegments: 6}, material: 'nose', offset: [0.05, -0.04, 0.53]},
    /* 飘尾（三节） */
    {jointId: 'tailA', shape: {kind: 'tube', rTop: 0.1, rBottom: 0.14, h: 0.42, sides: 10}, material: 'mane', color: MANE, offset: [0, 0.02, -0.21], rot: alignYTo(0, 0.15, -0.55)},
    {jointId: 'tailB', shape: {kind: 'tube', rTop: 0.075, rBottom: 0.11, h: 0.32, sides: 8}, material: 'mane', color: MANE, offset: [0, 0.0, -0.16], rot: alignYTo(0, 0.04, -0.3)},
    {jointId: 'tailC', shape: {kind: 'cone', r: 0.115, h: 0.34, segments: 8}, material: 'mane', color: MANE, offset: [0, 0.0, -0.15], rot: alignYTo(0, 0.01, -0.26)},
    /* 四肢 */
    ...foreleg('flHip', 'flKnee', 'flFetlock', 'flFoot'),
    ...foreleg('frHip', 'frKnee', 'frFetlock', 'frFoot'),
    ...hindleg('rlHip', 'rlKnee', 'rlHock', 'rlFoot'),
    ...hindleg('rrHip', 'rrKnee', 'rrHock', 'rrFoot'),
]
