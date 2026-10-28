import type {ShowcaseModule} from '../module.ts'
import {Vector3} from 'three'
import type {Object3D} from 'three'
import {setupShowcaseScene} from '../scene.ts'
import {setupClickFocus} from '../focus.ts'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupTerrain} from '../../../entity/terrain/common/physics/world.ts'
import {setupBuildingGenerator} from '../../../entity/building_generator/world.ts'
import type {BuildingGeneratorContext} from '../../../entity/building_generator/types/index.ts'
import {BUILDING_RECIPE_IDS} from '../../../entity/building_generator/types/index.ts'
import {recipeLabel} from '../../../entity/building_generator/ui/labels.ts'
import type {BuildingConfig} from '../../../entity/building_generator/validation.ts'
import {captureBuildingOps, type BuildingBlockOp} from '../building_generation_ops.ts'
import {
    TERRAIN_GRID_SIZE,
    TERRAIN_CELL_SIZE,
    TERRAIN_MIN_HEIGHT,
    TERRAIN_MAX_HEIGHT,
    TERRAIN_FRICTION,
    TERRAIN_DEFAULT_GENERATOR,
    TERRAIN_GENERATORS,
    TERRAIN_CAMERA_DISTANCE,
    TERRAIN_CAMERA_TARGET_Y,
    BUILDING_STEP_INTERVAL,
    BUILDING_DEFAULT_OPS_PER_STEP,
} from '../constants.ts'
import {localizeText, localizeApply} from '../../../i18n/dom.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'

/** 地形生成器 id → 文案键（复用编辑模式 terrain_gen.*） */
const GENERATOR_LABELS: Record<string, StringLocaleKey> = {
    fbm: 'terrain_gen.fbm',
    sine: 'terrain_gen.sine',
    steps: 'terrain_gen.steps',
    flat: 'terrain_gen.flat',
}

interface SizeSpec {
    readonly x: number
    readonly y: number
    readonly z: number
}

/** 各配方默认初始化尺寸 */
const RECIPE_SIZES: Record<string, SizeSpec> = {
    house: {x: 8, y: 5, z: 8},
    tower: {x: 6, y: 12, z: 6},
    wall: {x: 10, y: 3, z: 1},
    platform: {x: 8, y: 1, z: 8},
    ruin: {x: 8, y: 5, z: 8},
    tree: {x: 5, y: 7, z: 5},
    stairs: {x: 6, y: 8, z: 6},
    spiral_stairs: {x: 7, y: 10, z: 7},
    bridge: {x: 12, y: 6, z: 5},
    great_hall: {x: 12, y: 8, z: 12},
    keep: {x: 14, y: 12, z: 14},
    dungeon: {x: 44, y: 20, z: 44},
}

const sizeOf = (recipe: string): SizeSpec => RECIPE_SIZES[recipe] ?? {x: 8, y: 5, z: 8}

const createNumberInput = (value: number, id?: string): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'number'
    input.className = 'sch-ter-input'
    input.value = String(value)
    if (id !== undefined) input.id = id
    return input
}

/**
 * 复杂地形与建筑子模块。
 *
 * 通过下拉选择单个建筑配方，调整种子 / 尺寸 / 地形，并用「单步 / 播放」观察体素生成过程。
 * 使用生产同一套 terrain + building generator（块存储、贪心合并、LOD、trimesh 碰撞）。
 */
export const terrainModule: ShowcaseModule = {
    id: 'terrain',
    title: 'showcase.module.terrain.title',
    description: 'showcase.module.terrain.desc',
    setup: host => {
        const sceneCtx = setupShowcaseScene(host.renderer)
        const shared = createSharedWorld()
        const terrain = setupTerrain(sceneCtx.scene, shared, () => [])
        const building: BuildingGeneratorContext = setupBuildingGenerator(sceneCtx.scene, shared)

        sceneCtx.orbit.target.set(0, TERRAIN_CAMERA_TARGET_Y, 0)
        sceneCtx.orbit.setDistance(TERRAIN_CAMERA_DISTANCE)

        let generatorId = TERRAIN_DEFAULT_GENERATOR
        let recipe = 'house'
        let seed = 1
        let sizeX = sizeOf(recipe).x
        let sizeY = sizeOf(recipe).y
        let sizeZ = sizeOf(recipe).z
        let opsPerStep = BUILDING_DEFAULT_OPS_PER_STEP
        let worldId: number | undefined
        let ops: BuildingBlockOp[] = []
        let cursor = 0
        let playing = false
        let stepTimer = 0

        const terrainId = terrain.add(
            {
                gridSize: TERRAIN_GRID_SIZE,
                cellSize: TERRAIN_CELL_SIZE,
                minHeight: TERRAIN_MIN_HEIGHT,
                maxHeight: TERRAIN_MAX_HEIGHT,
                friction: TERRAIN_FRICTION,
                generatorId,
            },
            0, 0, 0,
        ).id

        /* —— 面板 —— */
        const style = document.createElement('style')
        style.textContent = `
.sch-ter { position: fixed; top: 16px; left: 16px; width: 320px;
    background: rgba(0,0,0,.72); color: #e8e4da; font: 13px/1.5 system-ui, sans-serif;
    border-radius: 10px; padding: 12px 14px; backdrop-filter: blur(4px); user-select: none; }
.sch-ter-title { font-size: 15px; font-weight: 700; color: #ffd070; }
.sch-ter-sub { color: #9aa3b2; font-size: 11px; margin: 2px 0 8px; }
.sch-ter-section { color: #7f8a9c; font-size: 11px; letter-spacing: 1px; margin: 8px 0 4px; }
.sch-ter-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.sch-ter-tab { background: #2a2f3a; color: #d8dce4; border: 1px solid #3a4150; border-radius: 6px;
    padding: 3px 10px; cursor: pointer; font: inherit; font-size: 12px; }
.sch-ter-tab:hover { background: #353c4a; }
.sch-ter-tab.active { background: #4a5a3a; border-color: #7a9a5a; color: #ffe9a0; }
.sch-ter-btn { background: #2a2f3a; color: #e8e4da; border: 1px solid #3a4150; border-radius: 6px;
    padding: 4px 10px; cursor: pointer; font: inherit; margin-top: 6px; }
.sch-ter-btn:hover { background: #353c4a; }
.sch-ter-btn:disabled { opacity: .45; cursor: default; }
.sch-ter-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.sch-ter-label { color: #9aa3b2; font-size: 11px; }
.sch-ter-input { width: 62px; background: #1a1f28; color: #e8e4da; border: 1px solid #3a4150;
    border-radius: 5px; padding: 2px 5px; font: inherit; font-size: 12px; }
.sch-ter-select { background: #1a1f28; color: #e8e4da; border: 1px solid #3a4150;
    border-radius: 5px; padding: 3px 6px; font: inherit; font-size: 12px; flex: 1; }
.sch-ter-progress { color: #9aa3b2; font-size: 11px; margin-top: 8px; }
`
        document.head.appendChild(style)

        const panel = document.createElement('div')
        panel.className = 'sch-ter'
        const title = document.createElement('div')
        title.className = 'sch-ter-title'
        localizeText(title, 'showcase.terrain.title')
        const sub = document.createElement('div')
        sub.className = 'sch-ter-sub'
        localizeText(sub, 'showcase.terrain.subtitle')
        panel.appendChild(title)
        panel.appendChild(sub)

        const buildingSection = document.createElement('div')
        buildingSection.className = 'sch-ter-section'
        localizeText(buildingSection, 'showcase.terrain.building')
        panel.appendChild(buildingSection)

        const recipeSelect = document.createElement('select')
        recipeSelect.className = 'sch-ter-select'
        recipeSelect.id = 'showcase-terrain-recipe'
        for (const id of BUILDING_RECIPE_IDS) {
            const option = document.createElement('option')
            option.value = id
            localizeApply(option, el => { el.textContent = recipeLabel(id) })
            recipeSelect.appendChild(option)
        }
        recipeSelect.value = recipe
        panel.appendChild(recipeSelect)

        const paramRow = document.createElement('div')
        paramRow.className = 'sch-ter-row'
        const seedLabel = document.createElement('span')
        seedLabel.className = 'sch-ter-label'
        localizeText(seedLabel, 'showcase.terrain.seed')
        const seedInput = createNumberInput(seed, 'showcase-terrain-seed')
        paramRow.appendChild(seedLabel)
        paramRow.appendChild(seedInput)
        panel.appendChild(paramRow)

        const sizeRow = document.createElement('div')
        sizeRow.className = 'sch-ter-row'
        const sizeLabel = document.createElement('span')
        sizeLabel.className = 'sch-ter-label'
        localizeText(sizeLabel, 'showcase.terrain.size')
        const sizeXInput = createNumberInput(sizeX, 'showcase-terrain-size-x')
        const sizeYInput = createNumberInput(sizeY, 'showcase-terrain-size-y')
        const sizeZInput = createNumberInput(sizeZ, 'showcase-terrain-size-z')
        sizeRow.appendChild(sizeLabel)
        sizeRow.appendChild(sizeXInput)
        sizeRow.appendChild(sizeYInput)
        sizeRow.appendChild(sizeZInput)
        panel.appendChild(sizeRow)

        const stepRow = document.createElement('div')
        stepRow.className = 'sch-ter-row'
        const stepLabel = document.createElement('span')
        stepLabel.className = 'sch-ter-label'
        localizeText(stepLabel, 'showcase.terrain.ops_per_step')
        const opsInput = createNumberInput(opsPerStep, 'showcase-terrain-ops')
        stepRow.appendChild(stepLabel)
        stepRow.appendChild(opsInput)
        panel.appendChild(stepRow)

        const buttonRow = document.createElement('div')
        buttonRow.className = 'sch-ter-row'
        const regenerateBtn = document.createElement('button')
        regenerateBtn.type = 'button'
        regenerateBtn.className = 'sch-ter-btn'
        localizeText(regenerateBtn, 'showcase.terrain.regenerate')
        const stepBtn = document.createElement('button')
        stepBtn.type = 'button'
        stepBtn.className = 'sch-ter-btn'
        localizeText(stepBtn, 'showcase.terrain.step')
        const playBtn = document.createElement('button')
        playBtn.type = 'button'
        playBtn.className = 'sch-ter-btn'
        localizeText(playBtn, 'showcase.terrain.play')
        const resetBtn = document.createElement('button')
        resetBtn.type = 'button'
        resetBtn.className = 'sch-ter-btn'
        localizeText(resetBtn, 'showcase.terrain.reset')
        buttonRow.appendChild(regenerateBtn)
        buttonRow.appendChild(stepBtn)
        buttonRow.appendChild(playBtn)
        buttonRow.appendChild(resetBtn)
        panel.appendChild(buttonRow)

        const progress = document.createElement('div')
        progress.className = 'sch-ter-progress'
        panel.appendChild(progress)

        const genSection = document.createElement('div')
        genSection.className = 'sch-ter-section'
        localizeText(genSection, 'showcase.terrain.generator')
        panel.appendChild(genSection)

        const tabs = document.createElement('div')
        tabs.className = 'sch-ter-tabs'
        const tabButtons = new Map<string, HTMLButtonElement>()
        panel.appendChild(tabs)
        document.body.appendChild(panel)

        const currentConfig = (): BuildingConfig => ({
            recipe,
            seed,
            sizeX,
            sizeY,
            sizeZ,
        })

        const readInputs = (): void => {
            const nextSeed = Number.parseInt(seedInput.value, 10)
            if (Number.isFinite(nextSeed)) seed = nextSeed
            sizeX = Math.max(1, Math.trunc(Number.parseFloat(sizeXInput.value) || sizeX))
            sizeY = Math.max(1, Math.trunc(Number.parseFloat(sizeYInput.value) || sizeY))
            sizeZ = Math.max(1, Math.trunc(Number.parseFloat(sizeZInput.value) || sizeZ))
            opsPerStep = Math.max(1, Math.trunc(Number.parseFloat(opsInput.value) || BUILDING_DEFAULT_OPS_PER_STEP))
            sizeXInput.value = String(sizeX)
            sizeYInput.value = String(sizeY)
            sizeZInput.value = String(sizeZ)
            opsInput.value = String(opsPerStep)
        }

        const setPlaying = (next: boolean): void => {
            playing = next
            playBtn.textContent = translate(next ? 'showcase.terrain.pause' : 'showcase.terrain.play')
            stepBtn.disabled = next || cursor >= ops.length
        }

        const refreshProgress = (): void => {
            progress.textContent = translate({key: 'showcase.terrain.progress', args: [String(cursor), String(ops.length)]})
            stepBtn.disabled = playing || cursor >= ops.length
            playBtn.disabled = ops.length === 0
            regenerateBtn.disabled = false
            const atEnd = cursor >= ops.length
            playBtn.textContent = translate(playing ? 'showcase.terrain.pause' : atEnd ? 'showcase.terrain.reset' : 'showcase.terrain.play')
        }

        const applyBatch = (): void => {
            const parsedOps = Math.trunc(Number.parseFloat(opsInput.value))
            if (Number.isFinite(parsedOps)) opsPerStep = Math.max(1, parsedOps)
            if (worldId === undefined || cursor >= ops.length) {
                setPlaying(false)
                refreshProgress()
                return
            }
            const count = Math.max(1, Math.min(opsPerStep, ops.length - cursor))
            for (let i = 0; i < count; i++) {
                const op = ops[cursor + i]
                if (op !== undefined) building.setBlock(worldId, op.x, op.y, op.z, op.material)
            }
            cursor += count
            if (cursor >= ops.length) setPlaying(false)
            refreshProgress()
        }

        const regenerate = (): void => {
            readInputs()
            setPlaying(false)
            stepTimer = 0
            if (worldId !== undefined) {
                building.remove(worldId)
                worldId = undefined
            }
            const y = (terrain.getHeightAt(0, 0, 20) ?? 0) + 0.05
            const world = building.add(currentConfig(), 0, y, 0)
            worldId = world.id
            ops = captureBuildingOps(currentConfig())
            /* 先清掉完整生成结果，再从第一块开始逐步回放 */
            for (const op of ops) building.setBlock(world.id, op.x, op.y, op.z)
            cursor = 0
            const maxSize = Math.max(sizeX, sizeY, sizeZ)
            sceneCtx.orbit.target.set(sizeX / 2, y + sizeY / 2, sizeZ / 2)
            sceneCtx.orbit.setDistance(Math.max(TERRAIN_CAMERA_DISTANCE, maxSize * 1.6 + 12))
            refreshProgress()
        }

        const applyGenerator = (next: string): void => {
            generatorId = next
            for (const [key, btn] of tabButtons) {
                const active = key === generatorId
                if (btn.classList.contains('active') !== active) btn.classList.toggle('active', active)
            }
            terrain.updateConfig(terrainId, {
                gridSize: TERRAIN_GRID_SIZE,
                cellSize: TERRAIN_CELL_SIZE,
                minHeight: TERRAIN_MIN_HEIGHT,
                maxHeight: TERRAIN_MAX_HEIGHT,
                friction: TERRAIN_FRICTION,
                generatorId,
            })
            regenerate()
        }
        for (const gen of TERRAIN_GENERATORS) {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'sch-ter-tab'
            const key = GENERATOR_LABELS[gen]
            if (key !== undefined) localizeText(btn, key)
            btn.addEventListener('click', () => { applyGenerator(gen); btn.blur() })
            tabs.appendChild(btn)
            tabButtons.set(gen, btn)
        }

        recipeSelect.addEventListener('change', () => {
            recipe = recipeSelect.value
            const size = sizeOf(recipe)
            sizeX = size.x
            sizeY = size.y
            sizeZ = size.z
            opsPerStep = recipe === 'dungeon' ? Math.max(BUILDING_DEFAULT_OPS_PER_STEP, 128) : BUILDING_DEFAULT_OPS_PER_STEP
            sizeXInput.value = String(sizeX)
            sizeYInput.value = String(sizeY)
            sizeZInput.value = String(sizeZ)
            opsInput.value = String(opsPerStep)
            regenerate()
            recipeSelect.blur()
        })
        regenerateBtn.addEventListener('click', () => { regenerate(); regenerateBtn.blur() })
        stepBtn.addEventListener('click', () => { setPlaying(false); applyBatch(); stepBtn.blur() })
        playBtn.addEventListener('click', () => {
            if (cursor >= ops.length) {
                regenerate()
                setPlaying(true)
            } else {
                setPlaying(!playing)
            }
            playBtn.blur()
        })
        resetBtn.addEventListener('click', () => { regenerate(); resetBtn.blur() })

        /* 点击聚焦：命中当前建筑的体素网格 */
        const focus = setupClickFocus<number>({
            scene: sceneCtx.scene,
            camera: sceneCtx.camera,
            domElement: host.renderer.domElement,
            orbit: sceneCtx.orbit,
            getObjects: () => building.getMeshes(),
            resolve: hit => {
                const worlds = building.getAll()
                let node: Object3D | null = hit.object
                while (node !== null && !worlds.some(w => w.group === node)) node = node.parent
                if (node === null) return undefined
                const world = worlds.find(w => w.group === node)
                if (world === undefined) return undefined
                const size = Math.max(world.config.sizeX, world.config.sizeY, world.config.sizeZ)
                return {
                    point: hit.point.clone(),
                    value: world.id,
                    distance: size * 1.2 + 4,
                    marker: new Vector3(world.group.position.x, world.group.position.y + 0.02, world.group.position.z),
                    markerScale: size * 0.5,
                }
            },
            onFocus: () => {},
        })

        const updater = (dt: number): void => {
            if (playing) {
                stepTimer += dt
                while (playing && stepTimer >= BUILDING_STEP_INTERVAL) {
                    stepTimer -= BUILDING_STEP_INTERVAL
                    applyBatch()
                }
            } else {
                stepTimer = 0
            }
            building.updateView(sceneCtx.camera, dt)
            sceneCtx.followGrid()
            sceneCtx.orbit.update(dt)
            focus.update(dt)
            host.renderer.render(sceneCtx.scene, sceneCtx.camera)
        }

        /* 初始化第一个建筑并显示参数 */
        recipeSelect.value = recipe
        seedInput.value = String(seed)
        sizeXInput.value = String(sizeX)
        sizeYInput.value = String(sizeY)
        sizeZInput.value = String(sizeZ)
        opsInput.value = String(opsPerStep)
        applyGenerator(generatorId)

        return {
            updater,
            dispose: () => {
                focus.dispose()
                panel.remove()
                style.remove()
                sceneCtx.dispose()
            },
        }
    },
}
