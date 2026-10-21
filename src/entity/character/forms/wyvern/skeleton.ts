import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'
import {buildBoneEdges} from '../creature_runtime/skeleton_bones.ts'

const I: readonly [number, number, number, number] = [0, 0, 0, 1]
const P = (x: number, y: number, z: number): readonly [number, number, number] => [x, y, z]

interface Joint {
    readonly id: string
    readonly name: string
    readonly parentId?: string
    readonly position: readonly [number, number, number]
    readonly rotation: readonly [number, number, number, number]
}

/**
 * 双足飞龙（wyvern，双足 + 双翼，共 4 肢）骨架：原点在脚底；原点高约 2.0。
 * 后足反曲（digitigrade）：hip → knee（前） → hock（后），趾着地。
 * 翼：wingBase → wingElbow → wingWrist → wingClaw，腕部再带四根翼指；
 * 翼爪是主要近战部位，翼指用于收翼/展翼的指骨层次。
 * 尾部四节，支持甩尾鞭击。
 */
const side = (s: 'l' | 'r', sign: number): readonly Joint[] => {
    const S = s.toUpperCase()
    return [
        {id: `${s}Hip`, name: sign < 0 ? '左髋' : '右髋', parentId: 'body', position: P(sign * 0.36, 0.1, -0.45), rotation: I},
        {id: `${s}Knee`, name: sign < 0 ? '左膝' : '右膝', parentId: `${s}Hip`, position: P(0, -0.5, 0.26), rotation: I},
        {id: `${s}Hock`, name: sign < 0 ? '左跗' : '右跗', parentId: `${s}Knee`, position: P(0, -0.5, -0.36), rotation: I},

        {id: `wing${S}Base`, name: sign < 0 ? '左翼根' : '右翼根', parentId: 'withers', position: P(sign * 0.34, 0.05, -0.1), rotation: I},
        {id: `wing${S}Elbow`, name: sign < 0 ? '左翼肘' : '右翼肘', parentId: `wing${S}Base`, position: P(sign * 0.34, 0.55, -0.28), rotation: I},
        {id: `wing${S}Wrist`, name: sign < 0 ? '左翼腕' : '右翼腕', parentId: `wing${S}Elbow`, position: P(sign * -0.16, -1.45, 0.42), rotation: I},
        {id: `wing${S}Claw`, name: sign < 0 ? '左翼爪' : '右翼爪', parentId: `wing${S}Wrist`, position: P(0, -0.18, 0.1), rotation: I},
        {id: `wing${S}FingerA`, name: sign < 0 ? '左翼指一' : '右翼指一', parentId: `wing${S}Wrist`, position: P(0, 0, 0), rotation: I},
        {id: `wing${S}FingerB`, name: sign < 0 ? '左翼指二' : '右翼指二', parentId: `wing${S}Wrist`, position: P(0, 0, 0), rotation: I},
        {id: `wing${S}FingerC`, name: sign < 0 ? '左翼指三' : '右翼指三', parentId: `wing${S}Wrist`, position: P(0, 0, 0), rotation: I},
        {id: `wing${S}FingerD`, name: sign < 0 ? '左翼指四' : '右翼指四', parentId: `wing${S}Wrist`, position: P(0, 0, 0), rotation: I},
    ]
}

const buildJoints = (): SkeletonDefinition['joints'] => [
    {id: 'root', name: '根', position: P(0, 0, 0), rotation: I},
    {id: 'body', name: '躯干', parentId: 'root', position: P(0, 1.0, 0), rotation: I},
    {id: 'bodyCollider', name: '主碰撞体（竖胶囊·落地）', parentId: 'root', position: P(0, 1.0, 0), rotation: I},
    {id: 'torsoCollider', name: '躯干碰撞体（盒）', parentId: 'root', position: P(0, 1.0, 0), rotation: I},

    {id: 'withers', name: '肩部', parentId: 'body', position: P(0, 0.25, 0.35), rotation: I},
    {id: 'neck', name: '颈', parentId: 'withers', position: P(0, 0.2, 0.15), rotation: I},
    {id: 'head', name: '头', parentId: 'neck', position: P(0, 0.3, 0.3), rotation: I},
    {id: 'jaw', name: '下颚', parentId: 'head', position: P(0, 0, 0.3), rotation: I},
    {id: 'mouthMount', name: '口部挂点', parentId: 'jaw', position: P(0, -0.05, 0.3), rotation: I},

    {id: 'tailA', name: '尾根', parentId: 'body', position: P(0, -0.05, -0.62), rotation: I},
    {id: 'tailB', name: '尾中', parentId: 'tailA', position: P(0, -0.1, -0.5), rotation: I},
    {id: 'tailC', name: '尾后', parentId: 'tailB', position: P(0, -0.05, -0.45), rotation: I},
    {id: 'tailD', name: '尾尖', parentId: 'tailC', position: P(0, 0.0, -0.4), rotation: I},

    ...side('l', -1),
    ...side('r', 1),
]

/** 每侧翼的主链骨骼段（翼指共用腕关节原点，不生成零长度段） */
const wingBones = (sideId: 'L' | 'R', lower: string): readonly (readonly [string, string, string, string])[] => [
    [`wing${sideId}BaseSeg`, `${lower}翼根`, 'withers', `wing${sideId}Base`],
    [`wing${sideId}ElbowSeg`, `${lower}翼肘`, `wing${sideId}Base`, `wing${sideId}Elbow`],
    [`wing${sideId}WristSeg`, `${lower}翼腕`, `wing${sideId}Elbow`, `wing${sideId}Wrist`],
    [`wing${sideId}ClawSeg`, `${lower}翼爪`, `wing${sideId}Wrist`, `wing${sideId}Claw`],
]

export const buildWyvernSkeleton = (): SkeletonDefinition => {
    const joints = buildJoints()
    const bones = buildBoneEdges(joints, [
        ['spineSeg', '躯干连接', 'root', 'body'],
        ['withersSeg', '肩部', 'body', 'withers'],
        ['neckSeg', '颈', 'withers', 'neck'],
        ['headSeg', '头', 'neck', 'head'],
        ['jawSeg', '下颚', 'head', 'jaw'],
        ['tailASeg', '尾根', 'body', 'tailA'],
        ['tailBSeg', '尾中', 'tailA', 'tailB'],
        ['tailCSeg', '尾后', 'tailB', 'tailC'],
        ['tailDSeg', '尾尖', 'tailC', 'tailD'],
        ['lHipSeg', '左髋', 'body', 'lHip'],
        ['lKneeSeg', '左膝', 'lHip', 'lKnee'],
        ['lHockSeg', '左跗', 'lKnee', 'lHock'],
        ['rHipSeg', '右髋', 'body', 'rHip'],
        ['rKneeSeg', '右膝', 'rHip', 'rKnee'],
        ['rHockSeg', '右跗', 'rKnee', 'rHock'],
        ...wingBones('L', '左'),
        ...wingBones('R', '右'),
    ])
    return {joints, bones}
}
