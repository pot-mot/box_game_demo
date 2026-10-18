import {alignYTo, type CreaturePartSpec} from '../creature_runtime/model.ts'
import type {HurtBlockProfile} from '../../../../character/hurt_blocks.ts'

/**
 * 马配色（半写实，固定）：深栗褐毛、浅腹、近黑鬃尾、深色蹄。
 * 造型按马解剖：深胸长桶、拱形长颈 + 颈脊鬃毛、长口鼻、立耳、飘尾、长腿 + 蹄（落地）。
 */
const COAT = 0x6b5340
const COAT_DARK = 0x4a382a
const MANE = 0x2a1f16
const BELLY = 0x8a7360
const HOOF = 0x2a2622

/** 前肢：肩 / 上臂肌肉体块（连到膝）+ 前臂管（连到蹄）+ 蹄（落地 y=0） */
const foreleg = (hip: string, knee: string, foot: string): CreaturePartSpec[] => [
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.13, ry: 0.24, rz: 0.14, widthSegments: 12, heightSegments: 10}, material: 'hide', color: COAT, offset: [0, -0.2, 0.0]},
    {jointId: knee, shape: {kind: 'tube', rTop: 0.075, rBottom: 0.058, h: 0.42, sides: 10}, material: 'hide', color: COAT_DARK, offset: [0, -0.2, 0]},
    {jointId: foot, shape: {kind: 'frustum', wTop: 0.14, wBottom: 0.16, h: 0.12, depthRatio: 1.3}, material: 'hoof', color: HOOF, offset: [0, 0.06, 0.02]},
]

/** 后肢：大腿 / 后臀肌肉体块（大，连到膝）+ 胫管（连到蹄）+ 蹄（落地 y=0） */
const hindleg = (hip: string, knee: string, foot: string): CreaturePartSpec[] => [
    {jointId: hip, shape: {kind: 'ellipsoid', rx: 0.16, ry: 0.26, rz: 0.19, widthSegments: 12, heightSegments: 10}, material: 'hide', color: COAT, offset: [0, -0.18, -0.06]},
    {jointId: knee, shape: {kind: 'tube', rTop: 0.08, rBottom: 0.058, h: 0.42, sides: 10}, material: 'hide', color: COAT_DARK, offset: [0, -0.2, 0.0]},
    {jointId: foot, shape: {kind: 'frustum', wTop: 0.14, wBottom: 0.16, h: 0.12, depthRatio: 1.3}, material: 'hoof', color: HOOF, offset: [0, 0.06, 0.02]},
]

/** 马半写实部件（胸 + 桶 + 后臀、拱颈 + 鬃毛、长口鼻、飘尾、长腿 + 蹄） */
export const HORSE_PARTS: readonly CreaturePartSpec[] = [
    /* 躯干：胸（前深）+ 桶（中）+ 后臀（后） */
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.29, ry: 0.34, rz: 0.3, widthSegments: 14, heightSegments: 12}, material: 'hide', color: COAT, offset: [0, 0.0, 0.28]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.29, ry: 0.32, rz: 0.42, widthSegments: 14, heightSegments: 12}, material: 'hide', color: COAT, offset: [0, 0.0, -0.12]},
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.3, ry: 0.34, rz: 0.3, widthSegments: 14, heightSegments: 12}, material: 'hide', color: COAT, offset: [0, 0.0, -0.52]},
    /* 浅色腹 */
    {jointId: 'body', shape: {kind: 'ellipsoid', rx: 0.22, ry: 0.16, rz: 0.62, widthSegments: 12, heightSegments: 8}, material: 'hide', color: BELLY, offset: [0, -0.24, -0.1]},
    /* 竖立长颈：下段自胸口（颈根）连到颈中，上段连到头顶 */
    {jointId: 'withers', shape: {kind: 'tube', rTop: 0.17, rBottom: 0.26, h: 0.36, sides: 12}, material: 'hide', color: COAT, offset: [0, 0.155, 0.06], rot: alignYTo(0, 0.31, 0.12)},
    {jointId: 'neck', shape: {kind: 'tube', rTop: 0.14, rBottom: 0.17, h: 0.36, sides: 12}, material: 'hide', color: COAT, offset: [0, 0.135, 0.105], rot: alignYTo(0, 0.27, 0.21)},
    /* 颈脊鬃毛（扁平长条，沿颈背） */
    {jointId: 'withers', shape: {kind: 'tube', rTop: 0.05, rBottom: 0.08, h: 0.36, sides: 8, depthRatio: 0.35}, material: 'mane', color: MANE, offset: [0, 0.21, -0.08], rot: alignYTo(0, 0.31, 0.12)},
    {jointId: 'neck', shape: {kind: 'tube', rTop: 0.04, rBottom: 0.05, h: 0.36, sides: 8, depthRatio: 0.35}, material: 'mane', color: MANE, offset: [0, 0.22, 0.0], rot: alignYTo(0, 0.27, 0.21)},
    /* 头：颅骨 + 长口鼻 + 下颚 + 立耳 + 眼 + 鼻孔 */
    {jointId: 'head', shape: {kind: 'ellipsoid', rx: 0.13, ry: 0.15, rz: 0.15, widthSegments: 14, heightSegments: 10}, material: 'hide', color: COAT, offset: [0, 0.03, 0.03]},
    {jointId: 'head', shape: {kind: 'tube', rTop: 0.075, rBottom: 0.13, h: 0.42, sides: 12, depthRatio: 0.85}, material: 'hide', color: COAT, offset: [0, -0.01, 0.34], rot: alignYTo(0, 0, 1)},
    {jointId: 'head', shape: {kind: 'tube', rTop: 0.08, rBottom: 0.1, h: 0.38, sides: 10, depthRatio: 0.7}, material: 'hide', color: COAT_DARK, offset: [0, -0.09, 0.3], rot: alignYTo(0, 0, 1)},
    {jointId: 'head', shape: {kind: 'cone', r: 0.06, h: 0.17, segments: 6}, material: 'hide', color: COAT_DARK, offset: [-0.1, 0.2, 0.0], rot: [0, 0, 0.16]},
    {jointId: 'head', shape: {kind: 'cone', r: 0.06, h: 0.17, segments: 6}, material: 'hide', color: COAT_DARK, offset: [0.1, 0.2, 0.0], rot: [0, 0, -0.16]},
    /* 眼：眼白 + 虹膜 + 瞳孔 */
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8cfc0, offset: [-0.12, 0.08, 0.14]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 12, heightSegments: 10}, material: 'eye', color: 0xd8cfc0, offset: [0.12, 0.08, 0.14]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.018, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0x6b4a1e, offset: [-0.123, 0.08, 0.154]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.018, widthSegments: 10, heightSegments: 8}, material: 'eye', color: 0x6b4a1e, offset: [0.123, 0.08, 0.154]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.009, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [-0.125, 0.08, 0.166]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.009, widthSegments: 8, heightSegments: 6}, material: 'eye', color: 0x0a0a0a, offset: [0.125, 0.08, 0.166]},
    /* 鼻孔 */
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 8, heightSegments: 6}, material: 'nose', offset: [-0.05, -0.04, 0.53]},
    {jointId: 'head', shape: {kind: 'sphere', r: 0.03, widthSegments: 8, heightSegments: 6}, material: 'nose', offset: [0.05, -0.04, 0.53]},
    /* 飘尾（鬃毛材质长束） */
    {jointId: 'tailA', shape: {kind: 'tube', rTop: 0.09, rBottom: 0.13, h: 0.5, sides: 10}, material: 'mane', color: MANE, offset: [0, 0.02, -0.25], rot: alignYTo(0, 0.15, -0.55)},
    {jointId: 'tailB', shape: {kind: 'cone', r: 0.13, h: 0.45, segments: 8}, material: 'mane', color: MANE, offset: [0, 0.0, -0.18], rot: alignYTo(0, 0.05, -0.35)},
    /* 四肢 */
    ...foreleg('flHip', 'flKnee', 'flFoot'),
    ...foreleg('frHip', 'frKnee', 'frFoot'),
    ...hindleg('rlHip', 'rlKnee', 'rlFoot'),
    ...hindleg('rrHip', 'rrKnee', 'rrFoot'),
]

/** 马受击子块（头 / 颈 / 躯干 / 尾 / 四肢） */
export const HORSE_HURT_BLOCKS: HurtBlockProfile = [
    {id: 'head', jointId: 'head', shape: {kind: 'box', half: {x: 0.16, y: 0.18, z: 0.3}}, offsetLocal: {x: 0, y: 0.0, z: 0.18}},
    {id: 'neck', jointId: 'neck', shape: {kind: 'box', half: {x: 0.18, y: 0.26, z: 0.28}}},
    /* 躯干受击箱适度收窄（原 0.3×0.35×0.85 略大） */
    {id: 'torso', jointId: 'body', shape: {kind: 'box', half: {x: 0.26, y: 0.3, z: 0.7}}},
    {id: 'tail', jointId: 'tailA', shape: {kind: 'box', half: {x: 0.08, y: 0.08, z: 0.25}}},
    {id: 'frontLeftLeg', jointId: 'flHip', shape: {kind: 'box', half: {x: 0.11, y: 0.22, z: 0.11}}, offsetLocal: {x: 0, y: -0.2, z: 0}},
    {id: 'frontRightLeg', jointId: 'frHip', shape: {kind: 'box', half: {x: 0.11, y: 0.22, z: 0.11}}, offsetLocal: {x: 0, y: -0.2, z: 0}},
    {id: 'rearLeftLeg', jointId: 'rlHip', shape: {kind: 'box', half: {x: 0.11, y: 0.22, z: 0.11}}, offsetLocal: {x: 0, y: -0.2, z: 0}},
    {id: 'rearRightLeg', jointId: 'rrHip', shape: {kind: 'box', half: {x: 0.11, y: 0.22, z: 0.11}}, offsetLocal: {x: 0, y: -0.2, z: 0}},
]
