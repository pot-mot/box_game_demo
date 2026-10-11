import type {ShowcaseModule} from '../module.ts'
import {Vector3} from 'three'
import {setupShowcaseScene} from '../scene.ts'
import {createSharedWorld} from '../../../physics/world.ts'
import {createFixedStepStepper} from '../../../physics/fixed_step.ts'
import type {SteppableSystem} from '../../../physics/fixed_step.ts'
import {setupCharacterEntities} from '../../../entity/character/physics/world.ts'
import type {CharacterEntitySystem} from '../../../entity/character/physics/world.ts'
import {setupInteractables, defaultInteractableConfig} from '../../../entity/interactable/index.ts'
import type {InteractableContext, InteractableEntity} from '../../../entity/interactable/index.ts'
import type {InteractionTarget} from '../../../character/interaction/types.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import {ARMOR_SLOTS, type ArmorSlot} from '../../../character/armor/slots.ts'
import {DEFAULT_WEAPON_ID} from '../../../character/weapon/catalog.ts'
import {getInputRegistry} from '../../../input/registry.ts'
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
} from '../../../inventory/index.ts'
import {ITEM_DEFS} from '../../../inventory/items.ts'
import {EQUIP_SLOTS, type EquipSlot, type InventoryState} from '../../../inventory/types.ts'
import {localizeText, localizeApply} from '../../../i18n/dom.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import {
    INVENTORY_CAMERA_DISTANCE,
    INVENTORY_CAMERA_TARGET_Y,
    INVENTORY_CHEST_Z,
    PLAYER_JUMP_HEIGHT,
    PLAYER_SPAWN_Z,
    PLAYER_SPEED,
    PLAYER_SPRINT_MULTIPLIER,
    SHOWCASE_INVENTORY_WIDTH,
    SHOWCASE_INVENTORY_HEIGHT,
} from '../constants.ts'

/** 简化玩家配置（无 AI、无锁定点，仅用于演示背包 / 开箱交互） */
const PLAYER_CONFIG: CharacterSaveConfig = {
    speed: PLAYER_SPEED,
    jumpHeight: PLAYER_JUMP_HEIGHT,
    scale: 1,
    attack: {weaponId: 'short_sword', damage: 3},
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
 * 同时提供**简化版玩家**（`WASD` 移动 / 空格跳跃 / `Shift` 冲刺 / `F` 交互 / `Tab` 开关背包）与一个
 * 地面箱子：走到箱子旁按 `F` 打开双栏容器面板（玩家背包 ↔ 箱子，可拖拽存取），相机跟随玩家
 * （鼠标拖拽环绕观察）。使用生产同一套 `CharacterEntitySystem` + `InteractableContext` 与物理固定子步，
 * 起到背包 / 装备 / 开箱交互的人员测试效果。
 */
export const inventoryModule: ShowcaseModule = {
    id: 'inventory',
    title: 'showcase.module.inventory.title',
    description: 'showcase.module.inventory.desc',
    setup: host => {
        /* 关闭相机 WASD 自由飞行：WASD 交给玩家，相机跟随玩家、鼠标环绕观察 */
        const sceneCtx = setupShowcaseScene(host.renderer, false)
        const shared = createSharedWorld()
        const interactables: InteractableContext = setupInteractables(sceneCtx.scene, shared)
        const characterSystem: CharacterEntitySystem = setupCharacterEntities(sceneCtx.scene, shared)
        const systems: SteppableSystem[] = [interactables, characterSystem]

        /* —— 简化玩家：出生在箱子前方，隐藏碰撞胶囊 —— */
        const playerId = characterSystem.add(PLAYER_CONFIG, 0, 0.6, PLAYER_SPAWN_Z).id
        characterSystem.markPlayer(playerId)
        characterSystem.setCollisionVisible(false)
        interactables.setPlayerAccess({
            readPosition: () => {
                const p = characterSystem.getPlayerCharacter()
                if (p === undefined) return undefined
                const t = p.body.translation()
                return {x: t.x, y: t.y, z: t.z}
            },
            isGrounded: () => characterSystem.getPlayerCharacter()?.isOnGround ?? false,
            translate: (dx, dy, dz) => {
                const p = characterSystem.getPlayerCharacter()
                if (p === undefined) return
                const t = p.body.translation()
                p.body.setTranslation({x: t.x + dx, y: t.y + dy, z: t.z + dz}, true)
            },
        })

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
        equipDef('weapon_short_sword', 'main_hand')
        equipDef('armor_iron_helmet', 'head')
        equipDef('armor_iron_plate', 'chest')
        equipDef('armor_iron_bracers', 'arms')
        equipDef('armor_iron_greaves', 'legs')

        const equippedDef = (slot: EquipSlot) => {
            const id = inventory.equipment[slot]
            return id === undefined ? undefined : findItemDef(findStack(inventory, id)?.defId ?? '')
        }
        const previewData = (): EquipPreviewData => {
            const armor: Partial<Record<EquipSlot, string>> = {}
            for (const slot of EQUIP_SLOTS) {
                const def = equippedDef(slot)
                if (def?.armorId !== undefined) armor[slot] = def.armorId
            }
            return {
                mainWeaponId: equippedDef('main_hand')?.weaponId,
                offhandWeaponId: equippedDef('off_hand')?.weaponId,
                armor,
            }
        }

        const preview: EquipmentPreview = createEquipmentPreview()

        /** 把装备映射同步到场景内玩家（主手 / 副手武器 + 四槽护甲）与预览小窗 */
        const applyEquipment = (): void => {
            const player = characterSystem.getPlayerCharacter()
            if (player !== undefined) {
                const main = equippedDef('main_hand')
                const off = equippedDef('off_hand')
                characterSystem.updateCharacterConfig(
                    playerId,
                    {},
                    {weaponId: main?.weaponId ?? DEFAULT_WEAPON_ID},
                    undefined, undefined, undefined, undefined, undefined,
                    off?.weaponId !== undefined ? {weaponId: off.weaponId} : null,
                )
                const armor: Partial<Record<ArmorSlot, string>> = {}
                for (const slot of ARMOR_SLOTS) {
                    const def = equippedDef(slot)
                    if (def?.armorId !== undefined) armor[slot] = def.armorId
                }
                characterSystem.updateCharacterConfig(playerId, {}, undefined, undefined, undefined, undefined, undefined, {armor})
            }
            preview.setEquipment(previewData())
            preview.render()
        }

        /* —— 背包面板（初始显示，`Tab` / 装备键可开关） —— */
        const panel: InventoryPanel = createInventoryPanel({
            getInventory: () => inventory,
            onMove: (instanceId, placement) => moveStack(inventory, instanceId, placement),
            onEquip: (instanceId, slot) => {
                if (slot === undefined) {
                    const def = findItemDef(findStack(inventory, instanceId)?.defId ?? '')
                    const target: EquipSlot = def?.category === 'weapon' ? 'main_hand' : (def?.equipSlot ?? 'main_hand')
                    return equipStack(inventory, instanceId, target)
                }
                return equipStack(inventory, instanceId, slot)
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

        /* 相机跟随玩家（鼠标仍可环绕 / 缩放） */
        const followPoint = new Vector3(0, INVENTORY_CAMERA_TARGET_Y, PLAYER_SPAWN_Z)
        sceneCtx.orbit.target.copy(followPoint)
        sceneCtx.orbit.setFollow(followPoint)
        sceneCtx.orbit.setDistance(INVENTORY_CAMERA_DISTANCE)

        /* —— 玩家输入：开关背包 / 移动 / 跳跃 / 冲刺 / 交互（相机跟随，不再消费 WASD） —— */
        const input = getInputRegistry()
        const interactionOut: InteractionTarget[] = []
        const applyInput = (): void => {
            /* 背包开关（边沿触发）：与 play 模式一致，`open_inventory` / `open_equipment` 共用 */
            if (input.wasActionPressed('open_inventory') || input.wasActionPressed('open_equipment')) {
                toggleInventory()
            }
            const player = characterSystem.getPlayerCharacter()
            if (player === undefined) return
            /* 冲刺：按住提升基础移速（状态机移速统一取 config.speed × 装备乘数） */
            player.config.speed = PLAYER_SPEED * (input.isActionActive('sprint') ? PLAYER_SPRINT_MULTIPLIER : 1)
            /* 以相机偏航角为基准的相对移动 */
            const yaw = sceneCtx.orbit.getYaw()
            const fwdX = -Math.sin(yaw)
            const fwdZ = -Math.cos(yaw)
            const rightX = Math.cos(yaw)
            const rightZ = -Math.sin(yaw)
            let dx = 0
            let dz = 0
            if (input.isActionActive('move_forward')) { dx += fwdX; dz += fwdZ }
            if (input.isActionActive('move_backward')) { dx -= fwdX; dz -= fwdZ }
            if (input.isActionActive('move_left')) { dx -= rightX; dz -= rightZ }
            if (input.isActionActive('move_right')) { dx += rightX; dz += rightZ }
            characterSystem.setPlayerMove(dx, dz, input.wasActionPressed('jump'), fwdX, fwdZ)

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

        /* 固定子步物理（镜像 main.ts，清力内聚于运行器）：世界步进 → 各系统 preSync / syncPositions
         * （preSync 内已推进交互物动画）。陷阱：漏清力会让角色坡面反重力力残留、跳跃后持续升空。 */
        const step = createFixedStepStepper(shared, systems)

        const updater = (dt: number): void => {
            step(dt, performance.now())
            applyInput()
            characterSystem.update(dt)
            /* 相机跟随玩家（固定观察高度） */
            const player = characterSystem.getPlayerCharacter()
            if (player !== undefined) {
                const t = player.body.translation()
                followPoint.set(t.x, INVENTORY_CAMERA_TARGET_Y, t.z)
            }
            sceneCtx.followGrid()
            sceneCtx.orbit.update(dt)
            host.renderer.render(sceneCtx.scene, sceneCtx.camera)
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
                sceneCtx.dispose()
            },
        }
    },
}
