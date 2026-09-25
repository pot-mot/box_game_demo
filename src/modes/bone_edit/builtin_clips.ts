import type {BoneAnimationClip} from '../../skeleton/anim/types.ts'
import {createTargetIdMapping, remapClipTargets} from '../../skeleton/anim/retarget.ts'
import {getBaseClip} from '../../entity/character/appearance/clips/base_clips.ts'
import {getAttackClip} from '../../entity/character/appearance/clips/attack_clips.ts'
import {WEAPON_GRIP_POSES} from '../../entity/character/appearance/constants.ts'
import {orderedSegments, segmentDisplayName, type AttackSegment} from '../../character/weapon/attack_chain.ts'
import {ALL_WEAPON_PRESETS, type WeaponConfig} from '../../character/weapon/catalog.ts'

/** 基础状态键（与姿态采样器状态一致） */
type BaseState = Parameters<typeof getBaseClip>[0]

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
    /** 中文显示名，同时作为载入动画库后的 clip 名（全库唯一） */
    readonly label: string
    readonly clip: BoneAnimationClip
    /** 攻击条目所属武器 id（编辑器据此自动装备武器；基础状态条目为 undefined） */
    readonly weaponId?: string
    /** 攻击条目对应的武器段 id（用于查该段是否双手持握；基础状态条目为 undefined） */
    readonly segmentId?: string
    /**
     * 基础状态持械标记（仅 待机/行走 的持械-空手变体携带）：
     * false = 空手变体（编辑器「自动」模式卸下武器）；true = 持械变体（保留当前武器）。
     */
    readonly weaponHeld?: boolean
}

/** 条目来源（武器/段/持械标记；基础状态与攻击动作各用其一） */
interface EntryOrigin {
    readonly weaponId?: string
    readonly segmentId?: string
    readonly weaponHeld?: boolean
}

/* ── 分组（顺序即下拉 optgroup 顺序） ── */

const GROUP_BASE = '基础状态'
const GROUP_MELEE = '近战攻击'
const GROUP_RANGED = '远程攻击'

/** 内置动作全部分组（按展示顺序） */
export const BUILTIN_CLIP_GROUP_ORDER: readonly string[] = [GROUP_BASE, GROUP_MELEE, GROUP_RANGED]

/* ── 关节 id 重定向 ── */

/**
 * 生产角色 clip 的关节 id → 编辑器预设骨架关节 id：
 * 角色模型的根 Group 名为 `group`，预设骨架的根关节名为 `root`，其余关节同名同构
 * （关节静止局部位置由同一套 render 比例常量推导，见 base_clips.ts 与 entity/skeleton/preset.ts）。
 */
const CHARACTER_TARGET_ALIASES: Readonly<Record<string, string>> = {group: 'root'}

const TARGET_MAPPING = createTargetIdMapping(CHARACTER_TARGET_ALIASES)

/** 组装条目：重定向关节 id 并把 clip 名改为显示名（记录对象与生产缓存共享，不就地修改） */
const entryOf = (
    id: string,
    group: string,
    label: string,
    source: BoneAnimationClip,
    origin: EntryOrigin = {},
): BuiltinClipEntry => ({
    id,
    group,
    label,
    clip: {...remapClipTargets(source, TARGET_MAPPING), name: label},
    weaponId: origin.weaponId,
    segmentId: origin.segmentId,
    weaponHeld: origin.weaponHeld,
})

/* ── 基础状态（待机/行走/跳跃/下落/死亡/冲刺/受击） ── */

const BASE_STATE_LABELS: Record<BaseState, string> = {
    idle: '待机',
    walking: '行走',
    jumping: '跳跃',
    falling: '下落',
    dying: '死亡',
    dashing: '冲刺',
    flinching: '受击硬直',
}

/** 基础状态展示顺序（待机 → 移动 → 受击/倒地） */
const BASE_STATE_ORDER: readonly BaseState[] = ['idle', 'walking', 'jumping', 'falling', 'dashing', 'flinching', 'dying']

/** 姿态公式区分持械/空手的状态（其余状态两种变体姿态相同，只列出一份） */
const WEAPON_VARIANT_STATES: readonly BaseState[] = ['idle', 'walking']

const buildBaseEntries = (): BuiltinClipEntry[] => {
    const entries: BuiltinClipEntry[] = []
    for (const state of BASE_STATE_ORDER) {
        const hasWeaponVariants = WEAPON_VARIANT_STATES.includes(state)
        const variants = hasWeaponVariants
            ? [{held: false, suffix: '（空手）'}, {held: true, suffix: '（持械）'}]
            : [{held: false, suffix: ''}]
        for (const {held, suffix} of variants) {
            /** 下落取水平速度 0 档（腿张开量的基准姿态），其余状态与速度无关 */
            entries.push(entryOf(
                `state/${state}${held ? '_held' : ''}`,
                GROUP_BASE,
                `${BASE_STATE_LABELS[state]}${suffix}`,
                getBaseClip(state, held, 0),
                /* 仅持械/空手变体带标记：空手变体在编辑器里卸下武器，持械变体保留当前武器；
                 * 其余基础状态（跳跃/下落/死亡/冲刺/受击）无持械语义 → 保留当前武器 */
                hasWeaponVariants ? {weaponHeld: held} : {},
            ))
        }
    }
    return entries
}

/* ── 攻击动作（全部武器 × 其武器模组声明的攻击段） ── */

/**
 * 攻击 clip 生成参数与生产装配一致（`appearance/system.ts`）：
 * 阶段/时长/倾斜角取武器模组的段定义，握持前倾取武器静态握持姿态 rx。
 */
const buildAttackSource = (weapon: WeaponConfig, segment: AttackSegment): BoneAnimationClip => getAttackClip({
    segmentId: segment.id,
    duration: segment.duration,
    recovery: segment.recovery,
    phases: segment.phases,
    tilt: segment.swingTilt ?? 0,
    gripTilt: WEAPON_GRIP_POSES[weapon.mesh.id].rx,
})

/**
 * 攻击条目：逐武器枚举其攻击段（顺序 = `orderedSegments`：轻1 → 轻2 → 重1 → 重2，
 * 条件起手变体段接在所属攻击键末尾），故「同链 1、2 段相邻、轻链在重链之前」由武器链数据本身保证。
 * 单段武器（远程）标签只用武器名。
 */
const buildAttackEntries = (): BuiltinClipEntry[] =>
    ALL_WEAPON_PRESETS.flatMap(weapon => {
        const segments = orderedSegments(weapon.attacks)
        return segments.map(segment => entryOf(
            segment.id,
            weapon.type === 'melee' ? GROUP_MELEE : GROUP_RANGED,
            segments.length > 1 ? `${weapon.name} · ${segmentDisplayName(segment)}` : weapon.name,
            buildAttackSource(weapon, segment),
            {weaponId: weapon.id, segmentId: segment.id},
        ))
    })

/* ── 动画库（惰性构建并缓存：主入口静态导入本模块，构建成本推迟到进入骨骼动画模式） ── */

let cachedLibrary: readonly BuiltinClipEntry[] | undefined

/** 全部内置动作（基础状态 9 项 + 全部武器的攻击段） */
export const getBuiltinClips = (): readonly BuiltinClipEntry[] => {
    if (cachedLibrary === undefined) {
        cachedLibrary = [...buildBaseEntries(), ...buildAttackEntries()]
    }
    return cachedLibrary
}

/** 按 id 查找内置动作条目 */
export const findBuiltinClip = (id: string): BuiltinClipEntry | undefined =>
    getBuiltinClips().find(entry => entry.id === id)
