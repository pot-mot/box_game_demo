import {Quaternion, Vector3} from 'three'
import {z} from 'zod'
import type {Skeleton} from '../skeleton.ts'
import {createSkeleton} from '../skeleton.ts'
import {createSkeletonJoint, connectJoint} from '../joint.ts'
import {createSkeletonBone} from '../bone.ts'
import type {
    BoneAnimationClip,
    BoneEventRecord,
    BoneEventTrack,
    BoneJointKeyframeRecord,
    BoneJointTrack,
    BoneSegmentKeyframeRecord,
    BoneSegmentTrack,
} from './types.ts'
import type {TransitionSpec} from '../transition.ts'

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

const TransitionSpecSchema = z.object({
    type: z.enum(['linear', 'bezier_quad']),
    strategy: z.enum(['none', 'ease_in', 'ease_out', 'strike_peak']),
    customCy: z.number().optional(),
    peakRatio: z.number().optional(),
})

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

const transitionToJSON = (spec: TransitionSpec): unknown => spec
const transitionFromJSON = (raw: z.infer<typeof TransitionSpecSchema>): TransitionSpec => raw

const jointRecordToJSON = (record: BoneJointKeyframeRecord): unknown => ({
    time: record.time,
    position: record.position.toArray(),
    rotation: record.rotation.toArray(),
})
const jointRecordFromJSON = (raw: z.infer<typeof JointRecordSchema>): BoneJointKeyframeRecord => ({
    time: raw.time,
    position: new Vector3().fromArray(raw.position),
    rotation: new Quaternion().fromArray(raw.rotation),
})

const segmentRecordToJSON = (record: BoneSegmentKeyframeRecord): unknown => ({
    time: record.time,
    roll: record.roll,
})
const segmentRecordFromJSON = (raw: z.infer<typeof SegmentRecordSchema>): BoneSegmentKeyframeRecord => ({
    time: raw.time,
    roll: raw.roll,
})

const eventRecordToJSON = (record: BoneEventRecord): unknown => record
const eventRecordFromJSON = (raw: z.infer<typeof EventRecordSchema>): BoneEventRecord => raw

const clipToJSON = (clip: BoneAnimationClip): unknown => ({
    name: clip.name,
    duration: clip.duration,
    loop: clip.loop,
    jointTracks: clip.jointTracks.map(track => ({
        targetId: track.targetId,
        interpolation: transitionToJSON(track.interpolation),
        records: track.records.map(jointRecordToJSON),
    })),
    boneTracks: clip.boneTracks.map(track => ({
        targetId: track.targetId,
        interpolation: transitionToJSON(track.interpolation),
        records: track.records.map(segmentRecordToJSON),
    })),
    eventTracks: clip.eventTracks.map(track => ({
        records: track.records.map(eventRecordToJSON),
    })),
})

const clipFromJSON = (raw: z.infer<typeof ClipSchema>): BoneAnimationClip => ({
    name: raw.name,
    duration: raw.duration,
    loop: raw.loop,
    jointTracks: raw.jointTracks.map((track): BoneJointTrack => ({
        targetId: track.targetId,
        interpolation: transitionFromJSON(track.interpolation),
        records: track.records.map(jointRecordFromJSON),
    })),
    boneTracks: raw.boneTracks.map((track): BoneSegmentTrack => ({
        targetId: track.targetId,
        interpolation: transitionFromJSON(track.interpolation),
        records: track.records.map(segmentRecordFromJSON),
    })),
    eventTracks: raw.eventTracks.map((track): BoneEventTrack => ({
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