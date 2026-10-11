import type {PanelContext} from '../../box/base/ui/index.ts'
import type {InteractableConfig, InteractableContext} from '../types.ts'
import {INTERACTABLE_KINDS, INTERACTABLE_LABELS, BREAKABLE_SOURCES, BREAKABLE_SOURCE_LABELS, type InteractableKind, type BreakableSource} from '../kinds.ts'
import {defaultInteractableConfig} from '../constants.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createEntityPanel} from '../../../ui/components/entity_panel.ts'
import {localizeText, type LocalKeyParam} from '../../../i18n/dom.ts'
import type {StringLocaleKey} from '../../../i18n/index.ts'

const row = (label: LocalKeyParam, control: HTMLElement): HTMLElement => {
    const wrap = document.createElement('label')
    wrap.className = 'dc-row'
    wrap.style.cssText = 'justify-content:space-between;margin:2px 0'
    const span = document.createElement('span')
    localizeText(span, label)
    wrap.appendChild(span)
    wrap.appendChild(control)
    return wrap
}

const textInput = (value: string, width = '120px'): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'dc-input'
    input.value = value
    input.style.cssText = `width:${width}`
    return input
}

const selectOf = (values: readonly string[], labels: Record<string, StringLocaleKey>, current: string): HTMLSelectElement => {
    const select = document.createElement('select')
    select.className = 'dc-select'
    for (const v of values) {
        const option = document.createElement('option')
        option.value = v
        const key = labels[v]
        if (key === undefined) option.textContent = v
        else localizeText(option, key)
        if (v === current) option.selected = true
        select.appendChild(option)
    }
    return select
}

export const createInteractablePanel = (ctx: Omit<InteractableContext, 'panel'>): PanelContext => {
    const el = createEntityPanel('interactable-panel', 'entity.interactable_title')
    el.style.cssText += ';min-width:250px;max-height:80vh;z-index:30'

    const kindSelect = selectOf(INTERACTABLE_KINDS, INTERACTABLE_LABELS, 'save_point')
    el.appendChild(row('entity.kind', kindSelect))
    const nameInput = textInput('')
    el.appendChild(row('entity.name', nameInput))
    const channelInput = textInput('')
    el.appendChild(row('entity.channel', channelInput))

    el.appendChild(createSection('entity.pos_yaw'))
    const posX = createLabeledNumberInput(el, 'panel.x', {step: '0.1'})
    const posY = createLabeledNumberInput(el, 'panel.y', {step: '0.1'})
    const posZ = createLabeledNumberInput(el, 'panel.z', {step: '0.1'})
    const yaw = createLabeledNumberInput(el, 'entity.yaw', {min: '-360', max: '360', step: '90'})

    el.appendChild(createSection('panel.size'))
    const sizeX = createLabeledNumberInput(el, 'panel.x', {min: '0.1', step: '0.1'})
    const sizeY = createLabeledNumberInput(el, 'panel.y', {min: '0.1', step: '0.1'})
    const sizeZ = createLabeledNumberInput(el, 'panel.z', {min: '0.1', step: '0.1'})

    const paramSection = createSection('entity.params')
    el.appendChild(paramSection)
    const travel = createLabeledNumberInput(el, 'entity.travel', {min: '0', step: '0.1'})
    const speed = createLabeledNumberInput(el, 'entity.speed', {min: '0', step: '0.1'})
    const health = createLabeledNumberInput(el, 'panel.health', {min: '1', step: '1'})
    const switchMode = selectOf(['toggle', 'momentary'], {toggle: 'entity.mode.toggle', momentary: 'entity.mode.momentary'}, 'toggle')
    el.appendChild(row('entity.switch_mode', switchMode))
    const breakableWrap = document.createElement('div')
    const breakableBoxes = new Map<BreakableSource, HTMLInputElement>()
    for (const source of BREAKABLE_SOURCES) {
        const label = document.createElement('label')
        label.className = 'dc-label'
        label.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:10px'
        const box = document.createElement('input')
        box.type = 'checkbox'
        box.className = 'dc-check'
        label.appendChild(box)
        const text = document.createElement('span')
        localizeText(text, BREAKABLE_SOURCE_LABELS[source])
        label.appendChild(text)
        breakableWrap.appendChild(label)
        breakableBoxes.set(source, box)
    }
    el.appendChild(row('entity.breakable_by', breakableWrap))

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)
    const triggerBtn = document.createElement('button')
    triggerBtn.className = 'dc-btn'
    localizeText(triggerBtn, 'entity.trigger')
    triggerBtn.style.cssText = 'margin-top:6px;width:100%'
    el.appendChild(triggerBtn)

    const syncKindFields = (kind: InteractableKind): void => {
        /* 按类型显隐专属参数（简单做法：不隐藏，仅按需刷新值） */
        nameInput.style.display = kind === 'save_point' || kind === 'teleport' ? '' : 'none'
        travel.parentElement!.style.display = kind === 'gate' || kind === 'elevator' ? '' : 'none'
        speed.parentElement!.style.display = kind === 'gate' || kind === 'elevator' ? '' : 'none'
        health.parentElement!.style.display = kind === 'breakable' ? '' : 'none'
        switchMode.parentElement!.style.display = kind === 'switch' ? '' : 'none'
        breakableWrap.parentElement!.style.display = kind === 'breakable' ? '' : 'none'
    }

    const refreshValues = (): void => {
        if (el.contains(document.activeElement)) return
        const sel = ctx.getById(ctx.getSelectedId() ?? -1)
        if (sel === undefined) return
        const c = sel.config
        kindSelect.value = c.kind
        syncKindFields(c.kind)
        if (c.kind === 'save_point' || c.kind === 'teleport') nameInput.value = c.name
        channelInput.value = c.channel
        posX.value = sel.base.x.toFixed(2)
        posY.value = sel.base.y.toFixed(2)
        posZ.value = sel.base.z.toFixed(2)
        yaw.value = (sel.group.rotation.y * 180 / Math.PI).toFixed(0)
        sizeX.value = String(c.size[0])
        sizeY.value = String(c.size[1])
        sizeZ.value = String(c.size[2])
        if (c.kind === 'gate' || c.kind === 'elevator') {
            travel.value = String(c.travel)
            speed.value = String(c.speed)
        }
        if (c.kind === 'switch') switchMode.value = c.mode
        if (c.kind === 'breakable') {
            health.value = String(c.health)
            for (const [source, box] of breakableBoxes) box.checked = c.breakableBy.includes(source)
        }
    }

    const readConfigFromPanel = (): InteractableConfig => {
        const kind = kindSelect.value as InteractableKind
        const cfg = defaultInteractableConfig(kind)
        cfg.size = [parseFloat(sizeX.value) || cfg.size[0], parseFloat(sizeY.value) || cfg.size[1], parseFloat(sizeZ.value) || cfg.size[2]]
        cfg.channel = channelInput.value
        if (cfg.kind === 'save_point' || cfg.kind === 'teleport') cfg.name = nameInput.value || cfg.name
        if (cfg.kind === 'switch') cfg.mode = switchMode.value as 'toggle' | 'momentary'
        if (cfg.kind === 'gate' || cfg.kind === 'elevator') {
            cfg.travel = parseFloat(travel.value) || cfg.travel
            cfg.speed = parseFloat(speed.value) || cfg.speed
        }
        if (cfg.kind === 'breakable') {
            cfg.health = parseFloat(health.value) || cfg.health
            const chosen = [...breakableBoxes.entries()].filter(([, box]) => box.checked).map(([source]) => source)
            if (chosen.length > 0) cfg.breakableBy = chosen
        }
        return cfg
    }

    return {
        render: (container: HTMLElement) => {
            container.appendChild(el)
            el.style.display = 'block'
            refreshValues()

            applyBtn.onclick = () => {
                const cur = ctx.getById(ctx.getSelectedId() ?? -1)
                if (cur === undefined) return
                const next = readConfigFromPanel()
                const x = parseFloat(posX.value)
                const y = parseFloat(posY.value)
                const z = parseFloat(posZ.value)
                const yawQuarter = Math.round((parseFloat(yaw.value) || 0) / 90) & 3
                ctx.remove(cur.id)
                const created = ctx.add(next, x, y, z, yawQuarter)
                ctx.select(created.id)
            }
            triggerBtn.onclick = () => {
                const id = ctx.getSelectedId()
                if (id !== undefined) ctx.activate(id)
            }
            deleteBtn.onclick = () => {
                const id = ctx.getSelectedId()
                if (id !== undefined) ctx.remove(id)
            }
        },
        destroy: () => {
            el.remove()
        },
        update: refreshValues,
    }
}
