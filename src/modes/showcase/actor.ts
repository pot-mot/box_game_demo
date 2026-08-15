import {Group, Vector3, Mesh, Sprite} from 'three'
import type {Material, Scene} from 'three'
import {createCharacterModel} from '../../entity/character/appearance/model.ts'
import {createAppearanceSystem} from '../../entity/character/appearance/system.ts'
import type {AnimationContext, CharacterModel} from '../../entity/character/appearance/types.ts'
import type {AppearanceSystem} from '../../entity/character/appearance/system.ts'
import type {WeaponTrail} from '../../entity/character/appearance/weapon_trail.ts'
import {createWeaponTrail} from '../../entity/character/appearance/weapon_trail.ts'
import type {NameLabel} from './label.ts'
import {COMBO_WINDOW, resolvePhases} from '../../character/combat/attack_phases.ts'
import type {AttackPhaseName} from '../../character/combat/attack_phases.ts'
import type {SkillConfig} from '../../character/combat/skill_types.ts'
import {
    ACTOR_JUMP_HEIGHT,
    ACTOR_SCALE,
    ACTOR_SPEED,
    COMBO_INPUT_RATIO,
    COMBO_TILT_TABLE,
    DIMMED_OPACITY,
    IDLE_LEAD,
    IDLE_TRAIL,
    RECOMBO_IDLE,
    TOTAL_COMBO_HITS,
} from './constants.ts'

/** 本击衔接方式标签（供人工审查连段推进路径） */
export const LINK_LABELS = ['首次起手', '段内推进', '重新起手', '—'] as const
export type LinkLabel = typeof LINK_LABELS[number]

/** 面板展示用的角色运行状态快照 */
export interface ActorStatus {
    readonly id: number
    readonly skillId: string
    readonly skillName: string
    readonly weaponName: string
    readonly isMelee: boolean
    readonly mode: 'idle' | 'attacking'
    /** 当前击（1 起，idle 时为下一次起手的击号） */
    readonly hitNumber: number
    readonly totalHits: number
    /** 当前挥砍倾斜角（rad，远程恒 0） */
    readonly swingTilt: number
    /** 当前阶段名（idle = 'idle'，全部阶段完成 = 'done'） */
    readonly phaseName: AttackPhaseName | 'idle' | 'done'
    /** 当前阶段进度 0-1 */
    readonly phaseProgress: number
    /** 攻击总进度 0-1 */
    readonly attackProgress: number
    /** 本击的衔接方式 */
    readonly link: LinkLabel
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
    readonly skill: SkillConfig
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
 *    阶段推进（durationRatio × duration）→ 连段推进（cancellable + 窗口未过期时重置计时）→
 *    完成判定（全部阶段完成 && attackTimer >= duration → idle）。
 * 2. 动画注入镜像 world.ts L579-602：按相同字段构造 AnimationContext 交给
 *    createAppearanceSystem()（阶段信息直接来自技能预设的 phases，绕开生产装配
 *    路径中 attackToSkillSlots 丢失 phases 的缺陷）。
 * 3. 刀光镜像 world.ts L642-654：strike/release/spin 阶段激活，采样 weaponTip。
 *
 * 展示场景省略的部分（与生产差异，见报告）：物理速度缩放（moveSpeedMultiplier）、
 * 命中执行器、hitstop、hitbox——攻击中角色静止站立。
 */
export const createShowcaseActor = (init: ShowcaseActorInit): ShowcaseActor => {
    const {id, scene, skill, faction, x, z, skillName, weaponName} = init
    const isMelee = skill.type === 'melee'
    const totalHits = isMelee ? TOTAL_COMBO_HITS : 1

    /* 模型直接引用技能预设的 phases —— 绝不走生产装配（那里 phases 字段会丢失） */
    const phases = resolvePhases(skill.phases)

    const model: CharacterModel = createCharacterModel(
        {speed: ACTOR_SPEED, jumpHeight: ACTOR_JUMP_HEIGHT, scale: ACTOR_SCALE},
        faction,
    )
    model.equipWeapon(skill.weapon.mesh)

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
    let comboTimer = 0
    let swingCount = 0
    let swingTilt = 0
    /** 当前击号（1 起；完整播完或段内推进时递增） */
    let hitNumber = 1
    /** 模拟玩家按住攻击键（cancellable 阶段过半后置位，消费或本击结束后复位） */
    let attackHeld = false
    /** 本击是否计划演示段内推进（击 1 与最后一击完整播放，中间各击尝试推进） */
    let planAdvance = false
    /** 本击衔接方式（进入攻击时取 pendingLink，段内推进直接覆盖） */
    let link: LinkLabel = '—'
    let pendingLink: LinkLabel = isMelee ? '首次起手' : '—'
    /** 连段全部完成，待机结束后重置循环（swingCount 归零，tilt 序列从头演示） */
    let resetPending = false

    /** 进入攻击 —— 镜像 attackingHandler.enter（省略物理 wakeUp/attackedTargets） */
    const enterAttack = (): void => {
        mode = 'attacking'
        stateTime = 0
        attackTimer = 0
        phaseIndex = 0
        phaseTimer = 0
        comboTimer = COMBO_WINDOW
        attackHeld = false
        if (isMelee) {
            /* tilt 按挥砍次数轮转 —— 与 nextComboTilt(c) 相同公式 */
            swingTilt = COMBO_TILT_TABLE[swingCount % COMBO_TILT_TABLE.length]
            swingCount++
            planAdvance = hitNumber > 1 && hitNumber < totalHits
        } else {
            /* 远程攻击 tilt 恒 0 */
            swingTilt = 0
            planAdvance = false
        }
        link = pendingLink
        pendingLink = '重新起手'
    }

    /** 攻击时间线 —— 镜像 attackingHandler.update 的调度部分（省略物理/位移缩放） */
    const advanceAttack = (dt: number): void => {
        /* 状态时长累加 —— 镜像生产 world.ts 传入 entity.stateMachine.stateTime 的累加语义：
         * enterAttack（状态切换）置 0、段内推进不重置；aim/spin 微颤与头部摆动依赖它 */
        stateTime += dt
        attackTimer += dt
        phaseTimer += dt
        /* 连招窗口倒计时 */
        comboTimer = Math.max(0, comboTimer - dt)

        /* 阶段推进（镜像 L64-76） */
        if (phaseIndex < phases.length) {
            const phaseDuration = skill.duration * phases[phaseIndex].durationRatio
            if (phaseTimer >= phaseDuration) {
                if (phaseIndex < phases.length - 1) {
                    phaseIndex++
                    phaseTimer = 0
                } else {
                    /* 最终阶段完成，标记所有阶段已结束 */
                    phaseIndex = phases.length
                }
            }
        }

        /* 连段推进（镜像 L79-108）：等价于 comboChain 指向同技能自身的推进分支 ——
         * 重置计时并轮转 tilt；phaseIndex 归零后动画器 prevPhase 为空，
         * startPose 取 NEUTRAL，产生与生产一致的衔接跳变（已知 bug，原样复现） */
        if (planAdvance && phaseIndex < phases.length) {
            const phase = phases[phaseIndex]
            const phaseDuration = Math.max(skill.duration * phase.durationRatio, 1e-6)
            /* 模拟玩家输入：cancellable 阶段过半后按住攻击键 */
            if (phase.cancellable && !attackHeld && phaseTimer / phaseDuration >= COMBO_INPUT_RATIO) {
                attackHeld = true
            }
            if (phase.cancellable && attackHeld && comboTimer > 0) {
                attackTimer = 0
                phaseIndex = 0
                phaseTimer = 0
                comboTimer = COMBO_WINDOW
                swingTilt = COMBO_TILT_TABLE[swingCount % COMBO_TILT_TABLE.length]
                swingCount++
                hitNumber++
                attackHeld = false
                planAdvance = hitNumber < totalHits
                link = '段内推进'
                return
            }
        }

        /* 完成判定（镜像 idle 转换 guard：全部阶段完成 && 总时长达标；站立恒有支撑） */
        if (phaseIndex >= phases.length && attackTimer >= skill.duration) {
            mode = 'idle'
            stateTime = 0
            attackHeld = false
            if (hitNumber >= totalHits) {
                idleDuration = IDLE_TRAIL
                resetPending = true
            } else {
                /* 本击未能在段内推进（无可取消阶段 / 窗口过期）→ 走"播完 → 重新起手"路径 */
                hitNumber++
                idleDuration = RECOMBO_IDLE
            }
        }
    }

    /** 待机时间线：计时结束进入下一击（或重置循环后重新起手） */
    const advanceIdle = (dt: number): void => {
        stateTime += dt
        if (stateTime >= idleDuration) {
            if (resetPending) {
                swingCount = 0
                hitNumber = 1
                resetPending = false
                pendingLink = isMelee ? '首次起手' : '—'
            }
            enterAttack()
        }
    }

    /**
     * 动画注入 —— 镜像 world.ts L579-654：
     * 构造 AnimationContext（同名同语义）→ system.update（状态切换自动检测）→ 刀光采样。
     */
    const applyAnimation = (dt: number): void => {
        const inAttacking = mode === 'attacking'
        const phaseDuration = phaseIndex < phases.length
            ? skill.duration * phases[phaseIndex].durationRatio
            : 1
        const ctxPhaseName: AttackPhaseName | undefined = inAttacking && phaseIndex < phases.length
            ? phases[phaseIndex].name
            : undefined

        const ctx: AnimationContext = {
            stateTime,
            /* 展示场景站立攻击：速度与位移恒 0（生产为物理体实时速度） */
            horizontalSpeed: 0,
            horizontalTravel: 0,
            swingTilt,
            attackPhase: ctxPhaseName,
            attackPhaseProgress: phaseDuration > 0 ? phaseTimer / phaseDuration : 0,
            attackTotalProgress: inAttacking && skill.duration > 0 ? attackTimer / skill.duration : 0,
            attackPhases: inAttacking ? phases : undefined,
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
        if (mode === 'attacking') {
            advanceAttack(dt)
        } else {
            advanceIdle(dt)
        }
        applyAnimation(dt)
    }

    const status = (): ActorStatus => ({
        id,
        skillId: skill.id,
        skillName,
        weaponName,
        isMelee,
        mode,
        hitNumber,
        totalHits,
        swingTilt,
        phaseName: mode === 'idle' ? 'idle' : phaseIndex < phases.length ? phases[phaseIndex].name : 'done',
        phaseProgress: mode === 'idle'
            ? 0
            : Math.min(Math.max(phaseIndex < phases.length ? phaseTimer / (skill.duration * phases[phaseIndex].durationRatio) : 1, 0), 1),
        attackProgress: mode === 'idle' ? 0 : Math.min(Math.max(attackTimer / skill.duration, 0), 1),
        link: mode === 'attacking' ? link : '—',
    })

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
        /* 刀光 mesh 挂在 scene 根（不在 anchor 子树内），单独下发压暗系数；
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
