import {Mesh, type Scene} from 'three'
import type {PanelContext} from '../box/base/ui'
import type {Skeleton} from '../../skeleton/skeleton.ts'
import {skeletonFromDefinition} from '../../skeleton/anim/serialization.ts'
import {createJointVisuals, type JointVisuals} from './render/joint_groups.ts'
import {assembleCharacterAppearance, resizeBoneParts, type CharacterAppearance} from './appearance/assemble.ts'
import {buildCharacterSkeletonDefinition} from './preset.ts'
import {createSkeletonPanel} from './ui/panel.ts'
import {PRESET_PALETTE} from './constants.ts'
import {focusPanel} from '../../ui/entity_control_panel.ts'

/** 骨架实体选中项 */
export interface SkeletonSelection {
    readonly kind: 'joint' | 'bone'
    readonly id: string
}

/** 骨架实体（纯视觉，不创建物理 body；编辑模式物理冻结） */
export interface SkeletonEntity {
    readonly id: number
    readonly name: string
    readonly skeleton: Skeleton
    readonly visuals: JointVisuals
    readonly appearance: CharacterAppearance
    /** 可拾取网格（gizmo + 外观部件） */
    readonly meshes: readonly Mesh[]
}

/** 骨骼实体上下文（多骨架并存 + 聚焦隔离） */
export interface SkeletonEntitiesContext {
    /** 新建人形预设骨架实体并聚焦 */
    addPreset: (name?: string) => SkeletonEntity
    remove: (id: number) => void
    getEntityList: () => readonly SkeletonEntity[]
    getFocus: () => SkeletonEntity | undefined
    focus: (id: number) => void
    select: (selection: SkeletonSelection | undefined) => void
    getSelection: () => SkeletonSelection | undefined
    /** 全部可拾取网格 */
    getMeshes: () => readonly Mesh[]
    /** 领域编辑后刷新：FK + 写回场景图 + 部件按骨骼段长度缩放 */
    refresh: () => void
    /** 以场景为真源：聚焦骨架从 Group 读回局部 */
    syncFromScene: () => void
    panel: PanelContext
    /** 每帧：FK 重算（骨架静止时无操作，动画播放时驱动场景图） */
    updater: (dt: number) => void
}

export const setupSkeletonEntities = (scene: Scene): SkeletonEntitiesContext => {
    const entities = new Map<number, SkeletonEntity>()
    let nextId = 1
    let focusId: number | undefined
    let selection: SkeletonSelection | undefined

    const addPreset = (name?: string): SkeletonEntity => {
        const skeleton = skeletonFromDefinition(buildCharacterSkeletonDefinition())
        const visuals = createJointVisuals(skeleton, scene)
        const appearance = assembleCharacterAppearance(visuals.groups, PRESET_PALETTE)
        resizeBoneParts(skeleton, appearance)
        const entity: SkeletonEntity = {
            id: nextId,
            name: name ?? `骨架${nextId}`,
            skeleton,
            visuals,
            appearance,
            meshes: [...visuals.gizmos.values(), ...appearance.partMeshes],
        }
        nextId += 1
        entities.set(entity.id, entity)
        focusId = entity.id
        return entity
    }

    const remove = (id: number): void => {
        const entity = entities.get(id)
        if (entity === undefined) return
        entity.appearance.cleanup()
        entity.visuals.cleanup()
        entities.delete(id)
        if (focusId === id) {
            focusId = [...entities.keys()][0]
        }
        if (selection !== undefined) {
            selection = undefined
            focusPanel(undefined)
        }
    }

    const getFocus = (): SkeletonEntity | undefined =>
        focusId !== undefined ? entities.get(focusId) : undefined

    const focus = (id: number): void => {
        if (!entities.has(id)) return
        focusId = id
        selection = undefined
        focusPanel(undefined)
    }

    const select = (next: SkeletonSelection | undefined): void => {
        selection = next
        if (next === undefined) {
            focusPanel(undefined)
            return
        }
        focusPanel(panel)
    }

    const refresh = (): void => {
        for (const entity of entities.values()) {
            entity.skeleton.updateWorldTransforms()
            resizeBoneParts(entity.skeleton, entity.appearance)
        }
    }

    const syncFromScene = (): void => {
        const entity = getFocus()
        if (entity !== undefined) {
            entity.visuals.bridge.syncFromScene()
        }
    }

    const updater = (dt: number): void => {
        void dt
        for (const entity of entities.values()) {
            entity.skeleton.updateWorldTransforms()
        }
    }

    const ctxWithoutPanel = {
        addPreset,
        remove,
        getEntityList: (): readonly SkeletonEntity[] => [...entities.values()],
        getFocus,
        focus,
        select,
        getSelection: (): SkeletonSelection | undefined => selection,
        getMeshes: (): readonly Mesh[] => [...entities.values()].flatMap(e => e.meshes),
        refresh,
        syncFromScene,
        updater,
    }

    const panel = createSkeletonPanel({
        getFocus,
        getSelection: (): SkeletonSelection | undefined => selection,
        refresh,
        reopen: (): void => {
            if (selection !== undefined) focusPanel(panel)
        },
    })

    return {...ctxWithoutPanel, panel}
}