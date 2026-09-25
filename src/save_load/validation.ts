import {z} from 'zod'
import {CommonBoxConfigSchema} from '../entity/box/common/validation.ts'
import {DestructibleConfigSchema} from '../entity/box/destructed/validation.ts'
import {BurningBoxConfigSchema} from '../entity/box/burning/validation.ts'
import {MagnetBoxConfigSchema} from '../entity/box/magnet/validation.ts'
import {ElasticBoxConfigSchema} from '../entity/box/elasticity/validation.ts'
import {WaterBlockConfigSchema} from '../entity/area/water/validation.ts'
import {BaseTerrainConfigSchema} from '../entity/terrain/base/validation.ts'
import {FragmentConfigSchema} from '../entity/fragment/common/validation.ts'
import {DEFAULT_COMMON_CONFIG} from '../entity/box/common/validation.ts'
import {DEFAULT_DESTRUCTIBLE_CONFIG} from '../entity/box/destructed/validation.ts'
import {DEFAULT_BURNING_CONFIG} from '../entity/box/burning/validation.ts'
import {DEFAULT_MAGNET_CONFIG} from '../entity/box/magnet/validation.ts'
import {DEFAULT_ELASTIC_CONFIG} from '../entity/box/elasticity/validation.ts'
import {DEFAULT_WATER_CONFIG} from '../entity/area/water/validation.ts'
import {DEFAULT_TERRAIN_CONFIG} from '../entity/terrain/base/validation.ts'
import {DEFAULT_FRAGMENT_CONFIG} from '../entity/fragment/common/validation.ts'
import {CHARACTER_CONFIG_DEFAULTS} from '../entity/character/constants.ts'

const Vec3 = z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0])
const Quat = z.tuple([z.number(), z.number(), z.number(), z.number()]).default([0, 0, 0, 1])

const SavableCommonBox = z.object({
    type: z.literal('box/common'),
    config: CommonBoxConfigSchema.default(DEFAULT_COMMON_CONFIG),
    position: Vec3,
    quaternion: Quat,
})

const CollisionRecordSchema = z.object({
    contactPoint: z.tuple([z.number(), z.number(), z.number()]),
    normal: z.tuple([z.number(), z.number(), z.number()]),
    relativeVelocity: z.number(),
})

const SavableDestructibleBox = z.object({
    type: z.literal('box/destruction'),
    config: DestructibleConfigSchema.default(DEFAULT_DESTRUCTIBLE_CONFIG),
    position: Vec3,
    quaternion: Quat,
    health: z.number().default(DEFAULT_DESTRUCTIBLE_CONFIG.maxHealth),
    collisions: z.array(CollisionRecordSchema).optional(),
    collisionHistory: z.array(CollisionRecordSchema).optional(),
    cooldowns: z.array(z.tuple([z.number(), z.number()])).optional(),
})

const SavableBurningBox = z.object({
    type: z.literal('box/burning'),
    config: BurningBoxConfigSchema.default(DEFAULT_BURNING_CONFIG),
    position: Vec3,
    quaternion: Quat,
    health: z.number().default(DEFAULT_BURNING_CONFIG.maxHealth),
})

const SavableMagnetBox = z.object({
    type: z.literal('box/magnet'),
    config: MagnetBoxConfigSchema.default(DEFAULT_MAGNET_CONFIG),
    position: Vec3,
    quaternion: Quat,
})

const SavableElasticBox = z.object({
    type: z.literal('box/elasticity'),
    config: ElasticBoxConfigSchema.default(DEFAULT_ELASTIC_CONFIG),
    position: Vec3,
    quaternion: Quat,
    def: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    vel: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
})

const SavableWaterBlock = z.object({
    type: z.literal('area/water'),
    config: WaterBlockConfigSchema.default(DEFAULT_WATER_CONFIG),
    position: Vec3,
    quaternion: Quat,
})

const SavableTerrain = z.object({
    type: z.literal('terrain'),
    config: BaseTerrainConfigSchema.default(DEFAULT_TERRAIN_CONFIG),
    position: Vec3,
    quaternion: Quat,
    heights: z.array(z.array(z.number())).default([[0]]),
})

const FragmentDataJSONSchema = z.object({
    renderVertices: z.array(z.number()).default([]),
    renderIndices: z.array(z.number()).default([]),
    hullVertices: z.array(Vec3).default([]),
    hullFaces: z.array(z.array(z.number())).default([]),
    centroid: Vec3.default([0, 0, 0]),
    massRatio: z.number().default(1),
    boxSize: Vec3.default([1, 1, 1]),
})

const SavableFragment = z.object({
    type: z.literal('fragment/common'),
    config: FragmentConfigSchema.default(DEFAULT_FRAGMENT_CONFIG),
    position: Vec3,
    quaternion: Quat,
    data: FragmentDataJSONSchema.default({
        renderVertices: [] as number[],
        renderIndices: [] as number[],
        hullVertices: [] as Array<[number, number, number]>,
        hullFaces: [] as number[][],
        centroid: [0, 0, 0] as [number, number, number],
        massRatio: 1,
        boxSize: [1, 1, 1] as [number, number, number],
    }),
})

/* 攻击配置：装备武器 id + 数值覆写；动作/时长/动画由武器模组的攻击链决定，不在此描述。
   宽松校验（武器 id 不做白名单硬校验）：未知武器 id 由运行时回退默认武器，旧档缺字段则安全回退默认配置 */
const RangedOverrideSchema = z.object({
    range: z.number(),
    bulletSpeed: z.number(),
    bulletKnockback: z.number(),
    bulletLifetime: z.number(),
})

const AttackConfigSchema = z.object({
    weaponId: z.string(),
    damage: z.number().optional(),
    cooldown: z.number().optional(),
    ranged: RangedOverrideSchema.optional(),
})

const TendencyConfigSchema = z.object({
    tendencyId: z.enum(['hostileAll', 'hostileExceptSelf', 'hostileTo', 'hostileExcept', 'pacifist']),
    targetFactions: z.array(z.number()).optional(),
})

/** character 存档共享默认值（供内联 schema .default() 和外层 CHARACTER_SAVE_CONFIG_DEFAULTS 共用） */
const CHARACTER_SAVE_ATTACK_DEFAULT = {weaponId: 'long_sword', damage: 3}
const CHARACTER_SAVE_TENDENCY_DEFAULT = {tendencyId: 'hostileExceptSelf' as const}

const CharacterConfigInner = z.object({
    speed: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.speed),
    jumpHeight: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.jumpHeight),
    scale: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.scale),
    peaceStrategy: z.enum(['patrol', 'build']).optional(),
    combatStrategy: z.enum(['tactical', 'aggressive', 'cowardly']).optional(),
    attack: AttackConfigSchema.default(CHARACTER_SAVE_ATTACK_DEFAULT),
    tendency: TendencyConfigSchema.default(CHARACTER_SAVE_TENDENCY_DEFAULT),
    faction: z.number().default(0),
    maxHealth: z.number().positive().default(100),
    isPlayer: z.boolean().default(false),
    navEnabled: z.boolean().default(true),
})

/** character config 默认值（供外层 .default() 使用） */
const CHARACTER_SAVE_CONFIG_DEFAULTS = {
    speed: CHARACTER_CONFIG_DEFAULTS.speed,
    jumpHeight: CHARACTER_CONFIG_DEFAULTS.jumpHeight,
    scale: CHARACTER_CONFIG_DEFAULTS.scale,
    attack: CHARACTER_SAVE_ATTACK_DEFAULT,
    tendency: CHARACTER_SAVE_TENDENCY_DEFAULT,
    faction: 0,
    maxHealth: 100,
    isPlayer: false,
    navEnabled: true,
}

const SavableCharacter = z.object({
    type: z.literal('character'),
    config: CharacterConfigInner.default(CHARACTER_SAVE_CONFIG_DEFAULTS),
    health: z.number().default(15),
    position: Vec3,
    quaternion: Quat,
    /* 朝向角（度）：旧存档无此字段时缺省为 0（+Z 前方） */
    facing: z.number().min(0).max(360).optional(),
})

const SavableEntity = z.discriminatedUnion('type', [
    SavableCommonBox,
    SavableDestructibleBox,
    SavableBurningBox,
    SavableMagnetBox,
    SavableElasticBox,
    SavableWaterBlock,
    SavableTerrain,
    SavableFragment,
    SavableCharacter,
])

const CameraInfo = z.object({
    position: Vec3,
    rotate: Vec3,
})

const ModeInfo = z.object({
    edit: z.object({cameraInfo: CameraInfo}).optional(),
    play: z.object({
        cameraInfo: CameraInfo.optional(),
    }).optional(),
    boneEdit: z.object({
        cameraInfo: CameraInfo.optional(),
    }).optional(),
})

const SaveDataSchema = z.object({
    /** 格式版本（缺省 1 = 旧档：character 位置为身体中心，加载时迁移到脚底原点） */
    version: z.number().int().positive().default(1),
    entities: z.array(SavableEntity),
    modeInfo: ModeInfo.optional(),
})

export type ValidatedSaveData = z.infer<typeof SaveDataSchema>

export const validateSaveData = (data: unknown): ValidatedSaveData =>
    SaveDataSchema.parse(data)
