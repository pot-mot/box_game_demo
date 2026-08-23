import {Group, Vector3, Mesh, Sprite} from 'three'
import type {Material, Scene} from 'three'
import {createCharacterModel} from '../../entity/character/appearance/model.ts'
import {createAppearanceSystem} from '../../entity/character/appearance/system.ts'
import type {AnimationContext, CharacterModel} from '../../entity/character/appearance/types.ts'
import type {AppearanceSystem} from '../../entity/character/appearance/system.ts'
import type {WeaponTrail} from '../../entity/character/appearance/weapon_trail.ts'
import {createWeaponTrail} from '../../entity/character/appearance/weapon_trail.ts'
import type {NameLabel} from './label.ts'
import {resolvePhases, phaseDurationOf} from '../../character/combat/attack_phases.ts'
import type {AttackPhaseName} from '../../character/combat/attack_phases.ts'
import type {SkillSlot} from '../../character/combat/skill_types.ts'
import {MELEE_CHAIN_SLOTS} from '../../character/combat/melee_skill.ts'
import {
    ACTOR_JUMP_HEIGHT,
    ACTOR_SCALE,
    ACTOR_SPEED,
    CHAIN_PAUSE_AFTER_POS,
    CHAIN_PAUSE_IDLE,
    DIMMED_OPACITY,
    IDLE_LEAD,
    IDLE_TRAIL,
} from './constants.ts'

/** 本击衔接方式标签（供人工审查连段推进路径） */
export const LINK_LABELS = ['首次起手', '段内推进', '重新起手', '—'] as const
export type LinkLabel = typeof LINK_LABELS[number]

/** 面板展示用的单个技能槽计时快照（与 play HUD 三计时器同语义） */
export interface SkillTimerStatus {
    readonly label: string
    readonly duration: number
    readonly recovery: number
    readonly cooldown: number
    /** 动作已进行时间（秒）；-1 = 本段未在播动作段 */
    readonly actionElapsed: number
    /** 恢复已进行时间（秒）；-1 = 未进入恢复段 */
    readonly recoveryElapsed: number
    /** 冷却剩余时间（秒，触发时刻满值递减） */
    readonly cooldownRemaining: number
}

/** 段显示名：近战链段取段后缀（light_1 等），其余技能取 id 尾段（shot 等） */
const slotLabel = (id: string): string => {
    for (const slot of MELEE_CHAIN_SLOTS) {
        if (id.endsWith(`_${slot}`)) return slot
    }
    const idx = id.lastIndexOf('_')
    return idx >= 0 ? id.slice(idx + 1) : id
}

/** 面板展示用的角色运行状态快照 */
export interface ActorStatus {
    readonly id: number
    readonly skillId: string
    readonly skillName: string
    readonly weaponName: string
    readonly isMelee: boolean
    readonly mode: 'idle' | 'attacking'
    /** 当前段（1 起，idle 时为下一段的段号） */
    readonly hitNumber: number
    readonly totalHits: number
    /** 当前挥砍倾斜角（rad，远程恒 0） */
    readonly swingTilt: number
    /** 当前阶段名（idle = 'idle'，全部阶段完成 = 'done'） */
    readonly phaseName: AttackPhaseName | 'idle' | 'done'
    /** 当前阶段进度 0-1 */
    readonly phaseProgress: number
    /** 当前段总进度 0-1 */
    readonly attackProgress: number
    /** 本段的衔接方式 */
    readonly link: LinkLabel
    /** 每技能槽一行的三计时器快照（动作/恢复/冷却，与 play HUD 一致） */
    readonly slotTimers: readonly SkillTimerStatus[]
}

export interface ShowcaseActor {
    readonly id: number
    readonly anchor: Group
    readonly skillName: string
    readonly weaponName: string
    /** 推进一帧：调度时间线 + 注入动画上下文 + 更新刀光 */
    update: (dt: number) => void
    status: () => ActorStatus
    /** 挂载头顶名称标签（label 资源句柄由本驱动器持有，随 dispose 统一回收） */
    attachLabel: (label: NameLabel) => void
    /** 聚焦模式下变暗/恢复（遍历材质透明度，含武器、标签与刀光） */
    setDimmed: (on: boolean) => void
    dispose: () => void
}

export interface ShowcaseActorInit {
    readonly id: number
    readonly scene: Scene
    /** 技能槽：近战 = buildMeleeSkillSlots 的 4 槽，远程 = 单槽 */
    readonly slots: readonly SkillSlot[]
    readonly faction: number
    readonly x: number
    readonly z: number
    readonly skillName: string
    readonly weaponName: string
}

/** 刀尖世界坐标复用向量（逐角色顺序调用，无并发） */
const _tipVec = new Vector3()
/** 聚焦变暗前的材质状态快照（恢复时精确还原） */
interface MaterialSnapshot {
    readonly material: Material
    readonly opacity: number
    readonly transparent: boolean
}

/**
 * 展示角色驱动器。
 *
 * 数据流（与生产 physics/world.ts + character/state_machine/states/attacking.ts 逐段对应）：
 * 1. 时间线调度镜像 attackingHandler.update：attackTimer/phaseTimer 递增 →
 *    阶段推进（phaseDurationOf：动作阶段按 ratio 分摊 duration，recovery 取 config.recovery）→ 最终阶段完整播完时的段末推进
 *    （缓冲恒有值 → 重置计时切换下一段，不出 attacking 状态）→
 *    脚本播完或链间停顿 → idle。
 * 2. 近战演示脚本 [轻1, 轻2, 重1, 重2]：轻链两段连续推进 → 停顿（模拟松开攻击键）→
 *    重链两段连续推进 → 收尾待机 → 循环。段间衔接为"段末推进"（不再有 cancellable 中途取消）。
 * 3. 动画注入镜像 world.ts：AnimationContext 携带 attackSkillId，段切换触发动画键变化
 *    走快照混合（修复旧版段切换单帧姿态跳变）。
 * 4. 刀光镜像 world.ts：strike/release/spin 阶段激活，采样 weaponTip。
 *
 * 展示场景省略的部分（与生产差异）：物理速度缩放（moveSpeedMultiplier）、
 * 命中执行器、hitstop、hitbox——攻击中角色静止站立。冷却计时仅镜像展示（触发即挂、逐帧递减），
 * 不阻断脚本推进。
 */
export const createShowcaseActor = (init: ShowcaseActorInit): ShowcaseActor => {
    const {id, scene, slots, faction, x, z, skillName, weaponName} = init
    if (slots.length === 0) {
        throw new Error(`[showcase] actor ${id} 技能槽为空`)
    }
    const isMelee = slots[0].config.type === 'melee'
    /* 演示脚本：近战按 轻1→轻2→重1→重2 播完整双链，远程单槽单段 */
    const script: readonly number[] = isMelee ? [0, 2, 1, 3] : [0]
    const totalHits = script.length

    const model: CharacterModel = createCharacterModel(
        {speed: ACTOR_SPEED, jumpHeight: ACTOR_JUMP_HEIGHT, scale: ACTOR_SCALE},
        faction,
    )
    model.equipWeapon(slots[0].config.weapon.mesh)

    const anchor = new Group()
    anchor.position.set(x, 0, z)
    anchor.add(model.group)
    scene.add(anchor)

    const system: AppearanceSystem = createAppearanceSystem()
    /* 远程角色同样创建刀光 —— 对齐生产 world.ts：远程 release 阶段的拖尾同样存在，
     * 激活门控已在 applyAnimation 中按 strike/release/spin 阶段判断 */
    const trail: WeaponTrail = createWeaponTrail(scene)

    /* —— 驱动状态（字段语义与生产 CombatComponent 同名一一对应） —— */
    let mode: 'idle' | 'attacking' = 'idle'
    let stateTime = 0
    let idleDuration = IDLE_LEAD
    let attackTimer = 0
    let phaseTimer = 0
    let phaseIndex = 0
    let swingTilt = 0
    /** 当前脚本位置（0 起；段末推进/重新起链时移动） */
    let scriptPos = 0
    /** 本段衔接方式（进入攻击时取 pendingLink，段末推进直接覆盖） */
    let link: LinkLabel = '—'
    let pendingLink: LinkLabel = isMelee ? '首次起手' : '—'
    /** 双链播完，收尾待机结束后重置循环（scriptPos 归零重新起手） */
    let resetPending = false
    /** 每槽冷却剩余时间（镜像生产：段触发即挂自身冷却，逐帧递减；仅展示不挡推进） */
    const cooldownTimers: number[] = slots.map(() => 0)

    /** 当前段技能槽（script 位置 → 槽下标） */
    const currentSlot = (): SkillSlot => slots[script[scriptPos] ?? 0]

    /** 进入指定脚本位置的段 —— 镜像 attackingHandler.enter（省略物理 wakeUp/attackedTargets） */
    const enterSegment = (pos: number, nextLink: LinkLabel): void => {
        scriptPos = pos
        mode = 'attacking'
        stateTime = 0
        attackTimer = 0
        phaseIndex = 0
        phaseTimer = 0
        /* 段固有倾斜角 —— 与 attacking.enter 的 c.swingTilt = skill.swingTilt ?? 0 一致 */
        const config = currentSlot().config
        swingTilt = config.type === 'melee' ? (config.swingTilt ?? 0) : 0
        link = nextLink
        /* 触发即挂自身冷却（镜像生产起手 enter） */
        cooldownTimers[scriptPos] = config.cooldown
    }

    /** 攻击时间线 —— 镜像 attackingHandler.update 的调度部分（省略物理/位移缩放） */
    const advanceAttack = (dt: number): void => {
        /* 状态时长累加 —— 镜像生产 world.ts 传入 entity.stateMachine.stateTime 的累加语义：
         * enterSegment（状态切换）置 0、段末推进不重置；aim/spin 微颤与头部摆动依赖它 */
        stateTime += dt
        attackTimer += dt
        phaseTimer += dt

        const config = currentSlot().config
        const phases = resolvePhases(config.phases)

        /* 阶段推进（镜像 attacking.update 阶段调度） */
        if (phaseIndex < phases.length) {
            const phaseDuration = phaseDurationOf(phases[phaseIndex], config.duration, config.recovery)
            if (phaseTimer >= phaseDuration) {
                if (phaseIndex < phases.length - 1) {
                    phaseIndex++
                    phaseTimer = 0
                } else {
                    /* 最终阶段完整播完 */
                    phaseIndex = phases.length
                }
            }
        }

        /* 段末推进（镜像 attacking.update 的缓冲消费分支）：
         * 演示中缓冲恒有值（模拟玩家持续按键）→ 切换下一段、重置计时、取新段 tilt，不出 attacking 状态 */
        if (phaseIndex >= phases.length && scriptPos < totalHits - 1) {
            if (scriptPos === CHAIN_PAUSE_AFTER_POS && isMelee) {
                /* 轻链播完 → 停顿（模拟玩家松开攻击键）→ 重新起手段进重链 */
                mode = 'idle'
                stateTime = 0
                idleDuration = CHAIN_PAUSE_IDLE
                pendingLink = '重新起手'
                scriptPos++
                return
            }
            /* 同链段末推进：attackTimer/phaseIndex/phaseTimer 重置，stateTime 保留 */
            attackTimer = 0
            phaseTimer = 0
            phaseIndex = 0
            scriptPos++
            const nextConfig = currentSlot().config
            swingTilt = nextConfig.type === 'melee' ? (nextConfig.swingTilt ?? 0) : 0
            link = '段内推进'
            /* 链中段触发同样挂自身冷却（镜像生产段末推进） */
            cooldownTimers[scriptPos] = nextConfig.cooldown
            return
        }

        /* 收尾判定：脚本最后一段播完 → 进收尾待机，循环重置 */
        if (phaseIndex >= phases.length) {
            mode = 'idle'
            stateTime = 0
            idleDuration = IDLE_TRAIL
            resetPending = true
        }
    }

    /** 待机时间线：计时结束进入下一段（循环重置后重新起手） */
    const advanceIdle = (dt: number): void => {
        stateTime += dt
        if (stateTime >= idleDuration) {
            if (resetPending) {
                scriptPos = 0
                resetPending = false
                pendingLink = isMelee ? '首次起手' : '—'
            }
            enterSegment(scriptPos, pendingLink)
        }
    }

    /**
     * 动画注入 —— 镜像 world.ts 动画上下文装配：
     * 构造 AnimationContext（同名同语义，含 attackSkillId）→ system.update（动画键 = state:skillId，
     * 段切换触发快照混合）→ 刀光采样。
     */
    const applyAnimation = (dt: number): void => {
        const inAttacking = mode === 'attacking'
        const config = currentSlot().config
        const phases = resolvePhases(config.phases)
        const phaseDuration = phaseIndex < phases.length
            ? phaseDurationOf(phases[phaseIndex], config.duration, config.recovery)
            : 1
        const ctxPhaseName: AttackPhaseName | undefined = inAttacking && phaseIndex < phases.length
            ? phases[phaseIndex].name
            : undefined

        const ctx: AnimationContext = {
            stateTime,
            /* 展示场景站立攻击：速度恒 0（生产为物理体实时速度） */
            horizontalSpeed: 0,
            swingTilt,
            attackPhase: ctxPhaseName,
            attackPhaseProgress: phaseDuration > 0 ? phaseTimer / phaseDuration : 0,
            /* 总进度分母 = 动作时间 + 恢复时间（镜像 world.ts totalDuration） */
            attackTotalProgress: inAttacking && config.duration + config.recovery > 0 ? attackTimer / (config.duration + config.recovery) : 0,
            attackPhases: inAttacking ? phases : undefined,
            attackPhaseIndex: phaseIndex,
            attackSkillId: inAttacking ? config.id : undefined,
            attackDuration: config.duration,
            attackRecovery: config.recovery,
            weaponHeld: model.weaponMesh !== null,
        }
        system.update(dt, model, inAttacking ? 'attacking' : 'idle', ctx)

        const tip = model.weaponTip
        if (tip !== null) {
            tip.getWorldPosition(_tipVec)
            const trailActive = inAttacking
                && (ctxPhaseName === 'strike' || ctxPhaseName === 'release' || ctxPhaseName === 'spin')
            trail.update(dt, _tipVec, trailActive)
        } else {
            trail.update(dt, _tipVec, false)
        }
    }

    const update = (dt: number): void => {
        /* 冷却递减（镜像 world.ts 技能冷却循环） */
        for (let i = 0; i < cooldownTimers.length; i++) {
            cooldownTimers[i] = Math.max(0, cooldownTimers[i] - dt)
        }
        if (mode === 'attacking') {
            advanceAttack(dt)
        } else {
            advanceIdle(dt)
        }
        applyAnimation(dt)
    }

    const status = (): ActorStatus => {
        const config = currentSlot().config
        const phases = resolvePhases(config.phases)
        return {
            id,
            skillId: config.id,
            skillName,
            weaponName,
            isMelee,
            mode,
            hitNumber: scriptPos + 1,
            totalHits,
            swingTilt,
            phaseName: mode === 'idle' ? 'idle' : phaseIndex < phases.length ? phases[phaseIndex].name : 'done',
            phaseProgress: mode === 'idle'
                ? 0
                : Math.min(Math.max(phaseIndex < phases.length ? phaseTimer / phaseDurationOf(phases[phaseIndex], config.duration, config.recovery) : 1, 0), 1),
            attackProgress: mode === 'idle' ? 0 : Math.min(Math.max(attackTimer / (config.duration + config.recovery), 0), 1),
            link: mode === 'attacking' ? link : '—',
            /* 每槽三计时器快照：当前段按 attackTimer 切分动作/恢复两格，冷却取递减值 */
            slotTimers: slots.map((slot, i) => {
                const cfg = slot.config
                const active = mode === 'attacking' && script[scriptPos] === i
                const t = attackTimer
                return {
                    label: slotLabel(cfg.id),
                    duration: cfg.duration,
                    recovery: cfg.recovery,
                    cooldown: cfg.cooldown,
                    actionElapsed: active && t <= cfg.duration ? t : -1,
                    recoveryElapsed: active && cfg.recovery > 0 && t > cfg.duration ? t - cfg.duration : -1,
                    cooldownRemaining: cooldownTimers[i] ?? 0,
                }
            }),
        }
    }

    /* —— 头顶名称标签：sprite 挂锚点、dispose 句柄留存，随 dispose 统一回收 —— */
    let labelDispose: (() => void) | null = null
    const attachLabel = (label: NameLabel): void => {
        anchor.add(label.sprite)
        labelDispose = label.dispose
    }

    /* —— 聚焦变暗：遍历锚点下全部 Mesh/Sprite 材质改透明度，恢复时按快照还原 —— */
    let dimmed = false
    const saved: MaterialSnapshot[] = []
    const setDimmed = (on: boolean): void => {
        if (on === dimmed) return
        dimmed = on
        /* 刀光 Mesh 挂在 scene 根（不在 anchor 子树内），单独下发压暗系数；
         * 其材质 opacity 每帧由 update 覆写，须用缩放系数而非直接改材质 */
        trail.setOpacityScale(on ? DIMMED_OPACITY : 1)
        if (on) {
            anchor.traverse(obj => {
                if (!(obj instanceof Mesh || obj instanceof Sprite)) return
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
                for (const m of mats) {
                    saved.push({material: m, opacity: m.opacity, transparent: m.transparent})
                    m.transparent = true
                    m.opacity = DIMMED_OPACITY
                }
            })
        } else {
            for (const snap of saved) {
                snap.material.opacity = snap.opacity
                snap.material.transparent = snap.transparent
            }
            saved.length = 0
        }
    }

    const dispose = (): void => {
        setDimmed(false)
        trail.dispose()
        labelDispose?.()
        model.dispose()
        scene.remove(anchor)
    }

    return {id, anchor, skillName, weaponName, update, status, attachLabel, setDimmed, dispose}
}
