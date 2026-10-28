import type {PanelContext} from '../../../entity/box/base/ui/index.ts'
import {createEntityPanel} from '../../../ui/components/entity_panel.ts'
import {createNumberInput} from '../../../ui/components/number_input.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {createSection} from '../../../ui/components/section.ts'
import {localizeApply, localizeText, localizeTitle} from '../../../i18n/dom.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import {SURFACE_MATERIAL_IDS} from '../../../render/materials/ids.ts'
import {BUILDING_PROP_KINDS, type BuildingPropKind} from '../../../entity/building_generator/props/kinds.ts'
import {BUILDING_RECIPE_IDS, buildingAnchors} from '../../../entity/building_generator/types/index.ts'
import {MATERIAL_LABELS, PROP_LABELS, recipeLabel} from '../../../entity/building_generator/ui/labels.ts'
import {DEFAULT_TERRAIN_CONFIG} from '../../../entity/terrain/base/validation.ts'
import {DEFAULT_AREA_CONFIG} from '../../../entity/area/validation.ts'
import {AREA_MATERIAL_IDS, AREA_SHAPE_KINDS, type AreaMaterialId, type AreaShapeKind} from '../../../entity/area/constants.ts'
import {DEFAULT_BOX_CONFIG} from '../../../entity/box/validation.ts'
import {INTERACTABLE_KINDS, INTERACTABLE_LABELS, type InteractableKind} from '../../../entity/interactable/kinds.ts'
import {defaultInteractableConfig} from '../../../entity/interactable/constants.ts'
import type {BuildingNode, ConnectionNode, DioramaBlueprint, DioramaContext, DioramaNode, DioramaOptions, AreaNode, PopulationRule} from '../types.ts'
import {cloneBlueprint} from '../blueprint.ts'
import {createDioramaBlueprint, DIORAMA_RECIPE_IDS} from '../recipes/index.ts'

const RECIPE_LABELS: Record<string, StringLocaleKey> = {
    fortress: 'diorama.recipe.fortress',
    dungeon: 'diorama.recipe.dungeon',
}

const NODE_KIND_LABELS: Record<DioramaNode['kind'], StringLocaleKey> = {
    building: 'diorama.node.building',
    terrain: 'diorama.node.terrain',
    area: 'diorama.node.area',
    connection: 'diorama.node.connection',
    group: 'diorama.node.group',
}

const RULE_KIND_LABELS: Record<PopulationRule['kind'], StringLocaleKey> = {
    character: 'diorama.rule.character',
    interactable: 'diorama.rule.interactable',
    item: 'diorama.rule.item',
    box: 'diorama.rule.box',
    decor: 'diorama.rule.decor',
}

const PLACEMENT_LABELS: Record<PopulationRule['placement'], StringLocaleKey> = {
    ground: 'diorama.panel.ground',
    roof: 'diorama.panel.roof',
    interior: 'diorama.panel.interior',
    anchor: 'diorama.panel.anchor',
}

const TERRAIN_GENERATORS: ReadonlyArray<{id: string; key: StringLocaleKey}> = [
    {id: 'fbm', key: 'terrain_gen.fbm'},
    {id: 'flat', key: 'terrain_gen.flat'},
    {id: 'sine', key: 'terrain_gen.sine'},
    {id: 'steps', key: 'terrain_gen.steps'},
]

const AREA_MATERIAL_LABELS: Record<AreaMaterialId, StringLocaleKey> = {
    water: 'material.area_water',
    air: 'material.area_air',
    force_field: 'material.area_force_field',
}

const SHAPE_LABELS: Record<AreaShapeKind, StringLocaleKey> = {
    box: 'panel.shape.box',
    sphere: 'panel.shape.sphere',
    cylinder: 'panel.shape.cylinder',
}

const TENDENCY_OPTIONS: ReadonlyArray<{value: string; key: StringLocaleKey}> = [
    {value: 'hostileAll', key: 'character.tendency.hostile_all'},
    {value: 'hostileExceptSelf', key: 'character.tendency.hostile_except_self'},
    {value: 'hostileTo', key: 'character.tendency.hostile_to'},
    {value: 'hostileExcept', key: 'character.tendency.hostile_except'},
    {value: 'pacifist', key: 'character.tendency.pacifist'},
]

const PEACE_OPTIONS: ReadonlyArray<{value: string; key: StringLocaleKey}> = [
    {value: 'patrol', key: 'character.peace.patrol'},
    {value: 'build', key: 'character.peace.build'},
]

const COMBAT_OPTIONS: ReadonlyArray<{value: string; key: StringLocaleKey}> = [
    {value: 'tactical', key: 'character.combat.tactical'},
    {value: 'aggressive', key: 'character.combat.aggressive'},
    {value: 'cowardly', key: 'character.combat.cowardly'},
]

const ORIGIN_OPTIONS: ReadonlyArray<{value: string; key: StringLocaleKey}> = [
    {value: 'resident', key: 'character.origin.resident'},
    {value: 'fighter', key: 'character.origin.fighter'},
    {value: 'hunter', key: 'character.origin.hunter'},
    {value: 'roamer', key: 'character.origin.roamer'},
]

type AreaConfigShape = AreaNode['config']['shape']

interface SelectEntry {
    readonly value: string
    readonly key?: StringLocaleKey
    /** 动态标签（如按配方 id 计算） */
    readonly label?: () => string
}

const addButton = (parent: HTMLElement, key: StringLocaleKey, onClick: () => void, id?: string): HTMLButtonElement => {
    const button = document.createElement('button')
    button.className = 'dc-btn'
    localizeText(button, key)
    if (id !== undefined) button.id = id
    button.addEventListener('click', onClick)
    parent.appendChild(button)
    return button
}

const addRow = (parent: HTMLElement, labelKey: StringLocaleKey, control: HTMLElement): void => {
    const row = document.createElement('label')
    row.className = 'dc-label'
    const text = document.createElement('span')
    localizeText(text, labelKey)
    row.appendChild(text)
    row.appendChild(control)
    parent.appendChild(row)
}

const textInput = (value: string, onChange: (value: string) => void, id?: string): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'dc-input'
    input.value = value
    if (id !== undefined) input.id = id
    input.addEventListener('change', () => onChange(input.value))
    return input
}

const numberInput = (
    value: number,
    onChange: (value: number) => void,
    attrs: Record<string, string> = {},
): HTMLInputElement => {
    const input = createNumberInput({...attrs, value: String(value)})
    input.addEventListener('input', () => {
        const parsed = Number.parseFloat(input.value)
        if (Number.isFinite(parsed)) onChange(parsed)
    })
    return input
}

const selectInput = (
    entries: readonly SelectEntry[],
    current: string,
    onChange: (value: string) => void,
    id?: string,
): HTMLSelectElement => {
    const select = document.createElement('select')
    select.className = 'dc-select'
    if (id !== undefined) select.id = id
    for (const entry of entries) {
        const option = document.createElement('option')
        option.value = entry.value
        const dynamicLabel = entry.label
        if (entry.key !== undefined) localizeText(option, entry.key)
        else if (dynamicLabel !== undefined) localizeApply(option, el => { el.textContent = dynamicLabel() })
        else option.textContent = entry.value
        select.appendChild(option)
    }
    select.value = current
    select.addEventListener('change', () => onChange(select.value))
    return select
}

const checkboxInput = (checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'dc-check'
    input.checked = checked
    input.addEventListener('change', () => onChange(input.checked))
    return input
}

const materialEntries = (): SelectEntry[] =>
    SURFACE_MATERIAL_IDS.map(id => ({value: id, key: MATERIAL_LABELS[id]}))

const propEntries = (): SelectEntry[] =>
    BUILDING_PROP_KINDS.map(kind => ({value: kind, key: PROP_LABELS[kind]}))

const yawEntries = (): SelectEntry[] => [0, 1, 2, 3].map(q => ({value: String(q), label: () => `${q * 90}°`}))

const defaultId = (prefix: string, existing: ReadonlySet<string>): string => {
    let index = 1
    while (existing.has(`${prefix}_${index}`)) index++
    return `${prefix}_${index}`
}

const defaultCharacterConfig = () => ({
    speed: 3,
    jumpHeight: 2,
    scale: 1,
    tendency: {tendencyId: 'hostileExceptSelf' as const},
    faction: 0,
    maxHealth: 100,
    equipment: {limb: {}, weapon: {}, armor: {}},
    isPlayer: false,
})

const defaultBuildingConfig = (): BuildingNode['config'] => ({
    recipe: BUILDING_RECIPE_IDS[0] ?? 'house',
    seed: 0,
    sizeX: 8,
    sizeY: 5,
    sizeZ: 8,
})

const defaultShape = (kind: AreaShapeKind): AreaConfigShape => {
    if (kind === 'box') return {kind, width: 2, height: 2, depth: 2}
    if (kind === 'sphere') return {kind, radius: 1}
    return {kind, radius: 1, height: 2}
}

export const createDioramaPanel = (ctx: Omit<DioramaContext, 'panel'>, options: DioramaOptions = {}): PanelContext => {
    const el = createEntityPanel('diorama-panel', 'entity.diorama_control')
    el.style.cssText += ';min-width:380px;max-height:84vh;z-index:30'

    const recipeRow = document.createElement('label')
    recipeRow.className = 'dc-label'
    const recipeText = document.createElement('span')
    localizeText(recipeText, 'diorama.panel.recipe')
    recipeRow.appendChild(recipeText)
    const recipeSelect = selectInput(
        DIORAMA_RECIPE_IDS.map(id => ({value: id, label: () => translate(RECIPE_LABELS[id] ?? 'diorama.recipe.fortress')})),
        DIORAMA_RECIPE_IDS[0] ?? '',
        () => { recipeDirty = true },
        'diorama-recipe',
    )
    recipeRow.appendChild(recipeSelect)
    el.appendChild(recipeRow)

    const seedRow = document.createElement('label')
    seedRow.className = 'dc-label'
    const seedText = document.createElement('span')
    localizeText(seedText, 'diorama.panel.seed')
    seedRow.appendChild(seedText)
    const seedInput = createNumberInput({step: '1', value: '1'})
    seedInput.id = 'diorama-seed'
    seedInput.addEventListener('input', () => { seedDirty = true })
    seedInput.addEventListener('change', () => { seedDirty = true })
    seedRow.appendChild(seedInput)
    el.appendChild(seedRow)

    const buttons = createButtonRow()
    localizeText(buttons.applyBtn, 'diorama.panel.rebuild')
    localizeText(buttons.deleteBtn, 'diorama.panel.delete')
    localizeTitle(buttons.deleteBtn, 'diorama.panel.delete_title')
    buttons.applyBtn.id = 'diorama-rebuild'
    buttons.deleteBtn.id = 'diorama-delete'
    el.appendChild(buttons.container)

    const guiRoot = document.createElement('div')
    el.appendChild(guiRoot)

    const advanced = document.createElement('details')
    advanced.id = 'diorama-advanced'
    advanced.className = 'dc-section'
    const summary = document.createElement('summary')
    summary.className = 'dc-label'
    localizeText(summary, 'diorama.panel.advanced')
    advanced.appendChild(summary)
    const blueprintText = document.createElement('textarea')
    blueprintText.className = 'dc-input'
    blueprintText.id = 'diorama-blueprint-json'
    blueprintText.style.cssText = 'width:100%;min-height:120px;resize:vertical;white-space:pre;font-family:var(--dc-font-mono)'
    blueprintText.addEventListener('input', () => { blueprintDirty = true })
    advanced.appendChild(blueprintText)
    const applyJsonBtn = document.createElement('button')
    applyJsonBtn.className = 'dc-btn dc-btn--primary'
    applyJsonBtn.id = 'diorama-apply-json'
    localizeText(applyJsonBtn, 'diorama.panel.apply_json')
    advanced.appendChild(applyJsonBtn)
    el.appendChild(advanced)

    const status = document.createElement('div')
    status.className = 'dc-section dc-scroll'
    status.id = 'diorama-diagnostics'
    status.style.cssText = 'max-height:180px;white-space:pre-wrap'
    el.appendChild(status)

    const selected = (): ReturnType<DioramaContext['getSelected']> => ctx.getSelected()

    /** 用户编辑中的字段不被逐帧刷新覆盖（点击按钮会让输入框失焦） */
    let boundEntityId: number | undefined
    let recipeDirty = false
    let seedDirty = false
    let blueprintDirty = false
    let draft: DioramaBlueprint | undefined
    let syncedBlueprint: DioramaBlueprint | undefined
    let draftDirty = false
    let selectedNodeIndex = -1
    let selectedRuleIndex = -1
    let unsavedHint: HTMLElement | undefined

    const clearUiDirty = (): void => {
        recipeDirty = false
        seedDirty = false
        blueprintDirty = false
    }

    const replaceNodes = (nodes: readonly DioramaNode[]): void => {
        if (draft === undefined) return
        draft = {...draft, nodes}
        draftDirty = true
    }

    const patchNode = (index: number, updater: (node: DioramaNode) => DioramaNode): void => {
        if (draft === undefined) return
        const node = draft.nodes[index]
        if (node === undefined) return
        const nodes = [...draft.nodes]
        nodes[index] = updater(node)
        replaceNodes(nodes)
    }

    const replaceRules = (population: readonly PopulationRule[]): void => {
        if (draft === undefined) return
        draft = {...draft, population}
        draftDirty = true
    }

    const patchRule = (index: number, updater: (rule: PopulationRule) => PopulationRule): void => {
        if (draft === undefined) return
        const rule = draft.population[index]
        if (rule === undefined) return
        const population = [...draft.population]
        population[index] = updater(rule)
        replaceRules(population)
    }

    const buildingNodes = (): BuildingNode[] =>
        (draft?.nodes ?? []).filter((node): node is BuildingNode => node.kind === 'building')

    const slotsOf = (node: BuildingNode): SelectEntry[] => {
        const ids = [
            ...buildingAnchors(node.config).map(anchor => anchor.id),
            ...(node.slots ?? []).map(slot => slot.id),
        ]
        return [...new Set(ids)].map(id => ({value: id, label: () => id}))
    }

    const nodeEntries = (nodes: readonly DioramaNode[]): SelectEntry[] =>
        nodes.map(node => ({
            value: node.nodeId,
            label: () => `${translate(NODE_KIND_LABELS[node.kind])} ${node.nodeId}`,
        }))

    const renderNodeDetail = (parent: HTMLElement, index: number, node: DioramaNode): void => {
        const detail = document.createElement('div')
        detail.className = 'dc-section'
        parent.appendChild(detail)

        addRow(detail, 'diorama.panel.node_id', textInput(node.nodeId, value => {
            patchNode(index, current => ({...current, nodeId: value}))
            renderEditor()
        }))
        addRow(detail, 'diorama.panel.yaw', selectInput(yawEntries(), String(node.yawQuarter), value => {
            patchNode(index, current => ({...current, yawQuarter: Number(value)}))
        }))
        addRow(detail, 'panel.x', numberInput(node.position[0], value => {
            patchNode(index, current => {
                const position = [value, current.position[1], current.position[2]] as [number, number, number]
                return {...current, position}
            })
        }, {step: '0.5'}))
        addRow(detail, 'panel.y', numberInput(node.position[1], value => {
            patchNode(index, current => {
                const position = [current.position[0], value, current.position[2]] as [number, number, number]
                return {...current, position}
            })
        }, {step: '0.5'}))
        addRow(detail, 'panel.z', numberInput(node.position[2], value => {
            patchNode(index, current => {
                const position = [current.position[0], current.position[1], value] as [number, number, number]
                return {...current, position}
            })
        }, {step: '0.5'}))

        if (node.kind === 'building') {
            detail.appendChild(createSection('panel.config'))
            addRow(detail, 'panel.recipe', selectInput(
                BUILDING_RECIPE_IDS.map(id => ({value: id, label: () => recipeLabel(id)})),
                node.config.recipe,
                value => {
                    patchNode(index, current => current.kind === 'building'
                        ? {...current, config: {...current.config, recipe: value}}
                        : current)
                    renderEditor()
                },
            ))
            addRow(detail, 'panel.seed', numberInput(node.config.seed, value => {
                patchNode(index, current => current.kind === 'building'
                    ? {...current, config: {...current.config, seed: Math.trunc(value)}}
                    : current)
            }, {step: '1'}))
            detail.appendChild(createSection('panel.size_voxel'))
            addRow(detail, 'panel.x', numberInput(node.config.sizeX, value => {
                patchNode(index, current => current.kind === 'building'
                    ? {...current, config: {...current.config, sizeX: Math.max(1, Math.trunc(value))}}
                    : current)
            }, {min: '1', step: '1'}))
            addRow(detail, 'panel.y', numberInput(node.config.sizeY, value => {
                patchNode(index, current => current.kind === 'building'
                    ? {...current, config: {...current.config, sizeY: Math.max(1, Math.trunc(value))}}
                    : current)
            }, {min: '1', step: '1'}))
            addRow(detail, 'panel.z', numberInput(node.config.sizeZ, value => {
                patchNode(index, current => current.kind === 'building'
                    ? {...current, config: {...current.config, sizeZ: Math.max(1, Math.trunc(value))}}
                    : current)
            }, {min: '1', step: '1'}))
            return
        }

        if (node.kind === 'terrain') {
            detail.appendChild(createSection('diorama.panel.terrain'))
            addRow(detail, 'panel.generator', selectInput(
                TERRAIN_GENERATORS.map(item => ({value: item.id, key: item.key})),
                node.config.generatorId,
                value => {
                    patchNode(index, current => current.kind === 'terrain'
                        ? {...current, config: {...current.config, generatorId: value}}
                        : current)
                },
            ))
            addRow(detail, 'panel.grid', numberInput(node.config.gridSize, value => {
                patchNode(index, current => current.kind === 'terrain'
                    ? {...current, config: {...current.config, gridSize: Math.max(2, Math.trunc(value))}}
                    : current)
            }, {min: '2', step: '1'}))
            addRow(detail, 'panel.cell', numberInput(node.config.cellSize, value => {
                patchNode(index, current => current.kind === 'terrain'
                    ? {...current, config: {...current.config, cellSize: Math.max(0.1, value)}}
                    : current)
            }, {min: '0.1', step: '0.1'}))
            addRow(detail, 'panel.min', numberInput(node.config.minHeight, value => {
                patchNode(index, current => current.kind === 'terrain'
                    ? {...current, config: {...current.config, minHeight: value}}
                    : current)
            }, {step: '0.1'}))
            addRow(detail, 'panel.max', numberInput(node.config.maxHeight, value => {
                patchNode(index, current => current.kind === 'terrain'
                    ? {...current, config: {...current.config, maxHeight: value}}
                    : current)
            }, {step: '0.1'}))
            addRow(detail, 'panel.friction', numberInput(node.config.friction, value => {
                patchNode(index, current => current.kind === 'terrain'
                    ? {...current, config: {...current.config, friction: Math.max(0, value)}}
                    : current)
            }, {min: '0', step: '0.05'}))
            return
        }

        if (node.kind === 'area') {
            detail.appendChild(createSection('panel.shape'))
            addRow(detail, 'panel.shape_kind', selectInput(
                AREA_SHAPE_KINDS.map(kind => ({value: kind, key: SHAPE_LABELS[kind]})),
                node.config.shape.kind,
                value => {
                    patchNode(index, current => current.kind === 'area'
                        ? {...current, config: {...current.config, shape: defaultShape(value as AreaShapeKind)}}
                        : current)
                    renderEditor()
                },
            ))
            addRow(detail, 'panel.material', selectInput(
                AREA_MATERIAL_IDS.map(id => ({value: id, key: AREA_MATERIAL_LABELS[id]})),
                node.config.material,
                value => {
                    patchNode(index, current => current.kind === 'area'
                        ? {...current, config: {...current.config, material: value as AreaMaterialId}}
                        : current)
                },
            ))
            if (node.config.shape.kind === 'box') {
                addRow(detail, 'panel.x', numberInput(node.config.shape.width, value => {
                    patchNode(index, current => current.kind === 'area' && current.config.shape.kind === 'box'
                        ? {...current, config: {...current.config, shape: {...current.config.shape, width: Math.max(0.1, value)}}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'panel.y', numberInput(node.config.shape.height, value => {
                    patchNode(index, current => current.kind === 'area' && current.config.shape.kind === 'box'
                        ? {...current, config: {...current.config, shape: {...current.config.shape, height: Math.max(0.1, value)}}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'panel.z', numberInput(node.config.shape.depth, value => {
                    patchNode(index, current => current.kind === 'area' && current.config.shape.kind === 'box'
                        ? {...current, config: {...current.config, shape: {...current.config.shape, depth: Math.max(0.1, value)}}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
            } else {
                addRow(detail, 'panel.radius', numberInput(node.config.shape.radius, value => {
                    patchNode(index, current => current.kind === 'area' && current.config.shape.kind !== 'box'
                        ? {...current, config: {...current.config, shape: {...current.config.shape, radius: Math.max(0.1, value)}}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                if (node.config.shape.kind === 'cylinder') {
                    addRow(detail, 'panel.height', numberInput(node.config.shape.height, value => {
                        patchNode(index, current => current.kind === 'area' && current.config.shape.kind === 'cylinder'
                            ? {...current, config: {...current.config, shape: {...current.config.shape, height: Math.max(0.1, value)}}}
                            : current)
                    }, {min: '0.1', step: '0.1'}))
                }
            }
            return
        }

        if (node.kind === 'connection') {
            detail.appendChild(createSection('panel.config'))
            const candidates = buildingNodes()
            const fromNode = candidates.find(item => item.nodeId === node.fromNodeId) ?? candidates[0]
            const toNode = candidates.find(item => item.nodeId === node.toNodeId) ?? candidates[1] ?? candidates[0]
            addRow(detail, 'diorama.panel.connection_kind', selectInput([
                {value: 'corridor', key: 'diorama.panel.corridor'},
                {value: 'stairs', key: 'diorama.panel.stairs'},
            ], node.connectionKind, value => {
                patchNode(index, current => current.kind === 'connection'
                    ? {...current, connectionKind: value as ConnectionNode['connectionKind']}
                    : current)
                renderEditor()
            }))
            addRow(detail, 'diorama.panel.from_node', selectInput(nodeEntries(candidates), fromNode?.nodeId ?? '', value => {
                const target = candidates.find(item => item.nodeId === value)
                patchNode(index, current => current.kind === 'connection'
                    ? {...current, fromNodeId: value, fromSlotId: target === undefined ? '' : slotsOf(target)[0]?.value ?? ''}
                    : current)
                renderEditor()
            }))
            addRow(detail, 'diorama.panel.from_slot', selectInput(
                fromNode === undefined ? [] : slotsOf(fromNode),
                node.fromSlotId,
                value => {
                    patchNode(index, current => current.kind === 'connection' ? {...current, fromSlotId: value} : current)
                },
            ))
            addRow(detail, 'diorama.panel.to_node', selectInput(nodeEntries(candidates), toNode?.nodeId ?? '', value => {
                const target = candidates.find(item => item.nodeId === value)
                patchNode(index, current => current.kind === 'connection'
                    ? {...current, toNodeId: value, toSlotId: target === undefined ? '' : slotsOf(target)[0]?.value ?? ''}
                    : current)
                renderEditor()
            }))
            addRow(detail, 'diorama.panel.to_slot', selectInput(
                toNode === undefined ? [] : slotsOf(toNode),
                node.toSlotId,
                value => {
                    patchNode(index, current => current.kind === 'connection' ? {...current, toSlotId: value} : current)
                },
            ))
            addRow(detail, 'diorama.panel.host_node', selectInput(
                nodeEntries(candidates),
                node.hostNodeId ?? node.fromNodeId,
                value => {
                    patchNode(index, current => current.kind === 'connection' ? {...current, hostNodeId: value} : current)
                },
            ))
            addRow(detail, 'panel.material', selectInput(materialEntries(), node.material, value => {
                patchNode(index, current => current.kind === 'connection'
                    ? {...current, material: value as ConnectionNode['material']}
                    : current)
            }))
            addRow(detail, 'diorama.panel.width', numberInput(node.width ?? 2, value => {
                patchNode(index, current => current.kind === 'connection'
                    ? {...current, width: Math.max(1, value)}
                    : current)
            }, {min: '1', step: '1'}))
            const railingRow = document.createElement('label')
            railingRow.className = 'dc-label'
            localizeText(railingRow, 'diorama.panel.railing')
            railingRow.appendChild(checkboxInput(node.railing ?? true, checked => {
                patchNode(index, current => current.kind === 'connection' ? {...current, railing: checked} : current)
            }))
            detail.appendChild(railingRow)
            return
        }

        detail.appendChild(createSection('diorama.panel.group_note'))
    }

    const renderNodes = (parent: HTMLElement): void => {
        if (draft === undefined) return
        const section = createSection('diorama.panel.nodes')
        parent.appendChild(section)

        const toolbar = document.createElement('div')
        toolbar.className = 'dc-row'
        toolbar.style.cssText = 'gap:var(--dc-space-1);flex-wrap:wrap'
        section.appendChild(toolbar)
        const addNode = (kind: 'building' | 'terrain' | 'area'): void => {
            const blueprint = draft
            if (blueprint === undefined) return
            const nodeId = defaultId(kind, new Set(blueprint.nodes.map(node => node.nodeId)))
            const node: DioramaNode = kind === 'building'
                ? {kind, nodeId, position: [0, 0, 0], yawQuarter: 0, config: defaultBuildingConfig()}
                : kind === 'terrain'
                    ? {kind, nodeId, position: [0, 0, 0], yawQuarter: 0, config: structuredClone(DEFAULT_TERRAIN_CONFIG)}
                    : {kind, nodeId, position: [0, 0, 0], yawQuarter: 0, config: structuredClone(DEFAULT_AREA_CONFIG)}
            replaceNodes([...blueprint.nodes, node])
            selectedNodeIndex = blueprint.nodes.length
            renderEditor()
        }
        addButton(toolbar, 'diorama.panel.add_building', () => addNode('building'), 'diorama-add-building')
        addButton(toolbar, 'diorama.panel.add_terrain', () => addNode('terrain'), 'diorama-add-terrain')
        addButton(toolbar, 'diorama.panel.add_area', () => addNode('area'), 'diorama-add-area')
        addButton(toolbar, 'diorama.panel.add_connection', () => {
            const blueprint = draft
            if (blueprint === undefined) return
            const candidates = buildingNodes()
            if (candidates.length < 2) return
            const from = candidates[0]
            const to = candidates[1]
            const node: ConnectionNode = {
                kind: 'connection',
                nodeId: defaultId('connection', new Set(blueprint.nodes.map(node => node.nodeId))),
                position: [0, 0, 0],
                yawQuarter: 0,
                connectionKind: 'corridor',
                fromNodeId: from.nodeId,
                fromSlotId: slotsOf(from)[0]?.value ?? '',
                toNodeId: to.nodeId,
                toSlotId: slotsOf(to)[0]?.value ?? '',
                hostNodeId: from.nodeId,
                material: 'wood',
                width: 2,
                railing: true,
            }
            replaceNodes([...blueprint.nodes, node])
            selectedNodeIndex = blueprint.nodes.length
            renderEditor()
        }, 'diorama-add-connection')

        const list = document.createElement('div')
        list.className = 'dc-list'
        section.appendChild(list)
        draft.nodes.forEach((node, index) => {
            const row = document.createElement('div')
            row.className = 'dc-list-row'
            row.dataset.nodeIndex = String(index)
            if (index === selectedNodeIndex) row.classList.add('is-selected')
            row.textContent = `${translate(NODE_KIND_LABELS[node.kind])} ${node.nodeId}`
            row.addEventListener('click', () => {
                selectedNodeIndex = index
                renderEditor()
            })
            list.appendChild(row)
        })

        const actionRow = document.createElement('div')
        actionRow.className = 'dc-row'
        section.appendChild(actionRow)
        addButton(actionRow, 'common.remove', () => {
            if (draft === undefined || selectedNodeIndex < 0) return
            replaceNodes(draft.nodes.filter((_, index) => index !== selectedNodeIndex))
            selectedNodeIndex = Math.min(selectedNodeIndex, (draft?.nodes.length ?? 0) - 1)
            renderEditor()
        }, 'diorama-remove-node')

        const selectedNode = draft.nodes[selectedNodeIndex]
        if (selectedNode !== undefined) renderNodeDetail(section, selectedNodeIndex, selectedNode)
    }

    const renderRuleDetail = (parent: HTMLElement, index: number, rule: PopulationRule): void => {
        const detail = document.createElement('div')
        detail.className = 'dc-section'
        parent.appendChild(detail)

        addRow(detail, 'diorama.panel.rule_id', textInput(rule.id, value => {
            patchRule(index, current => ({...current, id: value}))
            renderEditor()
        }))
        addRow(detail, 'diorama.panel.zone', selectInput([
            {value: '', key: 'diorama.panel.root'},
            ...nodeEntries(draft?.nodes ?? []),
        ], rule.zoneId, value => {
            patchRule(index, current => ({...current, zoneId: value}))
            renderEditor()
        }))
        addRow(detail, 'diorama.panel.placement', selectInput(
            (['ground', 'roof', 'interior', 'anchor'] as const).map(value => ({value, key: PLACEMENT_LABELS[value]})),
            rule.placement,
            value => {
                patchRule(index, current => ({
                    ...current,
                    placement: value as PopulationRule['placement'],
                    anchorNodeId: value === 'ground' ? undefined : current.anchorNodeId,
                    anchorSlotId: value === 'ground' ? undefined : current.anchorSlotId,
                }))
                renderEditor()
            },
        ))
        addRow(detail, 'diorama.panel.count', numberInput(rule.count ?? 1, value => {
            patchRule(index, current => ({...current, count: Math.max(1, Math.trunc(value))}))
        }, {min: '1', step: '1'}))
        addRow(detail, 'diorama.panel.spacing', numberInput(rule.minSpacing ?? 1.5, value => {
            patchRule(index, current => ({...current, minSpacing: Math.max(0, value)}))
        }, {min: '0', step: '0.5'}))

        if (rule.placement !== 'ground') {
            const candidates = buildingNodes()
            addRow(detail, 'diorama.panel.anchor_node', selectInput([
                {value: '', key: 'diorama.panel.auto'},
                ...nodeEntries(candidates),
            ], rule.anchorNodeId ?? '', value => {
                const target = candidates.find(node => node.nodeId === value)
                patchRule(index, current => ({
                    ...current,
                    anchorNodeId: value === '' ? undefined : value,
                    anchorSlotId: value === '' || target?.kind !== 'building'
                        ? undefined
                        : slotsOf(target)[0]?.value,
                }))
                renderEditor()
            }))
            const anchorNode = candidates.find(node => node.nodeId === rule.anchorNodeId)
            addRow(detail, 'diorama.panel.anchor_slot', selectInput(
                anchorNode?.kind === 'building' ? slotsOf(anchorNode) : [],
                rule.anchorSlotId ?? '',
                value => {
                    patchRule(index, current => ({...current, anchorSlotId: value === '' ? undefined : value}))
                },
            ))
        }

        switch (rule.kind) {
            case 'box': {
                detail.appendChild(createSection('panel.size'))
                addRow(detail, 'panel.x', numberInput(rule.config.width, value => {
                    patchRule(index, current => current.kind === 'box'
                        ? {...current, config: {...current.config, width: Math.max(0.1, value)}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'panel.y', numberInput(rule.config.height, value => {
                    patchRule(index, current => current.kind === 'box'
                        ? {...current, config: {...current.config, height: Math.max(0.1, value)}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'panel.z', numberInput(rule.config.depth, value => {
                    patchRule(index, current => current.kind === 'box'
                        ? {...current, config: {...current.config, depth: Math.max(0.1, value)}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'panel.material', selectInput(materialEntries(), rule.config.material, value => {
                    patchRule(index, current => current.kind === 'box'
                        ? {...current, config: {...current.config, material: value as typeof current.config.material}}
                        : current)
                }))
                addRow(detail, 'diorama.panel.mass', numberInput(rule.config.mass, value => {
                    patchRule(index, current => current.kind === 'box'
                        ? {...current, config: {...current.config, mass: Math.max(0, value)}}
                        : current)
                }, {min: '0', step: '0.1'}))
                addRow(detail, 'panel.friction', numberInput(rule.config.friction, value => {
                    patchRule(index, current => current.kind === 'box'
                        ? {...current, config: {...current.config, friction: Math.max(0, value)}}
                        : current)
                }, {min: '0', step: '0.05'}))
                return
            }
            case 'item': {
                addRow(detail, 'diorama.panel.def_id', textInput(rule.defId, value => {
                    patchRule(index, current => current.kind === 'item' ? {...current, defId: value} : current)
                }))
                addRow(detail, 'diorama.panel.count_per_spawn', numberInput(rule.countPerSpawn ?? 1, value => {
                    patchRule(index, current => current.kind === 'item'
                        ? {...current, countPerSpawn: Math.max(1, Math.trunc(value))}
                        : current)
                }, {min: '1', step: '1'}))
                return
            }
            case 'interactable': {
                const config = rule.config
                detail.appendChild(createSection('entity.params'))
                addRow(detail, 'entity.kind', selectInput(
                    INTERACTABLE_KINDS.map(kind => ({value: kind, key: INTERACTABLE_LABELS[kind]})),
                    config.kind,
                    value => {
                        const kind = value as InteractableKind
                        patchRule(index, current => {
                            if (current.kind !== 'interactable') return current
                            const next = defaultInteractableConfig(kind)
                            next.material = current.config.material
                            next.size = [...current.config.size] as [number, number, number]
                            next.channel = current.config.channel
                            return {...current, config: next}
                        })
                        renderEditor()
                    },
                ))
                addRow(detail, 'panel.material', selectInput(materialEntries(), config.material, value => {
                    patchRule(index, current => current.kind === 'interactable'
                        ? {...current, config: {...current.config, material: value as typeof current.config.material}}
                        : current)
                }))
                addRow(detail, 'entity.channel', textInput(config.channel, value => {
                    patchRule(index, current => current.kind === 'interactable'
                        ? {...current, config: {...current.config, channel: value}}
                        : current)
                }))
                addRow(detail, 'panel.x', numberInput(config.size[0], value => {
                    patchRule(index, current => current.kind === 'interactable'
                        ? {...current, config: {...current.config, size: [Math.max(0.1, value), current.config.size[1], current.config.size[2]]}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'panel.y', numberInput(config.size[1], value => {
                    patchRule(index, current => current.kind === 'interactable'
                        ? {...current, config: {...current.config, size: [current.config.size[0], Math.max(0.1, value), current.config.size[2]]}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'panel.z', numberInput(config.size[2], value => {
                    patchRule(index, current => current.kind === 'interactable'
                        ? {...current, config: {...current.config, size: [current.config.size[0], current.config.size[1], Math.max(0.1, value)]}}
                        : current)
                }, {min: '0.1', step: '0.1'}))

                if (config.kind === 'save_point' || config.kind === 'teleport') {
                    addRow(detail, 'entity.name', textInput(config.name, value => {
                        patchRule(index, current => current.kind === 'interactable' &&
                            (current.config.kind === 'save_point' || current.config.kind === 'teleport')
                            ? {...current, config: {...current.config, name: value}}
                            : current)
                    }))
                } else if (config.kind === 'switch') {
                    addRow(detail, 'entity.switch_mode', selectInput([
                        {value: 'toggle', key: 'entity.mode.toggle'},
                        {value: 'momentary', key: 'entity.mode.momentary'},
                    ], config.mode, value => {
                        patchRule(index, current => current.kind === 'interactable' && current.config.kind === 'switch'
                            ? {...current, config: {...current.config, mode: value as 'toggle' | 'momentary'}}
                            : current)
                    }))
                } else if (config.kind === 'push_door_single' || config.kind === 'push_door_double') {
                    addRow(detail, 'diorama.panel.yaw', selectInput(yawEntries(), String(config.hingeQuarter), value => {
                        patchRule(index, current => current.kind === 'interactable' &&
                            (current.config.kind === 'push_door_single' || current.config.kind === 'push_door_double')
                            ? {...current, config: {...current.config, hingeQuarter: Number(value)}}
                            : current)
                    }))
                } else if (config.kind === 'gate' || config.kind === 'elevator') {
                    addRow(detail, 'entity.travel', numberInput(config.travel, value => {
                        patchRule(index, current => current.kind === 'interactable' &&
                            (current.config.kind === 'gate' || current.config.kind === 'elevator')
                            ? {...current, config: {...current.config, travel: Math.max(0, value)}}
                            : current)
                    }, {min: '0', step: '0.1'}))
                    addRow(detail, 'entity.speed', numberInput(config.speed, value => {
                        patchRule(index, current => current.kind === 'interactable' &&
                            (current.config.kind === 'gate' || current.config.kind === 'elevator')
                            ? {...current, config: {...current.config, speed: Math.max(0.1, value)}}
                            : current)
                    }, {min: '0.1', step: '0.1'}))
                } else if (config.kind === 'chest') {
                    addRow(detail, 'diorama.panel.capacity', numberInput(config.capacity, value => {
                        patchRule(index, current => current.kind === 'interactable' && current.config.kind === 'chest'
                            ? {...current, config: {...current.config, capacity: Math.max(1, Math.trunc(value))}}
                            : current)
                    }, {min: '1', step: '1'}))
                } else if (config.kind === 'breakable') {
                    addRow(detail, 'panel.health', numberInput(config.health, value => {
                        patchRule(index, current => current.kind === 'interactable' && current.config.kind === 'breakable'
                            ? {...current, config: {...current.config, health: Math.max(1, value)}}
                            : current)
                    }, {min: '1', step: '1'}))
                }
                return
            }
            case 'decor': {
                addRow(detail, 'diorama.panel.prop_kind', selectInput(
                    propEntries(),
                    rule.propKind,
                    value => {
                        patchRule(index, current => current.kind === 'decor'
                            ? {...current, propKind: value as BuildingPropKind}
                            : current)
                    },
                ))
                addRow(detail, 'panel.material', selectInput(materialEntries(), rule.material, value => {
                    patchRule(index, current => current.kind === 'decor'
                        ? {...current, material: value as typeof current.material}
                        : current)
                }))
                addRow(detail, 'diorama.panel.yaw', selectInput(yawEntries(), String(rule.yawQuarter ?? 0), value => {
                    patchRule(index, current => current.kind === 'decor'
                        ? {...current, yawQuarter: Number(value)}
                        : current)
                }))
                return
            }
            case 'character': {
                detail.appendChild(createSection('diorama.rule.character'))
                addRow(detail, 'entity.speed', numberInput(rule.config.speed, value => {
                    patchRule(index, current => current.kind === 'character'
                        ? {...current, config: {...current.config, speed: Math.max(0.1, value)}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'character.base_jump_height', numberInput(rule.config.jumpHeight, value => {
                    patchRule(index, current => current.kind === 'character'
                        ? {...current, config: {...current.config, jumpHeight: Math.max(0.1, value)}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'diorama.panel.scale', numberInput(rule.config.scale, value => {
                    patchRule(index, current => current.kind === 'character'
                        ? {...current, config: {...current.config, scale: Math.max(0.1, value)}}
                        : current)
                }, {min: '0.1', step: '0.1'}))
                addRow(detail, 'diorama.panel.body_form', textInput(rule.config.bodyFormId ?? 'humanoid', value => {
                    patchRule(index, current => current.kind === 'character'
                        ? {...current, config: {...current.config, bodyFormId: value === '' ? undefined : value}}
                        : current)
                }))
                addRow(detail, 'panel.faction', numberInput(rule.config.faction, value => {
                    patchRule(index, current => current.kind === 'character'
                        ? {...current, config: {...current.config, faction: Math.trunc(value)}}
                        : current)
                }, {step: '1'}))
                addRow(detail, 'panel.health', numberInput(rule.config.maxHealth, value => {
                    patchRule(index, current => current.kind === 'character'
                        ? {...current, config: {...current.config, maxHealth: Math.max(1, value)}}
                        : current)
                }, {min: '1', step: '1'}))
                const playerRow = document.createElement('label')
                playerRow.className = 'dc-label'
                localizeText(playerRow, 'character.mark_player')
                playerRow.appendChild(checkboxInput(rule.config.isPlayer, checked => {
                    patchRule(index, current => current.kind === 'character'
                        ? {...current, config: {...current.config, isPlayer: checked}}
                        : current)
                }))
                detail.appendChild(playerRow)
                addRow(detail, 'character.ai_tendency', selectInput(
                    TENDENCY_OPTIONS,
                    rule.config.tendency.tendencyId,
                    value => {
                        patchRule(index, current => current.kind === 'character'
                            ? {
                                ...current,
                                config: {
                                    ...current.config,
                                    tendency: {
                                        ...current.config.tendency,
                                        tendencyId: value as typeof current.config.tendency.tendencyId,
                                    },
                                },
                            }
                            : current)
                    },
                ))
                addRow(detail, 'character.peace_label', selectInput(
                    PEACE_OPTIONS,
                    rule.config.peaceStrategy ?? 'patrol',
                    value => {
                        patchRule(index, current => current.kind === 'character'
                            ? {...current, config: {...current.config, peaceStrategy: value as 'patrol' | 'build'}}
                            : current)
                    },
                ))
                addRow(detail, 'character.combat_label', selectInput(
                    COMBAT_OPTIONS,
                    rule.config.combatStrategy ?? 'tactical',
                    value => {
                        patchRule(index, current => current.kind === 'character'
                            ? {...current, config: {...current.config, combatStrategy: value as 'tactical' | 'aggressive' | 'cowardly'}}
                            : current)
                    },
                ))
                addRow(detail, 'character.origin_label', selectInput(
                    ORIGIN_OPTIONS,
                    rule.config.originStrategy ?? 'resident',
                    value => {
                        patchRule(index, current => current.kind === 'character'
                            ? {...current, config: {...current.config, originStrategy: value as 'resident' | 'fighter' | 'hunter' | 'roamer'}}
                            : current)
                    },
                ))
                return
            }
        }
    }

    const renderPopulation = (parent: HTMLElement): void => {
        if (draft === undefined) return
        const section = createSection('diorama.panel.population')
        parent.appendChild(section)

        const toolbar = document.createElement('div')
        toolbar.className = 'dc-row'
        toolbar.style.cssText = 'gap:var(--dc-space-1);flex-wrap:wrap'
        section.appendChild(toolbar)

        const addRule = (kind: PopulationRule['kind']): void => {
            const blueprint = draft
            if (blueprint === undefined) return
            const id = defaultId(kind, new Set(blueprint.population.map(rule => rule.id)))
            const base = {id, zoneId: '', placement: 'ground' as const, count: 1, minSpacing: 1.5}
            const rule: PopulationRule = kind === 'box'
                ? {...base, kind, config: structuredClone(DEFAULT_BOX_CONFIG)}
                : kind === 'item'
                    ? {...base, kind, defId: 'material_stone', countPerSpawn: 1}
                    : kind === 'interactable'
                        ? {...base, kind, config: defaultInteractableConfig('chest')}
                        : kind === 'decor'
                            ? {...base, kind, propKind: 'lantern', material: 'wood', yawQuarter: 0}
                            : {...base, kind, config: defaultCharacterConfig()}
            replaceRules([...blueprint.population, rule])
            selectedRuleIndex = blueprint.population.length
            renderEditor()
        }
        addButton(toolbar, 'diorama.panel.add_box', () => addRule('box'), 'diorama-add-box')
        addButton(toolbar, 'diorama.panel.add_item', () => addRule('item'), 'diorama-add-item')
        addButton(toolbar, 'diorama.panel.add_interactable', () => addRule('interactable'), 'diorama-add-interactable')
        addButton(toolbar, 'diorama.panel.add_decor', () => addRule('decor'), 'diorama-add-decor')
        addButton(toolbar, 'diorama.panel.add_character', () => addRule('character'), 'diorama-add-character')

        const list = document.createElement('div')
        list.className = 'dc-list'
        section.appendChild(list)
        draft.population.forEach((rule, index) => {
            const row = document.createElement('div')
            row.className = 'dc-list-row'
            row.dataset.ruleIndex = String(index)
            if (index === selectedRuleIndex) row.classList.add('is-selected')
            row.textContent = `${translate(RULE_KIND_LABELS[rule.kind])} ${rule.id}`
            row.addEventListener('click', () => {
                selectedRuleIndex = index
                renderEditor()
            })
            list.appendChild(row)
        })

        const actionRow = document.createElement('div')
        actionRow.className = 'dc-row'
        section.appendChild(actionRow)
        addButton(actionRow, 'common.remove', () => {
            if (draft === undefined || selectedRuleIndex < 0) return
            replaceRules(draft.population.filter((_, index) => index !== selectedRuleIndex))
            selectedRuleIndex = Math.min(selectedRuleIndex, (draft?.population.length ?? 0) - 1)
            renderEditor()
        }, 'diorama-remove-rule')

        const selectedRule = draft.population[selectedRuleIndex]
        if (selectedRule !== undefined) renderRuleDetail(section, selectedRuleIndex, selectedRule)
    }

    const renderEditor = (): void => {
        guiRoot.replaceChildren()
        if (draft === undefined) return
        renderNodes(guiRoot)
        renderPopulation(guiRoot)

        const applyRow = document.createElement('div')
        applyRow.className = 'dc-row'
        applyRow.style.cssText = 'gap:var(--dc-space-2);margin-top:var(--dc-space-2)'
        const applyDraft = document.createElement('button')
        applyDraft.className = 'dc-btn dc-btn--primary'
        applyDraft.id = 'diorama-apply-draft'
        applyDraft.style.flex = '1'
        localizeText(applyDraft, 'diorama.panel.apply_draft')
        applyDraft.addEventListener('click', () => {
            const entity = selected()
            if (entity === undefined || draft === undefined) return
            const diagnostics = ctx.rebuild(entity.id, draft)
            const failed = diagnostics.some(item => item.severity === 'error')
            draftDirty = failed
            if (!failed) syncedBlueprint = entity.blueprint
        })
        applyRow.appendChild(applyDraft)
        unsavedHint = document.createElement('span')
        unsavedHint.className = 'dc-hint'
        localizeText(unsavedHint, 'diorama.panel.unsaved')
        unsavedHint.style.display = draftDirty ? '' : 'none'
        applyRow.appendChild(unsavedHint)
        guiRoot.appendChild(applyRow)
    }

    const bindEntity = (entity: NonNullable<ReturnType<DioramaContext['getSelected']>>): void => {
        boundEntityId = entity.id
        draft = cloneBlueprint(entity.blueprint)
        syncedBlueprint = entity.blueprint
        draftDirty = false
        clearUiDirty()
        selectedNodeIndex = draft.nodes.length > 0 ? 0 : -1
        selectedRuleIndex = draft.population.length > 0 ? 0 : -1
        renderEditor()
    }

    buttons.applyBtn.addEventListener('click', () => {
        const entity = selected()
        if (entity === undefined) return
        const seed = Number.parseInt(seedInput.value, 10)
        const blueprint = createDioramaBlueprint(recipeSelect.value, Number.isFinite(seed) ? seed : 0)
        if (blueprint === undefined) return
        ctx.rebuild(entity.id, blueprint)
        bindEntity(entity)
    })

    buttons.deleteBtn.addEventListener('click', () => {
        const entity = selected()
        if (entity !== undefined) ctx.removeCascade(entity.id)
    })

    applyJsonBtn.addEventListener('click', () => {
        const entity = selected()
        if (entity === undefined || options.parseBlueprint === undefined) return
        let raw: unknown
        try {
            raw = JSON.parse(blueprintText.value)
        } catch {
            status.textContent = translate('diorama.panel.invalid_json')
            return
        }
        const blueprint = options.parseBlueprint(raw)
        if (blueprint === undefined) {
            status.textContent = translate('diorama.panel.invalid_json')
            return
        }
        ctx.rebuild(entity.id, blueprint)
        bindEntity(entity)
    })

    return {
        render: (container: HTMLElement) => {
            container.appendChild(el)
            el.style.display = 'block'
            const entity = selected()
            if (entity !== undefined) bindEntity(entity)
        },
        destroy: () => {
            el.remove()
        },
        update: () => {
            const entity = selected()
            if (entity === undefined) return
            if (boundEntityId !== entity.id) {
                bindEntity(entity)
            } else if (!draftDirty && draft !== undefined && entity.blueprint !== syncedBlueprint) {
                bindEntity(entity)
            }
            if (!recipeDirty && document.activeElement !== recipeSelect) recipeSelect.value = entity.blueprint.recipeId
            if (!seedDirty && document.activeElement !== seedInput) seedInput.value = String(entity.seed)
            if (!blueprintDirty && document.activeElement !== blueprintText) {
                blueprintText.value = JSON.stringify(draft ?? entity.blueprint, null, 2)
            }
            const lines = entity.diagnostics.map(item => `${translate(item.severity === 'error' ? 'diorama.panel.error' : 'diorama.panel.warning')} ${item.message}`)
            status.textContent = lines.length === 0 ? translate('diorama.panel.ok') : lines.join('\n')
        },
    }
}
