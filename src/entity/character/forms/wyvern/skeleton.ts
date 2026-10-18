import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'

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
 * `body` 为躯干根；**颈与翼自身体前方**（`withers` 肩部）长出，`neck→head→jaw`（口部挂点 `mouthMount`）；
 * **后足与尾自身体后方**（髋 / 尾根均后移）。
 *
 * **后足反曲**（digitigrade）：`hip → knee（前） → hock（后）` 呈 Z 字，趾着地。
 * **翼**（每侧三节臂 + 手部四指）：`wingBase（肩）→ wingElbow（肘）→ wingWrist（腕）`，
 * 腕端带**单勾爪**撑地（常态四足着地，参考蝙蝠拇指爪 / 魂系飞龙落地翼爪）；四指与翅膜挂腕部。
 * **注意**：这是 wyvern，不是六肢（四足双翼）的 dragon。
 */
const side = (s: 'l' | 'r', sign: number): readonly Joint[] => [
    /* 后足三段（身体后方）：髋（体侧、背高） → 膝（前） → 跗（后）；趾着地 */
    {id: `${s}Hip`, name: sign < 0 ? '左髋' : '右髋', parentId: 'body', position: P(sign * 0.36, 0.1, -0.45), rotation: I},
    {id: `${s}Knee`, name: sign < 0 ? '左膝' : '右膝', parentId: `${s}Hip`, position: P(0, -0.5, 0.26), rotation: I},
    {id: `${s}Hock`, name: sign < 0 ? '左跗' : '右跗', parentId: `${s}Knee`, position: P(0, -0.5, -0.36), rotation: I},
    /* 翼三节臂（身体前方肩部，放大）：肩 → 肘（上抬外张） → 腕（下伸至地，勾爪撑地） */
    {id: `wing${s.toUpperCase()}Base`, name: sign < 0 ? '左翼根' : '右翼根', parentId: 'withers', position: P(sign * 0.34, 0.05, -0.1), rotation: I},
    {id: `wing${s.toUpperCase()}Elbow`, name: sign < 0 ? '左翼肘' : '右翼肘', parentId: `wing${s.toUpperCase()}Base`, position: P(sign * 0.34, 0.62, -0.3), rotation: I},
    {id: `wing${s.toUpperCase()}Wrist`, name: sign < 0 ? '左翼腕' : '右翼腕', parentId: `wing${s.toUpperCase()}Elbow`, position: P(sign * -0.12, -1.77, 0.72), rotation: I},
]

export const buildWyvernSkeleton = (): SkeletonDefinition => ({
    joints: [
        {id: 'root', name: '根', position: P(0, 0, 0), rotation: I},
        {id: 'body', name: '躯干', parentId: 'root', position: P(0, 1.0, 0), rotation: I},
        {id: 'bodyCollider', name: '主碰撞体（竖胶囊·落地）', parentId: 'root', position: P(0, 1.0, 0), rotation: I},
        {id: 'torsoCollider', name: '躯干碰撞体（盒）', parentId: 'root', position: P(0, 1.0, 0), rotation: I},
        /* 爪击挂点：身体前下方，供天然 `wyvern_claw` 命中盒定位 */
        {id: 'clawMount', name: '爪击挂点', parentId: 'root', position: P(0, 0.7, 0.7), rotation: I},

        /* 肩部（身体前方）：颈与双翼由此长出 */
        {id: 'withers', name: '肩部', parentId: 'body', position: P(0, 0.25, 0.35), rotation: I},
        {id: 'neck', name: '颈', parentId: 'withers', position: P(0, 0.2, 0.15), rotation: I},
        {id: 'head', name: '头', parentId: 'neck', position: P(0, 0.3, 0.3), rotation: I},
        {id: 'jaw', name: '下颚', parentId: 'head', position: P(0, 0, 0.3), rotation: I},
        {id: 'mouthMount', name: '口部挂点', parentId: 'jaw', position: P(0, -0.05, 0.3), rotation: I},

        /* 尾（身体后方） */
        {id: 'tailA', name: '尾根', parentId: 'body', position: P(0, -0.05, -0.62), rotation: I},
        {id: 'tailB', name: '尾中', parentId: 'tailA', position: P(0, -0.1, -0.5), rotation: I},
        {id: 'tailC', name: '尾尖', parentId: 'tailB', position: P(0, -0.05, -0.45), rotation: I},

        ...side('l', -1),
        ...side('r', 1),
    ],
    bones: [],
})
