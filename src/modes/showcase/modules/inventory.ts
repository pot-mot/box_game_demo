import type {ShowcaseModule} from '../module.ts'
import {Vector3} from 'three'
import {setupShowcaseStage} from '../scene.ts'
import {createPlayerControl} from '../../control/player_control.ts'
import {createSharedWorld} from '../../../physics/world.ts'
import {createFixedStepStepper} from '../../../physics/fixed_step.ts'
import type {SteppableSystem} from '../../../physics/fixed_step.ts'
import {setupCharacterEntities} from '../../../entity/character/physics/world.ts'
import type {CharacterEntitySystem} from '../../../entity/character/physics/world.ts'
import {setupInteractables, defaultInteractableConfig} from '../../../entity/interactable/index.ts'
import type {InteractableContext, InteractableEntity} from '../../../entity/interactable/index.ts'
import type {InteractionTarget} from '../../../character/interaction/types.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import {HUMANOID_BODY_FORM} from '../../../entity/character/body_form/index.ts'
import {equipSlotKey, withEquipmentAt, type EquipmentState} from '../../../character/equipment/types.ts'
import {getInputRegistry} from '../../../input/registry.ts'
import {MOUSE_ACTIONS_BY_MODE} from '../../../input/types.ts'
import {createInventoryPanel, type InventoryPanel} from '../../play/inventory_ui/panel.ts'
import {createContainerPanel, type ContainerPanel} from '../../play/container_ui/panel.ts'
import {createEquipmentPreview, type EquipmentPreview, type EquipPreviewData} from '../../play/equipment_ui/preview.ts'
import {
    addItem,
    createInventory,
    equipStack,
    findItemDef,
    findStack,
    moveStack,
    removeAt,
    unequipSlot,
    equipItemIdOf,
} from '../../../inventory/index.ts'
import {ITEM_DEFS} from '../../../inventory/items.ts'
import type {EquipSlot, InventoryState} from '../../../inventory/types.ts'
import {localizeText, localizeApply} from '../../../i18n/dom.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import {
    INVENTORY_CAMERA_DISTANCE,
    INVENTORY_CAMERA_TARGET_Y,
    INVENTORY_CHEST_Z,
    PLAYER_JUMP_HEIGHT,
    PLAYER_SPAWN_Z,
    PLAYER_SPEED,
    SHOWCASE_INVENTORY_WIDTH,
    SHOWCASE_INVENTORY_HEIGHT,
} from '../constants.ts'

/** 简化玩家配置（无 AI、无锁定点，仅用于演示背包 / 开箱交互） */
const PLAYER_CONFIG: CharacterSaveConfig = {
    speed: PLAYER_SPEED,
    jumpHeight: PLAYER_JUMP_HEIGHT,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: 'short_sword'}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 100,
    isPlayer: true,
    navEnabled: false,
}

/**
 * 背包与物品格子交互子模块。
 *
 * 内容：复用 play 模式的俄罗斯方块背包面板（`modes/play/inventory_ui`）、双栏容器面板
 * （`modes/play/container_ui`）与装备模型预览（`modes/play/equipment_ui`），注入一份演示背包
 * （全武器 / 全护甲 + 消耗品 / 材料 / 钥匙），支持拖拽移动、`R` 旋转、拖到环绕装备槽装备、
 * 点装备槽卸下、丢弃——装备变化即时同步到面板预览与**场景内玩家模型**。
 *
 * 同时提供**简化版玩家**（`WASD` 移动 / 空格跳跃 / `Shift` 翻滚 / `F` 交互 / `Tab` 开关背包）与一个
 * 地面箱子：走到箱子旁按 `F` 打开双栏容器面板（玩家背包 ↔ 箱子，可拖拽存取），相机跟随玩家
 * （鼠标拖拽环绕观察）。使用生产同一套 `CharacterEntitySystem` + `InteractableContext` 与物理固定子步，
 * 起到背包 / 装备 / 开箱交互的人员测试效果。
 */
export const inventoryModule: ShowcaseModule = {
    id: 'inventory',
    title: 'showcase.module.inventory.title',
    description: 'showcase.module.inventory.desc',
    setup: host => {
        /* 玩家主控方案：WASD 交给玩家，相机第三人称跟随（鼠标环绕） */
        const stage = setupShowcaseStage(host.renderer)
        const shared = createSharedWorld()
        const interactables: InteractableContext = setupInteractables(stage.scene, shared)
        const characterSystem: CharacterEntitySystem = setupCharacterEntities(stage.scene, shared)
        const systems: SteppableSystem[] = [characterSystem]

        /* —— 简化玩家：出生在箱子前方，隐藏碰撞胶囊 —— */
        const playerId = characterSystem.add(PLAYER_CONFIG, 0, 0.6, PLAYER_SPAWN_Z).id
        characterSystem.markPlayer(playerId)
        characterSystem.setCollisionVisible(false)

        /* —— 演示箱子：置于玩家前方地面（原点在底面，玩家自 +Z 面向 -Z 走向它） —— */
        const chest = interactables.add(defaultInteractableConfig('chest'), 0, 0, INVENTORY_CHEST_Z, 0)

        /* —— 演示背包：铺满全物品（消耗品 / 材料按堆叠数量） —— */
        const inventory: InventoryState = createInventory(SHOWCASE_INVENTORY_WIDTH, SHOWCASE_INVENTORY_HEIGHT)
        for (const def of ITEM_DEFS) {
            addItem(inventory, def.id, def.maxStack > 1 ? 5 : 1)
        }
        /* 预装一套装备（主手短剑 + 铁制四槽），使预览 / 玩家初始即有内容 */
        const equipDef = (defId: string, slot: EquipSlot): void => {
            const stack = inventory.stacks.find(s => s.defId === defId)
            if (stack !== undefined) equipStack(inventory, stack.instanceId, slot)
        }
        equipDef('weapon_short_sword', 'weapon:main_hand')
        equipDef('armor_iron_helmet', 'armor:head')
        equipDef('armor_iron_plate', 'armor:chest')
        equipDef('armor_iron_bracers', 'armor:arms')
        equipDef('armor_iron_greaves', 'armor:legs')

        const equippedDef = (slot: EquipSlot) => {
            const id = inventory.equipment[slot]
            return id === undefined ? undefined : findItemDef(findStack(inventory, id)?.defId ?? '')
        }
        const previewData = (): EquipPreviewData => {
            const armor: Partial<Record<string, string>> = {}
            for (const [key, instanceId] of Object.entries(inventory.equipment)) {
                if (instanceId === undefined || !key.startsWith('armor:')) continue
                const def = findItemDef(findStack(inventory, instanceId)?.defId ?? '')
                if (def?.armorId !== undefined) armor[key.slice('armor:'.length)] = def.armorId
            }
            return {
                bodyFormId: 'humanoid',
                mainWeaponId: equippedDef('weapon:main_hand')?.weaponId,
                offhandWeaponId: equippedDef('weapon:off_hand')?.weaponId,
                armor,
            }
        }

        const preview: EquipmentPreview = createEquipmentPreview()

        /** 把装备映射同步到场景内玩家（主手 / 副手武器 + 分层装备）与预览小窗 */
        const applyEquipment = (): void => {
            const player = characterSystem.getPlayerCharacter()
            if (player !== undefined) {
                let state: EquipmentState = {limb: {}, weapon: {}, armor: {}}
                for (const instanceId of Object.values(inventory.equipment)) {
                    if (instanceId === undefined) continue
                    const def = findItemDef(findStack(inventory, instanceId)?.defId ?? '')
                    if (def === undefined || def.equipKind === undefined || def.equipSlot === undefined) continue
                    const itemId = equipItemIdOf(def)
                    if (itemId === undefined) continue
                    state = withEquipmentAt(state, def.equipKind, def.equipSlot, itemId)
                }
                const mainWeaponId = state.weapon.main_hand ?? HUMANOID_BODY_FORM.defaultWeaponId
                const offWeaponId = state.weapon.off_hand
                characterSystem.updateCharacterConfig(
                    playerId,
                    {},
                    {weaponId: mainWeaponId},
                    undefined, undefined, undefined, undefined,
                    {equipment: state},
                    offWeaponId !== undefined ? {weaponId: offWeaponId} : null,
                )
            }
            preview.setEquipment(previewData())
            preview.render()
        }

        /* —— 背包面板（初始显示，`Tab` / 装备键可开关） —— */
        const panel: InventoryPanel = createInventoryPanel({
            getInventory: () => inventory,
            getSlots: () => HUMANOID_BODY_FORM.equipSlots,
            onMove: (instanceId, placement) => moveStack(inventory, instanceId, placement),
            onEquip: (instanceId, slot) => {
                if (slot === undefined) {
                    const def = findItemDef(findStack(inventory, instanceId)?.defId ?? '')
                    if (def === undefined || def.equipKind === undefined || def.equipSlot === undefined) return false
                    return equipStack(inventory, instanceId, equipSlotKey(def.equipKind, def.equipSlot), {bodyFormId: 'humanoid', allowedSlots: HUMANOID_BODY_FORM.equipSlots.map(s => equipSlotKey(s.kind, s.bodyPart))})
                }
                return equipStack(inventory, instanceId, slot, {bodyFormId: 'humanoid', allowedSlots: HUMANOID_BODY_FORM.equipSlots.map(s => equipSlotKey(s.kind, s.bodyPart))})
            },
            onUnequip: (slot) => unequipSlot(inventory, slot),
            onDrop: (instanceId) => { removeAt(inventory, instanceId) },
            onEquipmentChanged: () => applyEquipment(),
        })
        panel.attachPreview(preview.canvas)

        /* —— 双栏容器面板（打开箱子）：玩家背包 ↔ 箱子，拖拽 / 双击存取 —— */
        const containerPanel: ContainerPanel = createContainerPanel({
            getPlayerInventory: () => inventory,
            onChanged: () => panel.refresh(),
        })

        /* 背包面板开关（`Tab` / 开关背包键 / HUD 按钮共用）：与箱子容器面板互斥显示 */
        const toggleInventory = (): void => {
            if (panel.isVisible()) {
                panel.setVisible(false)
            } else {
                containerPanel.close()
                panel.setVisible(true)
            }
        }

        /* —— HUD（左上）：标题 / 操作说明 / 最近交互提示 / 状态 —— */
        const style = document.createElement('style')
        style.textContent = `
.sch-inv { position: fixed; top: 16px; left: 16px; width: 340px;
    background: var(--dc-bg-2); color: var(--dc-text);
    font-family: var(--dc-font-mono); font-size: var(--dc-fs-12); line-height: 1.5;
    border: 1px solid var(--dc-border); border-radius: var(--dc-radius-lg);
    box-shadow: var(--dc-shadow-panel), inset 0 0 0 1px var(--dc-hairline);
    padding: 12px 14px; user-select: none; }
.sch-inv-title { font-family: var(--dc-font-display); font-size: 15px; font-weight: 700; color: var(--dc-gold); letter-spacing: 1px; }
.sch-inv-sub { color: var(--dc-text-dim); font-size: 11px; margin: 2px 0 8px; }
.sch-inv-prompt { min-height: 18px; color: var(--dc-gold); font-size: 12px; }
.sch-inv-status { border-top: 1px solid var(--dc-border); margin-top: 6px; padding-top: 6px; color: var(--dc-text-dim); min-height: 18px; font-size: 12px; }
.sch-inv-btn { margin-top: 8px; background: var(--dc-bg-3); color: var(--dc-text); border: 1px solid var(--dc-border);
    border-radius: var(--dc-radius); padding: 3px 10px; cursor: pointer; font: inherit; }
.sch-inv-btn:hover { background: var(--dc-bg-2); border-color: var(--dc-border-strong); }
`
        document.head.appendChild(style)

        const hud = document.createElement('div')
        hud.className = 'sch-inv'
        const hudTitle = document.createElement('div')
        hudTitle.className = 'sch-inv-title'
        localizeText(hudTitle, 'showcase.module.inventory.title')
        const hudControls = document.createElement('div')
        hudControls.className = 'sch-inv-sub'
        localizeText(hudControls, 'showcase.inventory.controls')
        const promptEl = document.createElement('div')
        promptEl.className = 'sch-inv-prompt'
        const statusEl = document.createElement('div')
        statusEl.className = 'sch-inv-status'
        let statusKey: StringLocaleKey = 'showcase.inventory.hint'
        const setStatus = (key: StringLocaleKey): void => {
            statusKey = key
            statusEl.textContent = translate(key)
        }
        localizeApply(statusEl, el => { el.textContent = translate(statusKey) })
        const openBtn = document.createElement('button')
        openBtn.type = 'button'
        openBtn.className = 'sch-inv-btn'
        localizeText(openBtn, 'showcase.inventory.open')
        openBtn.addEventListener('click', () => { toggleInventory(); openBtn.blur() })
        hud.appendChild(hudTitle)
        hud.appendChild(hudControls)
        hud.appendChild(promptEl)
        hud.appendChild(statusEl)
        hud.appendChild(openBtn)
        document.body.appendChild(hud)

        /* Tab 开关背包：输入注册表已拦截游戏画面内 Tab 的默认焦点切换；此处仅在焦点位于
         * 游戏画面（body）时响应，避免设置面板 / 表单内的 Tab 导航被误触发 */
        const events = new AbortController()
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.code !== 'Tab' || e.repeat) return
            if (document.activeElement !== document.body) return
            e.preventDefault()
            toggleInventory()
        }, {signal: events.signal})

        /* —— 领域钩子：打开箱子 → 双栏容器面板（与背包面板互斥显示） —— */
        interactables.setHooks({
            onOpenChest: (e: InteractableEntity) => {
                panel.setVisible(false)
                containerPanel.open(e.container, e.id)
                setStatus('showcase.inventory.event_chest')
            },
        })

        /* 玩家主控相机（跟随玩家，固定观察高度；Shift = 翻滚） */
        const followPoint = new Vector3(0, INVENTORY_CAMERA_TARGET_Y, PLAYER_SPAWN_Z)
        const playerControl = createPlayerControl(stage.camera, host.renderer.domElement, {
            getTarget: () => followPoint,
            move: (dx, dz, jump, forwardX, forwardZ, roll, swimLift) =>
                characterSystem.setPlayerMove(dx, dz, jump, forwardX, forwardZ, roll, swimLift),
            pointerActions: MOUSE_ACTIONS_BY_MODE.showcase,
            initialYaw: 0,
            initialDistance: INVENTORY_CAMERA_DISTANCE,
            signal: stage.signal,
        })
        playerControl.update(0)

        /* —— 玩家输入：开关背包 / 交互（移动 / 翻滚 / 跳跃由 playerControl.move 处理） —— */
        const input = getInputRegistry()
        const interactionOut: InteractionTarget[] = []
        const applyInteraction = (): void => {
            /* 背包开关（边沿触发）：与 play 模式一致，`open_inventory` / `open_equipment` 共用 */
            if (input.wasActionPressed('open_inventory') || input.wasActionPressed('open_equipment')) {
                toggleInventory()
            }
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

        /* 固定子步物理（镜像 main.ts，清力内聚于运行器）：世界步进 → 各系统 preSync / 游戏逻辑 / 插值。
         * 陷阱：漏清力会让角色坡面反重力力残留、跳跃后持续升空。 */
        /* 交互物只在渲染层参与插值：其 update 必须在 world.step 之前（平台瞬移） */
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
                followPoint.set(p.x, INVENTORY_CAMERA_TARGET_Y, p.z)
            }
            playerControl.update(dt)
            stage.followGrid()
            host.renderer.render(stage.scene, stage.camera)
        }

        /* 初始化：装备应用到玩家模型与预览，背包面板显示 */
        applyEquipment()
        panel.setVisible(true)

        return {
            updater,
            dispose: () => {
                events.abort()
                panel.destroy()
                containerPanel.destroy()
                preview.dispose()
                /* 箱子随场景释放；显式移除以便释放其网格 / 刚体 */
                interactables.remove(chest.id)
                hud.remove()
                style.remove()
                stage.dispose()
            },
        }
    },
}
