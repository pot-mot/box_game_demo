import {alignYTo, type CreaturePartSpec} from '../creature_runtime/model.ts'

/**
 * 狼配色（半写实，固定不随阵营）：冷灰褐毛、浅腹、深色口鼻 / 耳 / 掌、琥珀眼。
 * 造型按灰狼解剖参考：深胸腔 + 收腹、前伸楔形口鼻、立耳、粗壮四肢与利爪、蓬松尾。
 */
const FUR = 0x5b574e
const FUR_LIGHT = 0x726c60
const FUR_DARK = 0x3a3730
const BELLY = 0x8d877a
const CLAW = 0x1c1a16

/** 掌 + 三爪（前后肢共用，掌底落在地面 y=0；爪自掌前端水平前伸，不落到掌下） */
const paw = (foot: string): CreaturePartSpec[] => [
    {jointId: foot, shape: {kind: 'ellipsoid', rx: 0.058, ry: 0.032, rz: 0.09, widthSegments: 10, heightSegments: 6}, material: 'fur', color: FUR_DARK, offset: [0, 0.04, 0.035]},
    {jointId: foot, shape: {kind: 'cone', r: 0.016, h: 0.06, segments: 6}, material: 'claw', color: CLAW, offset: [-0.035, 0.038, 0.08], rot: [1.75, 0, 0]},
    {jointId: foot, shape: {kind: 'cone', r: 0.016, h: 0.06, segments: 6}, material: 'claw', color: CLAW, offset: [0.035, 0.038, 0.08], rot: [1.75, 0, 0]},
    {jointId: foot, shape: {kind: 'cone', r: 0.016, h: 0.06, segments: 6}, material: 'claw', color: CLAW, offset: [0, 0.038, 0.1], rot: [1.75, 0, 0]},
]

/** 前肢：肩 / 上臂肌肉体块（从髋关节一直连到肘 / 膝）+ 前臂（肘 → 腕）+ 掌爪 */
const frontLeg = (hip: string, knee: string, foot: string): CreaturePartSpec[] => [
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.09, ry: 0.16, rz: 0.11, widthSegments: 12, heightSegments: 10}, material: 'fur', color: FUR, offset: [0, -0.06, 0.0]},
    {jointId: knee, shape: {kind: 'tube', rTop: 0.058, rBottom: 0.036, h: 0.18, sides: 10}, material: 'fur', color: FUR_DARK, offset: [0, -0.08, 0]},
    ...paw(foot),
]

/** 后肢：大腿 / 后臀肌肉体块（从髋关节一直连到膝）+ 小腿（膝 → 跗）+ 掌爪 */
const rearLeg = (hip: string, knee: string, foot: string): CreaturePartSpec[] => [
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.11, ry: 0.18, rz: 0.15, widthSegments: 12, heightSegments: 10}, material: 'fur', color: FUR, offset: [0, -0.06, -0.04]},
    {jointId: knee, shape: {kind: 'tube', rTop: 0.05, rBottom: 0.034, h: 0.18, sides: 10}, material: 'fur', color: FUR_DARK, offset: [0, -0.08, 0]},
    ...paw(foot),
]

/** 狼半写实部件（深胸 / 收腹、流线颈、楔形头 / 立耳 / 牙 / 蓬松尾 / 四足） */
export const WOLF_PARTS: readonly CreaturePartSpec[] = [
    /* 胸腔（前段更深）+ 收腹（后段更细）→ 灰狼侧面轮廓 */
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.22, ry: 0.245, rz: 0.3, widthSegments: 16, heightSegments: 12}, material: 'fur', color: FUR, offset: [0, -0.01, 0.16]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.19, ry: 0.2, rz: 0.32, widthSegments: 16, heightSegments: 12}, material: 'fur', color: FUR, offset: [0, 0.0, -0.14]},
    /* 腹下浅色 */
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.15, ry: 0.11, rz: 0.34, widthSegments: 12, heightSegments: 8}, material: 'fur', color: BELLY, offset: [0, -0.14, -0.02]},
    /* 颈（流线锥管）+ 颈周竖毛 */
    {jointId: 'neck', shape: {kind: 'tube', rTop: 0.115, rBottom: 0.16, h: 0.36, sides: 12}, material: 'fur', color: FUR_LIGHT, offset: [0, 0.05, 0.15], rot: alignYTo(0, 0.1, 0.3)},
    {jointId: 'neck', shape: {kind: 'ellipsoid', rx: 0.17, ry: 0.16, rz: 0.15, widthSegments: 12, heightSegments: 8}, material: 'mane', color: FUR_DARK, offset: [0, -0.02, 0.02], rot: alignYTo(0, 0.1, 0.3)},
    /* 颅骨 + 短宽口鼻 + 下颚 */
    {jointId: 'head', shape: {kind: 'ellipsoid', rx: 0.12, ry: 0.12, rz: 0.14, widthSegments: 14, heightSegments: 10}, material: 'fur', color: FUR_LIGHT, offset: [0, 0.06, 0.12]},
    {jointId: 'head', shape: {kind: 'tube', rTop: 0.042, rBottom: 0.09, h: 0.192, sides: 10, depthRatio: 0.95}, material: 'fur', color: FUR_DARK, offset: [0, 0.02, 0.3], rot: alignYTo(0, 0.02, 1)},
    {jointId: 'jaw', shape: {kind: 'tube', rTop: 0.06, rBottom: 0.072, h: 0.2, sides: 8, depthRatio: 0.8}, material: 'fur', color: FUR_DARK, offset: [0, -0.015, 0.1], rot: alignYTo(0, 0, 1)},
    /* 上颌犬齿 + 下颌齿列：位于口鼻两侧（不过分靠前） */
    {jointId: 'head', shape: {kind: 'cone', r: 0.015, h: 0.07, segments: 6}, material: 'tooth', offset: [-0.055, -0.035, 0.33], rot: [Math.PI, 0, 0]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.015, h: 0.07, segments: 6}, material: 'tooth', offset: [0.055, -0.035, 0.33], rot: [Math.PI, 0, 0]},
    {jointId: 'jaw', shape: {kind: 'cone', r: 0.013, h: 0.05, segments: 6}, material: 'tooth', offset: [-0.045, 0.03, 0.11]},
    {jointId: 'jaw', shape: {kind: 'cone', r: 0.013, h: 0.05, segments: 6}, material: 'tooth', offset: [0.045, 0.03, 0.11]},
    /* 立耳（薄锥） */
    {jointId: 'head', shape: {kind: 'cone', r: 0.055, h: 0.15, segments: 6}, material: 'fur', color: FUR_DARK, offset: [-0.095, 0.18, 0.0], rot: [0, 0, 0.18]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.055, h: 0.15, segments: 6}, material: 'fur', color: FUR_DARK, offset: [0.095, 0.18, 0.0], rot: [0, 0, -0.18]},
    /* 眼：眼白（球）+ 虹膜（琥珀）+ 瞳孔（黑），朝前外侧；鼻头 */
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8d2c4, offset: [-0.072, 0.075, 0.198]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8d2c4, offset: [0.072, 0.075, 0.198]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.018, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0xbe8a2e, offset: [-0.074, 0.076, 0.212]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.018, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0xbe8a2e, offset: [0.074, 0.076, 0.212]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.008, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [-0.076, 0.076, 0.224]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.008, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [0.076, 0.076, 0.224]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 8, heightSegments: 6}, material: 'nose', offset: [0, 0.02, 0.4]},
    /* 尾（尾根锥管 + 蓬松尾尖椭球） */
    {jointId: 'tailA', shape: {kind: 'tube', rTop: 0.07, rBottom: 0.095, h: 0.3, sides: 10}, material: 'fur', color: FUR, offset: [0, 0.03, -0.14], rot: alignYTo(0, 0.06, -0.28)},
    {jointId: 'tailB', shape: {kind: 'ellipsoid', rx: 0.095, ry: 0.1, rz: 0.2, widthSegments: 10, heightSegments: 8}, material: 'fur', color: FUR_DARK, offset: [0, 0.02, -0.12]},
    /* 前后肢 */
    ...frontLeg('flHip', 'flKnee', 'flFoot'),
    ...frontLeg('frHip', 'frKnee', 'frFoot'),
    ...rearLeg('rlHip', 'rlKnee', 'rlFoot'),
    ...rearLeg('rrHip', 'rrKnee', 'rrFoot'),
]
