import type {ShowcaseModule} from '../module.ts'
import {Vector3} from 'three'
import type {Object3D} from 'three'
import {setupShowcaseScene} from '../scene.ts'
import {setupClickFocus} from '../focus.ts'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupTerrain} from '../../../entity/terrain/common/physics/world.ts'
import {setupBuildingGenerator} from '../../../entity/building_generator/world.ts'
import type {BuildingGeneratorContext} from '../../../entity/building_generator/types/index.ts'
import {
    TERRAIN_GRID_SIZE,
    TERRAIN_CELL_SIZE,
    TERRAIN_MIN_HEIGHT,
    TERRAIN_MAX_HEIGHT,
    TERRAIN_FRICTION,
    TERRAIN_DEFAULT_GENERATOR,
    TERRAIN_GENERATORS,
    BUILDING_GRID_COLUMNS,
    BUILDING_GRID_SPACING,
    TERRAIN_CAMERA_DISTANCE,
    TERRAIN_CAMERA_TARGET_Y,
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

/** 建筑配方 id → 文案键（复用编辑模式 recipe.*） */
const RECIPE_LABELS: Record<string, StringLocaleKey> = {
    house: 'recipe.house',
    tower: 'recipe.tower',
    wall: 'recipe.wall',
    platform: 'recipe.platform',
    ruin: 'recipe.ruin',
    tree: 'recipe.tree',
    stairs: 'recipe.stairs',
    spiral_stairs: 'recipe.spiral_stairs',
    bridge: 'recipe.bridge',
    great_hall: 'recipe.great_hall',
    keep: 'recipe.keep',
}

interface RecipeSpec {
    readonly recipe: string
    readonly sizeX: number
    readonly sizeY: number
    readonly sizeZ: number
}

/** 展示的全部建筑配方（尺寸按配方特征给出；生成器内部对最小尺寸有保护） */
const RECIPE_SPECS: readonly RecipeSpec[] = [
    {recipe: 'house', sizeX: 8, sizeY: 5, sizeZ: 8},
    {recipe: 'tower', sizeX: 6, sizeY: 12, sizeZ: 6},
    {recipe: 'wall', sizeX: 10, sizeY: 3, sizeZ: 1},
    {recipe: 'platform', sizeX: 8, sizeY: 1, sizeZ: 8},
    {recipe: 'ruin', sizeX: 8, sizeY: 5, sizeZ: 8},
    {recipe: 'tree', sizeX: 5, sizeY: 7, sizeZ: 5},
    {recipe: 'stairs', sizeX: 6, sizeY: 8, sizeZ: 6},
    {recipe: 'spiral_stairs', sizeX: 7, sizeY: 10, sizeZ: 7},
    {recipe: 'bridge', sizeX: 12, sizeY: 6, sizeZ: 5},
    {recipe: 'great_hall', sizeX: 12, sizeY: 8, sizeZ: 12},
    {recipe: 'keep', sizeX: 14, sizeY: 12, sizeZ: 14},
]

/**
 * 复杂地形与建筑子模块。
 *
 * 内容：一片 FBM 起伏地形 + 全部 11 种建筑生成配方（平房 / 塔楼 / 城墙 / 平台 / 废墟 / 树木 / 阶梯 / 旋转楼梯 /
 * 廊桥 / 大殿 / 主楼）按网格摆放，建筑基座自动贴合地形高度。面板可切换地形生成器（FBM / 正弦 / 阶梯 /
 * 平坦）与「随机重建」——切换生成器会重铺地形并按新高度重新放置全部建筑。
 *
 * 使用生产同一套 `setupTerrain` + `setupBuildingGenerator`（体素块存储、贪心网格合并、粗 LOD、按距离卸载、
 * 近处 trimesh 碰撞体）；每帧调用 `building.updateView(camera, dt)` 摊还构建分块网格。起到地形 / 建筑系统的人员测试效果。
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
        let seed = 1
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

        const placed: number[] = []
        const placeBuildings = (): void => {
            for (const id of placed) building.remove(id)
            placed.length = 0
            for (let i = 0; i < RECIPE_SPECS.length; i++) {
                const spec = RECIPE_SPECS[i]
                if (spec === undefined) continue
                const col = i % BUILDING_GRID_COLUMNS
                const row = Math.floor(i / BUILDING_GRID_COLUMNS)
                const x = (col - (BUILDING_GRID_COLUMNS - 1) / 2) * BUILDING_GRID_SPACING
                const z = (row - (Math.ceil(RECIPE_SPECS.length / BUILDING_GRID_COLUMNS) - 1) / 2) * BUILDING_GRID_SPACING
                const y = (terrain.getHeightAt(x, z, 20) ?? 0) + 0.05
                const world = building.add(
                    {recipe: spec.recipe, seed, sizeX: spec.sizeX, sizeY: spec.sizeY, sizeZ: spec.sizeZ},
                    x, y, z,
                )
                placed.push(world.id)
            }
        }

        /* —— 面板（右上角下方）：地形生成器切换 + 随机重建 + 建筑清单 —— */
        const style = document.createElement('style')
        style.textContent = `
.sch-ter { position: fixed; top: 16px; left: 16px; width: 300px;
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
    padding: 4px 12px; cursor: pointer; font: inherit; margin-top: 6px; }
.sch-ter-btn:hover { background: #353c4a; }
.sch-ter-list { max-height: 32vh; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.sch-ter-chip { background: #1a1f28; border: 1px solid #313a48; border-radius: 6px; padding: 2px 8px; font-size: 11px; color: #c8cdd8; }
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

        const genSection = document.createElement('div')
        genSection.className = 'sch-ter-section'
        localizeText(genSection, 'showcase.terrain.generator')
        panel.appendChild(genSection)

        const tabs = document.createElement('div')
        tabs.className = 'sch-ter-tabs'
        const tabButtons = new Map<string, HTMLButtonElement>()
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
            placeBuildings()
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
        panel.appendChild(tabs)
        applyGenerator(generatorId)

        const reseedBtn = document.createElement('button')
        reseedBtn.type = 'button'
        reseedBtn.className = 'sch-ter-btn'
        localizeText(reseedBtn, 'showcase.terrain.reseed')
        reseedBtn.addEventListener('click', () => {
            seed = Math.floor(Math.random() * 1_000_000) + 1
            placeBuildings()
            reseedBtn.blur()
        })
        panel.appendChild(reseedBtn)

        const listSection = document.createElement('div')
        listSection.className = 'sch-ter-section'
        localizeText(listSection, 'showcase.terrain.recipes')
        panel.appendChild(listSection)
        const list = document.createElement('div')
        list.className = 'sch-ter-list'
        for (const spec of RECIPE_SPECS) {
            const chip = document.createElement('span')
            chip.className = 'sch-ter-chip'
            const key = RECIPE_LABELS[spec.recipe]
            localizeApply(chip, el => { el.textContent = key === undefined ? spec.recipe : translate(key) })
            list.appendChild(chip)
        }
        panel.appendChild(list)
        document.body.appendChild(panel)

        /* 点击聚焦：命中建筑体素网格即把相机飞向该建筑（聚焦距离与标记环随建筑尺寸） */
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
            /* 静态建筑不参与物理步进：每帧更新可见性 / 分块网格 / 近处碰撞体 */
            building.updateView(sceneCtx.camera, dt)
            sceneCtx.followGrid()
            sceneCtx.orbit.update(dt)
            focus.update(dt)
            host.renderer.render(sceneCtx.scene, sceneCtx.camera)
        }

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
