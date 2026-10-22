import {BoxGeometry, Group, Mesh} from 'three'
import type {Material} from 'three'
import type {ShowcaseModule} from '../module.ts'
import {setupShowcaseScene} from '../scene.ts'
import {createHumanoidModel} from '../../../entity/character/forms/humanoid/body_form.ts'
import {createAppearanceSystem} from '../../../entity/character/forms/humanoid/system.ts'
import type {AnimationContext} from '../../../entity/character/appearance/types.ts'
import {weaponPresetOrDefault} from '../../../character/weapon/catalog.ts'
import {DEFAULT_HANDEDNESS} from '../../../character/handedness.ts'
import {resolveArmorLoadout} from '../../../character/armor/catalog.ts'
import {ITEM_DEFS, ITEM_CATEGORIES, ITEM_CATEGORY_LABELS, itemDisplayName, itemDisplayDescription} from '../../../inventory/items.ts'
import type {ItemCategory, ItemDef} from '../../../inventory/items.ts'
import {EQUIP_SLOT_LABELS} from '../../../inventory/types.ts'
import {createGridBoxMaterial} from '../../../render/gridMaterial.ts'
import {scaleBoxUVs} from '../../../render/texture.ts'
import {TILE_SIZE} from '../../../render/constants.ts'
import {BOX_BADGE_COLORS, BOX_DEFAULT_BADGE_COLOR} from '../../../entity/box/constants.ts'
import type {BoxPresetId} from '../../../types/boxPreset.ts'
import type {AreaPresetId} from '../../../types/areaPreset.ts'
import {DEFAULT_GRID_COLOR} from '../../../render/constants.ts'
import {
    WATER_COLOR_DEEP, WATER_COLOR_SHALLOW,
    AIR_COLOR, AIR_EDGE_COLOR,
    FORCE_FIELD_COLOR, FORCE_FIELD_EDGE_COLOR,
} from '../../../entity/area/render/constants.ts'
import {ACTOR_JUMP_HEIGHT, ACTOR_SPEED, CATALOG_CAMERA_DISTANCE, CATALOG_CAMERA_TARGET_Y, CATALOG_CUBE_Y} from '../constants.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import {localizeText, localizeApply} from '../../../i18n/dom.ts'
import {createIcon} from '../../../ui/icons/icon.ts'

/** 类别代表色（图鉴格子图标着色 / 非装备类预览方块取色） */
const CATEGORY_COLORS: Record<ItemCategory, number> = {
    weapon: 0xc96a5a,
    armor: 0x5a7fc9,
    breath: 0xc95ab0,
    block: 0x8a97a8,
    consumable: 0x5abf86,
    material: 0xb09055,
    key: 0xd4af37,
}

/** 十六进制色串（`#rrggbb`）→ 数值（供预览材质取色） */
const hexToNum = (hex: string): number => parseInt(hex.slice(1), 16)

/** 箱型预设预览取色（复用箱子徽章底色，避免颜色漂移） */
const BOX_PRESET_PREVIEW: Record<BoxPresetId, {base: number; grid: number}> = {
    common: {base: hexToNum(BOX_DEFAULT_BADGE_COLOR), grid: DEFAULT_GRID_COLOR},
    destructible: {base: hexToNum(BOX_BADGE_COLORS.destructible), grid: DEFAULT_GRID_COLOR},
    burning: {base: hexToNum(BOX_BADGE_COLORS.burning), grid: DEFAULT_GRID_COLOR},
    magnet: {base: hexToNum(BOX_BADGE_COLORS.magnet), grid: DEFAULT_GRID_COLOR},
    elastic: {base: hexToNum(BOX_BADGE_COLORS.elastic), grid: DEFAULT_GRID_COLOR},
}

/** 非箱子方块物品预览取色（区域按预设取色） */
const AREA_PRESET_PREVIEW: Record<AreaPresetId, {base: number; grid: number}> = {
    water: {base: WATER_COLOR_DEEP, grid: WATER_COLOR_SHALLOW},
    air: {base: AIR_COLOR, grid: AIR_EDGE_COLOR},
    force_field: {base: FORCE_FIELD_COLOR, grid: FORCE_FIELD_EDGE_COLOR},
}

/** 方块物品预览取色：箱子按预设取色，区域按区域预设取色 */
const blockPreviewOf = (def: ItemDef): {base: number; grid: number} | undefined => {
    if (def.boxPreset !== undefined) return BOX_PRESET_PREVIEW[def.boxPreset]
    if (def.areaPreset !== undefined) return AREA_PRESET_PREVIEW[def.areaPreset]
    return undefined
}

const isEquipment = (def: ItemDef): boolean => def.category === 'weapon' || def.category === 'armor'

/** 类别代表色（CSS `#rrggbb`，用于图标着色） */
const categoryColorHex = (def: ItemDef): string => `#${CATEGORY_COLORS[def.category].toString(16).padStart(6, '0')}`

/** 把物品定义装备到展示人体上（武器 → 主手；护甲 → 对应槽；其余 → 空手无甲） */
const applyItemToModel = (model: ReturnType<typeof createHumanoidModel>, def: ItemDef | undefined): void => {
    model.removeWeapon()
    model.removeArmor()
    if (def === undefined) return
    if (def.category === 'weapon' && def.weaponId !== undefined) {
        model.equipWeapon({main: weaponPresetOrDefault(def.weaponId).mesh})
    } else if (def.category === 'armor' && def.armorId !== undefined && def.equipSlot !== undefined) {
        model.equipArmor(resolveArmorLoadout({[def.equipSlot]: def.armorId}))
    }
}

/** 详情副名：类别（+ 装备槽 / 方块实体类型） */
const subLineOf = (def: ItemDef): string => {
    const category = translate(ITEM_CATEGORY_LABELS[def.category])
    if (def.equipSlot !== undefined) return `${category} · ${translate(EQUIP_SLOT_LABELS[def.equipSlot])}`
    if (def.boxPreset !== undefined) return `${category} · ${def.boxPreset}`
    if (def.areaPreset !== undefined) return `${category} · ${def.areaPreset}`
    if (def.blockType !== undefined) return `${category} · ${def.blockType}`
    return category
}

/**
 * 全物品图鉴子模块。
 *
 * 内容：右侧**格子**式清单按类别分区展示 `ITEM_DEFS` 全量物品（全部武器 / 护甲 / 方块 + 消耗品 / 材料 / 钥匙），
 * 点击格子即选中；左侧 3D 场景**预览**所选物品——武器 / 护甲在展示人体上即时装配，方块与其它物品以代表方块展示。
 * 起到玩家图鉴效果（浏览全部物品数据与外观）。相机锁定聚焦预览物，可环绕观察。
 */
export const catalogModule: ShowcaseModule = {
    id: 'catalog',
    title: 'showcase.module.catalog.title',
    description: 'showcase.module.catalog.desc',
    setup: host => {
        const sceneCtx = setupShowcaseScene(host.renderer)

        /* —— 预览：展示人体（装备）+ 代表方块（方块 / 其它） —— */
        const model = createHumanoidModel({speed: ACTOR_SPEED, jumpHeight: ACTOR_JUMP_HEIGHT, scale: 1}, 0)
        sceneCtx.scene.add(model.group)
        /* 图鉴预览不展示物理碰撞箱（半胶囊可视化） */
        for (const m of model.colliderMeshes) m.visible = false
        const system = createAppearanceSystem()

        const cubeGroup = new Group()
        cubeGroup.position.y = CATALOG_CUBE_Y
        sceneCtx.scene.add(cubeGroup)
        let cube: Mesh | null = null
        const clearCube = (): void => {
            if (cube === null) return
            cubeGroup.remove(cube)
            cube.geometry.dispose()
            ;(cube.material as Material).dispose()
            cube = null
        }
        const showCube = (base: number, grid: number, size: number): void => {
            clearCube()
            const geo = new BoxGeometry(size, size, size)
            scaleBoxUVs(geo, size, size, size, TILE_SIZE)
            cube = new Mesh(geo, createGridBoxMaterial(base, grid))
            cubeGroup.add(cube)
        }

        /* 默认自由飞行：把注视中心对准展示人体（不进入聚焦），WASDZX 可自由环绕观察 */
        sceneCtx.orbit.target.set(0, CATALOG_CAMERA_TARGET_Y, 0)
        sceneCtx.orbit.setDistance(CATALOG_CAMERA_DISTANCE)

        /* —— 图鉴面板（右侧）：筛选标签 + 格子网格 + 详情 —— */
        const style = document.createElement('style')
        style.textContent = `
.sch-cat {
    position: fixed; top: 16px; right: 16px; bottom: 16px; width: 468px;
    background: var(--dc-bg-2); color: var(--dc-text);
    font-family: var(--dc-font-body); font-size: var(--dc-fs-13); line-height: 1.5;
    border: 1px solid var(--dc-border); border-radius: var(--dc-radius-lg);
    box-shadow: var(--dc-shadow-panel), inset 0 0 0 1px var(--dc-hairline);
    padding: 12px 14px; display: flex; flex-direction: column; user-select: none;
}
.sch-cat-title { font-family: var(--dc-font-display); font-size: 15px; font-weight: 700; color: var(--dc-gold); }
.sch-cat-sub { color: var(--dc-text-dim); font-size: 11px; margin: 2px 0 8px; }
.sch-cat-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.sch-cat-tab {
    background: var(--dc-bg-3); color: var(--dc-text-dim); border: 1px solid var(--dc-border);
    border-radius: var(--dc-radius); padding: 3px 10px; cursor: pointer; font: inherit; font-size: 12px;
}
.sch-cat-tab:hover { background: var(--dc-bg-2); border-color: var(--dc-border-strong); }
.sch-cat-tab.active { background: var(--dc-bg-3); border-color: var(--dc-orange); color: var(--dc-gold-bright); }
.sch-cat-grid { flex: 1; overflow-y: auto; scrollbar-gutter: stable; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; align-content: start; }
.sch-cat-cell {
    display: flex; flex-direction: column; align-items: stretch; gap: 3px;
    aspect-ratio: 1; padding: 4px 3px; overflow: hidden;
    background: var(--dc-bg-1); color: var(--dc-text-dim); border: 1px solid var(--dc-border); border-radius: var(--dc-radius);
    cursor: pointer; font: inherit; font-size: 10px; line-height: 1.15;
}
.sch-cat-cell:hover { border-color: var(--dc-border-strong); }
.sch-cat-cell.active { border-color: var(--dc-gold); background: color-mix(in srgb, var(--dc-gold) 12%, transparent); color: var(--dc-gold-bright); }
.sch-cat-icon { display: flex; align-items: center; justify-content: center; flex: 1; min-height: 0; }
.sch-cat-label {
    flex: none; display: flex; align-items: center; justify-content: center; text-align: center;
    overflow: hidden; word-break: break-all;
}
.sch-cat-detail { border-top: 1px solid var(--dc-border); margin-top: 8px; padding-top: 8px; min-height: 76px; }
.sch-cat-head { display: flex; align-items: center; gap: 8px; }
.sch-cat-name { font-weight: 700; color: var(--dc-gold-bright); }
.sch-cat-subline { color: var(--dc-text-dim); font-size: 12px; }
.sch-cat-desc { color: var(--dc-text-dim); font-size: 12px; margin-top: 3px; }
`
        document.head.appendChild(style)

        const panel = document.createElement('div')
        panel.className = 'sch-cat'
        const title = document.createElement('div')
        title.className = 'sch-cat-title'
        localizeText(title, 'showcase.catalog.title')
        const sub = document.createElement('div')
        sub.className = 'sch-cat-sub'
        localizeText(sub, 'showcase.catalog.subtitle')
        const tabs = document.createElement('div')
        tabs.className = 'sch-cat-tabs'
        const grid = document.createElement('div')
        grid.className = 'sch-cat-grid'
        const detail = document.createElement('div')
        detail.className = 'sch-cat-detail'
        panel.appendChild(title)
        panel.appendChild(sub)
        panel.appendChild(tabs)
        panel.appendChild(grid)
        panel.appendChild(detail)
        document.body.appendChild(panel)

        /* —— 预览切换 —— */
        let modelVisible = true
        const showPreview = (def: ItemDef | undefined): void => {
            if (def !== undefined && isEquipment(def)) {
                modelVisible = true
                model.group.visible = true
                cubeGroup.visible = false
                clearCube()
                applyItemToModel(model, def)
                return
            }
            modelVisible = false
            model.group.visible = false
            cubeGroup.visible = true
            if (def === undefined) {
                clearCube()
                return
            }
            const blockColors = blockPreviewOf(def)
            if (blockColors !== undefined) {
                showCube(blockColors.base, blockColors.grid, 0.6)
            } else {
                const base = CATEGORY_COLORS[def.category]
                showCube(base, base, 0.4)
            }
        }

        const renderDetail = (def: ItemDef | undefined): void => {
            detail.replaceChildren()
            if (def === undefined) {
                const hint = document.createElement('div')
                hint.className = 'sch-cat-desc'
                localizeText(hint, 'showcase.catalog.hint')
                detail.appendChild(hint)
                return
            }
            const name = document.createElement('div')
            name.className = 'sch-cat-name'
            localizeApply(name, el => { el.textContent = itemDisplayName(def) })
            const head = document.createElement('div')
            head.className = 'sch-cat-head'
            const headIcon = createIcon(def.icon, {size: 'lg'})
            headIcon.style.color = categoryColorHex(def)
            head.appendChild(headIcon)
            head.appendChild(name)
            const subline = document.createElement('div')
            subline.className = 'sch-cat-subline'
            localizeApply(subline, el => { el.textContent = subLineOf(def) })
            const desc = document.createElement('div')
            desc.className = 'sch-cat-desc'
            localizeApply(desc, el => { el.textContent = itemDisplayDescription(def) })
            detail.appendChild(head)
            detail.appendChild(subline)
            detail.appendChild(desc)
        }

        let activeId: string | undefined
        const cells = new Map<string, HTMLButtonElement>()
        const select = (def: ItemDef): void => {
            activeId = def.id
            for (const [id, cell] of cells) {
                const active = id === activeId
                if (cell.classList.contains('active') !== active) cell.classList.toggle('active', active)
            }
            showPreview(def)
            renderDetail(def)
        }

        /* 筛选标签：全部 + 各类别 */
        let filter: ItemCategory | 'all' = 'all'
        const buildGrid = (): void => {
            grid.replaceChildren()
            cells.clear()
            const defs = filter === 'all' ? ITEM_DEFS : ITEM_DEFS.filter(def => def.category === filter)
            for (const def of defs) {
                const cell = document.createElement('button')
                cell.type = 'button'
                cell.className = 'sch-cat-cell'
                const iconWrap = document.createElement('span')
                iconWrap.className = 'sch-cat-icon'
                iconWrap.style.color = categoryColorHex(def)
                iconWrap.appendChild(createIcon(def.icon, {size: 'lg'}))
                const label = document.createElement('span')
                label.className = 'sch-cat-label'
                localizeApply(label, el => { el.textContent = itemDisplayName(def) })
                cell.appendChild(iconWrap)
                cell.appendChild(label)
                cell.addEventListener('click', () => { select(def); cell.blur() })
                grid.appendChild(cell)
                cells.set(def.id, cell)
            }
        }
        const tabButtons = new Map<ItemCategory | 'all', HTMLButtonElement>()
        const setFilter = (next: ItemCategory | 'all'): void => {
            filter = next
            for (const [key, btn] of tabButtons) {
                const active = key === filter
                if (btn.classList.contains('active') !== active) btn.classList.toggle('active', active)
            }
            buildGrid()
        }
        const makeTab = (key: ItemCategory | 'all', labelKey: StringLocaleKey): void => {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'sch-cat-tab'
            localizeText(btn, labelKey)
            btn.addEventListener('click', () => { setFilter(key); btn.blur() })
            tabs.appendChild(btn)
            tabButtons.set(key, btn)
        }
        makeTab('all', 'showcase.catalog.all')
        for (const category of ITEM_CATEGORIES) makeTab(category, ITEM_CATEGORY_LABELS[category])
        setFilter('all')
        renderDetail(undefined)

        /* —— 逐帧：装备预览驱动待机动画；方块预览缓慢自转；渲染 —— */
        let stateTime = 0
        const updater = (dt: number): void => {
            if (modelVisible) {
                stateTime += dt
                const ctx: AnimationContext = {
                    stateTime,
                    horizontalSpeed: 0,
                    holdMode: 'one_handed',
                    handedness: DEFAULT_HANDEDNESS,
                    attackSegment: undefined,
                    attackPhase: undefined,
                    attackPhaseProgress: 0,
                    attackTotalProgress: 0,
                    attackPhaseIndex: 0,
                    attackCharge: 0,
                    attackHolding: false,
                    weaponHeld: model.weaponMesh !== null,
                    shieldHands: {main: false, off: false},
                }
                system.update(dt, model, 'idle', ctx)
            } else {
                cubeGroup.rotation.y += dt * 0.8
            }
            sceneCtx.orbit.update(dt)
            sceneCtx.followGrid()
            host.renderer.render(sceneCtx.scene, sceneCtx.camera)
        }

        return {
            updater,
            dispose: () => {
                clearCube()
                panel.remove()
                style.remove()
                model.dispose()
                sceneCtx.dispose()
            },
        }
    },
}
