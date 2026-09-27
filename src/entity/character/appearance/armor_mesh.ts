import {Group} from 'three'
import {createTwoFaceBoxPart, disposeBoxPart, type TrackedBoxPart} from '../../../render/box_parts.ts'
import {darkenColor} from '../../../render/constants.ts'
import {PRESET_PART_SIZES} from '../skeleton/preset.ts'
import {ARMOR_PAD} from './constants.ts'

/** 护甲外观形状 id（常量 + 索引类型推导） */
export const ARMOR_MESH_IDS = ['cap', 'helmet', 'hood', 'vest', 'plate', 'robe', 'bracer', 'greaves', 'legwrap', 'boots'] as const
export type ArmorMeshId = typeof ARMOR_MESH_IDS[number]

/** 护甲外观配方（领域数据引用，形状 id + 颜色） */
export interface ArmorMeshConfig {
    readonly id: ArmorMeshId
    readonly color: number
    readonly accentColor?: number
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

/** 形状规格：相对基准部件的尺寸乘数 + 中心位置乘数 + 可选装饰条（相对部件尺寸/高度）+ 关节白名单 */
interface ArmorShapeSpec {
    readonly w: number
    readonly h: number
    readonly d: number
    /** 部件中心 Y = 基准 centerY × centerScale（>1 上移；腿部基准为负则继续下移） */
    readonly centerScale: number
    /** 仅在这些关节上生成（缺省 = 槽位声明的全部关节；如靴只包小腿、不包大腿） */
    readonly joints?: readonly string[]
    readonly accent?: {readonly w: number; readonly h: number; readonly d: number; readonly y: number; readonly z?: number}
}

const ARMOR_SHAPES: Readonly<Record<ArmorMeshId, ArmorShapeSpec>> = {
    cap: {w: 1.12, h: 0.4, d: 1.12, centerScale: 1.35, accent: {w: 1.2, h: 0.16, d: 1.2, y: 0.5}},
    helmet: {w: 1.18, h: 1.1, d: 1.18, centerScale: 1, accent: {w: 1.24, h: 0.16, d: 1.24, y: -0.45}},
    hood: {w: 1.22, h: 1.22, d: 1.28, centerScale: 1, accent: {w: 1.28, h: 0.5, d: 0.4, y: -0.35}},
    vest: {w: 1.12, h: 0.5, d: 1.18, centerScale: 1.35},
    plate: {w: 1.18, h: 0.72, d: 1.22, centerScale: 1.2, accent: {w: 1.26, h: 0.14, d: 1.28, y: -0.4}},
    robe: {w: 1.24, h: 1.05, d: 1.26, centerScale: 1, accent: {w: 1.3, h: 0.16, d: 1.32, y: -0.42}},
    bracer: {w: 1.18, h: 0.6, d: 1.18, centerScale: 1.3, accent: {w: 1.24, h: 0.14, d: 1.24, y: -0.4}},
    greaves: {w: 1.16, h: 0.55, d: 1.16, centerScale: 1.4, accent: {w: 1.22, h: 0.12, d: 1.22, y: -0.42}},
    legwrap: {w: 1.12, h: 0.35, d: 1.12, centerScale: 1.45},
    /* 靴：仅包小腿（膝关节），底部署前伸的脚尖装饰条 */
    boots: {
        w: 1.16, h: 0.72, d: 1.22, centerScale: 1.4,
        joints: ['leftLegKnee', 'rightLegKnee'],
        accent: {w: 0.95, h: 0.28, d: 1.5, y: -0.52, z: 0.3},
    },
}

/**
 * 按配方 + 挂载关节构建护甲部件：尺寸取对应身体部件（`PRESET_PART_SIZES`）外扩 `ARMOR_PAD`，
 * 形状差异由 `ARMOR_SHAPES` 的乘数表达。未知关节返回空 Group（骨架被编辑后安全跳过）。
 * 护甲件是纯视觉子节点：不生成碰撞体、不参与受击箱 / 视线 / 导航判定。
 */
export const createArmorMesh = (config: ArmorMeshConfig, jointId: string): ArmorMeshResult => {
    const base = ARMOR_JOINT_BASES[jointId]
    const group = new Group()
    if (base === undefined) return {group, cleanup: () => {}}
    const shape = ARMOR_SHAPES[config.id]
    if (shape.joints !== undefined && !shape.joints.includes(jointId)) return {group, cleanup: () => {}}
    const parts: TrackedBoxPart[] = []

    const mountPart = (w: number, h: number, d: number, y: number, z: number, color: number): void => {
        const part = createTwoFaceBoxPart(w, h, d, color)
        part.mesh.position.set(0, y, z)
        parts.push(part)
        group.add(part.mesh)
    }

    const w = base.w * shape.w + ARMOR_PAD * 2
    const h = base.h * shape.h + ARMOR_PAD * 2
    const d = base.d * shape.d + ARMOR_PAD * 2
    mountPart(w, h, d, base.centerY * shape.centerScale, 0, config.color)
    if (shape.accent !== undefined) {
        const accent = shape.accent
        mountPart(
            w * accent.w, h * accent.h, d * accent.d,
            base.centerY * shape.centerScale + h * accent.y,
            accent.z ?? 0,
            config.accentColor ?? darkenColor(config.color, 0.7),
        )
    }
    return {
        group,
        cleanup: () => {
            for (const part of parts) disposeBoxPart(part)
            parts.splice(0)
        },
    }
}
