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

const SavableDestructibleBox = z.object({
    type: z.literal('box/destruction'),
    config: DestructibleConfigSchema,
    position: Vec3,
    quaternion: Quat,
    health: z.number(),
})

const SavableBurningBox = z.object({
    type: z.literal('box/burning'),
    config: BurningBoxConfigSchema,
    position: Vec3,
    quaternion: Quat,
    health: z.number(),
    burnProgress: z.number().min(0).max(1),
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

/** 所有实体类型的 discriminated union */
const SavableEntity = z.discriminatedUnion('type', [
    SavableCommonBox,
    SavableDestructibleBox,
    SavableBurningBox,
    SavableMagnetBox,
    SavableElasticBox,
    SavableWaterBlock,
    SavableTerrain,
    SavableFragment,
])

const CameraInfo = z.object({
    position: Vec3,
    rotate: Vec3,
})

const PlayerInfo = z.object({
    position: Vec3,
})

const ModeInfo = z.object({
    edit: z.object({cameraInfo: CameraInfo}).optional(),
    play: z.object({
        cameraInfo: CameraInfo.optional(),
        playerInfo: PlayerInfo.optional(),
    }).optional(),
})

const SaveDataSchema = z.object({
    entities: z.array(SavableEntity),
    modeInfo: ModeInfo.optional(),
})

export type ValidatedSaveData = z.infer<typeof SaveDataSchema>

/** 校验存档数据，失败抛出 ZodError */
export const validateSaveData = (data: unknown): ValidatedSaveData =>
    SaveDataSchema.parse(data)
