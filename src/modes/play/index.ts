import {Vector3, type Scene, type PerspectiveCamera, type WebGLRenderer} from 'three'
import type {SharedWorld} from '../../physics/world.ts'
import type {TerrainContext} from '../../entity/terrain/base/types'
import type {CharacterEntitySystem} from '../../entity/character/physics/world.ts'
import type {SpawnBoxCallback} from '../../entity/character/ai/types.ts'
import {setupPlayerKeyboard} from './keyboard.ts'
import {setupPlayCamera} from './camera.ts'
import {setupHealthBars} from './health_bar.ts'
import type {SkillTimerRowData, TimerCellData, TimerRowData} from './player_hud.ts'
import {createPlayerHUD} from './player_hud.ts'
import {createDeathScreen} from './death_screen.ts'
import {orderedSegments, segmentDisplayName} from '../../character/weapon/attack_chain.ts'
import {segmentCooldownRemaining} from '../../character/combat/attack_runtime.ts'
import {HIT_SHAKE_DURATION, HIT_SHAKE_AMPLITUDE} from './constants.ts'

export interface PlayModeController {
    updater: (dt: number) => void
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

    const playerInput = setupPlayerKeyboard(camera, characterSystem)
    /* 相机跟随目标取身体中心（mesh 原点在脚底，直接用 mesh.position 会导致相机压低） */
    const cameraTarget = new Vector3()
    const playCameraUpdate = setupPlayCamera(camera, renderer.domElement, () => {
        const player = characterSystem.getPlayerCharacter()
        if (!player) return undefined
        const t = player.body.translation()
        cameraTarget.set(t.x, t.y, t.z)
        return cameraTarget
    },
    {
        onLightAttack: (held) => characterSystem.setPlayerAttack('light', held),
        onHeavyAttack: (held) => characterSystem.setPlayerAttack('heavy', held),
    },
    )
    const healthBarUpdate = setupHealthBars(
        scene,
        () => characterSystem.getPlayerCharacter(),
        () => characterSystem.getAll(),
    ).update

    const hud = createPlayerHUD()
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

    const updater = (dt: number): void => {
        playerInput()
        characterSystem.update(dt)
        playCameraUpdate(dt)
        applyHitShake(dt)
        healthBarUpdate(camera, dt)

        const player = characterSystem.getPlayerCharacter()
        if (player) {
            hadPlayer = true
            hud.setVisible(true)

            const timers: TimerRowData[] = []

            /* 每攻击段一行：动作时间 + 恢复时间 + 冷却时间 三个计时器
             * 行顺序 = 武器攻击链展示顺序（轻1 → 轻2 → 重1 → 重2），段由武器模组声明 */
            const skillTimers: SkillTimerRowData[] = []
            const emptyCell = (text: string): TimerCellData => ({fillRatio: 0, fillColor: 'transparent', text})

            /* 冷却单元格：触发瞬间满条，随冷却流逝排空（cooldownTimer 递减）；就绪/无冷却时显示 0.0 */
            const cooldownCell = (cd: number, cdMax: number): TimerCellData => cdMax > 0
                ? {
                    fillRatio: cd / cdMax,
                    fillColor: cd > 0 ? '#ff6644' : '#4488ff',
                    text: `${cd.toFixed(1)}s`,
                }
                : emptyCell('0.0s')

            /* 冲刺技能（移动技能）：只有动作与冷却两段，动作期间用状态机驻留时间填充 */
            const dash = player.combat.dashSkill
            const dashCfg = dash.config
            const dashing = player.stateMachine.currentState === 'dashing'
            skillTimers.push({
                label: dashCfg.id,
                action: dashing
                    ? {fillRatio: Math.min(1, player.stateMachine.stateTime / dashCfg.duration), fillColor: '#ffaa00', text: `${player.stateMachine.stateTime.toFixed(2)}s`}
                    : emptyCell(`${dashCfg.duration.toFixed(2)}s`),
                recovery: emptyCell('-'),
                cooldown: cooldownCell(dash.cooldownTimer, dashCfg.cooldown),
            })

            for (const segment of orderedSegments(player.combat.attacks)) {
                const isActive = player.combat.attackActive && player.combat.activeSegment?.id === segment.id
                const t = player.combat.attackTimer

                /* 动作计时：attackTimer 处于 [0, duration] 区间时填充 */
                const action: TimerCellData = isActive && segment.duration > 0 && t <= segment.duration
                    ? {fillRatio: Math.min(1, t / segment.duration), fillColor: '#ffaa00', text: `${t.toFixed(2)}s`}
                    : emptyCell(segment.duration > 0 ? `${segment.duration.toFixed(2)}s` : '-')

                /* 恢复计时：attackTimer 越过 duration 后填充（recovery = 0 的段无恢复段） */
                const recovery: TimerCellData = isActive && segment.recovery > 0 && t > segment.duration
                    ? {fillRatio: Math.min(1, (t - segment.duration) / segment.recovery), fillColor: '#44ccff', text: `${(t - segment.duration).toFixed(2)}s`}
                    : emptyCell(segment.recovery > 0 ? `${segment.recovery.toFixed(2)}s` : '-')

                /* 冷却计时：从段触发时刻开始（段冷却递减），就绪/无冷却时显示 0.0 */
                skillTimers.push({
                    label: segmentDisplayName(segment),
                    action,
                    recovery,
                    cooldown: cooldownCell(segmentCooldownRemaining(player.combat, segment.id), segment.cooldown),
                })
            }

            hud.update({
                health: player.combat.health,
                maxHealth: player.combat.maxHealth,
                stateName: player.stateMachine.currentState,
                stateTime: player.stateMachine.stateTime,
                timers,
                skillTimers,
            })
        } else {
            hud.setVisible(false)
            if (hadPlayer && !playerDied) {
                playerDied = true
                deathScreen.show()
            }
        }
    }

    return {updater}
}
