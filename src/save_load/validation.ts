import {z} from 'zod'
import {BoxConfigSchema, DEFAULT_BOX_CONFIG} from '../entity/box/validation.ts'
import {AreaConfigSchema, DEFAULT_AREA_CONFIG} from '../entity/area/validation.ts'
import {BaseTerrainConfigSchema} from '../entity/terrain/base/validation.ts'
import {FragmentConfigSchema} from '../entity/fragment/common/validation.ts'
import {DEFAULT_TERRAIN_CONFIG} from '../entity/terrain/base/validation.ts'
import {DEFAULT_FRAGMENT_CONFIG} from '../entity/fragment/common/validation.ts'
import {CHARACTER_CONFIG_DEFAULTS} from '../entity/character/constants.ts'
import {SURFACE_MATERIAL_IDS} from '../render/materials/ids.ts'
import {BUILDING_PROP_KINDS} from '../entity/building_generator/props/kinds.ts'
import {BREAKABLE_SOURCES} from '../entity/interactable/kinds.ts'

const Vec3 = z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0])
const Quat = z.tuple([z.number(), z.number(), z.number(), z.number()]).default([0, 0, 0, 1])

const CollisionRecordSchema = z.object({
    contactPoint: z.tuple([z.number(), z.number(), z.number()]),
    normal: z.tuple([z.number(), z.number(), z.number()]),
    relativeVelocity: z.number(),
})

/* 统一箱子：config 携带可选特性对象（存在即启用）；各特性运行态分别可选，
   旧档 / 缺省安全回退。特性对象非法时由外层逐元素跳过（不整档失败）。 */
const SavableBox = z.object({
    type: z.literal('box'),
    config: BoxConfigSchema.default(DEFAULT_BOX_CONFIG),
    position: Vec3,
    quaternion: Quat,
    destructible: z.object({
        health: z.number().optional(),
        collisions: z.array(CollisionRecordSchema).optional(),
        collisionHistory: z.array(CollisionRecordSchema).optional(),
        cooldowns: z.array(z.tuple([z.number(), z.number()])).optional(),
    }).optional(),
    burning: z.object({
        health: z.number().optional(),
    }).optional(),
    elastic: z.object({
        def: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
        vel: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    }).optional(),
})

/* 统一区域：config 携带几何 + 视觉材质 + 可选物理场；旧 `area/water` 作为未知类型逐元素跳过 */
const SavableArea = z.object({
    type: z.literal('area'),
    config: AreaConfigSchema.default(DEFAULT_AREA_CONFIG),
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

/* 装备状态：limb / weapon / armor 三层的 槽位 bodyPart → 物品 id 映射。
   宽松校验：未知 id / 体形不匹配由运行时解析层安全剔除，不在此做白名单硬校验。 */
const EquipRecordSchema = z.record(z.string(), z.string()).catch({}).default({})
const EquipmentStateSchema = z.object({
    limb: EquipRecordSchema,
    weapon: EquipRecordSchema,
    armor: EquipRecordSchema,
}).catch({limb: {}, weapon: {}, armor: {}}).default({limb: {}, weapon: {}, armor: {}})

const TendencyConfigSchema = z.object({
    tendencyId: z.enum(['hostileAll', 'hostileExceptSelf', 'hostileTo', 'hostileExcept', 'pacifist']),
    targetFactions: z.array(z.number()).optional(),
})

/* 基础防御：逐攻击类别固定减伤（负值非法）；非法结构整体回退 undefined（运行时零防御），不抛错 */
const DefenseProfileSchema = z.object({
    physical: z.number().min(0).default(0),
    magic: z.number().min(0).default(0),
}).optional().catch(undefined)

/* 基础攻击加成：逐攻击类别（负值非法）；非法结构整体回退 undefined（运行时零加成），不抛错 */
const BaseAttackProfileSchema = z.object({
    physical: z.number().min(0).default(0),
    magic: z.number().min(0).default(0),
}).optional().catch(undefined)

/* 体形专属状态：不透明键值（attackModule + 人形 handedness）；非法结构回退空对象 */
const BodyStateSchema = z.record(z.string(), z.string()).optional().catch(undefined)

/* 额外锁定点：关节 id + 关节本地偏移；非法结构整体回退 undefined（运行时仅保留默认身体中心点），不抛错 */
const LockPointSchema = z.object({
    jointId: z.string().min(1),
    offset: z.tuple([z.number(), z.number(), z.number()]),
})
const LockPointsSchema = z.array(LockPointSchema).optional().catch(undefined)

/** character 存档共享默认值（供内联 schema .default() 和外层 CHARACTER_SAVE_CONFIG_DEFAULTS 共用） */
const CHARACTER_SAVE_TENDENCY_DEFAULT = {tendencyId: 'hostileExceptSelf' as const}

const CharacterConfigInner = z.object({
    speed: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.speed),
    jumpHeight: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.jumpHeight),
    scale: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.scale),
    peaceStrategy: z.enum(['patrol', 'build']).optional(),
    combatStrategy: z.enum(['tactical', 'aggressive', 'cowardly']).optional(),
    tendency: TendencyConfigSchema.default(CHARACTER_SAVE_TENDENCY_DEFAULT),
    faction: z.number().default(0),
    maxHealth: z.number().positive().default(100),
    defense: DefenseProfileSchema,
    baseAttack: BaseAttackProfileSchema,
    equipment: EquipmentStateSchema,
    lockPoints: LockPointsSchema,
    /* 韧性 / 倒地属性：非法值安全回退 undefined（运行时用默认），不抛错 */
    poiseMax: z.number().positive().optional().catch(undefined),
    poiseRegenDelay: z.number().min(0).optional().catch(undefined),
    poiseRegenPerSec: z.number().min(0).optional().catch(undefined),
    knockdownDuration: z.number().min(0).optional().catch(undefined),
    getUpDuration: z.number().min(0).optional().catch(undefined),
    /* 体形计划 id：非法值安全回退 undefined（运行时回退 humanoid），未知 id 由 bodyFormOf 安全回退 */
    bodyFormId: z.string().optional().catch(undefined),
    /* 体形专属状态（attackModule + 人形 handedness） */
    bodyState: BodyStateSchema,
    isPlayer: z.boolean().default(false),
    navEnabled: z.boolean().default(true),
    /* 行为原点策略 / 间隔 / 追击半径：非法值安全回退 undefined（运行时用默认），不抛错 */
    originStrategy: z.enum(['resident', 'fighter', 'hunter', 'roamer']).optional().catch(undefined),
    originInterval: z.number().positive().optional().catch(undefined),
    chaseLeashRadius: z.number().positive().optional().catch(undefined),
    /* AI 反应式举盾窗口 / 冷却：非法值安全回退 undefined（运行时用默认），不抛错 */
    aiBlockDuration: z.number().positive().optional().catch(undefined),
    /* 冷却必须为正：0 会让举盾窗口在同一帧内无限续期，退化为持续举盾（即本属性要解决的「持盾不攻击」） */
    aiBlockCooldown: z.number().positive().optional().catch(undefined),
})

/** character config 默认值（供外层 .default() 使用） */
const CHARACTER_SAVE_CONFIG_DEFAULTS = {
    speed: CHARACTER_CONFIG_DEFAULTS.speed,
    jumpHeight: CHARACTER_CONFIG_DEFAULTS.jumpHeight,
    scale: CHARACTER_CONFIG_DEFAULTS.scale,
    tendency: CHARACTER_SAVE_TENDENCY_DEFAULT,
    faction: 0,
    maxHealth: 100,
    equipment: {limb: {}, weapon: {}, armor: {}},
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
    SavableBox,
    SavableArea,
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

/* 顶层壳：entities 以 unknown 保留原数组下标，逐元素安全解析后再收集，
   使单个无法解析（未知 type / 字段非法）的元素被跳过而非导致整档校验失败。 */
const SaveDataShellSchema = z.object({
    /** 格式版本（缺省 1 = 旧档：character 位置为身体中心，加载时迁移到脚底原点） */
    version: z.number().int().positive().default(1),
    entities: z.array(z.unknown()),
    modeInfo: ModeInfo.optional(),
})

/** 逐元素跳过时记录的信息：原数组下标 + 原 `type` 字段（若有）+ 首条校验错误摘要 */
export interface SkippedEntity {
    readonly index: number
    readonly type: string | undefined
    readonly reason: string
}

/** 逐元素安全解析的结果：合法实体 + 被跳过的元素清单 */
export interface ParsedSaveData {
    readonly data: ValidatedSaveData
    readonly skipped: readonly SkippedEntity[]
}

export interface ValidatedSaveData {
    version: number
    entities: Array<z.infer<typeof SavableEntity>>
    modeInfo?: z.infer<typeof ModeInfo>
}

/** 安全读取元素的 `type` 字段（非对象 / 缺字段 / 非字符串均返回 undefined） */
const entityTypeOf = (raw: unknown): string | undefined => {
    if (typeof raw !== 'object' || raw === null) return undefined
    if (!('type' in raw)) return undefined
    const value: unknown = raw.type
    return typeof value === 'string' ? value : undefined
}

/**
 * 校验存档并按元素粒度收集非法项：
 * 顶层 / `entities` 非数组仍抛错（结构性失败）；单个元素无法解析则记入 `skipped` 并跳过。
 */
export const parseSaveData = (input: unknown): ParsedSaveData => {
    const shell = SaveDataShellSchema.parse(input)
    const entities: Array<z.infer<typeof SavableEntity>> = []
    const skipped: SkippedEntity[] = []
    shell.entities.forEach((raw, index) => {
        const result = SavableEntity.safeParse(raw)
        if (result.success) {
            entities.push(result.data)
            return
        }
        const issue = result.error.issues[0]
        skipped.push({
            index,
            type: entityTypeOf(raw),
            reason: issue === undefined ? 'invalid' : `${issue.path.join('.')}: ${issue.message}`,
        })
    })
    return {
        data: {version: shell.version, entities, modeInfo: shell.modeInfo},
        skipped,
    }
}

/** 校验并存档：返回合法实体，跳过非法元素（如需跳过明细请用 `parseSaveData`） */
export const validateSaveData = (data: unknown): ValidatedSaveData =>
    parseSaveData(data).data
