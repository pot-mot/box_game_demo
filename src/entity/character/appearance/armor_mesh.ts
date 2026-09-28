import {Group} from 'three'
import {darkenColor} from '../../../render/constants.ts'
import {PRESET_PART_SIZES} from '../skeleton/preset.ts'
import {ARMOR_PAD} from './constants.ts'
import {createMeshBuilder, type MeshBuilder} from './mesh_builder.ts'

/** 护甲外观形状 id（常量 + 索引类型推导） */
export const ARMOR_MESH_IDS = ['cap', 'helmet', 'hood', 'vest', 'plate', 'robe', 'bracer', 'greaves', 'legwrap', 'boots'] as const
export type ArmorMeshId = typeof ARMOR_MESH_IDS[number]

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

const ARMOR_JOINT_BASES: Readonly<Record<string, ArmorJointBase>> = {
    headNeck: {w: s.headW, h: s.headH, d: s.headW, centerY: s.headH / 2},
    spine: {w: s.bodyW, h: s.bodyH, d: s.bodyD, centerY: s.bodyH / 2},
    rightArmElbow: {w: s.armW * 0.8, h: s.forearmH, d: s.armD * 0.8, centerY: -s.forearmH / 2},
    leftArmElbow: {w: s.armW * 0.8, h: s.forearmH, d: s.armD * 0.8, centerY: -s.forearmH / 2},
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
