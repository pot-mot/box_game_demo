import type {ShowcaseModule} from '../module.ts'
import {Vector3} from 'three'
import type {Object3D} from 'three'
import {setupShowcaseStage} from '../scene.ts'
import {setupClickFocus} from '../focus.ts'
import {createPlayerControl} from '../../control/player_control.ts'
import {createSharedWorld} from '../../../physics/world.ts'
import {createFixedStepStepper} from '../../../physics/fixed_step.ts'
import type {SteppableSystem} from '../../../physics/fixed_step.ts'
import {setupCharacterEntities} from '../../../entity/character/physics/world.ts'
import type {CharacterEntitySystem} from '../../../entity/character/physics/world.ts'
import {setupInteractables, defaultInteractableConfig, INTERACTABLE_LABELS} from '../../../entity/interactable/index.ts'
import type {InteractableContext, InteractableKind} from '../../../entity/interactable/index.ts'
import type {InteractionTarget} from '../../../character/interaction/types.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import {getInputRegistry, isTextEntryTarget} from '../../../input/registry.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../../input/types.ts'
import {
    INTERACTABLE_SPACING,
    INTERACTABLE_ROW_Z,
    INTERACTABLE_CAMERA_DISTANCE,
    INTERACTABLE_CAMERA_TARGET_Y,
    INTERACTABLE_RESPAWN_DELAY,
    PLAYER_SPEED,
    PLAYER_JUMP_HEIGHT,
    PLAYER_SPAWN_Z,
} from '../constants.ts'
import {localizeText, localizeApply} from '../../../i18n/dom.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'

/**
 * 演示摆放清单：7 类交互物，其中**传送点放两个**（可互相传送演示效果）。
 * 开关只控制**闸门**（同频道联动），不再触发所有交互物。
 */
const SPAWN_LIST: readonly InteractableKind[] = [
    'save_point',
    'teleport',
    'teleport',
    'switch',
    'push_door_single',
    'push_door_double',
    'gate',
    'elevator',
]

/** 开关与其唯一联动物（闸门）共享的信号通道；其余交互物不联动 */
const CHANNEL_OF: Partial<Record<InteractableKind, string>> = {
    switch: 'showcase_gate',
    gate: 'showcase_gate',
}

/** 简化玩家角色配置（无 AI、无锁定点，仅用于演示交互） */
const PLAYER_CONFIG: CharacterSaveConfig = {
    speed: PLAYER_SPEED,
    jumpHeight: PLAYER_JUMP_HEIGHT,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 100,
    isPlayer: true,
    navEnabled: false,
}

/** 击杀玩家演示键（直接杀死当前玩家，观察存档点重生） */
const KILL_KEY = 'KeyK'

/**
 * 交互物交互效果子模块。
 *
 * 内容：摆放 7 类交互物（存档点 / **两个传送点** / 开关 / 单开门 / 双开门 / 升降闸门 / 升降梯），
 * **开关只联动闸门**。提供**简化版玩家**（`WASD` 移动 / 空格跳跃 / `Shift` 翻滚 / `F` 交互 / `K` 击杀）——走到交互物旁
 * 按 `F` 触发最近交互物（面板显示最近交互提示），相机**跟随玩家**（鼠标拖拽环绕观察），点击交互物可聚焦并显示呼吸环。
 *
 * 使用生产同一套 `InteractableContext` + `CharacterEntitySystem`（行为 / 动画 / 信号 / 破坏判定 / 状态机 / 物理），
 * 起到交互系统的人员测试效果。
 */
export const interactablesModule: ShowcaseModule = {
    id: 'interactables',
    title: 'showcase.module.interactables.title',
    description: 'showcase.module.interactables.desc',
    setup: host => {
        /* 玩家主控方案：WASD 交给玩家，相机第三人称跟随（鼠标环绕、点击聚焦交互物） */
        const stage = setupShowcaseStage(host.renderer)
        const shared = createSharedWorld()
        const interactables: InteractableContext = setupInteractables(stage.scene, shared)
        const characterSystem: CharacterEntitySystem = setupCharacterEntities(stage.scene, shared)
        const systems: SteppableSystem[] = [characterSystem]

        /* —— 简化玩家：出生在交互物行前方，隐藏碰撞胶囊 —— */
        let playerId = characterSystem.add(PLAYER_CONFIG, 0, 0.6, PLAYER_SPAWN_Z).id
        characterSystem.markPlayer(playerId)
        characterSystem.setCollisionVisible(false)

        /* 玩家主控相机（跟随玩家，固定观察高度；Shift = 翻滚） */
        const followPoint = new Vector3(0, INTERACTABLE_CAMERA_TARGET_Y, PLAYER_SPAWN_Z)
        const playerControl = createPlayerControl(stage.camera, host.renderer.domElement, {
            getTarget: () => followPoint,
            move: (dx, dz, jump, forwardX, forwardZ, roll, swimLift, sprint, fly, flyLift) =>
                characterSystem.setPlayerMove(dx, dz, jump, forwardX, forwardZ, roll, swimLift, sprint, fly, flyLift),
            pointerActions: MOUSE_ACTIONS_BY_MODE.showcase,
            initialYaw: 0,
            initialDistance: INTERACTABLE_CAMERA_DISTANCE,
            signal: stage.signal,
        })
        playerControl.update(0)

        /* —— 面板（左侧）：逐交互物激活按钮 + 击杀 / 重置 + 提示与事件状态 —— */
        const style = document.createElement('style')
        style.textContent = `
.sch-it { position: fixed; top: 16px; left: 16px; width: 320px;
    background: rgba(0,0,0,.72); color: #e8e4da; font: 13px/1.5 system-ui, sans-serif;
    border-radius: 10px; padding: 12px 14px; backdrop-filter: blur(4px); user-select: none; }
.sch-it-title { font-size: 15px; font-weight: 700; color: #ffd070; }
.sch-it-sub { color: #9aa3b2; font-size: 11px; margin: 2px 0 8px; }
.sch-it-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.sch-it-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sch-it-btn { background: #2a2f3a; color: #e8e4da; border: 1px solid #3a4150; border-radius: 6px;
    padding: 3px 10px; cursor: pointer; font: inherit; font-size: 12px; }
.sch-it-btn:hover { background: #353c4a; }
.sch-it-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sch-it-prompt { margin-top: 8px; min-height: 18px; color: #ffe9a0; font-size: 12px; }
.sch-it-status { border-top: 1px solid #333; margin-top: 4px; padding-top: 6px; color: #9aa3b2; min-height: 18px; font-size: 12px; }
`
        document.head.appendChild(style)

        const panel = document.createElement('div')
        panel.className = 'sch-it'
        const title = document.createElement('div')
        title.className = 'sch-it-title'
        localizeText(title, 'showcase.interact.title')
        const sub = document.createElement('div')
        sub.className = 'sch-it-sub'
        localizeText(sub, 'showcase.interact.subtitle')
        const controls = document.createElement('div')
        controls.className = 'sch-it-sub'
        localizeText(controls, 'showcase.interact.controls')
        panel.appendChild(title)
        panel.appendChild(sub)
        panel.appendChild(controls)

        const list = document.createElement('div')
        panel.appendChild(list)

        const promptEl = document.createElement('div')
        promptEl.className = 'sch-it-prompt'
        panel.appendChild(promptEl)

        const status = document.createElement('div')
        status.className = 'sch-it-status'
        let statusKey: StringLocaleKey = 'showcase.interact.hint'
        const setStatus = (key: StringLocaleKey): void => {
            statusKey = key
            status.textContent = translate(key)
        }
        localizeApply(status, el => { el.textContent = translate(statusKey) })
        panel.appendChild(status)

        const actions = document.createElement('div')
        actions.className = 'sch-it-actions'
        const killBtn = document.createElement('button')
        killBtn.type = 'button'
        killBtn.className = 'sch-it-btn'
        localizeText(killBtn, 'showcase.interact.kill')
        const resetBtn = document.createElement('button')
        resetBtn.type = 'button'
        resetBtn.className = 'sch-it-btn'
        localizeText(resetBtn, 'showcase.interact.reset')
        actions.appendChild(killBtn)
        actions.appendChild(resetBtn)
        panel.appendChild(actions)
        document.body.appendChild(panel)

        interface Entry { id: number; kind: InteractableKind; rowEl: HTMLElement }
        let entries: Entry[] = []
        /* 传送点 id（≥2 时激活其一即传送到另一个）与玩家重生点（存档点激活后更新） */
        const teleportIds: number[] = []
        let respawnPos = {x: 0, y: 0.6, z: PLAYER_SPAWN_Z}

        const spawnAll = (): void => {
            teleportIds.length = 0
            entries = SPAWN_LIST.map((kind, i) => {
                const base = defaultInteractableConfig(kind)
                const channel = CHANNEL_OF[kind]
                const config = channel === undefined ? base : {...base, channel}
                const x = (i - (SPAWN_LIST.length - 1) / 2) * INTERACTABLE_SPACING
                /* 交互物原点在**底面**（体素自 y=0 向上搭建，碰撞体上偏 h/2），故放地面 y=0 */
                const {id} = interactables.add(config, x, 0, INTERACTABLE_ROW_Z, 0)
                if (kind === 'teleport') teleportIds.push(id)

                const rowEl = document.createElement('div')
                rowEl.className = 'sch-it-row'
                const labelEl = document.createElement('span')
                labelEl.className = 'sch-it-label'
                localizeApply(labelEl, el => { el.textContent = translate(INTERACTABLE_LABELS[kind]) })
                const btn = document.createElement('button')
                btn.type = 'button'
                btn.className = 'sch-it-btn'
                localizeText(btn, 'showcase.interact.activate')
                btn.addEventListener('click', () => {
                    interactables.activate(id)
                    btn.blur()
                })
                rowEl.appendChild(labelEl)
                rowEl.appendChild(btn)
                list.appendChild(rowEl)
                return {id, kind, rowEl}
            })
        }
        spawnAll()

        /* 领域钩子：状态行回写；传送移动到另一个传送点；存档点刷新重生点 */
        interactables.setHooks({
            onSavePoint: (e) => {
                respawnPos = {x: e.base.x + 1.5, y: 0.6, z: e.base.z + 1.5}
                setStatus('showcase.interact.event_save')
            },
            onTeleport: (e) => {
                setStatus('showcase.interact.event_teleport')
                const otherId = teleportIds.find(id => id !== e.id)
                const target = otherId === undefined ? undefined : interactables.getById(otherId)
                if (target === undefined) return
                const p = characterSystem.getPlayerCharacter()
                if (p === undefined) return
                p.body.setTranslation({x: target.base.x, y: target.base.y + 0.6, z: target.base.z + 1.4}, true)
                p.body.setLinvel({x: 0, y: 0, z: 0}, true)
                p.body.wakeUp()
            },
        })

        /* —— 击杀玩家：清空生命触发死亡动画，延时在存档点重生（演示存档点） —— */
        let respawnTimer = 0
        const killPlayer = (): void => {
            const p = characterSystem.getPlayerCharacter()
            if (p === undefined || p.state.timers.isDying) return
            characterSystem.updateCharacterConfig(p.state.identity.id, {}, undefined, undefined, undefined, undefined, 0)
            respawnTimer = INTERACTABLE_RESPAWN_DELAY
        }
        const respawnPlayer = (): void => {
            characterSystem.remove(playerId)
            playerId = characterSystem.add(PLAYER_CONFIG, respawnPos.x, respawnPos.y, respawnPos.z).id
            characterSystem.markPlayer(playerId)
            characterSystem.setCollisionVisible(false)
            followPoint.set(respawnPos.x, INTERACTABLE_CAMERA_TARGET_Y, respawnPos.z)
        }
        killBtn.addEventListener('click', () => { killPlayer(); killBtn.blur() })

        resetBtn.addEventListener('click', () => {
            for (const entry of entries) interactables.remove(entry.id)
            list.replaceChildren()
            spawnAll()
            setStatus('showcase.interact.hint')
            resetBtn.blur()
        })

        /* 击杀快捷键（K）：独立事件监听，随模式释放 */
        const events = new AbortController()
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (isTextEntryTarget(e.target)) return
            if (e.code === KILL_KEY && !e.repeat) killPlayer()
        }, {signal: events.signal})

        /* 点击聚焦：命中交互物即把相机飞向其中部、并在脚下显示呼吸环（不触发激活） */
        const focusPoint = new Vector3()
        const markerPoint = new Vector3()
        const focus = setupClickFocus<number>({
            scene: stage.scene,
            camera: stage.camera,
            domElement: host.renderer.domElement,
            orbit: playerControl,
            getObjects: () => interactables.getMeshes(),
            resolve: hit => {
                const all = interactables.getAll()
                let node: Object3D | null = hit.object
                while (node !== null && !all.some(e => e.group === node)) node = node.parent
                if (node === null) return undefined
                const entity = all.find(e => e.group === node)
                if (entity === undefined) return undefined
                const size = Math.max(entity.config.size[0], entity.config.size[1], entity.config.size[2])
                focusPoint.set(
                    entity.group.position.x,
                    entity.group.position.y + entity.config.size[1] / 2,
                    entity.group.position.z,
                )
                markerPoint.set(entity.group.position.x, entity.group.position.y + 0.02, entity.group.position.z)
                return {
                    point: focusPoint.clone(),
                    value: entity.id,
                    distance: size * 2 + 3,
                    marker: markerPoint,
                    markerScale: size * 0.8,
                }
            },
            onFocus: () => {},
        })

        /* —— 玩家交互输入（移动 / 翻滚 / 跳跃由 playerControl.move 处理） —— */
        const input = getInputRegistry()
        const interactionOut: InteractionTarget[] = []
        const applyInteraction = (): void => {
            const player = characterSystem.getPlayerCharacter()
            if (player === undefined) return
            /* 交互：收集最近可交互目标（生产解析），显示提示，按键触发 */
            const t = player.body.translation()
            interactionOut.length = 0
            interactables.collectInteractionTargets(t.x, t.y, t.z, interactionOut)
            let best: InteractionTarget | undefined
            for (const target of interactionOut) {
                if (best === undefined || target.score < best.score) best = target
            }
            promptEl.textContent = best?.prompt ?? ''
            if (input.wasActionPressed('interact') && best !== undefined) {
                interactables.activateInteraction(best.key)
            }
        }

        /* 固定子步物理（镜像 main.ts，清力内聚于运行器）：移动平台先瞬移到位、乘客步进**前**对齐，
         * 再世界步进。陷阱：漏清力会让角色坡面反重力力残留、跳跃后持续升空。 */
        /* 交互物只在渲染层参与插值：其 update 必须在 world.step 之前（平台瞬移 + 乘客携带） */
        const interactableRender: SteppableSystem = {
            captureRenderState: interactables.captureRenderState,
            syncPositions: interactables.syncPositions,
        }
        const step = createFixedStepStepper(shared, [...systems, interactableRender], {
            beforeStep: (dt) => {
                interactables.update(dt)
                characterSystem.applySupportCarry(dt)
            },
        })

        const updater = (dt: number): void => {
            /* 输入采样与交互脉冲须早于固定步（角色状态机在步内消费） */
            playerControl.move()
            applyInteraction()
            step(dt, performance.now())
            /* 相机跟随玩家渲染插值位置（固定观察高度） */
            const p = characterSystem.getPlayerRenderPosition()
            if (p !== undefined) {
                followPoint.set(p.x, INTERACTABLE_CAMERA_TARGET_Y, p.z)
            }
            if (respawnTimer > 0) {
                respawnTimer -= dt
                if (respawnTimer <= 0) respawnPlayer()
            }
            playerControl.update(dt)
            stage.followGrid()
            focus.update(dt)
            host.renderer.render(stage.scene, stage.camera)
        }

        return {
            updater,
            dispose: () => {
                events.abort()
                focus.dispose()
                panel.remove()
                style.remove()
                stage.dispose()
            },
        }
    },
}
