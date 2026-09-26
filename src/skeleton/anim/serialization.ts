import {Quaternion, Vector3} from 'three'
import {z} from 'zod'
import type {Skeleton} from '../skeleton.ts'
import {createSkeleton} from '../skeleton.ts'
import {createSkeletonJoint, connectJoint} from '../joint.ts'
import {createSkeletonBone} from '../bone.ts'
import type {
    BoneAnimationClip,
    BoneEventRecord,
    BoneJointKeyframeRecord,
    BoneSegmentKeyframeRecord,
} from './types.ts'
/** 骨架定义（JSON-safe 表示：位置/旋转用元组，与 save_load 的 Vec3JSON/QuatJSON 约定一致） */
export interface SkeletonDefinition {
    readonly joints: readonly {
        readonly id: string
        readonly name: string
        readonly parentId?: string
        readonly position: readonly [number, number, number]
        readonly rotation: readonly [number, number, number, number]
        readonly ikRootLevel?: number
    }[]
    readonly bones: readonly {
        readonly id: string
        readonly name: string
        readonly headJointId: string
        readonly tailJointId: string
        readonly length: number
        readonly roll: number
    }[]
}

/** 骨架 + 动画库打包的资产文件（独立 JSON 导入导出，不接 save_load 实体） */
export interface SkeletonAnimationAsset {
    readonly formatVersion: number
    readonly skeleton: SkeletonDefinition
    readonly animations: readonly BoneAnimationClip[]
}

// ── zod 校验（JSON-safe 形状）──

const Vec3TupleSchema = z.tuple([z.number(), z.number(), z.number()])
const QuatTupleSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

const TransitionSpecSchema = z.discriminatedUnion('type', [
    z.object({type: z.literal('linear')}),
    z.object({
        type: z.literal('bezier_quad'),
        strategy: z.enum(['none', 'ease_in', 'ease_out', 'strike_peak']),
        customCy: z.number().optional(),
        peakRatio: z.number().optional(),
    }),
])

const JointRecordSchema = z.object({
    time: z.number(),
    position: Vec3TupleSchema,
    rotation: QuatTupleSchema,
})
const SegmentRecordSchema = z.object({
    time: z.number(),
    roll: z.number(),
})
const EventRecordSchema = z.object({
    time: z.number(),
    eventName: z.string(),
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})
const JointTrackSchema = z.object({
    targetId: z.string(),
    interpolation: TransitionSpecSchema,
    records: z.array(JointRecordSchema),
})
const SegmentTrackSchema = z.object({
    targetId: z.string(),
    interpolation: TransitionSpecSchema,
    records: z.array(SegmentRecordSchema),
})
const EventTrackSchema = z.object({
    records: z.array(EventRecordSchema),
})
const ClipSchema = z.object({
    name: z.string(),
    duration: z.number(),
    loop: z.boolean().default(false),
    jointTracks: z.array(JointTrackSchema).default([]),
    boneTracks: z.array(SegmentTrackSchema).default([]),
    eventTracks: z.array(EventTrackSchema).default([]),
})
const SkeletonDefinitionSchema = z.object({
    joints: z.array(z.object({
        id: z.string(),
        name: z.string(),
        parentId: z.string().optional(),
        position: Vec3TupleSchema,
        rotation: QuatTupleSchema,
        ikRootLevel: z.number().optional(),
    })).default([]),
    bones: z.array(z.object({
        id: z.string(),
        name: z.string(),
        headJointId: z.string(),
        tailJointId: z.string(),
        length: z.number(),
        roll: z.number().default(0),
    })).default([]),
})
const AssetSchema = z.object({
    formatVersion: z.number().default(1),
    skeleton: SkeletonDefinitionSchema,
    animations: z.array(ClipSchema).default([]),
})

// ── 领域 ↔ JSON 转换 ──
// JSON-safe 形状直接由上方 zod schema 推导（单一真相），避免手写接口与 schema 双份维护。

/** 关节关键帧记录的 JSON-safe 形状 */
export type JointRecordJSON = z.infer<typeof JointRecordSchema>
/** 骨骼段关键帧记录的 JSON-safe 形状 */
export type SegmentRecordJSON = z.infer<typeof SegmentRecordSchema>
/** 事件记录的 JSON-safe 形状 */
export type EventRecordJSON = z.infer<typeof EventRecordSchema>
/** 关节轨道的 JSON-safe 形状 */
export type JointTrackJSON = z.infer<typeof JointTrackSchema>
/** 骨骼段轨道的 JSON-safe 形状 */
export type SegmentTrackJSON = z.infer<typeof SegmentTrackSchema>
/** 事件轨道的 JSON-safe 形状 */
export type EventTrackJSON = z.infer<typeof EventTrackSchema>
/** 骨骼动画 clip 的 JSON-safe 形状（undo 快照/独立导入导出用） */
export type ClipJSON = z.infer<typeof ClipSchema>

const jointRecordToJSON = (record: BoneJointKeyframeRecord): JointRecordJSON => ({
    time: record.time,
    position: [record.position.x, record.position.y, record.position.z],
    rotation: [record.rotation.x, record.rotation.y, record.rotation.z, record.rotation.w],
})
const jointRecordFromJSON = (raw: JointRecordJSON): BoneJointKeyframeRecord => ({
    time: raw.time,
    position: new Vector3().fromArray(raw.position),
    rotation: new Quaternion().fromArray(raw.rotation),
})

const segmentRecordToJSON = (record: BoneSegmentKeyframeRecord): SegmentRecordJSON => ({
    time: record.time,
    roll: record.roll,
})
const segmentRecordFromJSON = (raw: SegmentRecordJSON): BoneSegmentKeyframeRecord => raw

const eventRecordToJSON = (record: BoneEventRecord): EventRecordJSON => record
const eventRecordFromJSON = (raw: EventRecordJSON): BoneEventRecord => raw

/** 序列化单个 clip 为 JSON-safe 形状（undo 快照/独立导出用） */
export const clipToJSON = (clip: BoneAnimationClip): ClipJSON => ({
    name: clip.name,
    duration: clip.duration,
    loop: clip.loop,
    jointTracks: clip.jointTracks.map(track => ({
        targetId: track.targetId,
        interpolation: track.interpolation,
        records: track.records.map(jointRecordToJSON),
    })),
    boneTracks: clip.boneTracks.map(track => ({
        targetId: track.targetId,
        interpolation: track.interpolation,
        records: track.records.map(segmentRecordToJSON),
    })),
    eventTracks: clip.eventTracks.map(track => ({
        records: track.records.map(eventRecordToJSON),
    })),
})

/** 从 JSON-safe 形状还原 clip（undo 快照/独立导入用；数据需先经 zod 校验或来自 clipToJSON） */
export const clipFromJSON = (raw: ClipJSON): BoneAnimationClip => ({
    name: raw.name,
    duration: raw.duration,
    loop: raw.loop,
    jointTracks: raw.jointTracks.map(track => ({
        targetId: track.targetId,
        interpolation: track.interpolation,
        records: track.records.map(jointRecordFromJSON),
    })),
    boneTracks: raw.boneTracks.map(track => ({
        targetId: track.targetId,
        interpolation: track.interpolation,
        records: track.records.map(segmentRecordFromJSON),
    })),
    eventTracks: raw.eventTracks.map(track => ({
        records: track.records.map(eventRecordFromJSON),
    })),
})

/** 序列化资产为 JSON 字符串 */
export const serializeAsset = (asset: SkeletonAnimationAsset): string =>
    JSON.stringify({
        formatVersion: asset.formatVersion,
        skeleton: asset.skeleton,
        animations: asset.animations.map(clipToJSON),
    })

/** 解析并校验资产 JSON；非法数据抛错（zod parse 异常） */
export const parseAsset = (raw: string): SkeletonAnimationAsset => {
    const parsed = AssetSchema.parse(JSON.parse(raw) as unknown)
    return {
        formatVersion: parsed.formatVersion,
        skeleton: parsed.skeleton,
        animations: parsed.animations.map(clipFromJSON),
    }
}

/** 骨架 → 定义快照（关节按注册顺序输出，length/roll 取当前值） */
export const skeletonToDefinition = (skeleton: Skeleton): SkeletonDefinition => ({
    joints: [...skeleton.joints.values()].map(joint => ({
        id: joint.id,
        name: joint.name,
        parentId: joint.parent?.id,
        position: [joint.position.x, joint.position.y, joint.position.z],
        rotation: [joint.rotation.x, joint.rotation.y, joint.rotation.z, joint.rotation.w],
        ikRootLevel: joint.ikRootLevel,
    })),
    bones: [...skeleton.bones.values()].map(bone => ({
        id: bone.id,
        name: bone.name,
        headJointId: bone.head.id,
        tailJointId: bone.tail.id,
        length: bone.length,
        roll: bone.roll,
    })),
})

/** 定义 → 骨架（重建关节层级与骨骼段；parentId 引用必须已定义） */
export const skeletonFromDefinition = (definition: SkeletonDefinition): Skeleton => {
    const skeleton = createSkeleton()
    const byId = new Map<string, ReturnType<typeof createSkeletonJoint>>()

    for (const jointDef of definition.joints) {
        const joint = createSkeletonJoint(jointDef.name, jointDef.id)
        joint.position.fromArray(jointDef.position)
        joint.rotation.fromArray(jointDef.rotation)
        joint.ikRootLevel = jointDef.ikRootLevel
        byId.set(joint.id, joint)
        skeleton.addJoint(joint)
    }
    for (const jointDef of definition.joints) {
        const parentId = jointDef.parentId
        if (parentId === undefined) continue
        const parent = byId.get(parentId)
        const child = byId.get(jointDef.id)
        if (parent === undefined || child === undefined) {
            throw new Error(`skeletonFromDefinition 失败：parentId "${parentId}" 未定义`)
        }
        connectJoint(parent, child)
    }
    for (const boneDef of definition.bones) {
        const head = byId.get(boneDef.headJointId)
        const tail = byId.get(boneDef.tailJointId)
        if (head === undefined || tail === undefined) {
            throw new Error(`skeletonFromDefinition 失败：骨骼 "${boneDef.name}" 的关节未定义`)
        }
        const bone = createSkeletonBone(boneDef.name, head, tail, boneDef.length, boneDef.id)
        bone.roll = boneDef.roll
        skeleton.addBone(bone)
    }
    skeleton.updateWorldTransforms()
    return skeleton
}