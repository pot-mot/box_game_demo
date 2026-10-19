import type { Faction, AttackTendency, TendencyConfig } from '../faction.ts'
import type { AttackSegment, WeaponAttacks } from '../weapon/attack_chain.ts'
import type { WeaponConfig } from '../weapon/catalog.ts'
import type { WeaponRuntime } from '../weapon/weapon_runtime.ts'
import type { ShieldBlockConfig } from '../weapon/constants.ts'
import type { HoldMode } from '../weapon/hold_mode.ts'
import type { ArmorLoadout, LimbLoadout } from '../armor/types.ts'
import { resolveArmorLoadout, resolveLimbLoadout, totalAttackOf, totalDefenseOf, totalMoveSpeedOf, totalPoiseOf } from '../armor/catalog.ts'
import { createRollSkillRuntime, type RollSkillRuntime } from './roll_skill.ts'
import type { DamageEvent, DamageModifier } from './damage.ts'
import { addDamageProfiles, ZERO_PROFILE, type DefenseProfile } from './defense.ts'
import type { DamageTypeProfile } from './damage_type.ts'
import { FLINCH_DURATION } from './attack_phases.ts'
import {
    DEFAULT_POISE_MAX,
    DEFAULT_POISE_REGEN_DELAY,
    DEFAULT_POISE_REGEN_PER_SEC,
    DEFAULT_KNOCKDOWN_DURATION,
    DEFAULT_GET_UP_DURATION,
} from './constants.ts'

/** 韧性相关角色属性（缺省取 `constants.ts` 默认值；可被角色配置覆写） */
export interface CombatAttributes {
    readonly poiseMax?: number
    readonly poiseRegenDelay?: number
    readonly poiseRegenPerSec?: number
    readonly knockdownDuration?: number
    readonly getUpDuration?: number
}

/** 攻击结果码 */
export const ATTACK_RESULT_CODES = ['ok', 'cooldown', 'dead', 'already_attacking', 'no_valid_skill'] as const
export type AttackResult = typeof ATTACK_RESULT_CODES[number]

/**
 * 角色战斗组件 — 从 CharacterEntity 中分离的所有战斗相关状态。
 *
 * 攻击动作模型（无槽位）：角色只持有**装备武器**（含数值覆写）与其**武器攻击链**；
 * 当前段 / 缓冲段以段定义对象表达（不再有 currentSkillIndex / chainEntryIndex / comboChain 索引），
 * 连段推进由段自身声明的 next 转换决定（见 `states/attacking/`）。
 */
export interface CombatComponent {
    /** 装备武器（含伤害 / 远程弹道数值覆写） */
    weapon: WeaponConfig
    /**
     * 副手武器运行时（单持 / 双持时装备；双手共持时挂背；undefined = 无副手武器）。
     * 副手不携带独立攻击链：双持连段由**主手武器类**的 `dual_wield` 链驱动，
     * 副手只提供外观、命中箱与伤害 / 击退数值（与主手同类，数值可能因模型覆写不同）。
     */
    offhand: WeaponRuntime | undefined
    /** 攻击链（武器固有段定义 + 起手段冷却覆写）；换武器时由 `setCombatWeapon` 同步更新 */
    attacks: WeaponAttacks

    /** 段冷却剩余（秒）：段 id → 剩余时间（仅非 0 冷却的起手段写入） */
    readonly segmentCooldowns: Map<string, number>

    /** 当前攻击段（attacking 期间有效；未攻击时 undefined） */
    activeSegment: AttackSegment | undefined
    /** 缓冲的下一段（段播完由段转换 / 异键起手解析消费） */
    bufferedSegment: AttackSegment | undefined

    attackActive: boolean
    /** 当前段累计时间（动作 + 恢复全程，秒） */
    attackTimer: number
    /**
     * 当前段的**瞄准方向**（期望朝向，世界水平向量）：
     * 玩家 = 相机前方、AI = 战斗目标方向；远程攻击期间角色据此转向，弹道则取自真实武器朝向（`muzzleDir`）。
     */
    attackDirX: number
    attackDirZ: number
    /**
     * 远程武器枪口当前**世界朝向**（水平单位向量）：由 `world.ts` 每帧从武器骨骼（本地 +Y）采样，
     * 发射时作为弹道初始方向。零向量表示无武器朝向数据（回退到瞄准方向）。
     */
    muzzleDirX: number
    muzzleDirZ: number
    attackedTargets: Set<number>

    /** 当前段阶段索引（0-based），attacking meta-state 推进 */
    phaseIndex: number
    /** 当前阶段已用时间（秒） */
    phaseTimer: number

    /**
     * 玩家蓄力值（0~1）：按住蓄力键期间按段 `chargeFullTime` 累积，段入场清零；
     * 发射时按武器的 `charge` 曲线缩放弹道与伤害。AI 不蓄力，恒 0。
     */
    attackCharge: number
    /** 本帧是否停在蓄力锚点阶段（冻结姿态）：为 true 时远程执行器不发射 */
    attackHolding: boolean
    /**
     * 本段蓄力是否已释放（视为**结束蓄力**）：抬手 / 拉弓蓄力一旦松开即置位，
     * 之后不再接受蓄力保持（防止「松开再按住」反复续蓄、蓄力值一段段增长）；
     * 段入场（`enterAttackSegment`）清零。
     */
    chargeCommitted: boolean
    /** 当前段已施加的冲击条数（`AttackSegment.impulses` 的消费索引；段入场清零） */
    impulsesFired: number

    /** 是否被标记为受击硬直 */
    pendingFlinch: boolean
    /** 本次硬直持续时间（秒）：由受击冲击力决定（轻/中 = `FLINCH_DURATION`、重 = `HEAVY_FLINCH_DURATION`），flinching 状态读取 */
    flinchDuration: number
    /** 受击保护剩余时间（秒）：flinching 退出后的免硬直窗口，防止无限连段把目标永久锁在受击状态；伤害不受影响 */
    flinchImmunityTimer: number

    /* ── 韧性 / 冲击反应 ── */

    /** 当前韧性值：受击按 `poiseDamage` 扣除，延迟后逐帧回充；归零触发倒地 */
    poise: number
    /** 韧性上限基础值（角色固有，不含装备加成） */
    basePoiseMax: number
    /** 有效韧性上限 = 基础值 + 装备韧性加成（`setCombatEquipment` 统一重算） */
    poiseMax: number
    /** 受击后停止回充的剩余延迟（秒）：> 0 时暂停回充，逐帧递减 */
    poiseRegenDelayTimer: number
    /** 停止回充延迟时长（秒，角色属性） */
    poiseRegenDelay: number
    /** 延迟结束后每秒回充的韧性值（角色属性） */
    poiseRegenPerSec: number
    /** 倒地状态持续时间（秒，角色属性） */
    knockdownDuration: number
    /** 起身状态持续时间（秒，角色属性；结束时韧性回满） */
    getUpDuration: number
    /** 是否被标记为受击倒地（由受击结算置位，knockdown 状态消费后清零） */
    pendingKnockdown: boolean
    /**
     * 倒地 / 起身无敌剩余时间（秒）：> 0 时 `applyDamage` 完全免疫伤害与击退
     * （倒地与起身期间不可被再次打击），由对应状态逐帧写入 / 退出清零。
     */
    hitImmunityTimer: number

    /**
     * 最近一次受击的冲击方向（世界水平单位向量，来源 → 受击者；无记录为 0,0）：
     * 由伤害事件携带（近战 = 武器 → 目标、远程 = 弹丸 → 目标、爆炸 = 爆心 → 目标），
     * 死亡 state 用它决定倒地方向。
     */
    lastHitDirX: number
    lastHitDirZ: number

    /** 翻滚技能（移动技能，属角色能力而非武器；冷却挡起手，中段无敌帧） */
    rollSkill: RollSkillRuntime
    /**
     * 无敌帧剩余时间（秒）：> 0 时 `applyDamage` 完全免疫伤害且不触发任何受击回调；
     * 由 rolling 状态在无敌窗口内逐帧写入，退出状态清零（world 逐帧递减仅作安全网）。
     */
    invincibleTimer: number

    faction: Faction
    attackTendency: AttackTendency
    tendencyConfig: TendencyConfig
    health: number
    maxHealth: number
    isDead: boolean

    /** 基础防御（角色固有，存档持久化） */
    baseDefense: DefenseProfile
    /** 基础攻击加成（角色固有，存档持久化；逐类别，攻击时与武器类别匹配才计入伤害） */
    baseAttack: DamageTypeProfile
    /** 装备的护甲（槽位 → 护甲 id；缺省 = 空槽） */
    armor: ArmorLoadout
    /** 装备的肢体组件（槽位 → 肢体 id；缺省 = 默认人类肢体，纯外观 + 数值） */
    limb: LimbLoadout
    /** 有效防御 = 基础防御 + 各护甲与肢体之和；`setCombatEquipment` 统一重算，applyDamage 按伤害事件类别取用 */
    defense: DefenseProfile
    /** 有效攻击加成 = 基础攻击 + 各护甲与肢体之和（攻击时与武器类别匹配才计入伤害） */
    attackBonus: DamageTypeProfile
    /** 装备提供的移速乘数（多件相乘，1 = 无修正；`moveSpeedOf` 与基础移速相乘） */
    moveSpeedMultiplier: number

    /* ── 格挡 / 盾牌 ── */

    /**
     * 当前盾牌格挡配置（主手盾优先，其次副手盾；无盾 = undefined）。
     * 由 `updateShieldBlock` 在装备（武器 / 副手）变更时同步，供格挡状态、盾碰撞体与减免结算读取。
     */
    block: ShieldBlockConfig | undefined
    /** 格挡槽当前值（0 ~ `block.guardMax`；无盾 = 0）：被挡命中扣除，归零触发破防 */
    guard: number
    /** 是否正在举盾格挡（`blocking` 状态进入 / 退出时写入，供盾碰撞体与判定使用） */
    blocking: boolean
    /** 本帧格挡输入（逐帧写入，供状态机守卫；玩家由输入路由写入，AI 由 AI 注入） */
    blockHeld: boolean

    readonly damageModifiers: readonly DamageModifier[]

    onDamageTaken: ((amount: number, event: DamageEvent) => void) | null
    onDamageDealt: ((amount: number) => void) | null
    onDeath: ((sourceId?: number, hitHurtBlocks?: readonly string[]) => void) | null
}

/**
 * 换装/数值覆写变更：整体替换武器运行时（攻击链同步跟随）。
 * `holdMode` 供盾牌来源重解析：双手共持时副手武器挂背、其盾不再计为可用盾。
 */
export const setCombatWeapon = (c: CombatComponent, runtime: WeaponRuntime, holdMode?: HoldMode): void => {
    c.weapon = runtime.weapon
    c.attacks = runtime.attacks
    updateShieldBlock(c, holdMode)
}

/** 变更副手武器（undefined = 卸下；双持可用性判定见 world.ts 的 setHoldMode） */
export const setCombatOffhand = (c: CombatComponent, runtime: WeaponRuntime | undefined, holdMode?: HoldMode): void => {
    c.offhand = runtime
    updateShieldBlock(c, holdMode)
}

/** 取当前盾牌格挡槽上限（无盾 = 0） */
export const guardMaxOf = (c: CombatComponent): number => c.block?.guardMax ?? 0

/**
 * 解析当前装备的盾牌格挡配置（主手盾优先，其次副手盾）并写入 `c.block`，
 * 同时把 `guard` 夹到 `[0, 上限]`（卸下 / 换更小盾时安全收敛，无盾则归零）。
 * 装备（主手 / 副手）或持握模式变更后必须调用，保证格挡状态与盾碰撞体读取到一致数据。
 * `holdMode === 'two_handed'` 时副手武器挂背、其盾不参与格挡（仅主手盾仍有效）。
 */
export const updateShieldBlock = (c: CombatComponent, holdMode?: HoldMode): void => {
    const mainBlock = c.weapon.type === 'melee' ? c.weapon.block : undefined
    const offhandActive = holdMode !== 'two_handed'
    const offBlock = offhandActive && c.offhand !== undefined && c.offhand.weapon.type === 'melee' ? c.offhand.weapon.block : undefined
    const previous = c.block
    c.block = mainBlock ?? offBlock
    const max = c.block?.guardMax ?? 0
    if (c.block !== previous) {
        /* 换盾 / 装盾：格挡槽回满；卸盾：归零 */
        c.guard = max
    } else if (c.guard > max) {
        c.guard = max
    }
}

/**
 * 变更基础防御 / 基础攻击 / 护甲 / 肢体：校验装备表并重算有效防御、有效攻击加成与移速乘数
 * （未知 id 安全回退空槽，不抛错）。肢体 / 基础攻击缺省（undefined）表示保持原值不变。
 */
export const setCombatEquipment = (
    c: CombatComponent,
    baseDefense: DefenseProfile,
    armor: ArmorLoadout,
    limb?: LimbLoadout,
    baseAttack?: DamageTypeProfile,
): void => {
    c.baseDefense = baseDefense
    c.armor = armor
    if (limb !== undefined) c.limb = limb
    if (baseAttack !== undefined) c.baseAttack = baseAttack
    const resolvedArmor = resolveArmorLoadout(c.armor)
    const resolvedLimb = resolveLimbLoadout(c.limb)
    c.defense = totalDefenseOf(baseDefense, resolvedArmor, resolvedLimb)
    c.attackBonus = addDamageProfiles(c.baseAttack, totalAttackOf(resolvedArmor, resolvedLimb))
    c.moveSpeedMultiplier = totalMoveSpeedOf(resolvedArmor, resolvedLimb)
    c.poiseMax = c.basePoiseMax + totalPoiseOf(resolvedArmor, resolvedLimb)
    if (c.poise > c.poiseMax) c.poise = c.poiseMax
}

/** 创建初始化的战斗组件（武器运行时 + 阵营/倾向/血量 + 韧性属性） */
export const createCombatComponent = (
    runtime: WeaponRuntime,
    faction: Faction,
    attackTendency: AttackTendency,
    tendencyConfig: TendencyConfig,
    maxHealth: number,
    attrs: CombatAttributes = {},
): CombatComponent => {
    const basePoiseMax = attrs.poiseMax ?? DEFAULT_POISE_MAX
    const combat: CombatComponent = {
        weapon: runtime.weapon,
        offhand: undefined,
        attacks: runtime.attacks,
        segmentCooldowns: new Map(),
        activeSegment: undefined,
        bufferedSegment: undefined,
        attackActive: false,
        attackTimer: 0,
        attackDirX: 0,
        attackDirZ: 1,
        muzzleDirX: 0,
        muzzleDirZ: 0,
        attackedTargets: new Set(),
        phaseIndex: 0,
        phaseTimer: 0,
        attackCharge: 0,
        attackHolding: false,
        chargeCommitted: false,
        impulsesFired: 0,
        pendingFlinch: false,
        flinchDuration: FLINCH_DURATION,
        flinchImmunityTimer: 0,
        poise: basePoiseMax,
        basePoiseMax,
        poiseMax: basePoiseMax,
        poiseRegenDelayTimer: 0,
        poiseRegenDelay: attrs.poiseRegenDelay ?? DEFAULT_POISE_REGEN_DELAY,
        poiseRegenPerSec: attrs.poiseRegenPerSec ?? DEFAULT_POISE_REGEN_PER_SEC,
        knockdownDuration: attrs.knockdownDuration ?? DEFAULT_KNOCKDOWN_DURATION,
        getUpDuration: attrs.getUpDuration ?? DEFAULT_GET_UP_DURATION,
        pendingKnockdown: false,
        hitImmunityTimer: 0,
        lastHitDirX: 0,
        lastHitDirZ: 0,
        rollSkill: createRollSkillRuntime(),
        invincibleTimer: 0,
        faction,
        attackTendency,
        tendencyConfig,
        health: maxHealth,
        maxHealth,
        isDead: false,
        baseDefense: ZERO_PROFILE,
        baseAttack: ZERO_PROFILE,
        armor: {},
        limb: {},
        defense: ZERO_PROFILE,
        attackBonus: ZERO_PROFILE,
        moveSpeedMultiplier: 1,
        block: undefined,
        guard: 0,
        blocking: false,
        blockHeld: false,
        damageModifiers: [],
        onDamageTaken: null,
        onDamageDealt: null,
        onDeath: null,
    }
    updateShieldBlock(combat)
    return combat
}
