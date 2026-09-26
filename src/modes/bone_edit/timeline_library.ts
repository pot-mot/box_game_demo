import type {ClipJSON} from '../../skeleton/anim/serialization.ts'
import {clipToJSON, clipFromJSON, skeletonToDefinition, parseAsset} from '../../skeleton/anim/serialization.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import type {AnimationStore} from './animation_store.ts'
import type {BoneEditHistory} from './history.ts'
import type {ClipWeaponSource} from './weapon_control.ts'
import type {TimelineRuntime} from './timeline_ops.ts'
import {BUILTIN_CLIP_GROUP_ORDER, findBuiltinClip, getBuiltinClips} from './builtin_clips.ts'
import {
    ANIM_OPTION_BUILTIN_PREFIX,
    ANIM_OPTION_EDITED_PREFIX,
    ANIM_SELECT_BUILTIN_GROUP_SUFFIX,
    ANIM_SELECT_EDITED_GROUP,
} from './constants.ts'

/** 武器状态（DOM 可测试面刷新用） */
export interface WeaponData {
    readonly weaponId: string
    readonly twoHanded: boolean
    readonly gripAssist: boolean
    readonly gripSolved: boolean
}

/** 动画库依赖（动画下拉 / 导入导出 / undo 恢复） */
export interface LibraryHost {
    readonly store: AnimationStore
    readonly world: SkeletonEntitiesContext
    readonly history: BoneEditHistory
    readonly container: HTMLElement
    readonly animSelect: HTMLSelectElement
    readonly clipWeaponSource: Map<string, ClipWeaponSource>
    readonly runtime: TimelineRuntime
    readonly getWeaponData: () => WeaponData
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
        editedGroup.label = ANIM_SELECT_EDITED_GROUP
        for (const name of store.clips.keys()) {
            const opt = document.createElement('option')
            opt.value = `${ANIM_OPTION_EDITED_PREFIX}${name}`
            opt.textContent = name
            editedGroup.appendChild(opt)
        }
        host.animSelect.appendChild(editedGroup)

        for (const group of BUILTIN_CLIP_GROUP_ORDER) {
            const entries = getBuiltinClips().filter(entry => entry.group === group)
            if (entries.length === 0) continue
            const optgroup = document.createElement('optgroup')
            optgroup.label = `${group}${ANIM_SELECT_BUILTIN_GROUP_SUFFIX}`
            for (const entry of entries) {
                const opt = document.createElement('option')
                opt.value = `${ANIM_OPTION_BUILTIN_PREFIX}${entry.id}`
                opt.textContent = entry.label
                opt.dataset.builtinId = entry.id
                optgroup.appendChild(opt)
            }
            host.animSelect.appendChild(optgroup)
        }

        host.animSelect.value = store.currentName !== undefined ? `${ANIM_OPTION_EDITED_PREFIX}${store.currentName}` : ''
        /* DOM 可测试面：当前动画名与内置动作条目总数 */
        host.container.dataset.currentClip = store.currentName ?? ''
        host.container.dataset.builtinClipCount = String(getBuiltinClips().length)
        /* DOM 可测试面：当前编辑器武器状态 */
        const weapon = host.getWeaponData()
        host.container.dataset.weapon = weapon.weaponId
        host.container.dataset.twoHanded = String(weapon.twoHanded)
        host.container.dataset.gripAssist = weapon.gripAssist ? 'on' : 'off'
        host.container.dataset.gripSolved = String(weapon.gripSolved)
    }

    const selectBuiltinClip = (builtinId: string): void => {
        const entry = findBuiltinClip(builtinId)
        if (entry === undefined) return
        if (store.clips.has(entry.label)) {
            store.select(entry.label)
            return
        }
        const imported = store.importClip(entry.clip)
        /* 记录来源：编辑器「武器：自动」模式据此装备该动作所属武器 / 按持械变体保留或卸下武器 */
        if (entry.weaponId !== undefined || entry.weaponHeld !== undefined) {
            host.clipWeaponSource.set(imported.name, {
                weaponId: entry.weaponId,
                segmentId: entry.segmentId,
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
                    const entity = world.addFromDefinition(asset.skeleton, `导入骨架${world.getEntityList().length + 1}`)
                    world.focus(entity.id)
                    history.startEdit()
                    store.replaceAll(asset.animations, asset.animations[0]?.name)
                    host.clipWeaponSource.clear()
                    /* 骨架被重建：武器必须重新挂到新骨架的右手挂点上 */
                    runtime.syncWeaponForCurrentClip(true)
                    runtime.rebuildPlayer()
                    history.endEdit()
                    runtime.refreshControls()
                    runtime.renderList()
                    runtime.renderCanvas()
                } catch {
                    window.alert('资产文件格式无效！')
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
