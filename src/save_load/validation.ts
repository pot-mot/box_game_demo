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
import {HOLD_MODES} from '../character/weapon/hold_mode.ts'
import {SURFACE_MATERIAL_IDS} from '../render/materials/ids.ts'
import {BUILDING_PROP_KINDS} from '../entity/building_generator/props/kinds.ts'
import {BREAKABLE_SOURCES} from '../entity/interactable/kinds.ts'

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

/* 建筑生成器：显式体素数据。
   非法结构整体回退空（运行时不生成 / 载入空建筑），不抛错；未知材质 id 由运行时安全跳过。 */
const BuildingChunkSave = z.object({
    key: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
    rle: z.string().default(''),
})

/* 自由道具：非法种类 / 材质回退为安全默认，不抛错 */
const BuildingPropSave = z.object({
    kind: z.enum(BUILDING_PROP_KINDS).catch('door'),
    material: z.enum(SURFACE_MATERIAL_IDS).catch('rock'),
    position: Vec3,
    yawQuarter: z.number().int().min(0).max(3).default(0),
})

const BuildingWorldSave = z.object({
    origin: Vec3,
    yawQuarter: z.number().int().min(0).max(3).default(0),
    palette: z.array(z.enum(SURFACE_MATERIAL_IDS)).catch([]).default([]),
    chunks: z.array(BuildingChunkSave).catch([]).default([]),
    props: z.array(BuildingPropSave).catch([]).default([]),
})

const SavableBuildingGenerator = z.object({
    type: z.literal('building_generator'),
    worlds: z.array(BuildingWorldSave).catch([]).default([]),
})

/* 交互物：判别式配置；非法 kind / 字段整体回退为安全默认，未知物品 id 由运行时丢弃，不抛错 */
const INTERACTABLE_BASE_SHAPE = {
    material: z.enum(SURFACE_MATERIAL_IDS).catch('wood'),
    size: z.tuple([z.number(), z.number(), z.number()]).default([0.5, 0.5, 0.5]),
    channel: z.string().default(''),
}
const InteractableConfigSchema = z.discriminatedUnion('kind', [
    z.object({kind: z.literal('save_point'), ...INTERACTABLE_BASE_SHAPE, name: z.string().default('篝火')}),
    z.object({kind: z.literal('teleport'), ...INTERACTABLE_BASE_SHAPE, name: z.string().default('传送点')}),
    z.object({kind: z.literal('switch'), ...INTERACTABLE_BASE_SHAPE, mode: z.enum(['toggle', 'momentary']).catch('toggle')}),
    z.object({kind: z.literal('push_door_single'), ...INTERACTABLE_BASE_SHAPE, hingeQuarter: z.number().int().min(0).max(3).default(0)}),
    z.object({kind: z.literal('push_door_double'), ...INTERACTABLE_BASE_SHAPE, hingeQuarter: z.number().int().min(0).max(3).default(0)}),
    z.object({kind: z.literal('gate'), ...INTERACTABLE_BASE_SHAPE, travel: z.number().default(2.4), speed: z.number().default(2)}),
    z.object({kind: z.literal('chest'), ...INTERACTABLE_BASE_SHAPE, capacity: z.number().int().default(12)}),
    z.object({kind: z.literal('elevator'), ...INTERACTABLE_BASE_SHAPE, travel: z.number().default(4), speed: z.number().default(1.2)}),
    z.object({
        kind: z.literal('breakable'),
        ...INTERACTABLE_BASE_SHAPE,
        health: z.number().default(30),
        breakableBy: z.array(z.enum(BREAKABLE_SOURCES)).catch(['melee', 'roll']).default(['melee', 'roll']),
    }),
]).catch({
    kind: 'breakable',
    material: 'brick',
    size: [0.8, 0.8, 0.8] as [number, number, number],
    channel: '',
    health: 30,
    breakableBy: ['melee', 'roll'] as Array<'melee' | 'roll'>,
})

/* 背包 / 容器：整体非法回退 undefined（运行时空背包）；未知 defId / 非法格位由运行时安全丢弃 */
const InventorySaveSchema = z.object({
    width: z.number().default(8),
    height: z.number().default(6),
    items: z.array(z.object({
        instanceId: z.string().default(''),
        defId: z.string().default(''),
        count: z.number().default(1),
        grid: z.object({
            x: z.number().default(0),
            y: z.number().default(0),
            rot: z.number().int().min(0).max(3).default(0),
        }).optional(),
    })).catch([]).default([]),
    equipment: z.record(z.string(), z.string()).catch({}).default({}),
}).optional().catch(undefined)

const SavableInteractable = z.object({
    type: z.literal('interactable'),
    config: InteractableConfigSchema,
    position: Vec3,
    yawQuarter: z.number().int().min(0).max(3).default(0),
    progress: z.number().min(0).max(1).catch(0).default(0),
    target: z.number().min(0).max(1).catch(0).default(0),
    on: z.boolean().default(false),
    container: InventorySaveSchema,
    health: z.number().default(1),
})

/* 掉落物：未知 defId 由运行时丢弃，数量非法回退 1，不抛错 */
const SavableItem = z.object({
    type: z.literal('item'),
    config: z.object({
        defId: z.string().default(''),
        count: z.number().positive().catch(1).default(1),
    }).default({defId: '', count: 1}),
    position: Vec3,
    quaternion: Quat,
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

/* 副手武器配置：结构非法整体回退 undefined（运行时无副手）；未知武器 id 由 world.add 安全丢弃 */
const OffhandConfigSchema = AttackConfigSchema.optional().catch(undefined)

const TendencyConfigSchema = z.object({
    tendencyId: z.enum(['hostileAll', 'hostileExceptSelf', 'hostileTo', 'hostileExcept', 'pacifist']),
    targetFactions: z.array(z.number()).optional(),
})

/* 基础防御：逐攻击类别固定减伤（负值非法）；非法结构整体回退 undefined（运行时零防御），不抛错 */
const DefenseProfileSchema = z.object({
    physical: z.number().min(0).default(0),
    magic: z.number().min(0).default(0),
}).optional().catch(undefined)

/* 护甲装备表：槽位 → 护甲 id；非法结构整体回退 undefined（运行时空护甲），未知 id 由运行时回退空槽 */
const ArmorLoadoutSchema = z.object({
    head: z.string().optional(),
    chest: z.string().optional(),
    arms: z.string().optional(),
    legs: z.string().optional(),
}).optional().catch(undefined)

/* 额外锁定点：关节 id + 关节本地偏移；非法结构整体回退 undefined（运行时仅保留默认身体中心点），不抛错 */
const LockPointSchema = z.object({
    jointId: z.string().min(1),
    offset: z.tuple([z.number(), z.number(), z.number()]),
})
const LockPointsSchema = z.array(LockPointSchema).optional().catch(undefined)

/** character 存档共享默认值（供内联 schema .default() 和外层 CHARACTER_SAVE_CONFIG_DEFAULTS 共用） */
const CHARACTER_SAVE_ATTACK_DEFAULT = {weaponId: 'long_sword', damage: 3}
const CHARACTER_SAVE_TENDENCY_DEFAULT = {tendencyId: 'hostileExceptSelf' as const}

const CharacterConfigInner = z.object({
    speed: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.speed),
    jumpHeight: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.jumpHeight),
    scale: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.scale),
    peaceStrategy: z.enum(['patrol', 'build']).optional(),
    combatStrategy: z.enum(['tactical', 'aggressive', 'cowardly']).optional(),
    /* 持握模式：非法值安全回退 undefined（由运行时按武器默认模式处理），不抛错 */
    holdMode: z.enum(HOLD_MODES).optional().catch(undefined),
    attack: AttackConfigSchema.default(CHARACTER_SAVE_ATTACK_DEFAULT),
    offhand: OffhandConfigSchema,
    tendency: TendencyConfigSchema.default(CHARACTER_SAVE_TENDENCY_DEFAULT),
    faction: z.number().default(0),
    maxHealth: z.number().positive().default(100),
    defense: DefenseProfileSchema,
    armor: ArmorLoadoutSchema,
    lockPoints: LockPointsSchema,
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
    SavableBuildingGenerator,
    SavableInteractable,
    SavableItem,
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
        /* 背包：整体非法回退 undefined（运行时空背包） */
        inventory: InventorySaveSchema,
        /* 已解锁传送点键 */
        teleports: z.array(z.string()).optional().catch(undefined),
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
