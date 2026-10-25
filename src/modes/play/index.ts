import {MathUtils, Vector3, type Scene, type PerspectiveCamera, type WebGLRenderer} from 'three'
import type {SharedWorld} from '../../physics/world.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import type {CharacterEntitySystem} from '../../entity/character/physics/world.ts'
import type {SpawnBoxCallback} from '../../entity/character/ai/types.ts'
import {createPlayerControl} from '../control/player_control.ts'
import {getInputRegistry} from '../../input/registry.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../input/types.ts'
import {createPlayerLockOn} from './lock_on.ts'
import {setupLockMarker} from './lock_marker.ts'
import {setupHealthBars} from './health_bar.ts'
import type {SkillTimerRowData, TimerCellData, TimerRowData} from './player_debug_hud.ts'
import {createPlayerDebugHUD} from './player_debug_hud.ts'
import {createPlayerHUD} from './player_hud.ts'
import {createDeathScreen} from './death_screen.ts'
import {orderedSegments, segmentDisplayName} from '../../character/weapon/attack_chain.ts'
import {weaponDisplayName} from '../../character/weapon/catalog.ts'
import {translate} from '../../i18n/index.ts'
import {segmentCooldownRemaining} from '../../character/combat/attack_runtime.ts'
import {guardMaxOf} from '../../character/combat/types.ts'
import type {InteractionProvider} from '../../character/interaction/types.ts'
import {setupPlayInteraction} from './interaction/index.ts'
import {HIT_SHAKE_DURATION, HIT_SHAKE_AMPLITUDE} from './constants.ts'

export interface PlayModeController {
    /** 每渲染帧一次、物理步进前：采样输入并写入角色 */
    sampleInput: () => void
    /** 每物理步：交互计时等游戏逻辑（状态机 / 动画由角色系统自身按步推进） */
    fixedUpdate: (dt: number) => void
    /** 每渲染帧一次、物理步进与插值同步之后：相机 / HUD / 表现层 */
    renderUpdate: (dt: number) => void
    /** 注册交互目标提供者（交互物 / 掉落物等系统） */
    registerInteractionProvider: (provider: InteractionProvider) => void
}

export const setupPlayMode = (
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    _shared: SharedWorld,
    _terrainSources: TerrainContext[],
    characterSystem: CharacterEntitySystem,
    boxSpawner: SpawnBoxCallback,
): PlayModeController => {
    characterSystem.setAIEnabled(true)
    characterSystem.activateAI()
    characterSystem.registerBoxSpawner(boxSpawner)

    const interaction = setupPlayInteraction(camera, characterSystem)
    /* 相机跟随目标取身体中心（mesh 原点在脚底，直接用 mesh.position 会导致相机压低） */
    const cameraTarget = new Vector3()
    const cameraDir = new Vector3()
    const lockOn = createPlayerLockOn(characterSystem, camera)
    const playerControl = createPlayerControl(camera, renderer.domElement, {
        getTarget: () => {
            /* 取渲染插值位置（滞后一拍），相机无需再叠一层 EMA 平滑 */
            const p = characterSystem.getPlayerRenderPosition()
            if (!p) return undefined
            cameraTarget.set(p.x, p.y, p.z)
            return cameraTarget
        },
        move: (dx, dz, jump, forwardX, forwardZ, roll, swimLift, sprint, fly, flyLift) =>
            characterSystem.setPlayerMove(dx, dz, jump, forwardX, forwardZ, roll, swimLift, sprint, fly, flyLift),
        cycleAttackModule: () => characterSystem.cyclePlayerAttackModule(),
        combat: {
            onLightAttackStart: () => characterSystem.beginPlayerAttackHold('light'),
            onLightAttack: (held) => characterSystem.endPlayerAttackHold('light', held),
            onLightAttackCancel: () => characterSystem.cancelPlayerAttackHold('light'),
            onHeavyAttackStart: () => characterSystem.beginPlayerAttackHold('heavy'),
            onHeavyAttack: (held) => characterSystem.endPlayerAttackHold('heavy', held),
            onHeavyAttackCancel: () => characterSystem.cancelPlayerAttackHold('heavy'),
        },
        lock: {
            onToggle: lockOn.toggle,
            getAimPoint: lockOn.getAimPoint,
            onOrbit: lockOn.release,
        },
        pointerActions: MOUSE_ACTIONS_BY_MODE.play,
    })
    const lockMarkerUpdate = setupLockMarker(scene).update
    const healthBarUpdate = setupHealthBars(
        scene,
        () => characterSystem.getPlayerCharacter(),
        () => characterSystem.getAll(),
    ).update

    const hud = createPlayerHUD()
    const debugHud = createPlayerDebugHUD()
    /* 调试 HUD 默认关闭，输入动作 toggle_debug_hud（默认 ~，可在按键设置中修改）控制显隐 */
    let debugHudVisible = false
    getInputRegistry().onActionDown('toggle_debug_hud', () => {
        debugHudVisible = !debugHudVisible
        debugHud.setVisible(debugHudVisible)
    })
    let playerDied = false
    let hadPlayer = false
    const deathScreen = createDeathScreen(
        () => { location.reload() },
        () => { location.reload() },
    )

    /* 近战命中相机震动：由角色系统命中冲击回调触发，叠加在轨道相机更新之后 */
    let shakeTime = 0
    characterSystem.setOnMeleeImpact(() => {
        shakeTime = HIT_SHAKE_DURATION
    })
    const applyHitShake = (dt: number): void => {
        if (shakeTime <= 0) return
        shakeTime -= dt
        const k = Math.max(shakeTime / HIT_SHAKE_DURATION, 0) * HIT_SHAKE_AMPLITUDE
        camera.position.x += (Math.random() * 2 - 1) * k
        camera.position.y += (Math.random() * 2 - 1) * k
        camera.position.z += (Math.random() * 2 - 1) * k
    }

    /** 每渲染帧一次：采样输入（必须在物理步进之前）；交互边沿在此锁存 */
    const sampleInput = (): void => {
        playerControl.move()
        interaction.sampleInput()
    }

    /** 每物理步：交互计时与激活（边沿只在首个物理步消费一次） */
    const fixedUpdate = (dt: number): void => {
        interaction.fixedUpdate(dt)
    }

    const renderUpdate = (dt: number): void => {
        playerControl.update(dt)
        lockMarkerUpdate(lockOn.getAimPoint())
        applyHitShake(dt)
        healthBarUpdate(camera, dt)

        const player = characterSystem.getPlayerCharacter()
        if (player) {
            hadPlayer = true
            /* 血量 / 韧性等基础 HUD 常驻；调试面板由 toggle_debug_hud 动作控制 */
            hud.setVisible(true)
            debugHud.setVisible(debugHudVisible)

            hud.update({
                health: player.state.combat.health,
                maxHealth: player.state.combat.maxHealth,
                poise: player.state.combat.poise,
                poiseMax: player.state.combat.poiseMax,
                stamina: player.state.stamina.current,
                staminaMax: player.state.stamina.max,
                guard: player.state.combat.guard,
                guardMax: guardMaxOf(player.state.combat),
                charge: player.state.combat.attackCharge,
                charging: player.state.combat.attackHolding || player.state.combat.attackCharge > 0,
            })

            if (debugHudVisible) {
                const timers: TimerRowData[] = []

                /* 每攻击段一行：动作时间 + 恢复时间 + 冷却时间 三个计时器
                 * 行顺序 = 武器攻击链展示顺序（轻1 → 轻2 → 重1 → 重2），段由武器模组声明 */
                const skillTimers: SkillTimerRowData[] = []
                const emptyCell = (text: string): TimerCellData => ({fillRatio: 0, fillColor: 'transparent', text})

                /* 冷却单元格：触发瞬间满条，随冷却流逝排空（cooldownTimer 递减）；就绪/无冷却时显示 0.0 */
                const cooldownCell = (cd: number, cdMax: number): TimerCellData => cdMax > 0
                    ? {
                        fillRatio: cd / cdMax,
                        fillColor: cd > 0 ? 'var(--dc-danger)' : 'var(--dc-info)',
                        text: `${cd.toFixed(1)}s`,
                    }
                    : emptyCell('0.0s')

                /* 翻滚技能（移动技能）：只有动作与冷却两段，动作期间用状态机驻留时间填充 */
                const roll = player.state.combat.rollSkill
                const rollCfg = roll.config
                const rolling = player.stateMachine.currentState === 'rolling'
                skillTimers.push({
                    label: translate('play.hotbar.roll'),
                    action: rolling
                        ? {fillRatio: Math.min(1, player.stateMachine.stateTime / rollCfg.duration), fillColor: 'var(--dc-orange-bright)', text: `${player.stateMachine.stateTime.toFixed(2)}s`}
                        : emptyCell(`${rollCfg.duration.toFixed(2)}s`),
                    recovery: emptyCell('-'),
                    cooldown: cooldownCell(roll.cooldownTimer, rollCfg.cooldown),
                })

                for (const segment of orderedSegments(player.state.combat.attacks)) {
                    const isActive = player.state.combat.attackActive && player.state.combat.activeSegment?.id === segment.id
                    const t = player.state.combat.attackTimer

                    /* 动作计时：attackTimer 处于 [0, duration] 区间时填充 */
                    const action: TimerCellData = isActive && segment.duration > 0 && t <= segment.duration
                        ? {fillRatio: Math.min(1, t / segment.duration), fillColor: 'var(--dc-orange-bright)', text: `${t.toFixed(2)}s`}
                        : emptyCell(segment.duration > 0 ? `${segment.duration.toFixed(2)}s` : '-')

                    /* 恢复计时：attackTimer 越过 duration 后填充（recovery = 0 的段无恢复段） */
                    const recovery: TimerCellData = isActive && segment.recovery > 0 && t > segment.duration
                        ? {fillRatio: Math.min(1, (t - segment.duration) / segment.recovery), fillColor: 'var(--dc-info)', text: `${(t - segment.duration).toFixed(2)}s`}
                        : emptyCell(segment.recovery > 0 ? `${segment.recovery.toFixed(2)}s` : '-')

                    /* 冷却计时：从段触发时刻开始（段冷却递减），就绪/无冷却时显示 0.0 */
                    skillTimers.push({
                        label: segmentDisplayName(segment),
                        action,
                        recovery,
                        cooldown: cooldownCell(segmentCooldownRemaining(player.state.combat, segment.id), segment.cooldown),
                    })
                }

                const pos = characterSystem.getPlayerRenderPosition()
                camera.getWorldDirection(cameraDir)
                const cameraYawDeg = (MathUtils.radToDeg(Math.atan2(cameraDir.x, cameraDir.z)) + 360) % 360
                const cameraPitchDeg = MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, cameraDir.y))))

                debugHud.update({
                    stateName: player.stateMachine.currentState,
                    stateTime: player.stateMachine.stateTime,
                    timers,
                    skillTimers,
                    weaponLabel: weaponDisplayName(player.state.combat.weapon),
                    attackModuleLabel: translate(player.state.combat.attackModules.get(player.state.combat.attackModule)?.def.nameKey ?? 'character.idle'),
                    positionX: pos?.x ?? player.mesh.position.x,
                    positionY: pos?.y ?? player.mesh.position.y,
                    positionZ: pos?.z ?? player.mesh.position.z,
                    facingDeg: characterSystem.getFacing(player.state.identity.id),
                    cameraYawDeg,
                    cameraPitchDeg,
                })
            }
        } else {
            hud.setVisible(false)
            debugHud.setVisible(false)
            if (hadPlayer && !playerDied) {
                playerDied = true
                deathScreen.show()
            }
        }
    }

    return {
        sampleInput,
        fixedUpdate,
        renderUpdate,
        registerInteractionProvider: interaction.registerProvider,
    }
}
