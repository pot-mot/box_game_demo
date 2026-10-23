import {Group, type MeshStandardMaterial} from 'three'
import {createBoxMaterial, drawRaceFaceCanvas, type BoxPartPalette} from '../../../../../render/box_parts.ts'
import {BONE_IVORY_COLOR, ELF_BLUSH_COLOR, ELF_CLOTH_COLOR, ELF_GOLDEN_HAIR_COLOR, SKELETON_EYE_COLOR, SKELETON_HOLLOW_COLOR, darkenColor} from '../../../../../render/constants.ts'
import {PRESET_PART_SIZES} from '../skeleton/skeleton.ts'
import {HAND_HEIGHT_RATIO} from '../state/constants.ts'
import {ARMOR_PAD, ARMOR_TOP_OVERLAP, armorThicknessOf} from '../state/constants.ts'
import {createMeshBuilder, type MeshBuilder} from '../../../appearance/mesh_builder.ts'
import type {ArmorBodyPart, ArmorMeshConfig, ArmorMeshId, LimbMeshConfig, LimbRace} from '../../../../../character/equipment/mesh_config.ts'
import type {CharacterMaterialId} from '../../../../../render/character_materials.ts'

export type {
    ArmorBodyPart,
    ArmorMeshConfig,
    ArmorMeshId,
    LimbMeshConfig,
    LimbRace,
} from '../../../../../character/equipment/mesh_config.ts'
export {ARMOR_BODY_PARTS, ARMOR_MESH_IDS, LIMB_RACES} from '../../../../../character/equipment/mesh_config.ts'

/** 身体部位 → 承载该部位基础模型的关节 id（与 assembleCharacterAppearance 的挂载目标一致） */
export const ARMOR_BODY_PART_JOINTS: Readonly<Record<ArmorBodyPart, string>> = {
    head: 'headNeck', torso: 'spine',
    rightUpperArm: 'rightArmShoulder', rightForearm: 'rightArmElbow', rightHand: 'rightHandPivot',
    leftUpperArm: 'leftArmShoulder', leftForearm: 'leftArmElbow', leftHand: 'leftHandPivot',
    rightThigh: 'rightLegHip', rightShin: 'rightLegKnee',
    leftThigh: 'leftLegHip', leftShin: 'leftLegKnee',
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
    rightFoot: {w: s.legW * 0.85, h: s.shinH * 0.3, d: s.legD * 0.85, centerY: s.shinH * 0.15},
    leftFoot: {w: s.legW * 0.85, h: s.shinH * 0.3, d: s.legD * 0.85, centerY: s.shinH * 0.15},
}

/** 生成器参数：关节基准部件尺寸 + 已解析的调色（accentColor 缺省时回退主色暗化）+ 材质库 id */
interface ArmorGenParams {
    readonly base: ArmorJointBase
    readonly color: number
    readonly accentColor: number
    /** 材质库 id（已解析：配置显式声明，否则按形状推导） */
    readonly material: CharacterMaterialId
}

/** 单个护甲形状生成器：以共享 builder 拼装部件（独立实现，参照 weapon_mesh 的 gen 模式） */
type ArmorGen = (b: MeshBuilder, p: ArmorGenParams) => void

/** 关节白名单 + 生成器：白名单缺省 = 槽位声明的全部关节 */
interface ArmorShape {
    readonly joints?: readonly string[]
    readonly gen: ArmorGen
}

/** 肢体部件外扩：身体部件尺寸 × 乘数 + 2 × ARMOR_PAD（供种族肢体使用） */
const padded = (size: number): number => size + ARMOR_PAD * 2

/** 各形状缺省材质（可在配方中显式覆盖） */
const ARMOR_SHAPE_MATERIAL: Readonly<Record<ArmorMeshId, CharacterMaterialId>> = {    cap: 'cloth',
    helmet: 'metal',
    hood: 'cloth',
    vest: 'cloth',
    plate: 'metal',
    robe: 'cloth',
    bracer: 'metal',
    greaves: 'metal',
    legwrap: 'cloth',
    boots: 'leather',
}

// ── 各护甲形状生成器（方块造型 + 统一材质库；宽/深 = 身体部件尺寸 × 材质厚度系数） ──

/* 布帽：下沿落在头顶（过眼线之上、与头顶非共面）的方形帽身 + 方锥帽顶 + 帽檐 */
const genCap: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const d = p.base.d * t
    const hh = p.base.h
    const capH = hh * 0.5
    const y = hh * 0.85 + capH / 2
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.frustum(w * 0.84, w, capH, d / w), m, 0, y, 0)
    b.add(b.frustum(w * 0.6, w * 0.84, hh * 0.14, d / w), m, 0, y + capH * 0.5, 0)
    b.add(b.frustum(w * 1.02, w * 1.08, hh * 0.12, d / w), a, 0, hh * 0.86, 0)
}

/* 铁盔：包裹头部的方形盔体（顶缘高出头顶 ≥ 1 单位）+ 额檐 + 顶脊 */
const genHelmet: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const d = p.base.d * t
    const hh = p.base.h
    const h = hh * 1.1
    const y = hh + ARMOR_TOP_OVERLAP - h / 2
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.box(w, h, d), m, 0, y, 0)
    b.add(b.box(w * 1.02, h * 0.14, d * 1.02), a, 0, y - h * 0.44, d * 0.1)
    b.add(b.box(w * 0.14, h * 0.16, d * 1.04), a, 0, y + h * 0.5, 0)
}

/* 兜帽：方形锥体帽身（顶缘高出头顶）+ 方锥顶尖 + 肩部斗篷垂布 */
const genHood: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const d = p.base.d * t
    const hh = p.base.h
    const h = hh * 1.1
    const y = hh + ARMOR_TOP_OVERLAP - h / 2
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.frustum(w * 0.5, w, h, d / w), m, 0, y, 0)
    b.add(b.frustum(w * 0.05, w * 0.5, hh * 0.6, d / w), m, 0, y + h * 0.5 + hh * 0.3, 0)
    b.add(b.frustum(w * 0.84, w * 1.1, h * 0.5, 0.7), a, 0, y - h * 0.55, -d * 0.25)
}

/* 布衣 / 皮甲：贴身等宽薄衣身（宽 = 体宽 × 材质厚度），顶缘高出肩部 ≥ 1 单位 */
const genVest: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const h = p.base.h * 1.1
    const y = p.base.h + ARMOR_TOP_OVERLAP - h / 2
    const m = b.materialById(p.material, p.color)
    b.add(b.frustum(w, w, h, p.base.d / p.base.w), m, 0, y, 0)
}

/* 铁 / 鳞 / 石胸甲：方形胸板 + 中脊 + 腰带 + 双方形肩甲；顶缘高出肩部 */
const genPlate: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const d = p.base.d * t
    const h = p.base.h * 0.92
    const y = p.base.h + ARMOR_TOP_OVERLAP - h / 2
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.frustum(w * 0.9, w, h, d / w), m, 0, y, 0)
    b.add(b.box(w * 0.16, h * 0.68, d * 0.16), a, 0, y + h * 0.02, d * 0.44)
    b.add(b.box(w * 1.02, h * 0.12, d * 1.02), a, 0, y - h * 0.46, 0)
    b.add(b.frustum(w * 0.24, w * 0.34, h * 0.3, 0.8), a, w * 0.4, y + h * 0.48, 0)
    b.add(b.frustum(w * 0.24, w * 0.34, h * 0.3, 0.8), a, -w * 0.4, y + h * 0.48, 0)
}

/* 法袍：上窄（1.1）下宽（1.3）的贴身长袍，顶缘高出肩部 ≥ 1 单位、下摆延至膝部 + 下摆边 */
const genRobe: ArmorGen = (b, p) => {
    const w = p.base.w
    const ratio = p.base.d / p.base.w
    const h = p.base.h * 1.7
    const y = p.base.h + ARMOR_TOP_OVERLAP - h / 2
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.frustum(w * 1.1, w * 1.3, h, ratio), m, 0, y, 0)
    b.add(b.frustum(w * 1.28, w * 1.32, h * 0.06, ratio), a, 0, y - h * 0.47, 0)
}

/* 护腕：方形护臂 + 束带 + 手背护片 */
const genBracer: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const d = p.base.d * t
    const h = p.base.h * 0.62
    const y = p.base.centerY * 1.3
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.frustum(w, w, h, d / w), m, 0, y, 0)
    b.add(b.box(w * 1.04, h * 0.18, d * 1.04), a, 0, y - h * 0.4, 0)
    b.add(b.box(w * 0.5, h * 0.34, d * 0.42), a, 0, y + h * 0.28, d * 0.34)
}

/* 胫甲：方形护胫 + 前方护片 + 方形膝甲；底端与腿段底面平齐，不超出模型腿底 */
const genGreaves: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const d = p.base.d * t
    const h = p.base.h * 0.55
    const y = -p.base.h + h / 2
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.frustum(w, w, h, d / w), m, 0, y, 0)
    b.add(b.box(w * 0.6, h * 0.5, d * 0.3), a, 0, y - h * 0.05, d * 0.42)
    b.add(b.box(w * 0.72, h * 0.2, d * 0.72), a, 0, y + h * 0.42, 0)
}

/* 布裤：方形绑腿 + 侧向束结 */
const genLegwrap: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const d = p.base.d * t
    const h = p.base.h * 0.4
    const y = p.base.centerY * 1.4
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.frustum(w, w, h, d / w), m, 0, y, 0)
    b.add(b.box(w * 0.16, h * 0.6, d * 0.5), a, w * 0.52, y - h * 0.1, 0)
}

/* 靴：方形靴筒（仅包小腿 / 膝关节）+ 前伸脚尖；底面与小腿底端平齐，不超出模型腿底。 */
const genBoots: ArmorGen = (b, p) => {
    const t = armorThicknessOf(p.material)
    const w = p.base.w * t
    const d = p.base.d * t
    const h = p.base.h * 0.72
    const toeH = h * 0.26
    const y = -p.base.h + h / 2
    const toeY = -p.base.h + toeH / 2
    const m = b.materialById(p.material, p.color)
    const a = b.materialById(p.material, p.accentColor)
    b.add(b.frustum(w, w, h, d / w), m, 0, y, 0)
    b.add(b.frustum(w * 0.68, w * 0.9, toeH, 0.6), a, 0, toeY, p.base.d * 0.5)
    b.add(b.box(w * 0.9, h * 0.14, d * 0.5), a, 0, y + h * 0.2, d * 0.34)
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
        material: config.material ?? ARMOR_SHAPE_MATERIAL[config.id],
    })
    return {group: builder.group, cleanup: builder.dispose}
}

// ── 肢体组件（种族肢体：复用护甲外观机制，默认顶替对应人类肢体） ──

/** 肢体区域（由挂载关节推导：头部 / 手臂 / 手 / 身体 / 腿部 / 足） */
type LimbRegion = 'head' | 'arm' | 'hand' | 'body' | 'leg' | 'foot'

/** 关节 → 肢体区域（挂载关节与 ARMOR_BODY_PART_JOINTS 一致） */
const LIMB_JOINT_REGION: Readonly<Record<string, LimbRegion>> = {
    headNeck: 'head',
    spine: 'body',
    rightArmShoulder: 'arm', rightArmElbow: 'arm',
    leftArmShoulder: 'arm', leftArmElbow: 'arm',
    rightHandPivot: 'hand', leftHandPivot: 'hand',
    rightLegHip: 'leg', rightLegKnee: 'leg',
    leftLegHip: 'leg', leftLegKnee: 'leg',
    rightFoot: 'foot', leftFoot: 'foot',
}

/** 各肢体的种族粗壮系数：骷髅瘦削、兽人魁梧、精灵修长（导出供测试校验横向尺寸序） */
export const RACE_BULK: Readonly<Record<LimbRace, number>> = {
    skeleton: 0.64,
    orc: 1.18,
    elf: 0.82,
}

/** 各种族缺省材质库 id（骷髅骨 / 兽人 & 精灵肤） */
const LIMB_RACE_MATERIAL: Readonly<Record<LimbRace, CharacterMaterialId>> = {
    skeleton: 'bone',
    orc: 'skin',
    elf: 'skin',
}

/** 肢体生成器参数：关节基准尺寸 + 种族 + 已解析配色（阵营色 / 发色来自调色板） */
interface LimbGenParams {
    readonly base: ArmorJointBase
    readonly race: LimbRace
    readonly color: number
    readonly accentColor: number
    /** 材质库 id（按种族推导） */
    readonly material: CharacterMaterialId
    /** 阵营色（= `factionColorOf(faction)` = `SELECT_PALETTE(faction).bodyColor`）：肢体上的披挂 / 束带随之重着色 */
    readonly factionColor: number
    /** 发色（SELECT_PALETTE 的 hairColor）：精灵头颅发色 */
    readonly hairColor: number
    /** 骨腔阴影色：骷髅内部镂空（眼窝 / 鼻腔 / 胸腔）的暗部 */
    readonly hollowColor: number
}

/** 肢体生成器：以共享 builder 拼装，阵营色从参数注入（换阵营时重建即可重着色） */
type LimbGen = (b: MeshBuilder, p: LimbGenParams) => void

/** 单个 gen 内按颜色缓存材质（避免同色重复创建） */
const materialCacheOf = (b: MeshBuilder, p: LimbGenParams): ((color: number) => MeshStandardMaterial) => {
    const cache = new Map<number, MeshStandardMaterial>()
    return (color: number): MeshStandardMaterial => {
        let m = cache.get(color)
        if (m === undefined) {
            m = b.materialById(p.material, color)
            cache.set(color, m)
        }
        return m
    }
}

/**
 * 带**种族脸部纹理**的头部主块：前面使用对应种族的脸（骷髅眼窝 / 兽人獠牙 / 精灵纹路），
 * 其余五面为 `baseColor` 的同风格明暗。面部材质与其 `map` 纹理都经 builder 登记：
 * `Material.dispose()` 不会释放 `map`，故纹理须单独 `trackTexture`，否则每次装配/换阵营都会泄漏一张 CanvasTexture。
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
        b.materialById(p.material, side), b.materialById(p.material, side), b.materialById(p.material, p.color),
        b.materialById(p.material, bottom), face, b.materialById(p.material, back),
    ]
    const mesh = b.add(b.box(w, h, d), materials[0], 0, y, 0)
    /* add 只接收单材质；六面材质在此显式替换（与 createHeadBoxPart 面序一致） */
    mesh.material = materials
}

/**
 * **棱台曲线**（true frustum）：沿纵轴用低多面体 4 边 `frustum` 逐段收放形成折线曲线。
 * @param profile 自上而下的宽度系数序列（长度 n+1，相邻两层构成一段棱台）
 */
const frustumStack = (
    b: MeshBuilder,
    mat: MeshStandardMaterial,
    w: number,
    centerY: number,
    spanY: number,
    profile: readonly number[],
    depthRatio: number,
): void => {
    const segments = profile.length - 1
    if (segments <= 0) return
    const layerH = spanY / segments
    for (let i = 0; i < segments; i++) {
        const wTop = w * (profile[i] ?? 1)
        const wBot = w * (profile[i + 1] ?? 1)
        const cy = centerY + spanY / 2 - layerH * (i + 0.5)
        b.add(b.frustum(wTop, wBot, layerH, depthRatio), mat, 0, cy, 0)
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
    const m = materialCacheOf(b, p)
    addRaceFaceBox(b, p, w, h, d, y)

    if (p.race === 'skeleton') {
        /* ── 骷髅头骨：深眼窝（红点）+ 眉骨 + 鼻腔 + 独立下颌 + 齿列 + 放大阵营色额环 ── */
        b.add(b.sphere(w * 0.17, 8, 6), m(p.hollowColor), w * 0.24, y + h * 0.12, d * 0.38)
        b.add(b.sphere(w * 0.17, 8, 6), m(p.hollowColor), -w * 0.24, y + h * 0.12, d * 0.38)
        b.add(b.sphere(w * 0.075, 6, 4), m(SKELETON_EYE_COLOR), w * 0.24, y + h * 0.12, d * 0.45)
        b.add(b.sphere(w * 0.075, 6, 4), m(SKELETON_EYE_COLOR), -w * 0.24, y + h * 0.12, d * 0.45)
        b.add(b.box(w * 1.08, h * 0.12, d * 0.22), m(p.color), 0, y + h * 0.27, d * 0.44)
        b.add(b.cone(w * 0.09, h * 0.22, 4), m(p.hollowColor), 0, y + h * 0.0, d * 0.5, Math.PI, 0, 0)
        b.add(b.box(w * 0.86, h * 0.16, d * 0.86), m(p.color), 0, y - h * 0.06, d * 0.08)
        b.add(b.box(w * 0.6, h * 0.05, d * 0.1), m(BONE_IVORY_COLOR), 0, y - h * 0.12, d * 0.5)
        b.add(b.box(w * 0.78, h * 0.2, d * 0.84), m(p.color), 0, y - h * 0.36, d * 0.06)
        b.add(b.box(w * 0.62, h * 0.05, d * 0.08), m(BONE_IVORY_COLOR), 0, y - h * 0.29, d * 0.5)
        /* 头顶阵营色环带（放大） */
        b.add(b.frustum(w * 1.14, w * 1.18, h * 0.26, d / w), m(p.factionColor), 0, y + h * 0.34, 0)
    } else if (p.race === 'orc') {
        /* 厚眉骨 + 宽颚 + 上翘獠牙（几何强化脸部纹理）+ 阵营色额带 */
        b.add(b.frustum(w * 0.9, w * 1.05, h * 0.3, d / w), m(p.color), 0, y - h * 0.4, d * 0.3)
        b.add(b.box(w * 1.1, h * 0.14, d * 0.24), m(p.accentColor), 0, y + h * 0.24, d * 0.42)
        b.add(b.cone(w * 0.11, h * 0.34, 6), m(BONE_IVORY_COLOR), w * 0.22, y - h * 0.48, d * 0.5, 0.3, 0, -0.3)
        b.add(b.cone(w * 0.11, h * 0.34, 6), m(BONE_IVORY_COLOR), -w * 0.22, y - h * 0.48, d * 0.5, 0.3, 0, 0.3)
        b.add(b.box(w * 1.03, h * 0.16, d * 1.03), m(p.factionColor), 0, y + h * 0.4, 0)
    } else {
        /* ── 日式精灵：金发 + 后掠尖耳 + 女性化柔美脸 ── */
        const hair = ELF_GOLDEN_HAIR_COLOR
        const hairDark = darkenColor(hair, 0.62)
        const earTilt = Math.PI / 2 - 0.3
        b.add(b.cone(w * 0.12, h * 0.6, 4), m(p.color), w * 0.54, y + h * 0.06, -d * 0.1, 0.62, 0, -earTilt)
        b.add(b.cone(w * 0.12, h * 0.6, 4), m(p.color), -w * 0.54, y + h * 0.06, -d * 0.1, 0.62, 0, earTilt)
        b.add(b.frustum(w * 1.06, w * 1.06, h * 0.24, d / w), m(hair), 0, y + h * 0.44, 0)
        b.add(b.box(w * 1.02, h * 0.3, d * 0.7), m(hair), 0, y + h * 0.34, -d * 0.32)
        b.add(b.box(w * 1.02, h * 0.16, d * 0.14), m(hair), 0, y + h * 0.34, d * 0.48)
        b.add(b.box(w * 0.16, h * 0.2, d * 0.12), m(hairDark), 0, y + h * 0.28, d * 0.5)
        b.add(b.box(w * 0.14, h * 0.66, d * 0.42), m(hair), w * 0.58, y + h * 0.0, -d * 0.02)
        b.add(b.box(w * 0.14, h * 0.66, d * 0.42), m(hair), -w * 0.58, y + h * 0.0, -d * 0.02)
        b.add(b.box(w * 0.82, h * 0.5, d * 0.24), m(hair), 0, y + h * 0.06, -d * 0.6)
        b.add(b.box(w * 0.6, h * 0.3, d * 0.2), m(hair), 0, y - h * 0.32, -d * 0.56)
        b.add(b.box(w * 0.22, h * 0.028, d * 0.06), m(hairDark), w * 0.22, y + h * 0.25, d * 0.5)
        b.add(b.box(w * 0.22, h * 0.028, d * 0.06), m(hairDark), -w * 0.22, y + h * 0.25, d * 0.5)
        b.add(b.box(w * 0.14, h * 0.045, d * 0.05), m(ELF_BLUSH_COLOR), w * 0.3, y + h * 0.03, d * 0.48)
        b.add(b.box(w * 0.14, h * 0.045, d * 0.05), m(ELF_BLUSH_COLOR), -w * 0.3, y + h * 0.03, d * 0.48)
        /* 头顶阵营宝石（颜色随阵营，替代四肢束带作为阵营标识） */
        b.add(b.sphere(w * 0.15, 10, 8), b.materialById('gem', p.factionColor), 0, y + h * 0.58, 0)
    }
}

/* 种族躯干
 * 骷髅：**空心胸腔** —— 脊柱 + 独立肋骨（低面柱条）+ 骨盆 + 锁骨，不建实心主躯；
 * 兽人：宽肩甲 + 胸肌板（锥台）；精灵（日式）：细腰女体 + 轻甲胸衣 + 披肩 */
const genLimbBody: LimbGen = (b, p) => {
    const bulk = RACE_BULK[p.race]
    const w = padded(p.base.w * bulk)
    const h = p.base.h
    const d = padded(p.base.d * bulk)
    const y = p.base.centerY
    const m = materialCacheOf(b, p)

    if (p.race === 'skeleton') {
        /* ── 空心胸腔：脊柱椎骨 + 肋骨笼（低面柱）+ 骨盆 + 锁骨 ── */
        const spineZ = -d * 0.32
        for (let i = 0; i < 6; i++) {
            b.add(b.sphere(w * 0.09, 6, 4), m(p.color), 0, y + h * 0.42 - i * h * 0.16, spineZ)
        }
        for (let i = 0; i < 5; i++) {
            const ribY = y + h * 0.34 - i * h * 0.13
            b.add(b.cylinder(w * 0.05, w * 0.05, d * 0.92, 5), m(p.color), w * 0.3, ribY, 0, Math.PI / 2, 0, 0)
            b.add(b.cylinder(w * 0.05, w * 0.05, d * 0.92, 5), m(p.color), -w * 0.3, ribY, 0, Math.PI / 2, 0, 0)
            b.add(b.cylinder(w * 0.05, w * 0.05, w * 0.5, 5), m(p.color), 0, ribY, d * 0.34, 0, 0, Math.PI / 2)
        }
        b.add(b.box(w * 0.12, h * 0.5, d * 0.14), m(p.color), 0, y + h * 0.16, d * 0.34)
        b.add(b.box(w * 0.42, h * 0.07, d * 0.16), m(p.color), w * 0.28, y + h * 0.46, d * 0.2)
        b.add(b.box(w * 0.42, h * 0.07, d * 0.16), m(p.color), -w * 0.28, y + h * 0.46, d * 0.2)
        b.add(b.box(w * 0.3, h * 0.16, d * 0.8), m(p.color), w * 0.26, y - h * 0.36, 0)
        b.add(b.box(w * 0.3, h * 0.16, d * 0.8), m(p.color), -w * 0.26, y - h * 0.36, 0)
        b.add(b.box(w * 0.56, h * 0.14, d * 0.2), m(p.color), 0, y - h * 0.4, spineZ)
        b.add(b.frustum(w * 1.02, w * 1.02, h * 0.1, d / w), m(p.factionColor), 0, y - h * 0.26, 0)
        return
    }

    if (p.race === 'orc') {
        /* 兽人：厚实锥台主躯 + 胸肌 / 腹肌体块 + 双肩甲 + 阵营色腰带 */
        b.add(b.frustum(w * 0.86, w, h, d / w), m(p.color), 0, y, 0)
        b.add(b.ellipsoid(w * 0.34, h * 0.16, d * 0.22, 10, 8), m(p.color), w * 0.2, y + h * 0.22, d * 0.36)
        b.add(b.ellipsoid(w * 0.34, h * 0.16, d * 0.22, 10, 8), m(p.color), -w * 0.2, y + h * 0.22, d * 0.36)
        b.add(b.ellipsoid(w * 0.22, h * 0.18, d * 0.16, 8, 6), m(p.color), 0, y - h * 0.08, d * 0.42)
        b.add(b.frustum(w * 0.32, w * 0.44, h * 0.24, 0.8), m(p.accentColor), w * 0.42, y + h * 0.44, 0)
        b.add(b.frustum(w * 0.32, w * 0.44, h * 0.24, 0.8), m(p.accentColor), -w * 0.42, y + h * 0.44, 0)
        b.add(b.frustum(w * 1.04, w * 1.06, h * 0.12, d / w), m(p.factionColor), 0, y - h * 0.22, 0)
        return
    }

    /* ── 日式精灵女体：细棱台沙漏（锥度平缓，最宽∶最窄 ≈ 1.2）+ 素色布裹胸 / 裹胯，仅露出腹部 ── */
    const torsoProfile = [0.9, 0.85, 0.8, 0.76, 0.75, 0.79, 0.86, 0.83] as const
    frustumStack(b, m(p.color), w, y, h, torsoProfile, 0.82)
    const cloth = b.materialById('cloth', ELF_CLOTH_COLOR)
    b.add(b.frustum(w * 0.88, w * 0.94, h * 0.2, 0.82), cloth, 0, y + h * 0.34, 0)
    b.add(b.frustum(w * 0.8, w * 0.88, h * 0.24, 0.86), cloth, 0, y - h * 0.26, 0)
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
    const m = materialCacheOf(b, p)

    if (p.race === 'skeleton') {
        /* ── 细骨干（低面柱）+ 两端小球骨节 ── */
        b.add(b.cylinder(w * 0.2, w * 0.2, h * 0.86, 6), m(p.color), 0, y, 0)
        b.add(b.sphere(w * 0.34, 6, 4), m(p.color), 0, y + h * 0.45, 0)
        b.add(b.sphere(w * 0.34, 6, 4), m(p.color), 0, y - h * 0.45, 0)
    } else if (p.race === 'orc') {
        /* 兽人：粗壮锥台主段 + 肌肉隆起 + 阵营色束带 */
        b.add(b.frustum(w * 1.0, w * 1.12, h, d / w), m(p.color), 0, y, 0)
        b.add(b.ellipsoid(w * 0.56, h * 0.28, d * 0.56, 10, 8), m(p.color), 0, y + h * 0.08, 0)
        b.add(b.frustum(w * 1.04, w * 1.04, h * 0.14, d / w), m(p.factionColor), 0, y - h * 0.34, 0)
        b.add(b.box(w * 1.02, h * 0.1, d * 0.5), m(p.accentColor), 0, y - h * 0.3, d * 0.42)
    } else {
        /* 日式精灵：细棱台锥形肢体（皮肤；锥度平缓，最宽∶最窄 ≈ 1.2），无阵营束带 */
        const limbProfile = [0.86, 0.81, 0.77, 0.74, 0.72, 0.78] as const
        frustumStack(b, m(p.color), w, y, h, limbProfile, 0.78)
    }
}

/* 种族足部：骷髅紧凑骨足 / 兽人紧凑厚足 + 短爪；精灵无足部 */
const genLimbFoot: LimbGen = (b, p) => {
    if (p.race === 'elf') return
    const bulk = RACE_BULK[p.race]
    /* 仅比腿（小腿）宽 1.05，且不向前延展太多 */
    const w = padded(p.base.w * bulk) * 1.05
    const h = p.base.h
    const d = padded(p.base.d * bulk) * 1.05
    const y = p.base.centerY
    const m = materialCacheOf(b, p)

    if (p.race === 'skeleton') {
        b.add(b.box(w, h, d), m(p.color), 0, y, 0)
        b.add(b.sphere(w * 0.22, 6, 4), m(p.color), 0, y - h * 0.1, d * 0.45)
    } else {
        b.add(b.ellipsoid(w * 0.58, h * 0.5, d * 0.58, 10, 8), m(p.color), 0, y, 0)
        b.add(b.cone(w * 0.1, d * 0.24, 6), m(BONE_IVORY_COLOR), -w * 0.2, y - h * 0.14, d * 0.5, 1.75, 0, 0)
        b.add(b.cone(w * 0.1, d * 0.24, 6), m(BONE_IVORY_COLOR), 0, y - h * 0.14, d * 0.52, 1.75, 0, 0)
        b.add(b.cone(w * 0.1, d * 0.24, 6), m(BONE_IVORY_COLOR), w * 0.2, y - h * 0.14, d * 0.5, 1.75, 0, 0)
    }
}

const LIMB_REGION_GENS: Readonly<Record<LimbRegion, LimbGen>> = {
    head: genLimbHead,
    body: genLimbBody,
    arm: genLimbSegment,
    hand: genLimbSegment,
    leg: genLimbSegment,
    foot: genLimbFoot,
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
        material: LIMB_RACE_MATERIAL[config.race],
        /* 阵营色：`palette.bodyColor` 即 `factionColorOf(faction)`（SELECT_PALETTE 唯一映射），与人类身体同源 */
        factionColor: palette.bodyColor,
        hairColor: palette.hairColor,
        hollowColor: SKELETON_HOLLOW_COLOR,
    })
    return {group: builder.group, cleanup: builder.dispose}
}
