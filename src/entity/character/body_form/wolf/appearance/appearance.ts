import {alignYTo, type CreaturePartSpec} from '../../common/creature_runtime/model.ts'

/** 狼配色（半写实，固定不随阵营）：冷灰褐毛、浅腹、深色口鼻 / 耳 / 掌、琥珀眼。 */
const FUR = 0x5b574e
const FUR_LIGHT = 0x726c60
const FUR_DARK = 0x3a3730
const BELLY = 0x8d877a
const CLAW = 0x1c1a16
const NOSE = 0x171512

/** 掌 + 三趾 + 三爪（掌底落在地面 y=0） */
const paw = (foot: string): CreaturePartSpec[] => [
    {jointId: foot, shape: {kind: 'ellipsoid', rx: 0.062, ry: 0.035, rz: 0.095, widthSegments: 10, heightSegments: 6}, material: 'fur', color: FUR_DARK, offset: [0, 0.038, 0.035]},
    {jointId: foot, shape: {kind: 'ellipsoid', rx: 0.022, ry: 0.026, rz: 0.045, widthSegments: 8, heightSegments: 6}, material: 'fur', color: FUR_DARK, offset: [-0.038, 0.03, 0.095]},
    {jointId: foot, shape: {kind: 'ellipsoid', rx: 0.022, ry: 0.026, rz: 0.045, widthSegments: 8, heightSegments: 6}, material: 'fur', color: FUR_DARK, offset: [0.038, 0.03, 0.095]},
    {jointId: foot, shape: {kind: 'ellipsoid', rx: 0.022, ry: 0.026, rz: 0.045, widthSegments: 8, heightSegments: 6}, material: 'fur', color: FUR_DARK, offset: [0, 0.03, 0.11]},
    {jointId: foot, shape: {kind: 'cone', r: 0.014, h: 0.055, segments: 6}, material: 'claw', color: CLAW, offset: [-0.038, 0.03, 0.14], rot: [1.75, 0, 0]},
    {jointId: foot, shape: {kind: 'cone', r: 0.014, h: 0.055, segments: 6}, material: 'claw', color: CLAW, offset: [0.038, 0.03, 0.14], rot: [1.75, 0, 0]},
    {jointId: foot, shape: {kind: 'cone', r: 0.014, h: 0.055, segments: 6}, material: 'claw', color: CLAW, offset: [0, 0.03, 0.15], rot: [1.75, 0, 0]},
]

/** 前肢：肩 / 上臂肌肉体块 + 前臂 + 掌爪 */
const frontLeg = (hip: string, knee: string, foot: string): CreaturePartSpec[] => [
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.095, ry: 0.16, rz: 0.115, widthSegments: 12, heightSegments: 10}, material: 'fur', color: FUR, offset: [0, -0.06, 0.0]},
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.07, ry: 0.12, rz: 0.1, widthSegments: 10, heightSegments: 8}, material: 'fur', color: FUR_LIGHT, offset: [-0.025, -0.1, 0.02]},
    {jointId: knee, shape: {kind: 'tube', rTop: 0.058, rBottom: 0.036, h: 0.18, sides: 10}, material: 'fur', color: FUR_DARK, offset: [0, -0.08, 0]},
    ...paw(foot),
]

/** 后肢：大腿 / 后臀肌肉体块 + 小腿 + 掌爪 */
const rearLeg = (hip: string, knee: string, foot: string): CreaturePartSpec[] => [
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.115, ry: 0.18, rz: 0.155, widthSegments: 12, heightSegments: 10}, material: 'fur', color: FUR, offset: [0, -0.06, -0.04]},
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.08, ry: 0.13, rz: 0.12, widthSegments: 10, heightSegments: 8}, material: 'fur', color: FUR_LIGHT, offset: [0, -0.11, 0.04]},
    {jointId: knee, shape: {kind: 'tube', rTop: 0.05, rBottom: 0.034, h: 0.18, sides: 10}, material: 'fur', color: FUR_DARK, offset: [0, -0.08, 0]},
    ...paw(foot),
]

/** 狼半写实部件（深胸 / 收腹、流线颈、楔形头 / 立耳 / 牙 / 蓬松三节尾 / 四足） */
export const WOLF_PARTS: readonly CreaturePartSpec[] = [
    /* 胸腔 + 收腹 + 腰腹 */
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.225, ry: 0.245, rz: 0.3, widthSegments: 16, heightSegments: 12}, material: 'fur', color: FUR, offset: [0, -0.01, 0.16]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.19, ry: 0.2, rz: 0.32, widthSegments: 16, heightSegments: 12}, material: 'fur', color: FUR, offset: [0, 0.0, -0.14]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.155, ry: 0.12, rz: 0.34, widthSegments: 12, heightSegments: 8}, material: 'fur', color: BELLY, offset: [0, -0.14, -0.02]},
    /* 颈（流线锥管）+ 颈周毛领 */
    {jointId: 'neck', shape: {kind: 'tube', rTop: 0.115, rBottom: 0.165, h: 0.36, sides: 12}, material: 'fur', color: FUR_LIGHT, offset: [0, 0.05, 0.15], rot: alignYTo(0, 0.1, 0.3)},
    {jointId: 'neck', shape: {kind: 'ellipsoid', rx: 0.18, ry: 0.17, rz: 0.16, widthSegments: 12, heightSegments: 8}, material: 'mane', color: FUR_DARK, offset: [0, -0.02, 0.02], rot: alignYTo(0, 0.1, 0.3)},
    /* 颅骨 + 颊毛 + 楔形口鼻 + 下颚 */
    {jointId: 'head', shape: {kind: 'ellipsoid', rx: 0.12, ry: 0.12, rz: 0.14, widthSegments: 14, heightSegments: 10}, material: 'fur', color: FUR_LIGHT, offset: [0, 0.06, 0.12]},
    {jointId: 'head', shape: {kind: 'ellipsoid', rx: 0.075, ry: 0.085, rz: 0.11, widthSegments: 10, heightSegments: 8}, material: 'fur', color: FUR_LIGHT, offset: [-0.09, 0.01, 0.15]},
    {jointId: 'head', shape: {kind: 'ellipsoid', rx: 0.075, ry: 0.085, rz: 0.11, widthSegments: 10, heightSegments: 8}, material: 'fur', color: FUR_LIGHT, offset: [0.09, 0.01, 0.15]},
    {jointId: 'head', shape: {kind: 'tube', rTop: 0.042, rBottom: 0.09, h: 0.192, sides: 10, depthRatio: 0.95}, material: 'fur', color: FUR_DARK, offset: [0, 0.02, 0.3], rot: alignYTo(0, 0.02, 1)},
    {jointId: 'jaw', shape: {kind: 'tube', rTop: 0.06, rBottom: 0.072, h: 0.2, sides: 8, depthRatio: 0.8}, material: 'fur', color: FUR_DARK, offset: [0, -0.015, 0.1], rot: alignYTo(0, 0, 1)},
    /* 上颌犬齿 + 下颌齿列 */
    {jointId: 'head', shape: {kind: 'cone', r: 0.015, h: 0.07, segments: 6}, material: 'tooth', offset: [-0.055, -0.035, 0.33], rot: [Math.PI, 0, 0]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.015, h: 0.07, segments: 6}, material: 'tooth', offset: [0.055, -0.035, 0.33], rot: [Math.PI, 0, 0]},
    {jointId: 'jaw', shape: {kind: 'cone', r: 0.013, h: 0.05, segments: 6}, material: 'tooth', offset: [-0.045, 0.03, 0.11]},
    {jointId: 'jaw', shape: {kind: 'cone', r: 0.013, h: 0.05, segments: 6}, material: 'tooth', offset: [0.045, 0.03, 0.11]},
    /* 立耳（耳骨 + 内耳） */
    {jointId: 'earL', shape: {kind: 'cone', r: 0.058, h: 0.16, segments: 6}, material: 'fur', color: FUR_DARK, offset: [0, 0.07, 0], rot: [0, 0, 0.18]},
    {jointId: 'earL', shape: {kind: 'cone', r: 0.03, h: 0.11, segments: 6}, material: 'fur', color: BELLY, offset: [0.012, 0.065, 0.018], rot: [0, 0, 0.18]},
    {jointId: 'earR', shape: {kind: 'cone', r: 0.058, h: 0.16, segments: 6}, material: 'fur', color: FUR_DARK, offset: [0, 0.07, 0], rot: [0, 0, -0.18]},
    {jointId: 'earR', shape: {kind: 'cone', r: 0.03, h: 0.11, segments: 6}, material: 'fur', color: BELLY, offset: [-0.012, 0.065, 0.018], rot: [0, 0, -0.18]},
    /* 眼：眼白 + 琥珀虹膜 + 瞳孔；鼻头 */
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8d2c4, offset: [-0.072, 0.075, 0.198]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8d2c4, offset: [0.072, 0.075, 0.198]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.018, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0xbe8a2e, offset: [-0.074, 0.076, 0.212]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.018, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0xbe8a2e, offset: [0.074, 0.076, 0.212]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.008, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [-0.076, 0.076, 0.224]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.008, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [0.076, 0.076, 0.224]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 8, heightSegments: 6}, material: 'nose', color: NOSE, offset: [0, 0.02, 0.4]},
    /* 三节尾（尾根管 + 中段 + 蓬松尾尖） */
    {jointId: 'tailA', shape: {kind: 'tube', rTop: 0.07, rBottom: 0.095, h: 0.28, sides: 10}, material: 'fur', color: FUR, offset: [0, 0.03, -0.13], rot: alignYTo(0, 0.06, -0.28)},
    {jointId: 'tailB', shape: {kind: 'ellipsoid', rx: 0.085, ry: 0.09, rz: 0.16, widthSegments: 10, heightSegments: 8}, material: 'fur', color: FUR_LIGHT, offset: [0, 0.02, -0.1]},
    {jointId: 'tailC', shape: {kind: 'ellipsoid', rx: 0.075, ry: 0.08, rz: 0.14, widthSegments: 10, heightSegments: 8}, material: 'fur', color: FUR_DARK, offset: [0, 0.01, -0.1]},
    /* 前后肢 */
    ...frontLeg('flHip', 'flKnee', 'flFoot'),
    ...frontLeg('frHip', 'frKnee', 'frFoot'),
    ...rearLeg('rlHip', 'rlKnee', 'rlFoot'),
    ...rearLeg('rrHip', 'rrKnee', 'rrFoot'),
]

/** 逐槽位肢体：狼的皮毛 / 鬃毛 / 腹部按该槽位肢体颜色替换材质（不改变其它槽位） */
export const WOLF_LIMB_TINT = {
    materials: ['fur', 'mane', 'belly'],
} as const
