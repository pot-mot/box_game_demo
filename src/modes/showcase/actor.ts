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
import type {WeaponConfig} from '../../character/weapon/catalog.ts'
import {
    orderedSegments,
    segmentDisplayName,
    segmentTotalDuration,
    type AttackSegment,
} from '../../character/weapon/attack_chain.ts'
import {
    ACTOR_JUMP_HEIGHT,
    ACTOR_SCALE,
    ACTOR_SPEED,
    CHAIN_PAUSE_IDLE,
    DIMMED_OPACITY,
    IDLE_LEAD,
    IDLE_TRAIL,
} from './constants.ts'

/** 本击衔接方式标签（供人工审查连段推进路径） */
export const LINK_LABELS = ['首次起手', '段内推进', '重新起手', '—'] as const
export type LinkLabel = typeof LINK_LABELS[number]

/** 面板展示用的单个攻击段计时快照（与 play HUD 三计时器同语义） */
export interface SkillTimerStatus {
    /** 段显示名（`segmentDisplayName`：轻击一段 / 重击二段 / 变体段 label） */
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

/** 面板展示用的角色运行状态快照 */
export interface ActorStatus {
    readonly id: number
    /** 当前段 id（= 动画键，武器内唯一；idle 时为下一段） */
    readonly skillId: string
    /**
     * 展示名（重构后无技能概念：与 weaponName 同为武器中文名，
     * 保留字段以兼容面板「名称 + 副名」两段式渲染）
     */
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
    /** 每段一行的三计时器快照（顺序 = 段展示顺序，与清单/播放顺序同源） */
    readonly slotTimers: readonly SkillTimerStatus[]
}

export interface ShowcaseActor {
    readonly id: number
    readonly anchor: Group
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
    /** 展示武器模组：攻击链（段/时长/阶段/冷却/倾斜角）+ 模型一并取自它 */
    readonly weapon: WeaponConfig
    readonly faction: number
    readonly x: number
    readonly z: number
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
 * 数据流（与生产 physics/world.ts + state_machine/states/attacking/ 逐段对应）：
 * 1. 时间线调度镜像 attackingHandler.update：attackTimer/phaseTimer 递增 →
 *    阶段推进（phaseDurationOf：动作阶段按 ratio 分摊 duration，recovery 取段 recovery）→
 *    最终阶段完整播完时的段末推进（缓冲恒有值 → 重置计时切换下一段，不出 attacking 状态）→
 *    脚本播完或链间停顿 → idle。
 * 2. 数据源 = 武器模组拥有的攻击链（`WeaponAttacks`）：演示脚本即 `orderedSegments(weapon.attacks)`
 *    的段展示顺序（轻 1 → 轻 2 → 重 1 → 重 2，条件起手变体段接在所属键末尾），
 *    故播放顺序、面板计时行顺序与清单枚举顺序三者同源一致（不再需要槽位重排）。
 *    链间停顿位置由脚本内首个重段派生：停顿插在它之前（模拟松开攻击键），
 *    无重段（远程单段 / 单键武器）自然不停顿。
 * 3. 动画注入镜像 world.ts：AnimationContext 携带 attackSegment（段即动画键），
 *    段切换触发动画键变化走快照混合（修复旧版段切换单帧姿态跳变）。
 * 4. 刀光镜像 world.ts：strike/release/spin 阶段激活，采样 weaponTip。
 *
 * 展示场景省略的部分（与生产差异）：物理速度缩放（moveSpeedMultiplier）、
 * 命中执行器、hitstop、hitbox——攻击中角色静止站立。段冷却计时仅镜像展示（进入段即挂、逐帧递减），
 * 不阻断脚本推进。
 */
export const createShowcaseActor = (init: ShowcaseActorInit): ShowcaseActor => {
    const {id, scene, faction, x, z, weaponName} = init
    const isMelee = init.weapon.type === 'melee'
    /*
     * 演示脚本 = 段展示顺序本身（下标 0..n-1 即播放顺序）：
     * 播放顺序、面板计时行顺序与清单顺序三者一致（统一枚举源，无需重排映射）。
     */
    const segments: readonly AttackSegment[] = orderedSegments(init.weapon.attacks)
    if (segments.length === 0) {
        throw new Error(`[showcase] actor ${id} 武器 ${init.weapon.id} 没有可展示的攻击段`)
    }
    const totalHits = segments.length
    /** 链间停顿位置：脚本内首个重段之前（-1/-2 等负值 = 无重段，恒不停顿） */
    const pauseAfterPos = segments.findIndex(segment => segment.key === 'heavy') - 1

    const model: CharacterModel = createCharacterModel(
        {speed: ACTOR_SPEED, jumpHeight: ACTOR_JUMP_HEIGHT, scale: ACTOR_SCALE},
        faction,
    )
    model.equipWeapon(init.weapon.mesh)

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
    /** 全链播完，收尾待机结束后重置循环（scriptPos 归零重新起手） */
    let resetPending = false
    /** 每段冷却剩余时间（镜像生产：段触发即挂自身冷却，逐帧递减；仅展示不挡推进） */
    const cooldownTimers = new Map<string, number>()

    /** 当前脚本站位的段（scriptPos 恒在脚本范围内；越界回退首段防御） */
    const currentSegment = (): AttackSegment => segments[scriptPos] ?? segments[0]

    /** 进入指定脚本位置的段 —— 镜像 attackingHandler.enter（省略物理 wakeUp/attackedTargets） */
    const enterSegment = (pos: number, nextLink: LinkLabel): void => {
        scriptPos = pos
        mode = 'attacking'
        stateTime = 0
        attackTimer = 0
        phaseIndex = 0
        phaseTimer = 0
        const segment = currentSegment()
        /* 段固有倾斜角 —— 与 attacking.enter 的 c.swingTilt = segment.swingTilt ?? 0 一致 */
        swingTilt = segment.swingTilt ?? 0
        link = nextLink
        /* 触发即挂自身冷却（镜像生产起手 enter） */
        cooldownTimers.set(segment.id, segment.cooldown)
    }

    /** 攻击时间线 —— 镜像 attackingHandler.update 的调度部分（省略物理/位移缩放） */
    const advanceAttack = (dt: number): void => {
        /* 状态时长累加 —— 镜像生产 world.ts 传入 entity.stateMachine.stateTime 的累加语义：
         * enterSegment（状态切换）置 0、段末推进不重置；aim/spin 微颤与头部摆动依赖它 */
        stateTime += dt
        attackTimer += dt
        phaseTimer += dt

        const segment = currentSegment()
        const phases = resolvePhases(segment.phases)

        /* 阶段推进（镜像 attacking.update 阶段调度） */
        if (phaseIndex < phases.length) {
            const phaseDuration = phaseDurationOf(phases[phaseIndex], segment.duration, segment.recovery)
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
            if (scriptPos === pauseAfterPos) {
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
            const nextSegment = currentSegment()
            swingTilt = nextSegment.swingTilt ?? 0
            link = '段内推进'
            /* 链中段触发同样挂自身冷却（镜像生产段末推进） */
            cooldownTimers.set(nextSegment.id, nextSegment.cooldown)
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
     * 构造 AnimationContext（同名同语义，含 attackSegment）→ system.update（动画键 = state:segmentId，
     * 段切换触发快照混合）→ 刀光采样。
     */
    const applyAnimation = (dt: number): void => {
        const inAttacking = mode === 'attacking'
        const segment = currentSegment()
        const phases = resolvePhases(segment.phases)
        const phaseDuration = phaseIndex < phases.length
            ? phaseDurationOf(phases[phaseIndex], segment.duration, segment.recovery)
            : 1
        const ctxPhaseName: AttackPhaseName | undefined = inAttacking && phaseIndex < phases.length
            ? phases[phaseIndex].name
            : undefined

        const ctx: AnimationContext = {
            stateTime,
            /* 展示场景站立攻击：速度恒 0（生产为物理体实时速度） */
            horizontalSpeed: 0,
            swingTilt,
            attackSegment: inAttacking ? segment : undefined,
            attackPhase: ctxPhaseName,
            attackPhaseProgress: phaseDuration > 0 ? phaseTimer / phaseDuration : 0,
            /* 总进度分母 = 动作时间 + 恢复时间（镜像 world.ts totalDuration） */
            attackTotalProgress: inAttacking && segmentTotalDuration(segment) > 0
                ? attackTimer / segmentTotalDuration(segment)
                : 0,
            attackPhaseIndex: phaseIndex,
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
        /* 冷却递减（镜像 world.ts 段冷却循环） */
        for (const [segmentId, remaining] of cooldownTimers) {
            cooldownTimers.set(segmentId, Math.max(0, remaining - dt))
        }
        if (mode === 'attacking') {
            advanceAttack(dt)
        } else {
            advanceIdle(dt)
        }
        applyAnimation(dt)
    }

    const status = (): ActorStatus => {
        const segment = currentSegment()
        const phases = resolvePhases(segment.phases)
        return {
            id,
            skillId: segment.id,
            skillName: weaponName,
            weaponName,
            isMelee,
            mode,
            hitNumber: scriptPos + 1,
            totalHits,
            swingTilt,
            phaseName: mode === 'idle' ? 'idle' : phaseIndex < phases.length ? phases[phaseIndex].name : 'done',
            phaseProgress: mode === 'idle'
                ? 0
                : Math.min(Math.max(phaseIndex < phases.length ? phaseTimer / phaseDurationOf(phases[phaseIndex], segment.duration, segment.recovery) : 1, 0), 1),
            attackProgress: mode === 'idle' ? 0 : Math.min(Math.max(attackTimer / segmentTotalDuration(segment), 0), 1),
            link: mode === 'attacking' ? link : '—',
            /* 每段三计时器快照：当前段按 attackTimer 切分动作/恢复两格，冷却取递减值 */
            slotTimers: segments.map(seg => {
                const active = mode === 'attacking' && seg.id === segment.id
                const t = attackTimer
                return {
                    label: segmentDisplayName(seg),
                    duration: seg.duration,
                    recovery: seg.recovery,
                    cooldown: seg.cooldown,
                    actionElapsed: active && t <= seg.duration ? t : -1,
                    recoveryElapsed: active && seg.recovery > 0 && t > seg.duration ? t - seg.duration : -1,
                    cooldownRemaining: cooldownTimers.get(seg.id) ?? 0,
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

    return {id, anchor, weaponName, update, status, attachLabel, setDimmed, dispose}
}
