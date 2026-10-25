import type {WeaponConfig} from '../../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../../character/weapon/weapon_class.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../../character/weapon/melee_weapon.ts'
import {rangedClass, resolveRangedWeapon, type RangedWeaponClassConfig} from '../../../../../character/weapon/ranged_weapon.ts'
import {SHIELD_BLOCK_LARGE, SHIELD_BLOCK_MEDIUM, SHIELD_BLOCK_SMALL} from '../../../../../character/weapon/constants.ts'
import {HOLD_MODE_LABELS, type HoldMode} from '../../../../../character/weapon/hold_mode.ts'
import {Box3, Vector3} from 'three'
import {createWeaponMesh, resolveAttackBoxes} from '../../../appearance/weapon_mesh.ts'
import type {AttackModuleDef} from '../../../../../character/weapon/attack_module.ts'
import type {MeleeDetectBoxSpec} from '../../../../../character/weapon/melee_weapon.ts'
import {HUMANOID_SIZE} from '../state/form_base.ts'

/**
 * 人形武器表（formId = 'humanoid'）：全部近战 / 远程武器类与模型。
 * 武器数据归属体形，此处为人形的权威来源；其他体形（狼 / 马 / wyvern）各自拥有自己的武器表，
 * 若需要相同外观则**复用 `weapon_mesh.ts` 的网格生成器**、各自声明独立武器条目。
 */

const FORM_ID = 'humanoid'

/** 人形武器可装备部位：主手 / 副手（同一武器模型可装任一手） */
const HUMANOID_WEAPON_SLOTS = ['main_hand', 'off_hand'] as const

/** 人形身体中心（脚底原点起算）：检测箱 offset 以身体中心为基准 */
const BODY_CENTER_Y = HUMANOID_SIZE.height / 2

const holdModules = (modes: readonly HoldMode[]): readonly AttackModuleDef[] =>
    modes.map(id => ({id, nameKey: HOLD_MODE_LABELS[id], holdMode: id}))

const detectBoxes = (
    size: {x: number; y: number; z: number},
    offset: {x: number; y: number; z: number},
): readonly MeleeDetectBoxSpec[] => [{
    jointId: 'root',
    size,
    offset: {x: offset.x, y: offset.y + BODY_CENTER_Y, z: offset.z},
    rotation: {x: 0, y: 0, z: 0},
}]

/** `weaponMount` 为占位关节：装备时由主 / 副手槽解析为实际武器挂点 */
const WEAPON_MOUNT = 'weaponMount'

const attackBoxesOf = (mesh: WeaponModelConfig['mesh']): readonly import('../../../../../character/weapon/mesh_config.ts').WeaponAttackBoxSpec[] => {
    const result = createWeaponMesh(mesh)
    const boxes = resolveAttackBoxes(result, WEAPON_MOUNT, undefined)
    result.cleanup()
    return boxes
}

/** 远程武器攻击箱：用真实武器网格包围盒生成，贴合枪身 / 弓身（仅展示 / 调试用） */
const attackBoxesOfMeshBounds = (mesh: WeaponModelConfig['mesh']): readonly import('../../../../../character/weapon/mesh_config.ts').WeaponAttackBoxSpec[] => {
    const result = createWeaponMesh(mesh)
    const position = result.group.position.clone()
    const quaternion = result.group.quaternion.clone()
    const rotation = {x: result.group.rotation.x, y: result.group.rotation.y, z: result.group.rotation.z}
    /* 在武器本地空间取包围盒，再按握持变换放回挂点空间：得到贴合模型的定向盒 */
    result.group.position.set(0, 0, 0)
    result.group.quaternion.identity()
    result.group.updateWorldMatrix(true, true)
    const bounds = new Box3().setFromObject(result.group)
    result.group.position.copy(position)
    result.group.quaternion.copy(quaternion)
    result.cleanup()
    const localCenter = bounds.getCenter(new Vector3()).applyQuaternion(quaternion).add(position)
    const size = bounds.getSize(new Vector3())
    const margin = 0.01
    return [{
        jointId: WEAPON_MOUNT,
        center: localCenter,
        half: {
            x: Math.max(0.02, size.x / 2 + margin),
            y: Math.max(0.02, size.y / 2 + margin),
            z: Math.max(0.02, size.z / 2 + margin),
        },
        rotation,
        reach: Math.max(size.y, size.z) / 2 + margin,
    }]
}

/** 近战武器类目录（键 = 类 id） */
const MELEE_CLASSES: Record<string, MeleeWeaponClassConfig> = {
    short_sword: meleeClass({
        id: 'short_sword', type: 'melee',
        damageType: 'physical',
        attackModules: holdModules(['one_handed', 'two_handed', 'dual_wield']),
        damage: 2,
        knockbackForce: 2, knockbackY: 1,
        detectionRange: 6,
        /* 前缘 = (0.5 + reach 0.3125) × 0.8 = 0.65，外扩 +0.05 见 src/entity/character/ai/ai.md 2.5.1 */
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 0.8 }, { x: 0, y: 0, z: 0.275 }),
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
    long_sword: meleeClass({
        id: 'long_sword', type: 'melee',
        damageType: 'physical',
        attackModules: holdModules(['one_handed', 'two_handed', 'dual_wield']),
        damage: 3,
        knockbackForce: 5, knockbackY: 2,
        detectionRange: 8,
        /* 前缘 = (0.5 + reach 0.4875) × 0.8 = 0.79 */
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 0.94 }, { x: 0, y: 0, z: 0.345 }),
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
    /* 巨剑：双手链轻型链加长为三段（轻 1 → 轻 2 → 轻 3 循环），重链保持两段 */
    heavy_sword: meleeClass({
        id: 'heavy_sword', type: 'melee',
        damageType: 'physical',
        attackModules: holdModules(['one_handed', 'two_handed', 'dual_wield']),
        damage: 8,
        knockbackForce: 8, knockbackY: 3,
        stamina: {entry: {attack: 1.2}, drain: {sprinting: 1.1}},
        detectionRange: 10,
        /* 前缘 = (0.5 + reach 0.6025) × 0.8 = 0.882 */
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 1.032 }, { x: 0, y: 0, z: 0.391 }),
        /* 空中：两段旋风斩（姿势基底取轻 1/轻 2），动量略低、保留少量操控 */
        airAttack: {steps: ['air_1', 'air_2'], loop: false, momentum: 0.9, airControl: 0.25, poseKeys: ['light_1', 'light_2']},
    }, {
        one_handed: {},
        two_handed: {chains: {light: {steps: ['light_1', 'light_2', 'light_3'], loop: true}}},
        dual_wield: {},
    }),
    /* 长枪：轻击链为标准两段（蓄力统一由「重击蓄力」承担，见 melee_attacks.ts 的 heavyCharge） */
    spear: meleeClass({
        id: 'spear', type: 'melee',
        damageType: 'physical',
        attackModules: holdModules(['one_handed', 'two_handed', 'dual_wield']),
        damage: 5,
        knockbackForce: 4, knockbackY: 1,
        detectionRange: 10,
        /* 前缘 = (0.5 + reach 1.17) × 0.8 = 1.336（长杆武器攻击距离优势） */
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 1.486 }, { x: 0, y: 0, z: 0.618 }),
        /* 空中：单段下刺（姿势基底取重 1 突刺），几乎保持惯性 */
        airAttack: {steps: ['air_1'], loop: false, momentum: 0.95, airControl: 0.3, poseKeys: ['heavy_1']},
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
    /* 战斧：同为单刃斧（斧刃几何关于矢状面对称），双持时左右手各一把同类武器，副手相位错开半程（交替挥砍） */
    dual_axe: meleeClass({
        id: 'dual_axe', type: 'melee',
        damageType: 'physical',
        attackModules: holdModules(['one_handed', 'two_handed', 'dual_wield']),
        damage: 6,
        knockbackForce: 7, knockbackY: 2,
        stamina: {entry: {attack: 1.1}, drain: {sprinting: 1.05}},
        detectionRange: 7,
        /* 前缘 = (0.5 + reach 0.4193) × 0.8 = 0.73544 */
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 0.88544 }, { x: 0, y: 0, z: 0.31772 }),
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
    war_hammer: meleeClass({
        id: 'war_hammer', type: 'melee',
        damageType: 'physical',
        attackModules: holdModules(['one_handed', 'two_handed', 'dual_wield']),
        damage: 10,
        knockbackForce: 10, knockbackY: 4,
        stamina: {entry: {attack: 1.35}, drain: {sprinting: 1.2}},
        detectionRange: 8,
        /* 前缘 = (0.5 + reach 0.4875) × 0.8 = 0.79（战锤握把偏低，reach 已计入 gripY） */
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 0.94 }, { x: 0, y: 0, z: 0.345 }),
        /* 空中：跳跃砸地——单段重砸（姿势基底取重 1） */
        airAttack: {steps: ['air_1'], loop: false, momentum: 0.7, airControl: 0.12, poseKeys: ['heavy_1']},
        /* 段内自身冲击：砸地在下砸到打击帧（段内 0.5s，与 clip hitbox_on 同刻）时向下砸；离地才施加 */
        impulses: {
            air_1: [{at: 0.5, direction: {x: 0, y: -1, z: 0}, speed: 14, requireAirborne: true}],
        },
    }, {
        one_handed: {},
        two_handed: {},
        dual_wield: {},
    }),
    /* 盾牌：仅单持，承载格挡（`block`）。轻击 = 盾击，重击 = 盾撞；三档共用同一套盾击 / 盾撞姿态，仅握持角不同。 */
    shield_small: meleeClass({
        id: 'shield_small', type: 'melee',
        damageType: 'physical',
        /* 盾击 / 盾撞整体放慢：保留 2:1:2.5，下砸不再瞬跳 */
        timeScale: 2,
        attackModules: holdModules(['one_handed']),
        damage: 2,
        knockbackForce: 3, knockbackY: 1,
        detectionRange: 3,
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 0.7 }, { x: 0, y: 0, z: 0.225 }),
        block: SHIELD_BLOCK_SMALL,
        stamina: {drain: {blocking: 0.8}},
    }, {
        one_handed: {},
    }),
    shield_medium: meleeClass({
        id: 'shield_medium', type: 'melee',
        damageType: 'physical',
        /* 盾击 / 盾撞整体放慢：保留 2:1:2.5，下砸不再瞬跳 */
        timeScale: 2,
        attackModules: holdModules(['one_handed']),
        damage: 3,
        knockbackForce: 4, knockbackY: 2,
        detectionRange: 4,
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 0.8 }, { x: 0, y: 0, z: 0.275 }),
        block: SHIELD_BLOCK_MEDIUM,
        stamina: {drain: {blocking: 0.9}},
    }, {
        one_handed: {},
    }),
    shield_large: meleeClass({
        id: 'shield_large', type: 'melee',
        damageType: 'physical',
        /* 盾击 / 盾撞整体放慢：保留 2:1:2.5，下砸不再瞬跳 */
        timeScale: 2,
        attackModules: holdModules(['one_handed']),
        damage: 4,
        knockbackForce: 5, knockbackY: 2,
        detectionRange: 5,
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 0.94 }, { x: 0, y: 0, z: 0.345 }),
        block: SHIELD_BLOCK_LARGE,
        stamina: {drain: {blocking: 1.15}},
    }, {
        one_handed: {},
    }),
    /* 空手：天然武器类别（主手 / 副手默认）。无可视模型，攻击箱贴掌；
     * 动作复用短剑单持 / 双持段关键帧（单拳直拳 / 双拳交替），外观由身体手部件表达。
     * 不支持双手共持：双拳 = 主手 + 副手各装备 `unarmed` 后切换 `dual_wield`。 */
    unarmed: meleeClass({
        id: 'unarmed', type: 'melee', natural: true,
        damageType: 'physical',
        attackModules: holdModules(['one_handed', 'dual_wield']),
        damage: 1,
        knockbackForce: 2, knockbackY: 1,
        detectionRange: 3,
        detectBoxes: detectBoxes({ x: 0.5, y: 1.15, z: 0.5 }, { x: 0, y: 0, z: 0.2 }),
    }, {
        one_handed: {poseRef: (own: string) => own.replace(/^unarmed_/, 'short_sword_')},
        dual_wield: {poseRef: (own: string) => own.replace(/^unarmed_/, 'short_sword_')},
    }),
}

/** 近战武器模型目录（键 = 模型 id） */
const MELEE_MODELS: Record<string, WeaponModelConfig> = {
    short_sword: {
        id: 'short_sword', classId: 'short_sword', formId: FORM_ID, name: '短剑', nameKey: 'weapon.short_sword',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'sword', bladeLen: 0.3, color: 0xcc5555, gripColor: 0x664422, supportGripOffset: 0 },
    },
    long_sword: {
        id: 'long_sword', classId: 'long_sword', formId: FORM_ID, name: '长剑', nameKey: 'weapon.long_sword',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322, supportGripOffset: 0.08 },
    },
    heavy_sword: {
        id: 'heavy_sword', classId: 'heavy_sword', formId: FORM_ID, name: '巨剑', nameKey: 'weapon.heavy_sword',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'heavy_sword', bladeLen: 0.65, color: 0x555566, gripColor: 0x332211, supportGripOffset: 0.065 },
    },
    spear: {
        id: 'spear', classId: 'spear', formId: FORM_ID, name: '长枪', nameKey: 'weapon.spear',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'spear', poleLen: 1.0, headLen: 0.2, color: 0x886644, headColor: 0xaaaaaa, supportGripOffset: 0.14 },
    },
    dual_axe: {
        id: 'dual_axe', classId: 'dual_axe', formId: FORM_ID, name: '战斧', nameKey: 'weapon.dual_axe',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322, supportGripOffset: -0.18 },
    },
    war_hammer: {
        id: 'war_hammer', classId: 'war_hammer', formId: FORM_ID, name: '战锤', nameKey: 'weapon.war_hammer',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'war_hammer', headSize: 0.35, color: 0x777777, gripColor: 0x443311, supportGripOffset: -0.0805 },
    },
    shield_small: {
        id: 'shield_small', classId: 'shield_small', formId: FORM_ID, name: '小盾', nameKey: 'weapon.shield_small',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'shield_small', width: 0.44, height: 0.44, thickness: 0.06, round: true, color: 0x8a6a3a, gripColor: 0x4a3520, bossColor: 0x9a9a9a },
    },
    shield_medium: {
        id: 'shield_medium', classId: 'shield_medium', formId: FORM_ID, name: '中盾', nameKey: 'weapon.shield_medium',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'shield_medium', width: 0.6, height: 0.9, thickness: 0.12, round: false, color: 0x6a5a44, gripColor: 0x4a3520, bossColor: 0x8a8a8a },
    },
    shield_large: {
        id: 'shield_large', classId: 'shield_large', formId: FORM_ID, name: '大盾', nameKey: 'weapon.shield_large',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'shield_large', width: 0.9, height: 1.4, thickness: 0.15, round: false, color: 0x556070, gripColor: 0x3a2a18, bossColor: 0x9a9a9a },
    },
    unarmed: {
        id: 'unarmed', classId: 'unarmed', formId: FORM_ID, name: '空手', nameKey: 'weapon.unarmed',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'none' },
        /* 拳头攻击箱：缩小并拆到前臂 / 手两段关节；`forearm` / `hand` 在装备时按主副手侧解析 */
        attackBoxes: [
            {jointId: 'forearm', center: {x: 0, y: -0.09, z: 0}, half: {x: 0.055, y: 0.1, z: 0.055}, rotation: {x: 0, y: 0, z: 0}, reach: 0.2},
            {jointId: 'hand', center: {x: 0, y: -0.04, z: 0.02}, half: {x: 0.06, y: 0.06, z: 0.07}, rotation: {x: 0, y: 0, z: 0}, reach: 0.12},
        ],
    },
}

/** 远程武器类目录（键 = 类 id） */
const RANGED_CLASSES: Record<string, RangedWeaponClassConfig> = {
    longbow: rangedClass({
        id: 'longbow', type: 'ranged',
        stamina: {entry: {attack: 1.15}},
        damageType: 'physical',
        attackModules: holdModules(['two_handed']),
        damage: 2, range: 10,
        knockbackForce: 3, projectileSpeed: 20, projectileLifetime: 3,
        detectionRange: 20, idealRange: 7, retreatRange: 4,
        projectile: {kind: 'arrow'}, projectileGravityScale: 0.08,
        /* 蓄力：低蓄力近射低伤，满蓄力远射高伤 */
        charge: {maxChargeMultiplier: 180, maxChargeTime: 1, minSpeedScale: 0.55, maxSpeedScale: 1.6, minLifetimeScale: 0.8, maxLifetimeScale: 1.3},
    }),
    crossbow: rangedClass({
        id: 'crossbow', type: 'ranged',
        damageType: 'physical',
        attackModules: holdModules(['two_handed']),
        damage: 5, range: 8,
        knockbackForce: 4, projectileSpeed: 45, projectileLifetime: 1.5,
        detectionRange: 15, idealRange: 5, retreatRange: 3,
        projectile: {kind: 'bolt'}, projectileGravityScale: 0.02,
    }),
    shotgun: rangedClass({
        id: 'shotgun', type: 'ranged',
        damageType: 'physical',
        attackModules: holdModules(['two_handed']),
        damage: 1, range: 6,
        knockbackForce: 6, projectileSpeed: 15, projectileLifetime: 1.5,
        detectionRange: 10, idealRange: 3, retreatRange: 2,
        spreadCount: 6, spreadAngle: Math.PI * 0.08,
        projectile: {kind: 'bullet'}, projectileGravityScale: 0.04,
    }),
    staff: rangedClass({
        id: 'staff', type: 'ranged',
        damageType: 'magic',
        attackModules: holdModules(['two_handed']),
        damage: 3, range: 8,
        knockbackForce: 4, projectileSpeed: 10, projectileLifetime: 5,
        detectionRange: 18, idealRange: 5, retreatRange: 3,
        explosionRadius: 1.2,
        projectile: {kind: 'magic_orb', explosionStyle: 'magic'}, projectileGravityScale: 0.05,
    }),
    magic_wand: rangedClass({
        id: 'magic_wand', type: 'ranged',
        damageType: 'magic',
        attackModules: holdModules(['one_handed']),
        damage: 1.5, range: 10,
        knockbackForce: 2, projectileSpeed: 8, projectileLifetime: 4,
        detectionRange: 16, idealRange: 6, retreatRange: 4,
        homingStrength: 0.3,
        projectile: {kind: 'magic_orb'}, projectileGravityScale: 0,
    }),
    throwing_axe: rangedClass({
        id: 'throwing_axe', type: 'ranged',
        damageType: 'physical',
        attackModules: holdModules(['one_handed']),
        damage: 6, range: 10,
        knockbackForce: 5, projectileSpeed: 15, projectileLifetime: 3,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 8,
        projectile: {kind: 'thrown_weapon', spin: true}, projectileGravityScale: 0.45,
        /* 蓄力：控制投掷远近 + 伤害 */
        charge: {maxChargeMultiplier: 140, maxChargeTime: 0.9, minSpeedScale: 0.45, maxSpeedScale: 1.7, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
    grenade: rangedClass({
        id: 'grenade', type: 'ranged',
        damageType: 'physical',
        attackModules: holdModules(['one_handed']),
        damage: 4, range: 10,
        knockbackForce: 8, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 14, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 5, explosionRadius: 2.0,
        projectile: {kind: 'thrown_weapon', spin: true, explosionStyle: 'frag'}, projectileGravityScale: 0.55,
        charge: {maxChargeMultiplier: 135, maxChargeTime: 0.9, minSpeedScale: 0.5, maxSpeedScale: 1.6, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
    molotov: rangedClass({
        id: 'molotov', type: 'ranged',
        damageType: 'physical',
        attackModules: holdModules(['one_handed']),
        damage: 2, range: 10,
        knockbackForce: 5, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 9, explosionRadius: 1.5,
        projectile: {kind: 'thrown_weapon', spin: true, explosionStyle: 'fire'}, projectileGravityScale: 0.5,
        charge: {maxChargeMultiplier: 135, maxChargeTime: 0.9, minSpeedScale: 0.5, maxSpeedScale: 1.6, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
    throwing_dart: rangedClass({
        id: 'throwing_dart', type: 'ranged',
        damageType: 'physical',
        attackModules: holdModules(['one_handed']),
        damage: 1.5, range: 12,
        knockbackForce: 1, projectileSpeed: 30, projectileLifetime: 2,
        detectionRange: 16, idealRange: 8, retreatRange: 4,
        throwAngle: 0,
        projectile: {kind: 'thrown_weapon'}, projectileGravityScale: 0.2,
        charge: {maxChargeMultiplier: 140, maxChargeTime: 0.7, minSpeedScale: 0.5, maxSpeedScale: 1.6, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
}

/** 远程武器模型目录（键 = 模型 id） */
const RANGED_MODELS: Record<string, WeaponModelConfig> = {
    longbow: {
        id: 'longbow', classId: 'longbow', formId: FORM_ID, name: '长弓', nameKey: 'weapon.longbow',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'bow', size: 0.7, color: 0x886633, stringColor: 0xddddcc, supportGripOffset: 0.084 },
    },
    crossbow: {
        id: 'crossbow', classId: 'crossbow', formId: FORM_ID, name: '弩', nameKey: 'weapon.crossbow',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'crossbow', size: 0.5, color: 0x553322, metalColor: 0x888888, supportGripOffset: 0.16 },
    },
    shotgun: {
        id: 'shotgun', classId: 'shotgun', formId: FORM_ID, name: '霰弹枪', nameKey: 'weapon.shotgun',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'shotgun', size: 0.6, color: 0x443322, metalColor: 0x666666, supportGripOffset: 0.156 },
    },
    staff: {
        id: 'staff', classId: 'staff', formId: FORM_ID, name: '法杖', nameKey: 'weapon.staff',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'staff', poleLen: 0.8, orbRadius: 0.12, color: 0x664422, orbColor: 0x44aaff, supportGripOffset: 0.24 },
    },
    magic_wand: {
        id: 'magic_wand', classId: 'magic_wand', formId: FORM_ID, name: '魔杖', nameKey: 'weapon.magic_wand',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'magic_wand', len: 0.5, color: 0x886633, gemColor: 0xff44ff },
    },
    throwing_axe: {
        id: 'throwing_axe', classId: 'throwing_axe', formId: FORM_ID, name: '飞斧', nameKey: 'weapon.throwing_axe',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322 },
    },
    grenade: {
        id: 'grenade', classId: 'grenade', formId: FORM_ID, name: '手雷', nameKey: 'weapon.grenade',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'grenade', radius: 0.1, color: 0x445522, bandColor: 0x333311 },
    },
    molotov: {
        id: 'molotov', classId: 'molotov', formId: FORM_ID, name: '燃烧瓶', nameKey: 'weapon.molotov',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'molotov', size: 0.25, color: 0x446622, fireColor: 0xff8800 },
    },
    throwing_dart: {
        id: 'throwing_dart', classId: 'throwing_dart', formId: FORM_ID, name: '飞镖', nameKey: 'weapon.throwing_dart',
        equipBodyParts: HUMANOID_WEAPON_SLOTS,
        mesh: { id: 'throwing_dart', len: 0.5, color: 0x888888, tailColor: 0xcc3333 },
    },
}

/** 人形全部武器（近战在前、远程在后；空手固定排近战首位；面板下拉 / 存档校验用） */
const ORDERED_MELEE_MODELS: readonly WeaponModelConfig[] = [
    ...Object.values(MELEE_MODELS).filter(model => model.id === 'unarmed'),
    ...Object.values(MELEE_MODELS).filter(model => model.id !== 'unarmed'),
]
export const HUMANOID_WEAPONS: readonly WeaponConfig[] = [
    ...ORDERED_MELEE_MODELS.map(model => resolveMeleeWeapon(MELEE_CLASSES[model.classId]!, {
        ...model,
        attackBoxes: model.attackBoxes ?? attackBoxesOf(model.mesh),
        colliders: [],
        hurtBoxes: [],
    })),
    ...Object.values(RANGED_MODELS).map(model => resolveRangedWeapon(RANGED_CLASSES[model.classId]!, {
        ...model,
        attackBoxes: attackBoxesOfMeshBounds(model.mesh),
        colliders: [],
        hurtBoxes: [],
    })),
]
