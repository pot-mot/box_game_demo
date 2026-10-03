import {Group} from 'three'
import {createBoxMaterial, drawRaceFaceCanvas, RACE_FACE_KINDS, type BoxPartPalette, type RaceFaceKind} from '../../../render/box_parts.ts'
import {BONE_IVORY_COLOR, ELF_BLUSH_COLOR, ELF_GOLDEN_HAIR_COLOR, SKELETON_EYE_COLOR, SKELETON_HOLLOW_COLOR, darkenColor} from '../../../render/constants.ts'
import {PRESET_PART_SIZES} from '../skeleton/preset.ts'
import {HAND_HEIGHT_RATIO} from '../skeleton/constants.ts'
import {ARMOR_PAD} from './constants.ts'
import {createMeshBuilder, type MeshBuilder} from './mesh_builder.ts'

/** 护甲外观形状 id（常量 + 索引类型推导） */
export const ARMOR_MESH_IDS = ['cap', 'helmet', 'hood', 'vest', 'plate', 'robe', 'bracer', 'greaves', 'legwrap', 'boots'] as const
export type ArmorMeshId = typeof ARMOR_MESH_IDS[number]

/** 肢体种族（骷髅 / 兽人 / 精灵）：沿用 render 层的种族脸联合类型，避免两处枚举各写一份 */
export const LIMB_RACES = RACE_FACE_KINDS
export type LimbRace = RaceFaceKind

/**
 * 肢体外观配方（种族 + 种族基色；阵营色由创建时传入的调色板注入）。
 * 肢体默认顶替对应人类肢体（`replace` 恒开启），无需 `hideBodyParts` 声明。
 */
export interface LimbMeshConfig {
    readonly race: LimbRace
    /** 种族基色（骨骼 / 皮肤 / 躯体主色） */
    readonly color: number
    /** 种族点缀色（缺省回退主色暗化） */
    readonly accentColor?: number
}

/**
 * 身体部位名（语义标识，与骨架关节 id 解耦）：护甲通过 `hideBodyParts` 声明要顶替的部位。
 * 护甲领域数据只使用这些语义名，部位 → 关节的映射由本模块（entity 侧）持有。
 */
export const ARMOR_BODY_PARTS = [
    'head', 'torso',
    'rightUpperArm', 'rightForearm', 'rightHand',
    'leftUpperArm', 'leftForearm', 'leftHand',
    'rightThigh', 'rightShin', 'leftThigh', 'leftShin',
] as const
export type ArmorBodyPart = typeof ARMOR_BODY_PARTS[number]

/** 身体部位 → 承载该部位基础模型的关节 id（与 assembleCharacterAppearance 的挂载目标一致） */
export const ARMOR_BODY_PART_JOINTS: Readonly<Record<ArmorBodyPart, string>> = {
    head: 'headNeck', torso: 'spine',
    rightUpperArm: 'rightArmShoulder', rightForearm: 'rightArmElbow', rightHand: 'rightHandPivot',
    leftUpperArm: 'leftArmShoulder', leftForearm: 'leftArmElbow', leftHand: 'leftHandPivot',
    rightThigh: 'rightLegHip', rightShin: 'rightLegKnee',
    leftThigh: 'leftLegHip', leftShin: 'leftLegKnee',
}

/** 护甲外观配方（领域数据引用：形状 id + 主色 + 可选点缀色 + 可选顶替的身体部位） */
export interface ArmorMeshConfig {
    readonly id: ArmorMeshId
    readonly color: number
    readonly accentColor?: number
    /** 装备后隐藏的身体部位（护甲顶替该部位模型而非叠加）；缺省 = 不隐藏 */
    readonly hideBodyParts?: readonly ArmorBodyPart[]
}

/** 护甲部件构建结果：group 挂到目标关节，cleanup 释放几何与材质 */
export interface ArmorMeshResult {
    readonly group: Group
    readonly cleanup: () => void
}

const s = PRESET_PART_SIZES

/** 关节基准部件（与 assembleCharacterAppearance 同构）：尺寸 + 部件中心相对关节的 Y 偏移 */
interface ArmorJointBase {
    readonly w: number
    readonly h: number
    readonly d: number
    readonly centerY: number
}

const handH = s.forearmH * HAND_HEIGHT_RATIO

const ARMOR_JOINT_BASES: Readonly<Record<string, ArmorJointBase>> = {
    headNeck: {w: s.headW, h: s.headH, d: s.headW, centerY: s.headH / 2},
    spine: {w: s.bodyW, h: s.bodyH, d: s.bodyD, centerY: s.bodyH / 2},
    rightArmShoulder: {w: s.armW, h: s.upperArmH, d: s.armD, centerY: -s.upperArmH / 2},
    leftArmShoulder: {w: s.armW, h: s.upperArmH, d: s.armD, centerY: -s.upperArmH / 2},
    rightArmElbow: {w: s.armW * 0.8, h: s.forearmH, d: s.armD * 0.8, centerY: -s.forearmH / 2},
    leftArmElbow: {w: s.armW * 0.8, h: s.forearmH, d: s.armD * 0.8, centerY: -s.forearmH / 2},
    rightHandPivot: {w: s.armW * 0.7, h: handH, d: s.armD * 0.7, centerY: -handH / 2},
    leftHandPivot: {w: s.armW * 0.7, h: handH, d: s.armD * 0.7, centerY: -handH / 2},
    rightLegHip: {w: s.legW, h: s.thighH, d: s.legD, centerY: -s.thighH / 2},
    leftLegHip: {w: s.legW, h: s.thighH, d: s.legD, centerY: -s.thighH / 2},
    rightLegKnee: {w: s.legW * 0.85, h: s.shinH, d: s.legD * 0.85, centerY: -s.shinH / 2},
    leftLegKnee: {w: s.legW * 0.85, h: s.shinH, d: s.legD * 0.85, centerY: -s.shinH / 2},
}

/** 生成器参数：关节基准部件尺寸 + 已解析的调色（accentColor 缺省时回退主色暗化） */
interface ArmorGenParams {
    readonly base: ArmorJointBase
    readonly color: number
    readonly accentColor: number
}

/** 单个护甲形状生成器：以共享 builder 拼装部件（独立实现，参照 weapon_mesh 的 gen 模式） */
type ArmorGen = (b: MeshBuilder, p: ArmorGenParams) => void

/** 关节白名单 + 生成器：白名单缺省 = 槽位声明的全部关节 */
interface ArmorShape {
    readonly joints?: readonly string[]
    readonly gen: ArmorGen
}

/** 与身体部件一致的外扩：身体部件尺寸 × 乘数 + 2 × ARMOR_PAD */
const padded = (size: number): number => size + ARMOR_PAD * 2

// ── 各护甲形状生成器 ──

/* 布帽：覆盖头顶的浅帽体 + 下沿一圈帽檐 */
const genCap: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.12)
    const h = padded(p.base.h * 0.42)
    const d = padded(p.base.d * 1.12)
    const y = p.base.centerY * 1.35
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 1.1, h * 0.34, d * 1.1, p.accentColor, 0, y - h * 0.45, 0)
}

/* 铁盔：包住整头的盔体 + 前伸额檐 + 顶脊 */
const genHelmet: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.16)
    const h = padded(p.base.h * 1.08)
    const d = padded(p.base.d * 1.16)
    const y = p.base.centerY
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 1.08, h * 0.16, d * 1.02, p.accentColor, 0, y - h * 0.45, p.base.d * 0.12)
    b.faceBox(w * 0.16, h * 0.16, d, p.accentColor, 0, y + h * 0.55, 0)
}

/* 兜帽：包住头部并下垂的帽体 + 后颈垂布 + 尖顶 */
const genHood: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.22)
    const h = padded(p.base.h * 1.24)
    const d = padded(p.base.d * 1.26)
    const y = p.base.centerY
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 0.92, h * 0.5, d * 0.32, p.accentColor, 0, y - h * 0.45, -p.base.d * 0.45)
    b.add(b.cone(w * 0.42, h * 0.55, 6), b.material(p.color, 0.85, 0.05), 0, y + h * 0.72, 0)
}

/* 布衣：覆盖上半身的短衣 + 领口 */
const genVest: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.1)
    const h = padded(p.base.h * 0.5)
    const d = padded(p.base.d * 1.18)
    const y = p.base.centerY * 1.35
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 1.02, h * 0.16, d * 1.02, p.accentColor, 0, y + h * 0.52, 0)
}

/* 铁胸甲：覆盖躯干的胸板 + 腰带 + 双肩甲 */
const genPlate: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.16)
    const h = padded(p.base.h * 0.72)
    const d = padded(p.base.d * 1.22)
    const y = p.base.centerY * 1.2
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 1.04, h * 0.1, d * 1.04, p.accentColor, 0, y - h * 0.45, 0)
    const pauldronW = w * 0.34
    b.faceBox(pauldronW, h * 0.26, d * 0.72, p.accentColor, w * 0.36, y + h * 0.5, 0)
    b.faceBox(pauldronW, h * 0.26, d * 0.72, p.accentColor, -w * 0.36, y + h * 0.5, 0)
}

/* 法袍：覆盖躯干并下垂的长袍 + 下摆 + 领口 */
const genRobe: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.2)
    const h = padded(p.base.h * 1.05)
    const d = padded(p.base.d * 1.24)
    const y = p.base.centerY
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 1.05, h * 0.12, d * 1.05, p.accentColor, 0, y - h * 0.45, 0)
    b.faceBox(w * 0.6, h * 0.1, d * 0.6, p.accentColor, 0, y + h * 0.5, 0)
}

/* 护腕：包住前臂的腕甲 + 束带 */
const genBracer: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.16)
    const h = padded(p.base.h * 0.6)
    const d = padded(p.base.d * 1.16)
    const y = p.base.centerY * 1.3
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 1.08, h * 0.14, d * 1.08, p.accentColor, 0, y - h * 0.42, 0)
}

/* 胫甲：包住腿段的护板 + 前方护片；底端与腿段底面平齐，不超出模型腿底 */
const genGreaves: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.14)
    const h = padded(p.base.h * 0.55)
    const d = padded(p.base.d * 1.14)
    const y = -p.base.h + h / 2
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 0.5, h * 0.5, d * 0.28, p.accentColor, 0, y - h * 0.1, d * 0.42)
}

/* 布裤：裹住腿段的绑腿 + 侧向束结 */
const genLegwrap: ArmorGen = (b, p) => {
    const w = padded(p.base.w * 1.12)
    const h = padded(p.base.h * 0.35)
    const d = padded(p.base.d * 1.12)
    const y = p.base.centerY * 1.45
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 0.16, h * 0.55, d * 0.5, p.accentColor, w * 0.5, y - h * 0.1, 0)
}

/* 靴：仅包小腿（膝关节），底端前伸脚尖；靴体与脚尖底面均与小腿底端平齐，不超出模型腿底。
 * 横向外扩层收窄到原值的 1/4（仍完整包裹小腿），避免靴体显得过厚。 */
const genBoots: ArmorGen = (b, p) => {
    const w = p.base.w + (padded(p.base.w * 1.16) - p.base.w) / 4
    const d = p.base.d + (padded(p.base.d * 1.22) - p.base.d) / 4
    const h = padded(p.base.h * 0.72)
    const toeH = h * 0.24
    const y = -p.base.h + h / 2
    const toeY = -p.base.h + toeH / 2
    b.faceBox(w, h, d, p.color, 0, y, 0)
    b.faceBox(w * 0.95, toeH, d * 0.9, p.accentColor, 0, toeY, p.base.d * 0.5)
}

// ── 形状注册表 ──

const ARMOR_SHAPES: Readonly<Record<ArmorMeshId, ArmorShape>> = {
    cap: {gen: genCap},
    helmet: {gen: genHelmet},
    hood: {gen: genHood},
    vest: {gen: genVest},
    plate: {gen: genPlate},
    robe: {gen: genRobe},
    bracer: {gen: genBracer},
    greaves: {gen: genGreaves},
    legwrap: {gen: genLegwrap},
    boots: {joints: ['leftLegKnee', 'rightLegKnee'], gen: genBoots},
}

/** 空结果（未知关节 / 关节不在白名单）：骨架被编辑后安全跳过，不抛错 */
const emptyResult = (): ArmorMeshResult => ({group: new Group(), cleanup: () => {}})

/**
 * 按配方 + 挂载关节构建护甲部件：关节决定基准身体部件尺寸（`PRESET_PART_SIZES`），
 * 每个形状由独立 `gen` 构造函数以共享 `mesh_builder` 拼装，尺寸统一外扩 `ARMOR_PAD`。
 * 护甲件是纯视觉子节点：不生成碰撞体、不参与受击箱 / 视线 / 导航判定。
 */
export const createArmorMesh = (config: ArmorMeshConfig, jointId: string): ArmorMeshResult => {
    const base = ARMOR_JOINT_BASES[jointId]
    if (base === undefined) return emptyResult()
    const shape = ARMOR_SHAPES[config.id]
    if (shape.joints !== undefined && !shape.joints.includes(jointId)) return emptyResult()

    const builder = createMeshBuilder()
    shape.gen(builder, {
        base,
        color: config.color,
        accentColor: config.accentColor ?? darkenColor(config.color, 0.7),
    })
    return {group: builder.group, cleanup: builder.dispose}
}

// ── 肢体组件（种族肢体：复用护甲外观机制，默认顶替对应人类肢体） ──

/** 肢体区域（由挂载关节推导：头部 / 手臂 / 手 / 身体 / 腿部） */
type LimbRegion = 'head' | 'arm' | 'hand' | 'body' | 'leg'

/** 关节 → 肢体区域（挂载关节与 ARMOR_BODY_PART_JOINTS 一致） */
const LIMB_JOINT_REGION: Readonly<Record<string, LimbRegion>> = {
    headNeck: 'head',
    spine: 'body',
    rightArmShoulder: 'arm', rightArmElbow: 'arm',
    leftArmShoulder: 'arm', leftArmElbow: 'arm',
    rightHandPivot: 'hand', leftHandPivot: 'hand',
    rightLegHip: 'leg', rightLegKnee: 'leg',
    leftLegHip: 'leg', leftLegKnee: 'leg',
}

/** 各肢体的种族粗壮系数：骷髅瘦削、兽人魁梧、精灵修长（导出供测试校验横向尺寸序） */
export const RACE_BULK: Readonly<Record<LimbRace, number>> = {
    skeleton: 0.64,
    orc: 1.18,
    elf: 0.82,
}

/** 肢体生成器参数：关节基准尺寸 + 种族 + 已解析配色（阵营色 / 发色来自调色板） */
interface LimbGenParams {
    readonly base: ArmorJointBase
    readonly race: LimbRace
    readonly color: number
    readonly accentColor: number
    /** 阵营色（= `factionColorOf(faction)` = `SELECT_PALETTE(faction).bodyColor`）：肢体上的披挂 / 束带随之重着色 */
    readonly factionColor: number
    /** 发色（SELECT_PALETTE 的 hairColor）：精灵头颅发色 */
    readonly hairColor: number
    /** 骨腔阴影色：骷髅内部镂空（眼窝 / 鼻腔 / 胸腔）的暗部 */
    readonly hollowColor: number
}

/** 肢体生成器：以共享 builder 拼装，阵营色从参数注入（换阵营时重建即可重着色） */
type LimbGen = (b: MeshBuilder, p: LimbGenParams) => void

/**
 * 带**种族脸部纹理**的头部主块：前面使用对应种族的脸（骷髅眼窝 / 兽人獠牙 / 精灵纹路），
 * 其余五面为 `baseColor` 的同风格明暗（复用 twoFaceBox 的暗化比例）。
 * 面部材质与其 `map` 纹理都经 builder 登记：`Material.dispose()` 不会释放 `map`，
 * 故纹理须单独 `trackTexture`，否则每次装配/换阵营都会泄漏一张 CanvasTexture。
 */
const addRaceFaceBox = (b: MeshBuilder, p: LimbGenParams, w: number, h: number, d: number, y: number): void => {
    const side = darkenColor(p.color, 0.82)
    const back = darkenColor(p.color, 0.62)
    const bottom = darkenColor(p.color, 0.6)
    const faceTexture = drawRaceFaceCanvas(p.race, {
        baseColor: p.color,
        faceColor: p.accentColor,
        accentColor: p.race === 'orc' ? BONE_IVORY_COLOR : p.hairColor,
    })
    const face = createBoxMaterial(p.color, faceTexture)
    /* 面部材质 + 其 map 纹理均交 builder 生命周期管理，dispose 时一并释放 */
    b.trackMaterial(face)
    b.trackTexture(faceTexture)
    const materials = [
        b.material(side), b.material(side), b.material(p.color),
        b.material(bottom), face, b.material(back),
    ]
    const mesh = b.add(b.box(w, h, d), materials[0], 0, y, 0)
    /* add 只接收单材质；六面材质在此显式替换（与 createHeadBoxPart 面序一致） */
    mesh.material = materials
}

/**
 * **棱台曲线**（true frustum）：沿纵轴用 4 边 `cylinder`（`radiusTop !== radiusBottom`）构建
 * 上下底面**不一样大**的锥台段，逐段收放形成折线曲线——区别于 `stackProfile` 的等截面棱柱。
 * 4 边圆柱绕 Y 转 45° 后截面为正方形，再以 `scale.z` 压成矩形；半径 r = 半宽 × √2。
 * @param profile 自上而下的宽度系数序列（长度 n+1，相邻两层构成一段棱台）
 */
const frustumStack = (
    b: MeshBuilder,
    color: number,
    w: number,
    centerY: number,
    spanY: number,
    profile: readonly number[],
    depthRatio: number,
): void => {
    const segments = profile.length - 1
    if (segments <= 0) return
    const layerH = spanY / segments
    /* 整段共用一个材质（一次登记，多段复用） */
    const mat = b.material(color, 0.55, 0.15)
    for (let i = 0; i < segments; i++) {
        const wTop = w * (profile[i] ?? 1)
        const wBot = w * (profile[i + 1] ?? 1)
        const rTop = wTop / Math.SQRT2
        const rBot = wBot / Math.SQRT2
        const cy = centerY + spanY / 2 - layerH * (i + 0.5)
        const mesh = b.add(b.cylinder(rTop, rBot, layerH, 4), mat, 0, cy, 0, 0, Math.PI / 4, 0)
        mesh.scale.z = depthRatio
    }
}

/* 种族头颅：带种族脸的主颅 + 阵营色额带 / 战纹 + 种族特征
 * 骷髅：头盖骨 + 独立下颌骨 + 内部镂空（眼窝 / 鼻腔 / 颞窝）+ 眉骨 + 眼窝红点；
 * 兽人：獠牙脸 + 宽颚 + 眉骨；精灵（日式）：金发 + 后掠尖耳 + 女性化柔美脸 */
const genLimbHead: LimbGen = (b, p) => {
    const bulk = RACE_BULK[p.race]
    const w = padded(p.base.w * bulk)
    const h = p.base.h
    const d = padded(p.base.d * bulk)
    const y = p.base.centerY
    addRaceFaceBox(b, p, w, h, d, y)

    if (p.race === 'skeleton') {
        /* ── 骷髅头骨：以「暗腔底板 + 前置骨质框」造出**真实空洞**（眼窝 / 鼻腔 / 口腔），
         *    下颌骨独立分离，眉骨外凸显凶，眼窝内嵌凶光红点 ──
         * 层次（z 由后到前）：面颅底板(0.5d) < 暗腔底板(0.53d) < 骨质框(0.58d)；
         * 骨质框在眼/鼻/口处**留空**，露出后方暗腔 = 真正的镂空。 */
        /* 颅顶：头盖骨（上颅）略窄于面颅、后收 */
        b.faceBox(w * 0.94, h * 0.44, d * 0.96, p.color, 0, y + h * 0.28, -d * 0.06)
        /* 暗腔底板：覆盖面前区，作为眼窝 / 鼻腔 / 口腔的共同「空腔」底 */
        b.faceBox(w * 0.84, h * 0.52, d * 0.05, p.hollowColor, 0, y + h * 0.02, d * 0.53)
        /* ── 前置骨质框（留出眼 / 鼻 / 口空洞） ── */
        /* 眉骨：横贯前脸上缘的凸起骨脊，略宽出额面（凶相关键） */
        b.faceBox(w * 1.1, h * 0.13, d * 0.2, p.color, 0, y + h * 0.26, d * 0.52)
        /* 鼻梁骨：中央竖向窄条（分隔两枚眼窝，下接鼻腔） */
        b.faceBox(w * 0.12, h * 0.34, d * 0.16, p.color, 0, y + h * 0.1, d * 0.54)
        /* 颧骨 / 颊骨：两枚外眶骨，位于眼窝外侧 */
        b.faceBox(w * 0.28, h * 0.34, d * 0.18, p.color, w * 0.32, y + h * 0.05, d * 0.52)
        b.faceBox(w * 0.28, h * 0.34, d * 0.18, p.color, -w * 0.32, y + h * 0.05, d * 0.52)
        /* 上颌骨（含上齿列）：鼻腔之下、口腔之上的横条 */
        b.faceBox(w * 0.86, h * 0.16, d * 0.18, p.color, 0, y - h * 0.1, d * 0.52)
        b.faceBox(w * 0.6, h * 0.05, d * 0.08, BONE_IVORY_COLOR, 0, y - h * 0.13, d * 0.62)
        /* 眼窝红点：空洞深处透出的凶光（位于暗腔底板上、眼窝开口内） */
        b.faceBox(w * 0.1, h * 0.09, d * 0.07, SKELETON_EYE_COLOR, w * 0.24, y + h * 0.12, d * 0.56)
        b.faceBox(w * 0.1, h * 0.09, d * 0.07, SKELETON_EYE_COLOR, -w * 0.24, y + h * 0.12, d * 0.56)
        /* 颞窝（两侧凹陷）：眼窝外侧的暗槽 */
        b.faceBox(w * 1.06, h * 0.16, d * 0.34, p.hollowColor, 0, y + h * 0.1, -d * 0.12)
        /* ── 下颌骨：与上颌之间留出**口腔空洞**（中间无物），独立成块 ── */
        b.faceBox(w * 0.78, h * 0.2, d * 0.86, p.color, 0, y - h * 0.36, d * 0.06)
        b.faceBox(w * 0.14, h * 0.14, d * 0.5, p.color, w * 0.37, y - h * 0.27, -d * 0.04)
        b.faceBox(w * 0.14, h * 0.14, d * 0.5, p.color, -w * 0.37, y - h * 0.27, -d * 0.04)
        /* 下颌前齿列（象牙白牙缝） */
        b.faceBox(w * 0.62, h * 0.05, d * 0.08, BONE_IVORY_COLOR, 0, y - h * 0.29, d * 0.5)
        /* 阵营色额带 */
        b.faceBox(w * 1.0, h * 0.09, d * 1.0, p.factionColor, 0, y + h * 0.4, 0)
    } else if (p.race === 'orc') {
        /* 前突下颚 + 獠牙（几何强化脸部纹理）+ 眉骨 */
        b.faceBox(w * 1.04, h * 0.26, d * 0.6, p.color, 0, y - h * 0.4, d * 0.34)
        b.add(b.cone(w * 0.1, h * 0.3, 4), b.material(BONE_IVORY_COLOR, 0.5, 0.05), w * 0.22, y - h * 0.5, d * 0.5)
        b.add(b.cone(w * 0.1, h * 0.3, 4), b.material(BONE_IVORY_COLOR, 0.5, 0.05), -w * 0.22, y - h * 0.5, d * 0.5)
        b.faceBox(w * 1.05, h * 0.12, d * 0.92, p.accentColor, 0, y + h * 0.16, 0)
        /* 阵营色额带 */
        b.faceBox(w * 1.03, h * 0.16, d * 1.03, p.factionColor, 0, y + h * 0.36, 0)
    } else {
        /* ── 日式精灵：金发 + 后掠尖耳 + 女性化柔美脸 ── */
        const hair = ELF_GOLDEN_HAIR_COLOR
        const hairDark = darkenColor(hair, 0.62)
        /* 后掠尖耳（耳根在头侧，锥尖向后方 -Z 延伸并微微上挑；rx>0 让锥尖转向 -Z） */
        const earTilt = Math.PI / 2 - 0.3
        b.add(b.cone(w * 0.12, h * 0.6, 4), b.material(p.color, 0.7, 0.05), w * 0.54, y + h * 0.06, -d * 0.1, 0.62, 0, -earTilt)
        b.add(b.cone(w * 0.12, h * 0.6, 4), b.material(p.color, 0.7, 0.05), -w * 0.54, y + h * 0.06, -d * 0.1, 0.62, 0, earTilt)
        /* 顶发：覆盖头顶与后脑（圆润发盖），前低后高 */
        b.faceBox(w * 1.06, h * 0.24, d * 0.98, hair, 0, y + h * 0.44, 0)
        b.faceBox(w * 1.02, h * 0.3, d * 0.7, hair, 0, y + h * 0.34, -d * 0.32)
        /* 齐刘海：前额横向发片 + 中分缺口 */
        b.faceBox(w * 1.02, h * 0.16, d * 0.14, hair, 0, y + h * 0.34, d * 0.48)
        b.faceBox(w * 0.16, h * 0.2, d * 0.12, hairDark, 0, y + h * 0.28, d * 0.5)
        /* 两侧鬓发：贴脸下垂的长发丝 */
        b.faceBox(w * 0.14, h * 0.66, d * 0.42, hair, w * 0.58, y + h * 0.0, -d * 0.02)
        b.faceBox(w * 0.14, h * 0.66, d * 0.42, hair, -w * 0.58, y + h * 0.0, -d * 0.02)
        /* 脑后长发：下垂至肩（发尾略收窄） */
        b.faceBox(w * 0.82, h * 0.5, d * 0.24, hair, 0, y + h * 0.06, -d * 0.6)
        b.faceBox(w * 0.6, h * 0.3, d * 0.2, hair, 0, y - h * 0.32, -d * 0.56)
        /* 面部：细眉（金发暗色） */
        b.faceBox(w * 0.22, h * 0.028, d * 0.06, hairDark, w * 0.22, y + h * 0.25, d * 0.5)
        b.faceBox(w * 0.22, h * 0.028, d * 0.06, hairDark, -w * 0.22, y + h * 0.25, d * 0.5)
        /* 腮红（柔美化） */
        b.faceBox(w * 0.14, h * 0.045, d * 0.05, ELF_BLUSH_COLOR, w * 0.3, y + h * 0.03, d * 0.48)
        b.faceBox(w * 0.14, h * 0.045, d * 0.05, ELF_BLUSH_COLOR, -w * 0.3, y + h * 0.03, d * 0.48)
    }
}

/* 种族躯干
 * 骷髅：**空心胸腔** —— 脊柱 + 独立肋骨（左右成对）+ 骨盆 + 锁骨，不建实心主躯；
 * 兽人：宽肩甲 + 胸肌板；精灵（日式）：细腰女体 + 轻甲胸衣 + 披肩 */
const genLimbBody: LimbGen = (b, p) => {
    const bulk = RACE_BULK[p.race]
    const w = padded(p.base.w * bulk)
    const h = p.base.h
    const d = padded(p.base.d * bulk)
    const y = p.base.centerY

    if (p.race === 'skeleton') {
        /* ── 空心胸腔：脊柱 + 肋骨笼 + 骨盆 + 锁骨 ── */
        /* 脊柱：纵向椎骨列（后侧中线） */
        const spineZ = -d * 0.32
        for (let i = 0; i < 6; i++) {
            b.faceBox(w * 0.16, h * 0.1, d * 0.18, p.color, 0, y + h * 0.42 - i * h * 0.16, spineZ)
        }
        /* 肋骨：左右成对的弧形骨条，围出中空胸腔（不封前胸 → 直观镂空） */
        for (let i = 0; i < 5; i++) {
            const ribY = y + h * 0.34 - i * h * 0.13
            const ribW = w * 0.24
            b.faceBox(ribW, h * 0.045, d * 0.92, p.color, w * 0.3, ribY, 0)
            b.faceBox(ribW, h * 0.045, d * 0.92, p.color, -w * 0.3, ribY, 0)
            b.faceBox(w * 0.5, h * 0.045, d * 0.14, p.color, 0, ribY, d * 0.34)
        }
        /* 胸骨（前中） */
        b.faceBox(w * 0.12, h * 0.5, d * 0.14, p.color, 0, y + h * 0.16, d * 0.34)
        /* 锁骨：两段自中线向肩部外上斜伸 */
        b.faceBox(w * 0.42, h * 0.07, d * 0.16, p.color, w * 0.28, y + h * 0.46, d * 0.2)
        b.faceBox(w * 0.42, h * 0.07, d * 0.16, p.color, -w * 0.28, y + h * 0.46, d * 0.2)
        /* 骨盆：下端开口的骨环（左右髋骨 + 骶骨） */
        b.faceBox(w * 0.3, h * 0.16, d * 0.8, p.color, w * 0.26, y - h * 0.36, 0)
        b.faceBox(w * 0.3, h * 0.16, d * 0.8, p.color, -w * 0.26, y - h * 0.36, 0)
        b.faceBox(w * 0.56, h * 0.14, d * 0.2, p.color, 0, y - h * 0.4, spineZ)
        /* 阵营色束带（腰间，体现阵营归属） */
        b.faceBox(w * 1.02, h * 0.1, d * 1.0, p.factionColor, 0, y - h * 0.26, 0)
        return
    }

    if (p.race === 'orc') {
        /* 兽人：厚实主躯 + 双肩甲 + 胸肌板 + 阵营色腰带 */
        b.faceBox(w, h, d, p.color, 0, y, 0)
        b.faceBox(w * 0.34, h * 0.22, d * 0.76, p.accentColor, w * 0.38, y + h * 0.42, 0)
        b.faceBox(w * 0.34, h * 0.22, d * 0.76, p.accentColor, -w * 0.38, y + h * 0.42, 0)
        b.faceBox(w * 0.8, h * 0.3, d * 0.12, p.accentColor, 0, y + h * 0.12, d * 0.56)
        b.faceBox(w * 1.03, h * 0.12, d * 1.03, p.factionColor, 0, y - h * 0.2, 0)
        return
    }

    /* ── 日式精灵女体：**真棱台**沙漏曲线（每段上下底面不等宽，折线收放） ── */
    /* 宽度剖面（自上而下）：宽肩 → 收胸 → 细腰 → 张胯 → 收腿根 */
    const torsoProfile = [1.0, 0.9, 0.78, 0.6, 0.54, 0.72, 0.94, 0.8] as const
    frustumStack(b, p.color, w, y, h, torsoProfile, 0.82)
    /* 胸前点缀色细带（轻甲吊带，克制不遮身，且不居中突出） */
    b.faceBox(w * 0.09, h * 0.24, d * 0.06, p.accentColor, w * 0.17, y + h * 0.34, d * 0.4)
    b.faceBox(w * 0.09, h * 0.24, d * 0.06, p.accentColor, -w * 0.17, y + h * 0.34, d * 0.4)
    /* 腰封（阵营色束带，卡在最细处 → 强化细腰） */
    b.faceBox(w * 0.5, h * 0.07, d * 0.76, p.factionColor, 0, y - h * 0.11, 0)
}

/* 种族肢段（手臂 / 手 / 腿部）：主段 + 阵营色束带 + 种族特征
 * 骷髅：细骨干 + 两端骨节（关节略粗，体现骨节）；兽人：肌肉隆起；
 * 精灵：修长女体 + 护腕 / 束袜线 */
const genLimbSegment: LimbGen = (b, p) => {
    const bulk = RACE_BULK[p.race]
    const w = padded(p.base.w * bulk)
    const h = p.base.h
    const d = padded(p.base.d * bulk)
    const y = p.base.centerY

    if (p.race === 'skeleton') {
        /* ── 细骨干 + 两端骨节 ── */
        /* 骨干：细长（约为骨节宽度的 0.6），纵向留出两端骨节空间 */
        b.faceBox(w * 0.58, h * 0.82, d * 0.58, p.color, 0, y, 0)
        /* 两端骨节：略加粗的关节球块（上下各一），末端不超出原部件范围 */
        const knobW = w * 1.02
        const knobH = h * 0.1
        const knobD = d * 1.02
        b.faceBox(knobW, knobH, knobD, p.color, 0, y + h * 0.45, 0)
        b.faceBox(knobW, knobH, knobD, p.color, 0, y - h * 0.45, 0)
        /* 骨节暗缝（上下端各一道，强化骨节感） */
        b.faceBox(w * 0.86, h * 0.03, d * 0.86, p.accentColor, 0, y + h * 0.4, 0)
        b.faceBox(w * 0.86, h * 0.03, d * 0.86, p.accentColor, 0, y - h * 0.4, 0)
    } else if (p.race === 'orc') {
        /* 兽人：粗壮主段 + 阵营色束带 + 肌肉隆起 */
        b.faceBox(w, h, d, p.color, 0, y, 0)
        b.faceBox(w * 1.04, h * 0.14, d * 1.04, p.factionColor, 0, y - h * 0.06, 0)
        b.faceBox(w * 1.1, h * 0.42, d * 1.1, p.color, 0, y + h * 0.05, 0)
        b.faceBox(w * 1.04, h * 0.1, d * 0.5, p.accentColor, 0, y - h * 0.3, d * 0.42)
    } else {
        /* 日式精灵：**真棱台**锥形肢体（上端饱满 → 向关节收细 → 端部微张做腕 / 踝） */
        const limbProfile = [1.0, 0.82, 0.7, 0.68, 0.76, 0.84] as const
        frustumStack(b, p.color, w, y, h, limbProfile, 0.78)
        /* 阵营色束带（近端） */
        b.faceBox(w * 0.8, h * 0.06, d * 0.72, p.factionColor, 0, y - h * 0.1, 0)
        /* 点缀色护腕 / 束袜线（远端） */
        b.faceBox(w * 0.86, h * 0.05, d * 0.8, p.accentColor, 0, y + h * 0.4, 0)
        b.faceBox(w * 0.8, h * 0.04, d * 0.4, p.accentColor, 0, y - h * 0.36, d * 0.34)
    }
}

const LIMB_REGION_GENS: Readonly<Record<LimbRegion, LimbGen>> = {
    head: genLimbHead,
    body: genLimbBody,
    arm: genLimbSegment,
    hand: genLimbSegment,
    leg: genLimbSegment,
}

/**
 * 按肢体配方 + 挂载关节 + 阵营调色板构建种族肢体部件：
 * 关节决定区域与基准尺寸（复用护甲关节基座的 `PRESET_PART_SIZES`），
 * 种族基色来自配方，披挂 / 束带 / 发色取自调色板（换阵营重建即可重着色）。
 * 与护甲件同为**纯视觉子节点**：不生成碰撞体、不参与受击箱 / 视线 / 导航。
 */
export const createLimbMesh = (config: LimbMeshConfig, jointId: string, palette: BoxPartPalette): ArmorMeshResult => {
    const base = ARMOR_JOINT_BASES[jointId]
    const region = LIMB_JOINT_REGION[jointId]
    if (base === undefined || region === undefined) return emptyResult()

    const builder = createMeshBuilder()
    LIMB_REGION_GENS[region](builder, {
        base,
        race: config.race,
        color: config.color,
        accentColor: config.accentColor ?? darkenColor(config.color, 0.7),
        /* 阵营色：`palette.bodyColor` 即 `factionColorOf(faction)`（SELECT_PALETTE 唯一映射），与人类身体同源 */
        factionColor: palette.bodyColor,
        hairColor: palette.hairColor,
        hollowColor: SKELETON_HOLLOW_COLOR,
    })
    return {group: builder.group, cleanup: builder.dispose}
}
