import type {BoneAnimationClip} from '../../skeleton/anim/types.ts'
import type {BaseClipState} from '../../character/state_machine/types.ts'
import {orderedSegments, segmentDisplayName, type AttackSegment} from '../../character/weapon/attack_chain.ts'
import {weaponAttacksOf, weaponDisplayName, weaponsOfForm} from '../../character/weapon/catalog.ts'
import {HUMANOID_BODY_FORM_ID, bodyFormOf} from '../../entity/character/body_form/index.ts'
import {DEFAULT_FORM_CLIP_VARIANT} from '../../entity/character/body_form/common/skeleton_animation/form_animation.ts'
import {HOLD_MODE_LABELS, type HoldMode} from '../../character/weapon/hold_mode.ts'
import {translate, type StringLocaleKey} from '../../i18n/index.ts'

/** 基础状态键（与姿态采样器状态一致） */
type BaseState = BaseClipState

/**
 * 内置动作条目：骨骼动画编辑模式动画列表中的「已有动作」来源。
 * clip 由生产生成器（基础状态 / 攻击）产出并重定向到编辑器预设骨架，**与生产共用同一份缓存对象**：
 * 载入动画库时必须深拷贝（`AnimationStore.importClip`），编辑副本不回写生产缓存。
 */
export interface BuiltinClipEntry {
    /** 稳定标识（动画下拉 option 值） */
    readonly id: string
    /** 分组名（动画下拉 optgroup） */
    readonly group: string
    /** 显示名（基础状态随语言本地化；攻击段沿用武器/段名），同时作为载入动画库后的 clip 名（全库唯一） */
    readonly label: string
    /** 按当前语言重算显示名（语言切换时刷新下拉文案；不影响 `label` / `clip.name` 标识） */
    readonly labelOf: () => string
    readonly clip: BoneAnimationClip
    /** 攻击条目所属武器 id（编辑器据此自动装备武器；基础状态条目为 undefined） */
    readonly weaponId?: string
    /** 攻击条目对应的武器段 id（基础状态条目为 undefined） */
    readonly segmentId?: string
    /** 攻击条目所在攻击链的持握模式（编辑器据此决定双手贴合 / 副手装备；基础状态条目为 undefined） */
    readonly holdMode?: HoldMode
    /**
     * 基础状态持械标记（仅 待机/行走 的持械-空手变体携带）：
     * false = 空手变体（编辑器「自动」模式卸下武器）；true = 持械变体（保留当前武器）。
     */
    readonly weaponHeld?: boolean
}

/** 条目来源（武器/段/持握模式/持械标记；基础状态与攻击动作各用其一） */
interface EntryOrigin {
    readonly weaponId?: string
    readonly segmentId?: string
    readonly holdMode?: HoldMode
    readonly weaponHeld?: boolean
}

/* ── 分组（顺序即下拉 optgroup 顺序） ── */

/* 分组 id 为稳定标识（用于分组过滤与测试），展示文案在 timeline_library 中经键本地化 */
const GROUP_BASE = '基础状态'
const GROUP_MELEE = '近战攻击'
const GROUP_RANGED = '远程攻击'

/** 内置动作全部分组（按展示顺序） */
export const BUILTIN_CLIP_GROUP_ORDER: readonly string[] = [GROUP_BASE, GROUP_MELEE, GROUP_RANGED]

/** 分组 id → 展示文案键 */
const GROUP_LABEL_KEYS: Record<string, StringLocaleKey> = {
    [GROUP_BASE]: 'bone_edit.group.base',
    [GROUP_MELEE]: 'bone_edit.group.melee',
    [GROUP_RANGED]: 'bone_edit.group.ranged',
}

/** 取内置动作分组展示文案键（未知分组回退基础状态） */
export const builtinGroupLabelKey = (group: string): StringLocaleKey =>
    GROUP_LABEL_KEYS[group] ?? 'bone_edit.group.base'

/* ── 关节 id ── */

/**
 * 生产角色 clip 与编辑器预设骨架使用**同一套关节 id**（根关节统一为 `root`，
 * 静止局部位置由同一套 render 比例常量推导，见 base_clips.ts 与 forms/humanoid/skeleton.ts），
 * 因此无需任何目标 id 重定向。
 */

/** 组装条目：把 clip 名改为显示名（记录对象与生产缓存共享，不就地修改） */
const entryOf = (
    id: string,
    group: string,
    label: string,
    source: BoneAnimationClip,
    origin: EntryOrigin = {},
    labelOf?: () => string,
): BuiltinClipEntry => ({
    id,
    group,
    label,
    labelOf: labelOf ?? (() => label),
    clip: {...source, name: label},
    weaponId: origin.weaponId,
    segmentId: origin.segmentId,
    holdMode: origin.holdMode,
    weaponHeld: origin.weaponHeld,
})

/* ── 基础状态（待机/行走/跳跃/下落/死亡/翻滚/受击） ── */

const BASE_STATE_LABELS: Record<BaseState, StringLocaleKey> = {
    idle: 'bone_edit.state.idle',
    walking: 'bone_edit.state.walking',
    jumping: 'bone_edit.state.jumping',
    falling: 'bone_edit.state.falling',
    swimming: 'bone_edit.state.swimming',
    floating: 'bone_edit.state.floating',
    dying: 'bone_edit.state.dying',
    rolling: 'bone_edit.state.rolling',
    flinching: 'bone_edit.state.flinching',
    interacting: 'bone_edit.state.interacting',
    knockdown: 'bone_edit.state.knockdown',
    getting_up: 'bone_edit.state.getting_up',
    blocking: 'bone_edit.state.blocking',
    guard_broken: 'bone_edit.state.guard_broken',
}

/** 基础状态展示优先级：Record 保证新增状态漏配时编译失败（待机 → 移动 → 受击/倒地） */
const BASE_STATE_PRIORITY: Record<BaseState, number> = {
    idle: 0, walking: 1, jumping: 2, falling: 3, swimming: 4, floating: 5,
    rolling: 6, flinching: 7, dying: 8, knockdown: 9, getting_up: 10,
    interacting: 11, blocking: 12, guard_broken: 13,
}

/** 基础状态展示顺序（导出供测试校验覆盖全部 `BASE_CLIP_STATES`） */
export const BASE_STATE_ORDER: readonly BaseState[] = (Object.keys(BASE_STATE_PRIORITY) as BaseState[])
    .sort((a, b) => BASE_STATE_PRIORITY[a] - BASE_STATE_PRIORITY[b])

/** 姿态公式区分持械/空手的状态（其余状态两种变体姿态相同，只列出一份） */
const WEAPON_VARIANT_STATES: readonly BaseState[] = ['idle', 'walking']

/** 体形 clip 来源：统一取自 `BodyForm.animation`，模式层不再感知具体体形。 */
interface ClipProvider {
    readonly attackClip: (segment: AttackSegment) => BoneAnimationClip
    readonly baseClip: (state: BaseState, held: boolean) => BoneAnimationClip
    /** 基础状态是否有「持械 / 空手」两种变体 */
    readonly weaponVariants: boolean
}

const providerOf = (formId: string): ClipProvider => {
    const form = bodyFormOf(formId)
    return {
        attackClip: segment => form.animation.attackClip(segment, DEFAULT_FORM_CLIP_VARIANT),
        baseClip: (state, held) => form.animation.baseClip(state, {
            ...DEFAULT_FORM_CLIP_VARIANT,
            weaponHeld: held,
        }),
        weaponVariants: form.animation.weaponVariants === true,
    }
}

const buildBaseEntries = (provider: ClipProvider): BuiltinClipEntry[] => {
    const entries: BuiltinClipEntry[] = []
    for (const state of BASE_STATE_ORDER) {
        const hasWeaponVariants = provider.weaponVariants && WEAPON_VARIANT_STATES.includes(state)
        const variants: readonly {held: boolean; suffixKey?: StringLocaleKey}[] = hasWeaponVariants
            ? [
                {held: false, suffixKey: 'bone_edit.state.variant_bare'},
                {held: true, suffixKey: 'bone_edit.state.variant_held'},
            ]
            : [{held: false}]
        for (const {held, suffixKey} of variants) {
            /** 下落取水平速度 0 档（腿张开量的基准姿态），其余状态与速度无关 */
            const labelOf = (): string => `${translate(BASE_STATE_LABELS[state])}${suffixKey !== undefined ? translate(suffixKey) : ''}`
            entries.push(entryOf(
                `state/${state}${held ? '_held' : ''}`,
                GROUP_BASE,
                labelOf(),
                provider.baseClip(state, held),
                /* 仅持械/空手变体带标记：空手变体在编辑器里卸下武器，持械变体保留当前武器；
                 * 其余基础状态（跳跃/下落/死亡/翻滚/受击）无持械语义 → 保留当前武器 */
                hasWeaponVariants ? {weaponHeld: held} : {},
                labelOf,
            ))
        }
    }
    return entries
}

/* ── 攻击动作（全部武器 × 其武器模组声明的攻击段） ── */

/**
 * 攻击条目：逐武器枚举其**全部持握模式**的攻击段（顺序 = `orderedSegments`：轻1 → 轻2 → 重1 → 重2，
 * 条件起手变体段接在所属攻击键末尾），故「同链 1、2 段相邻、轻链在重链之前」由武器链数据本身保证。
 * 多模式武器（近战）标签带持握模式名以保持全库唯一；单段武器（远程）标签只用武器名。
 * 攻击 clip 统一由 `BodyForm.animation.attackClip` 提供（人形 / 生物各自作者数据或公式回退）。
 */
const buildAttackEntries = (formId: string, provider: ClipProvider): BuiltinClipEntry[] => {
    /* 吐息是独立装备槽，不属于 `bodyForm.weapons`；编辑器仍应能直接预览 */
    const weapons = [...weaponsOfForm(formId), ...(bodyFormOf(formId).breathModules ?? [])]
    return weapons.flatMap(weapon => {
        const multiMode = weapon.holdModes.length > 1
        return weapon.holdModes.flatMap(holdMode => {
            const segments = orderedSegments(weaponAttacksOf(weapon, holdMode))
            return segments.map(segment => {
                const labelOf = (): string => segments.length > 1
                    ? `${weaponDisplayName(weapon)} · ${multiMode ? `${translate(HOLD_MODE_LABELS[holdMode])} · ` : ''}${segmentDisplayName(segment)}`
                    : weaponDisplayName(weapon)
                /* 吐息段在运行时由 `composeClawAndBreath` 标记 attackWeaponId；编辑器直接预览时补上，
                 * 避免把吐息段误当作近战段生成 hitbox 事件轨 */
                const source = weapon.id.startsWith('breath_')
                    ? {...segment, attackWeaponId: weapon.id}
                    : segment
                return entryOf(
                    segment.id,
                    weapon.type === 'melee' ? GROUP_MELEE : GROUP_RANGED,
                    labelOf(),
                    provider.attackClip(source),
                    {weaponId: weapon.id, segmentId: segment.id, holdMode},
                    labelOf,
                )
            })
        })
    })
}

/* ── 动画库（按体形惰性构建并缓存：主入口静态导入本模块，构建成本推迟到进入骨骼动画模式） ── */

const cachedLibraries = new Map<string, readonly BuiltinClipEntry[]>()

/** 指定体形的内置动作：统一从该体形的 `animation` provider 生成 */
export const getBuiltinClips = (formId: string = HUMANOID_BODY_FORM_ID): readonly BuiltinClipEntry[] => {
    const cached = cachedLibraries.get(formId)
    if (cached !== undefined) return cached
    const provider = providerOf(formId)
    const library = [...buildBaseEntries(provider), ...buildAttackEntries(formId, provider)]
    cachedLibraries.set(formId, library)
    return library
}

/** 按 id 查找指定体形的内置动作条目 */
export const findBuiltinClip = (id: string, formId: string = HUMANOID_BODY_FORM_ID): BuiltinClipEntry | undefined =>
    getBuiltinClips(formId).find(entry => entry.id === id)
