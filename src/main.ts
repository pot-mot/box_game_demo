import './assets/style.css'
import './assets/theme.css'
import {type Mesh} from 'three'
import type {EntityInfoSource} from './entity/box/base/types/entity_info.ts'
import type {EntityTickHandler} from './types/physics.ts'
import type {TerrainContext} from './entity/terrain/base/types'
import type {GameMode} from './modes/constants.ts'
import type {SaveData} from './save_load/types.ts'
import RAPIER from '@dimforge/rapier3d-compat'
import {createRenderContext} from './render/setup.ts'
import {createSharedWorld} from './physics/world.ts'
import {clearAllForces} from './physics/rapier_utils.ts'
import {createVelocitySnapshots} from './physics/velocity_snapshots.ts'
import {setupInfiniteGrid} from './render/grid.ts'
import {setupRefractionPass} from './render/refraction_pass.ts'
import {createPhysicsEnv} from './physics/env.ts'
import {setupBoxes} from './entity/box/physics/world.ts'
import {boxPresetConfig} from './entity/box/presets.ts'
import {setupFragmentEntities} from './entity/fragment/common/physics/world.ts'
import {setupAreas} from './entity/area/physics/world.ts'
import {setupTerrain} from './entity/terrain/common/physics/world.ts'
import {setupBuildingGenerator} from './entity/building_generator/world.ts'
import {setupInteractables} from './entity/interactable/index.ts'
import {setupItemEntities} from './entity/item/index.ts'
import {setupHakoniwa} from './modes/play/hakoniwa.ts'
import type {PlaySaveData} from './modes/play/save.ts'
import {setupCharacterEntities} from './entity/character/physics/world.ts'
import type {CharacterEntitySystem} from './entity/character/physics/world.ts'
import type {SpawnBoxCallback} from './entity/character/ai/types.ts'
import type {CharacterEntity} from './character/types.ts'
import {setupCameraInfo} from './ui/camera_info.ts'
import {installIconSprite} from './ui/icons/sprite.ts'
import {setupStartupScreen} from './modes/startup_screen.ts'
import {setupSettingsPanel} from './ui/settings_panel.ts'
import {setupEditMode} from './modes/edit'
import type {EditModeController} from './modes/edit'
import {setupPlayMode} from './modes/play'
import type {PlayModeController} from './modes/play'
import {setupShowcaseMode} from './modes/showcase'
import type {ShowcaseModeController} from './modes/showcase'
import {setupBoneEditMode} from './modes/bone_edit'
import type {BoneEditModeController} from './modes/bone_edit'
import {collectWorldState, saveWorldToFile} from './save_load/serialize.ts'
import {loadWorldFromData, clearAllEntities, type LoadWorldResult} from './save_load/deserialize.ts'
import {cacheSaveData, loadCachedSaveData} from './save_load/cache.ts'
import {promptLoadFile} from './save_load/actions.ts'
import {showSkippedEntitiesNotice} from './ui/components/message_dialog.ts'
import {MAX_DT, FIXED_TIME_STEP, MAX_SUB_STEPS} from './physics/constants.ts'
import {createFixedStepClock} from './physics/fixed_step.ts'
import {createInputRegistry} from './input/registry.ts'
import {openOperationsPanel} from './input/operations_panel.ts'

type EntitySystem = EntityInfoSource & EntityTickHandler

const app = document.querySelector<HTMLDivElement>('#app')!

// 图标 sprite 需在任意面板创建前注入（<use> 引用依赖其存在）
installIconSprite()

// ── 启动页（展示模式退出后可重新拉起） ──

const showStartup = (): void => {
    setupStartupScreen({
        onStart: (mode: GameMode, saveData?: SaveData) => {
            startGame(mode, saveData)
        },
    })
}
showStartup()

const startGame = async (mode: GameMode, saveData?: SaveData): Promise<void> => {
    // --- Rapier 物理引擎初始化 ---
    await RAPIER.init()

    // --- 输入注册表（必须在所有模式初始化之前）---
    const input = createInputRegistry()

    // --- 渲染系统 ---
    const {scene, camera, renderer} = createRenderContext(app)
    const {renderFrame, excludeFromBackground} = setupRefractionPass(scene, camera, renderer)

    // --- 无限地面网格 ---
    const gridUpdate = setupInfiniteGrid(scene, camera)

    // --- 共享物理世界 ---
    const shared = createSharedWorld()
    const physicsEnv = createPhysicsEnv()

    /* 每个物理子步结束后清除所有刚体累积力：
     * Rapier addForce 不会自动清除，本项目所有施力均为「每物理步」瞬态语义（preSync / 状态机每步执行一次） */
    shared.eventBus.onStepEnd(() => clearAllForces(shared.world))

    /* 撞击前速度快照（单例）：箱子可破坏 / 弹性特性共用，每子步结束自动刷新 */
    const velocitySnapshots = createVelocitySnapshots(shared.eventBus, () => physicsEnv.getAllBodies())

    // --- Entity 子系统（按依赖顺序初始化）---
    const fragments = setupFragmentEntities(scene, shared)
    const terrainSource = setupTerrain(scene, shared, () => physicsEnv.getAllBodies())
    const allTerrainSources: TerrainContext[] = [terrainSource]
    const building = setupBuildingGenerator(scene, shared)
    const interactables = setupInteractables(scene, shared)
    const itemEntities = setupItemEntities(scene, shared)
    const characterSystem: CharacterEntitySystem = setupCharacterEntities(scene, shared)
    const boxes = setupBoxes(scene, shared, {fragmentCtx: fragments, velocitySnapshots, physicsEnv})
    const areas = setupAreas(scene, physicsEnv)

    // 注册 body provider
    physicsEnv.bodyProviders.push(
        () => fragments.getAll().map(f => f.body),
        () => characterSystem.getAll().map((e: CharacterEntity) => e.body),
        () => boxes.getAll().map(e => e.body),
        () => terrainSource.getAll().map(e => e.body),
        () => interactables.getAll().map(e => e.body),
        () => itemEntities.getAll().map(e => e.body),
    )

    /* 环境场通道：角色注册自己的环境累加器，area 场据此绕开状态机速度覆写影响角色 */
    physicsEnv.registerEnvironmentProvider((body) => characterSystem.getCharacterByBody(body)?.state.environment)

    // 按 type 索引
    const systems: EntitySystem[] = [boxes, fragments, areas, characterSystem as EntitySystem, terrainSource, building, interactables as EntitySystem, itemEntities as EntitySystem]
    const systemsByType = new Map<string, EntityInfoSource>(
        systems.map(s => [s.type, s]),
    )

    characterSystem.setupAI(systems)

    /**
     * 清空世界：所有存档实体 + 执行期产生的临时对象。
     * 子弹不属于存档实体（由角色战斗系统内部持有），必须显式清理，
     * 否则 Reset / 载入存档后会残留在还原后的世界里继续飞行。
     */
    const clearWorld = (): void => {
        characterSystem.clearBullets()
        clearAllEntities(systemsByType, allTerrainSources)
    }

    /* 箱子生成回调（供 builder AI 使用）：特性由 preset 决定，质量 = 单位质量 × 体积 */
    const boxSpawner: SpawnBoxCallback = (entry, x, y, z, size): void => {
        const mass = entry.mass * size.width * size.height * size.depth
        boxes.add(boxPresetConfig(entry.preset, {...size, mass, friction: entry.friction}), x, y, z)
    }

    characterSystem.registerBoxSpawner(boxSpawner)

    // --- 从缓存/导入文件加载实体（必须在 mode setup 之前，确保角色存在后再激活 AI）---
    let loadResult: LoadWorldResult | undefined
    /* play 模式的背包 / 传送点等数据存于 modeInfo.play */
    let savedPlay: PlaySaveData | undefined
    /* 展示/骨骼动画模式为独立干净场景，不加载存档元素 */
    if (mode === 'edit' || mode === 'play') {
        /* 启动屏已解析的存档直接使用；否则（无导入）回退到缓存，缓存解析结果携带跳过明细。
         * 启动屏路径的跳过提示已在启动屏弹出，此处不重复。 */
        const cachedParsed = saveData === undefined ? loadCachedSaveData() : undefined
        const dataToLoad: SaveData | undefined = saveData ?? cachedParsed?.data
        if (cachedParsed !== undefined) void showSkippedEntitiesNotice(cachedParsed.skipped)
        if (dataToLoad) {
            if (mode === 'play' && dataToLoad.modeInfo?.play !== undefined) {
                savedPlay = {
                    inventory: dataToLoad.modeInfo.play.inventory,
                    knownTeleports: dataToLoad.modeInfo.play.teleports,
                }
            }
            clearWorld()
            loadResult = loadWorldFromData(dataToLoad, systemsByType, allTerrainSources)
        }
    }

    // --- 模式控制器（编辑/游玩/展示/骨骼动画）---
    let editMode: EditModeController | undefined
    let playMode: PlayModeController | undefined
    let showcaseMode: ShowcaseModeController | undefined
    let boneEditMode: BoneEditModeController | undefined
    /* 展示模式退出（返回启动屏）后置位，终止本 RAF 循环，新循环由再次 startGame 启动 */
    let showcaseExited = false

    if (mode === 'edit') {
        editMode = setupEditMode(camera, renderer, scene, systems, allTerrainSources, terrainSource, building, excludeFromBackground, characterSystem)
    } else if (mode === 'play') {
        playMode = setupPlayMode(scene, camera, renderer, shared, allTerrainSources, characterSystem, boxSpawner)
    } else if (mode === 'showcase') {
        /* 展示模式：复用共享渲染器与单 RAF 循环，自建独立展示场景 */
        showcaseMode = setupShowcaseMode({
            renderer,
            onExit: () => {
                showcaseExited = true
                /* 销毁本次装配的渲染器与画布，避免重现启动屏/再次进入模式时叠加残留 */
                renderer.domElement.remove()
                renderer.dispose()
                showStartup()
            },
        })
    } else {
        /* 骨骼动画编辑模式：复用主场景，物理冻结，仅编辑骨骼节点/段与动画轨道 */
        boneEditMode = setupBoneEditMode(camera, renderer, scene, excludeFromBackground)
    }

    /* ── 交互物接线：存档回调 / 可破坏命中目标注册 ── */
    const hakoniwa = mode === 'play' ? setupHakoniwa(characterSystem, itemEntities, interactables, building, savedPlay) : undefined
    interactables.setHooks({
        onSavePoint: () => {
            const state = collectWorldState(systemsByType, allTerrainSources, mode, camera.position, camera.rotation)
            if (mode === 'play' && hakoniwa !== undefined) {
                state.modeInfo = {...(state.modeInfo ?? {}), play: {...(state.modeInfo?.play ?? {}), ...hakoniwa.getSaveData()}}
            }
            cacheSaveData(state)
        },
        onOpenChest: (e) => hakoniwa?.openChest(e),
        onTeleport: (e) => hakoniwa?.onTeleport(e),
    })
    characterSystem.registerWorldDamageTargets(interactables.collectBreakableTargets)
    itemEntities.setPickupHandler((defId, count) => hakoniwa?.tryPickup(defId, count) ?? false)

    if (mode === 'edit') {
        /* edit 模式主动触发当前选中的交互物 */
        input.onActionDown('interact', () => {
            const id = interactables.getSelectedId()
            if (id !== undefined) interactables.activate(id)
        })
    }
    if (mode === 'play') {
        playMode?.registerInteractionProvider(interactables)
        playMode?.registerInteractionProvider(itemEntities)
    }

    /* ── 编辑模式：执行 / 步进状态 ── */
    let executing = false
    let snapshot: SaveData | undefined
    let aiActive = false
    /** 自最近一次基线记录以来世界是否已被步进：步进后当前状态就不再是「编辑基线」 */
    let steppedSinceBaseline = false

    const saveSnapshot = (): void => {
        snapshot = collectWorldState(
            systemsByType,
            allTerrainSources,
            'edit',
            camera.position,
            camera.rotation,
        )
        steppedSinceBaseline = false
    }

    const restoreSnapshot = (): void => {
        if (!snapshot) return
        /* Reset 还原整个世界：实体由快照重建，执行期子弹一并清除 */
        clearWorld()
        loadWorldFromData(snapshot, systemsByType, allTerrainSources)
        saveSnapshot()
    }

    const ensureAI = (): void => {
        const shouldRun = executing || (editMode?.execute.pendingSteps() ?? 0) > 0
        if (shouldRun && !aiActive) {
            characterSystem.setAIEnabled(true)
            characterSystem.activateAI()
            aiActive = true
        } else if (!shouldRun && aiActive) {
            characterSystem.setAIEnabled(false)
            aiActive = false
        }
    }

    if (editMode) {
        editMode.execute.onToggle((entering: boolean) => {
            if (entering) {
                /* 世界尚未步进过（仍是编辑态）时重记基线，保证编辑内容不被 Reset 丢弃；
                 * 世界已步进过则保留原基线，使「Execute → Stop → 再次 Execute」不会改变 Reset 的还原点 */
                if (!steppedSinceBaseline) saveSnapshot()
                executing = true
            } else {
                /* Stop 只停止世界步进，保留当前世界状态；还原唯一入口是 Reset */
                executing = false
            }
        })

        editMode.execute.onReset(() => {
            executing = false
            characterSystem.setAIEnabled(false)
            aiActive = false
            /* Reset 是唯一的世界还原入口：回到最近一次「步进之前」的状态 */
            restoreSnapshot()
        })
    }

    /* 进入编辑模式时保存初始快照，保证始终至少有一个快照 */
    if (mode === 'edit') saveSnapshot()

    /* 调试可视化默认全部关闭（编辑模式下由实体列表上方的显示控制面板开启） */
    characterSystem.setCollisionVisible(false)

    // --- 恢复相机 ---
    if (loadResult) {
        if (mode === 'edit') {
            if (loadResult.editCameraPos) camera.position.set(loadResult.editCameraPos.x, loadResult.editCameraPos.y, loadResult.editCameraPos.z)
            if (loadResult.editCameraRot) camera.rotation.set(loadResult.editCameraRot.x, loadResult.editCameraRot.y, loadResult.editCameraRot.z)
            if (loadResult.editCameraPos || loadResult.editCameraRot) editMode?.setCameraOrientation(camera.rotation.y, camera.rotation.x)
        }
        if (mode === 'play') {
            if (loadResult.playCameraPos) camera.position.set(loadResult.playCameraPos.x, loadResult.playCameraPos.y, loadResult.playCameraPos.z)
            if (loadResult.playCameraRot) camera.rotation.set(loadResult.playCameraRot.x, loadResult.playCameraRot.y, loadResult.playCameraRot.z)
        }
    }

    // --- UI ---
    /* play 模式不显示独立相机信息面板（相机角度并入 ~ 调试 HUD） */
    const cameraInfoUpdate = mode === 'showcase' || mode === 'play' ? () => {} : setupCameraInfo(camera)

    // --- 存档（保存后立即下载为文件）---
    const exportSaveWorld = (): void => {
        const cached = loadCachedSaveData()
        const state = collectWorldState(
            systemsByType,
            allTerrainSources,
            mode,
            camera.position,
            camera.rotation,
            cached?.data.modeInfo,
        )
        /* play 模式的背包 / 传送点数据并入 modeInfo.play */
        if (mode === 'play' && hakoniwa !== undefined) {
            state.modeInfo = {...(state.modeInfo ?? {}), play: {...(state.modeInfo?.play ?? {}), ...hakoniwa.getSaveData()}}
        }
        cacheSaveData(state)
        saveWorldToFile(state)
    }

    /* Ctrl+S 仅编辑模式生效：游玩模式与「Ctrl 单独按下切换持握」冲突，改由右上角菜单手动存档
     * （绑定保留以使 Ctrl+S 组合继续遮蔽浏览器默认保存，但不再触发存档回调）。
     * 展示模式无世界实体、骨骼动画模式走独立资产导入导出，均不注册。 */
    if (mode === 'edit') input.onActionDown('save_world', exportSaveWorld)

    if (mode !== 'showcase' && mode !== 'bone_edit') input.onActionDown('load_world', () => {
        promptLoadFile((parsed) => {
            const data = parsed.data
            void showSkippedEntitiesNotice(parsed.skipped)
            cacheSaveData(data)
            /* 载入新世界：连同执行期子弹一起清空，避免旧子弹飞入新世界 */
            clearWorld()
            const result = loadWorldFromData(data, systemsByType, allTerrainSources)
            if (mode === 'edit') {
                if (result.editCameraPos) camera.position.set(result.editCameraPos.x, result.editCameraPos.y, result.editCameraPos.z)
                if (result.editCameraRot) camera.rotation.set(result.editCameraRot.x, result.editCameraRot.y, result.editCameraRot.z)
                if (result.editCameraPos || result.editCameraRot) editMode?.setCameraOrientation(camera.rotation.y, camera.rotation.x)
                /* 载入的世界取代原有编辑内容：刷新还原基线，使 Reset 回到载入后的世界 */
                saveSnapshot()
            }
            if (mode === 'play') {
                if (result.playCameraPos) camera.position.set(result.playCameraPos.x, result.playCameraPos.y, result.playCameraPos.z)
                if (result.playCameraRot) camera.rotation.set(result.playCameraRot.x, result.playCameraRot.y, result.playCameraRot.z)
            }
        })
    })

    // --- 设置面板（右上角齿轮） ---
    setupSettingsPanel(
        () => openOperationsPanel(mode),
        mode === 'showcase' ? () => showcaseMode?.exit() : undefined,
        mode === 'play' ? () => hakoniwa?.teleportToNearestSavePoint() : undefined,
        mode === 'edit' || mode === 'play' ? exportSaveWorld : undefined,
    )

    // --- 单 RAF 循环 ---
    let lastTime = performance.now()
    /** play 模式固定步时钟：步数由真实帧间隔累计决定，不追赶（欠账丢弃） */
    const playClock = createFixedStepClock()
    /** play 模式累计仿真时间（每物理步 +1/60） */
    let simTime = 0

    const tick = (time: number): void => {
        /* 展示模式已退出（返回启动屏）：终止本循环，不再排队下一帧 */
        if (showcaseExited) return
        const delta = Math.min((time - lastTime) / 1000, MAX_DT)
        lastTime = time

        try {
            const simActive = mode === 'play' || executing
            const pendingSteps = editMode?.execute.pendingSteps() ?? 0
            const stepActive = pendingSteps > 0 && !executing

            if (mode === 'play') {
                /* 固定 1/60 物理步 + 滞后一拍渲染插值：帧间隔只决定本帧步数（0..MAX），
                 * 游戏时间轴（状态机 / 计时器 / 动画）全部按物理步推进 */
                playMode?.sampleInput()
                const {steps, alpha} = playClock.advance(delta)
                for (let s = 0; s < steps; s++) {
                    /* 移动平台先瞬移到位并注册速度，乘客在步进前对齐（避免顶起抖动） */
                    interactables.update(FIXED_TIME_STEP)
                    characterSystem.applySupportCarry(FIXED_TIME_STEP)
                    shared.world.step(shared.eventQueue)
                    /* 每个子步立即排空事件：autoDrain 会在下一步前清空队列 */
                    shared.eventBus.drain()
                    characterSystem.clearEnvironments()
                    for (const sys of systems) { if (sys !== interactables) sys.preSync?.(FIXED_TIME_STEP, simTime) }
                    /* 交互脉冲须早于角色状态机更新，保证同一步生效 */
                    playMode?.fixedUpdate(FIXED_TIME_STEP)
                    /* 碰撞体同步需要真实物理位置（不能是插值位置） */
                    characterSystem.syncTrueTransforms()
                    characterSystem.update(FIXED_TIME_STEP)
                    for (const sys of systems) sys.captureRenderState?.()
                    simTime += FIXED_TIME_STEP
                }
                for (const sys of systems) sys.syncPositions(alpha)
            } else if (simActive) {
                /* 世界一旦步进就不再是编辑基线（编辑模式的 Reset 需回到步进前的状态） */
                if (mode === 'edit') steppedSinceBaseline = true
                /* 移动平台（升降梯 / 闸门）先瞬移到位并注册速度，乘客在步进前对齐（避免顶起抖动） */
                interactables.update(delta)
                characterSystem.applySupportCarry(delta)
                /* 编辑模式持续执行：保持原有变速步进语义 */
                const totalSteps = Math.min(Math.max(1, Math.ceil(delta / FIXED_TIME_STEP)), MAX_SUB_STEPS)
                for (let s = 0; s < totalSteps; s++) {
                    shared.world.step(shared.eventQueue)
                    /* 每个子步立即排空事件：autoDrain 会在下一步前清空队列，
                     * 延迟到循环结束再排空会丢失非末子步的接触开始/结束事件 */
                    shared.eventBus.drain()
                }
                /* 交互物已在步进前 update，跳过其 preSync（避免二次推进） */
                characterSystem.clearEnvironments()
                for (const s of systems) { if (s !== interactables) s.preSync?.(delta, time) }
                for (const s of systems) s.syncPositions()
                /* 编辑模式不走滞后插值：先按刚体真实位置对齐，再在 update 后捕获当前帧 */
                characterSystem.syncTrueTransforms()
            } else if (stepActive) {
                /* 单步 / 排队步进同样会推进世界：基线随之固定 */
                steppedSinceBaseline = true
                /* 逐帧步进：每帧精确推进 1 物理步 */
                interactables.update(FIXED_TIME_STEP)
                characterSystem.applySupportCarry(FIXED_TIME_STEP)
                shared.world.step(shared.eventQueue)
                shared.eventBus.drain()
                characterSystem.clearEnvironments()
                for (const s of systems) { if (s !== interactables) s.preSync?.(FIXED_TIME_STEP, time) }
                for (const s of systems) s.syncPositions()
                /* 编辑模式不走滞后插值：先按刚体真实位置对齐，再在 update 后捕获当前帧 */
                characterSystem.syncTrueTransforms()
                editMode?.execute.consumeStep()
            }
            /* else: 编辑暂停态，物理世界完全冻结 */

            ensureAI()

            /* 展示场景自带跟随相机的网格，主场景网格无需更新 */
            if (mode !== 'showcase') {
                gridUpdate()
                /* 静态建筑不参与物理步进，其分块网格 / 距离卸载 / 近处碰撞体每帧独立更新 */
                building.updateView(camera, delta)
            }

            if (mode === 'edit') {
                editMode?.updater(delta)
                if (simActive) {
                    characterSystem.update(delta)
                    characterSystem.captureRenderState()
                    characterSystem.syncPositions()
                } else if (stepActive) {
                    characterSystem.update(FIXED_TIME_STEP)
                    characterSystem.captureRenderState()
                    characterSystem.syncPositions()
                }
            } else if (mode === 'showcase') {
                /* 展示模式：物理冻结，仅推进展示时间线（渲染在 updater 内完成） */
                showcaseMode?.updater(delta)
            } else if (mode === 'bone_edit') {
                /* 骨骼动画编辑模式：物理冻结，推进视窗交互与时间轴 */
                boneEditMode?.updater(delta)
            } else {
                /* play 模式：物理已在固定步循环推进，此处只做渲染侧更新（相机 / HUD） */
                playMode?.renderUpdate(delta)
                hakoniwa?.updater(delta)
            }

            if (mode !== 'showcase') {
                // 双 Pass 渲染（水材质区域折射）
                areas.updateTime(time)
                const waterMeshes: Mesh[] = areas.getRefractionMeshes()
                renderFrame(waterMeshes)
            }

            cameraInfoUpdate()
            input.getUpdater()()
        } catch (e) {
            console.warn('Frame update failed:', e)
        }

        requestAnimationFrame(tick)
    }

    tick(performance.now())
    renderer.domElement.focus()
}
