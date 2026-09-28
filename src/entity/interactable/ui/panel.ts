import type {PanelContext} from '../../box/base/ui/index.ts'
import type {InteractableConfig, InteractableContext} from '../types.ts'
import {INTERACTABLE_KINDS, INTERACTABLE_LABELS, BREAKABLE_SOURCES, BREAKABLE_SOURCE_LABELS, type InteractableKind, type BreakableSource} from '../kinds.ts'
import {defaultInteractableConfig} from '../constants.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'

const row = (label: string, control: HTMLElement): HTMLElement => {
    const wrap = document.createElement('label')
    wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin:2px 0'
    const span = document.createElement('span')
    span.textContent = label
    wrap.appendChild(span)
    wrap.appendChild(control)
    return wrap
}

const textInput = (value: string, width = '120px'): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = value
    input.style.cssText = `width:${width}`
    return input
}

const selectOf = (values: readonly string[], labels: Record<string, string>, current: string): HTMLSelectElement => {
    const select = document.createElement('select')
    for (const v of values) {
        const option = document.createElement('option')
        option.value = v
        option.textContent = labels[v] ?? v
        if (v === current) option.selected = true
        select.appendChild(option)
    }
    return select
}

export const createInteractablePanel = (ctx: Omit<InteractableContext, 'panel'>): PanelContext => {
    const el = document.createElement('div')
    el.id = 'interactable-panel'
    el.style.cssText = [
        'position:fixed;bottom:24px;right:24px',
        'background:rgba(0,0,0,.78);color:#fff',
        'font:13px/1.5 monospace;padding:14px 18px',
        'border-radius:10px;min-width:250px;max-height:80vh;overflow:auto',
        'user-select:none;display:none;z-index:30',
    ].join(';')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px;color:#2a9d8f'
    header.textContent = '交互物'
    el.appendChild(header)

    const kindSelect = selectOf(INTERACTABLE_KINDS, INTERACTABLE_LABELS, 'save_point')
    el.appendChild(row('类型', kindSelect))
    const nameInput = textInput('')
    el.appendChild(row('名称', nameInput))
    const channelInput = textInput('')
    el.appendChild(row('通道', channelInput))

    el.appendChild(createSection('位置 / 朝向'))
    const posX = createLabeledNumberInput(el, 'X', {step: '0.1'})
    const posY = createLabeledNumberInput(el, 'Y', {step: '0.1'})
    const posZ = createLabeledNumberInput(el, 'Z', {step: '0.1'})
    const yaw = createLabeledNumberInput(el, '偏航(°)', {min: '-360', max: '360', step: '90'})

    el.appendChild(createSection('尺寸'))
    const sizeX = createLabeledNumberInput(el, 'X', {min: '0.1', step: '0.1'})
    const sizeY = createLabeledNumberInput(el, 'Y', {min: '0.1', step: '0.1'})
    const sizeZ = createLabeledNumberInput(el, 'Z', {min: '0.1', step: '0.1'})

    const paramSection = createSection('参数')
    el.appendChild(paramSection)
    const travel = createLabeledNumberInput(el, '行程', {min: '0', step: '0.1'})
    const speed = createLabeledNumberInput(el, '速度', {min: '0', step: '0.1'})
    const health = createLabeledNumberInput(el, '生命', {min: '1', step: '1'})
    const switchMode = selectOf(['toggle', 'momentary'], {toggle: '切换', momentary: '瞬时'}, 'toggle')
    el.appendChild(row('开关模式', switchMode))
    const breakableWrap = document.createElement('div')
    const breakableBoxes = new Map<BreakableSource, HTMLInputElement>()
    for (const source of BREAKABLE_SOURCES) {
        const label = document.createElement('label')
        label.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:10px'
        const box = document.createElement('input')
        box.type = 'checkbox'
        label.appendChild(box)
        label.appendChild(document.createTextNode(BREAKABLE_SOURCE_LABELS[source]))
        breakableWrap.appendChild(label)
        breakableBoxes.set(source, box)
    }
    el.appendChild(row('可破坏来源', breakableWrap))

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)
    const triggerBtn = document.createElement('button')
    triggerBtn.textContent = '触发交互'
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
