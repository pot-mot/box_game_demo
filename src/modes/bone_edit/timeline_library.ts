import type {ClipJSON} from '../../skeleton/anim/serialization.ts'
import {clipToJSON, clipFromJSON, skeletonToDefinition, parseAsset} from '../../skeleton/anim/serialization.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import type {AnimationStore} from './animation_store.ts'
import type {BoneEditHistory} from './history.ts'
import type {ClipWeaponSource} from './weapon_control.ts'
import type {TimelineRuntime} from './timeline_ops.ts'
import {BUILTIN_CLIP_GROUP_ORDER, builtinGroupLabelKey, findBuiltinClip, getBuiltinClips} from './builtin_clips.ts'
import {translate} from '../../i18n/index.ts'
import {localizeApply} from '../../i18n/dom.ts'
import {ANIM_OPTION_BUILTIN_PREFIX, ANIM_OPTION_EDITED_PREFIX} from './constants.ts'

/** 武器状态（DOM 可测试面刷新用） */
export interface WeaponData {
    readonly weaponId: string
    readonly twoHanded: boolean
}

/** 动画库依赖（动画下拉 / 导入导出 / undo 恢复） */
export interface LibraryHost {
    readonly store: AnimationStore
    readonly world: SkeletonEntitiesContext
    readonly history: BoneEditHistory
    readonly container: HTMLElement
    readonly animSelect: HTMLSelectElement
    readonly getClipWeaponSource: () => Map<string, ClipWeaponSource>
    readonly runtime: TimelineRuntime
    readonly getWeaponData: () => WeaponData
    readonly getFormId: () => string
}

export interface TimelineLibrary {
    /** 重建动画下拉（编辑动画 + 内置动作）并刷新 DOM 可测试面 */
    readonly rebuildAnimOptions: () => void
    /** 选中内置动作：已有同名副本则选中，否则深拷贝载入可编辑副本 */
    readonly selectBuiltinClip: (builtinId: string) => void
    readonly exportAsset: () => void
    readonly importAsset: () => void
    /** 恢复动画库（undo/导入用） */
    readonly applyLibrary: (clips: readonly ClipJSON[], currentName?: string) => void
}

export const setupTimelineLibrary = (host: LibraryHost): TimelineLibrary => {
    const {store, world, history, runtime} = host

    const rebuildAnimOptions = (): void => {
        host.animSelect.innerHTML = ''

        const editedGroup = document.createElement('optgroup')
        localizeApply(editedGroup, el => {
            if (el instanceof HTMLOptGroupElement) el.label = translate('bone_edit.anim.edited_group')
        })
        for (const name of store.clips.keys()) {
            const opt = document.createElement('option')
            opt.value = `${ANIM_OPTION_EDITED_PREFIX}${name}`
            opt.textContent = name
            editedGroup.appendChild(opt)
        }
        host.animSelect.appendChild(editedGroup)

        for (const group of BUILTIN_CLIP_GROUP_ORDER) {
            const entries = getBuiltinClips(host.getFormId()).filter(entry => entry.group === group)
            if (entries.length === 0) continue
            const optgroup = document.createElement('optgroup')
            localizeApply(optgroup, el => {
                if (el instanceof HTMLOptGroupElement) el.label = `${translate(builtinGroupLabelKey(group))}${translate('bone_edit.anim.builtin_suffix')}`
            })
            for (const entry of entries) {
                const opt = document.createElement('option')
                opt.value = `${ANIM_OPTION_BUILTIN_PREFIX}${entry.id}`
                localizeApply(opt, el => { el.textContent = entry.labelOf() })
                opt.dataset.builtinId = entry.id
                optgroup.appendChild(opt)
            }
            host.animSelect.appendChild(optgroup)
        }

        host.animSelect.value = store.currentName !== undefined ? `${ANIM_OPTION_EDITED_PREFIX}${store.currentName}` : ''
        /* DOM 可测试面：当前动画名与内置动作条目总数 */
        host.container.dataset.currentClip = store.currentName ?? ''
        host.container.dataset.builtinClipCount = String(getBuiltinClips(host.getFormId()).length)
        /* DOM 可测试面：当前编辑器武器状态 */
        const weapon = host.getWeaponData()
        host.container.dataset.weapon = weapon.weaponId
        host.container.dataset.twoHanded = String(weapon.twoHanded)
    }

    const selectBuiltinClip = (builtinId: string): void => {
        const entry = findBuiltinClip(builtinId, host.getFormId())
        if (entry === undefined) return
        if (store.clips.has(entry.label)) {
            store.select(entry.label)
            return
        }
        const imported = store.importClip(entry.clip)
        /* 记录来源：编辑器「武器：自动」模式据此装备该动作所属武器 / 按持械变体保留或卸下武器 */
        if (entry.weaponId !== undefined || entry.weaponHeld !== undefined) {
            host.getClipWeaponSource().set(imported.name, {
                weaponId: entry.weaponId,
                segmentId: entry.segmentId,
                holdMode: entry.holdMode,
                weaponHeld: entry.weaponHeld,
            })
        }
    }

    const exportAsset = (): void => {
        const skeleton = world.getFocus()?.skeleton
        if (skeleton === undefined) return
        const clips = [...store.clips.values()].map(clipToJSON)
        const json = JSON.stringify({
            formatVersion: 1,
            skeleton: skeletonToDefinition(skeleton),
            animations: clips,
        }, null, 2)
        const blob = new Blob([json], {type: 'application/json'})
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bone-asset-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const importAsset = (): void => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.addEventListener('change', () => {
            const file = input.files?.[0]
            if (file === undefined) return
            const reader = new FileReader()
            reader.onload = () => {
                try {
                    if (typeof reader.result !== 'string') return
                    const raw = JSON.parse(reader.result) as unknown
                    const asset = parseAsset(JSON.stringify(raw))
                    const entity = world.addFromDefinition(
                        asset.skeleton,
                        translate({key: 'bone_edit.library.import_skeleton', args: [world.getEntityList().length + 1]}),
                        host.getFormId(),
                    )
                    world.focus(entity.id)
                    history.startEdit()
                    store.replaceAll(asset.animations, asset.animations[0]?.name)
                    host.getClipWeaponSource().clear()
                    /* 骨架被重建：武器必须重新挂到新骨架的右手挂点上 */
                    runtime.syncWeaponForCurrentClip(true)
                    runtime.rebuildPlayer()
                    history.endEdit()
                    runtime.refreshControls()
                    runtime.renderList()
                    runtime.renderCanvas()
                } catch {
                    window.alert(translate('bone_edit.library.invalid_asset'))
                }
            }
            reader.readAsText(file)
        })
        input.click()
    }

    const applyLibrary = (clips: readonly ClipJSON[], currentName?: string): void => {
        store.replaceAll(clips.map(clipFromJSON), currentName)
        /* undo/redo 会整体重建骨架实体：武器重新挂到新骨架的挂点上 */
        runtime.syncWeaponForCurrentClip(true)
        runtime.rebuildPlayer()
        runtime.refreshControls()
        runtime.renderList()
        runtime.renderCanvas()
    }

    return {rebuildAnimOptions, selectBuiltinClip, exportAsset, importAsset, applyLibrary}
}
