import {z} from 'zod'
import {CommonBoxConfigSchema} from '../entity/box/common/validation.ts'
import {DestructibleConfigSchema} from '../entity/box/destructed/validation.ts'
import {BurningBoxConfigSchema} from '../entity/box/burning/validation.ts'
import {MagnetBoxConfigSchema} from '../entity/box/magnet/validation.ts'
import {ElasticBoxConfigSchema} from '../entity/box/elasticity/validation.ts'
import {WaterBlockConfigSchema} from '../entity/area/water/validation.ts'
import {BaseTerrainConfigSchema} from '../entity/terrain/base/validation.ts'
import {FragmentConfigSchema} from '../entity/fragment/common/validation.ts'

const Vec3 = z.tuple([z.number(), z.number(), z.number()])
const Quat = z.tuple([z.number(), z.number(), z.number(), z.number()])

const SavableCommonBox = z.object({
    type: z.literal('box/common'),
    config: CommonBoxConfigSchema,
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
    config: DestructibleConfigSchema,
    position: Vec3,
    quaternion: Quat,
    health: z.number(),
    collisions: z.array(CollisionRecordSchema).optional(),
    collisionHistory: z.array(CollisionRecordSchema).optional(),
    cooldowns: z.array(z.tuple([z.number(), z.number()])).optional(),
})

const SavableBurningBox = z.object({
    type: z.literal('box/burning'),
    config: BurningBoxConfigSchema,
    position: Vec3,
    quaternion: Quat,
    health: z.number(),
})

const SavableMagnetBox = z.object({
    type: z.literal('box/magnet'),
    config: MagnetBoxConfigSchema,
    position: Vec3,
    quaternion: Quat,
})

const SavableElasticBox = z.object({
    type: z.literal('box/elasticity'),
    config: ElasticBoxConfigSchema,
    position: Vec3,
    quaternion: Quat,
    def: z.tuple([z.number(), z.number(), z.number()]),
    vel: z.tuple([z.number(), z.number(), z.number()]),
})

const SavableWaterBlock = z.object({
    type: z.literal('area/water'),
    config: WaterBlockConfigSchema,
    position: Vec3,
    quaternion: Quat,
})

const SavableTerrain = z.object({
    type: z.literal('terrain'),
    config: BaseTerrainConfigSchema,
    position: Vec3,
    quaternion: Quat,
    heights: z.array(z.array(z.number())),
})

const FragmentDataJSONSchema = z.object({
    renderVertices: z.array(z.number()),
    renderIndices: z.array(z.number()),
    hullVertices: z.array(Vec3),
    hullFaces: z.array(z.array(z.number())),
    centroid: Vec3,
    massRatio: z.number(),
    boxSize: Vec3,
})

const SavableFragment = z.object({
    type: z.literal('fragment/common'),
    config: FragmentConfigSchema,
    position: Vec3,
    quaternion: Quat,
    data: FragmentDataJSONSchema,
})

const MeleeAttackSchema = z.object({
    type: z.literal('melee'),
    weaponId: z.string().optional(),
    range: z.number().positive(),
    damage: z.number().positive(),
    cooldown: z.number().positive(),
    duration: z.number().positive(),
})

const RangedAttackSchema = z.object({
    type: z.literal('ranged'),
    weaponId: z.string().optional(),
    range: z.number().positive(),
    damage: z.number().positive(),
    cooldown: z.number().positive(),
    duration: z.number().positive(),
    bulletSpeed: z.number().positive(),
    bulletKnockback: z.number(),
    bulletLifetime: z.number().positive(),
})

const AttackSlotSchema = z.discriminatedUnion('type', [MeleeAttackSchema, RangedAttackSchema])

const TendencyConfigSchema = z.object({
    tendencyId: z.enum(['hostileAll', 'hostileExceptSelf', 'hostileTo', 'hostileExcept', 'pacifist']),
    targetFactions: z.array(z.number()).optional(),
})

const SavableCharacter = z.object({
    type: z.literal('character'),
    config: z.object({
        speed: z.number().positive(),
        jumpHeight: z.number().positive(),
        radius: z.number().positive(),
        height: z.number().positive(),
        attackSlot: AttackSlotSchema,
        tendency: TendencyConfigSchema,
        faction: z.number(),
        maxHealth: z.number().positive(),
        isPlayer: z.boolean(),
    }),
    health: z.number(),
    position: Vec3,
    quaternion: Quat,
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
})

const SaveDataSchema = z.object({
    entities: z.array(SavableEntity),
    modeInfo: ModeInfo.optional(),
})

export type ValidatedSaveData = z.infer<typeof SaveDataSchema>

export const validateSaveData = (data: unknown): ValidatedSaveData =>
    SaveDataSchema.parse(data)
