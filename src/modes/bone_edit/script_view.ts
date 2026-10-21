import {translate} from '../../i18n/index.ts'
import {localizeText} from '../../i18n/dom.ts'
import type {BoneEditFormProfile} from './form_catalog.ts'
import type {FormScriptCacheEntry} from './script_cache.ts'
import {
    BONE_SCRIPT_LIST_ID,
    BONE_SCRIPT_PROGRESS_ID,
    BONE_SCRIPT_REBAKE_ID,
    BONE_SCRIPT_STATUS_ID,
    BONE_SCRIPT_TO_TRACKS_ID,
} from './constants.ts'

export interface ScriptViewHost {
    readonly onSelect: (motionId: string) => void
    readonly onRebake: () => void
    readonly onToTracks: () => void
}

export interface ScriptView {
    readonly element: HTMLElement
    readonly setVisible: (visible: boolean) => void
    readonly render: (profile: BoneEditFormProfile, cache: FormScriptCacheEntry | undefined, selectedId: string | undefined) => void
    readonly updateProgress: (time: number, duration: number) => void
    readonly setVisibleProgress: (visible: boolean) => void
    readonly destroy: () => void
}

/** 函数编排面板：列出代码注册的语义动作、烘焙状态与预览进度 */
export const setupScriptView = (host: ScriptViewHost): ScriptView => {
    const element = document.createElement('div')
    element.id = 'bone-script-panel'
    element.dataset.authoringPanel = 'script'
    element.style.cssText = 'display:none;flex:1;min-height:0;flex-direction:column;gap:6px;padding:8px 10px;overflow:hidden'

    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap'
    const title = document.createElement('strong')
    localizeText(title, 'bone_edit.script.title')
    const help = document.createElement('span')
    localizeText(help, 'bone_edit.script.help')
    help.style.cssText = 'color:var(--dc-text-dim);font-size:11px'
    header.append(title, help)

    const toolbar = document.createElement('div')
    toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap'
    const rebakeBtn = document.createElement('button')
    rebakeBtn.id = BONE_SCRIPT_REBAKE_ID
    rebakeBtn.className = 'dc-btn'
    localizeText(rebakeBtn, 'bone_edit.script.rebake')
    const toTracksBtn = document.createElement('button')
    toTracksBtn.id = BONE_SCRIPT_TO_TRACKS_ID
    toTracksBtn.className = 'dc-btn'
    localizeText(toTracksBtn, 'bone_edit.script.to_tracks')
    const status = document.createElement('span')
    status.id = BONE_SCRIPT_STATUS_ID
    status.style.cssText = 'color:var(--dc-text-dim);font-size:11px'
    toolbar.append(rebakeBtn, toTracksBtn, status)

    const progress = document.createElement('div')
    progress.id = BONE_SCRIPT_PROGRESS_ID
    progress.style.cssText = 'height:4px;border-radius:2px;background:var(--dc-bg-3);overflow:hidden;flex-shrink:0'
    const progressFill = document.createElement('div')
    progressFill.style.cssText = 'height:100%;width:0;background:var(--dc-gold)'
    progress.appendChild(progressFill)

    const list = document.createElement('div')
    list.id = BONE_SCRIPT_LIST_ID
    list.className = 'dc-scroll'
    list.style.cssText = 'flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:4px'

    element.append(header, toolbar, progress, list)

    const setSelected = (selectedId: string | undefined): void => {
        for (const child of list.children) {
            if (!(child instanceof HTMLButtonElement)) continue
            child.classList.toggle('is-active', child.dataset.scriptId === selectedId)
        }
        element.dataset.selectedScript = selectedId ?? ''
    }

    rebakeBtn.addEventListener('click', host.onRebake)
    toTracksBtn.addEventListener('click', host.onToTracks)

    const render = (
        profile: BoneEditFormProfile,
        cache: FormScriptCacheEntry | undefined,
        selectedId: string | undefined,
    ): void => {
        list.innerHTML = ''
        const errors = new Map((cache?.result.errors ?? []).map(error => [error.motionId, error.message]))
        for (const motion of profile.motions) {
            const clip = cache?.result.clips.get(motion.id)
            const error = errors.get(motion.id)
            const row = document.createElement('button')
            row.type = 'button'
            row.className = 'dc-btn'
            row.dataset.scriptId = motion.id
            row.dataset.baked = String(clip !== undefined)
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;padding:6px 8px'
            const label = document.createElement('span')
            label.textContent = translate(motion.nameKey)
            const meta = document.createElement('span')
            meta.style.cssText = 'color:var(--dc-text-dim);font-size:11px'
            meta.textContent = error !== undefined
                ? `${translate('bone_edit.script.error')}: ${error}`
                : `${translate('bone_edit.script.duration')} ${motion.duration.toFixed(2)}s / ${translate(motion.loop ? 'bone_edit.script.loop' : 'bone_edit.script.once')}`
            row.append(label, meta)
            row.disabled = clip === undefined
            row.addEventListener('click', () => host.onSelect(motion.id))
            list.appendChild(row)
        }
        if (profile.motions.length === 0) {
            const empty = document.createElement('div')
            empty.style.cssText = 'color:var(--dc-text-dim);padding:8px 0'
            localizeText(empty, 'bone_edit.script.empty')
            list.appendChild(empty)
        }
        const bakedCount = cache?.result.clips.size ?? 0
        const errorCount = cache?.result.errors.length ?? 0
        status.textContent = errorCount > 0
            ? `${translate('bone_edit.script.error')}: ${errorCount}`
            : translate({key: 'bone_edit.script.baked', args: [bakedCount]})
        toTracksBtn.disabled = selectedId === undefined || !(cache?.result.clips.has(selectedId) ?? false)
        element.dataset.bakedCount = String(bakedCount)
        element.dataset.errorCount = String(errorCount)
        element.dataset.form = profile.formId
        setSelected(selectedId)
    }

    const updateProgress = (time: number, duration: number): void => {
        const ratio = duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0
        progressFill.style.width = `${(ratio * 100).toFixed(2)}%`
        progress.dataset.time = time.toFixed(3)
        progress.dataset.duration = duration.toFixed(3)
    }

    return {
        element,
        setVisible: (visible) => { element.style.display = visible ? 'flex' : 'none' },
        render,
        updateProgress,
        setVisibleProgress: (visible) => { progress.style.display = visible ? 'block' : 'none' },
        destroy: () => { element.remove() },
    }
}
