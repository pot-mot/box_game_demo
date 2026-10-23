import {Mesh, type Scene} from 'three'
import type {PanelContext} from '../box/base/ui'
import type {Skeleton, JointCascadeSettings} from '../../skeleton/skeleton.ts'
import {syncBoneLengths} from '../../skeleton/bone.ts'
import {connectJoint, disconnectJoint} from '../../skeleton/joint.ts'
import {skeletonFromDefinition, type SkeletonDefinition} from '../../skeleton/anim/serialization.ts'
import {createJointVisuals, type JointVisuals} from './render/joint_groups.ts'
import type {SkeletonAppearance, SkeletonPreset} from './appearance.ts'
import {createSkeletonPanel} from './ui/panel.ts'
import {focusPanel} from '../../ui/entity_control_panel.ts'
import {translate} from '../../i18n/index.ts'
import {DEFAULT_CASCADE_DEPTH, DEFAULT_CASCADE_ENABLED} from './constants.ts'

/** 骨架实体选中项 */
export interface SkeletonSelection {
    readonly kind: 'joint' | 'bone'
    readonly id: string
}

/** 骨骼编辑器视图设置：编辑开关 + 三层独立显示 */
export interface SkeletonViewSettings {
    /** 是否允许编辑节点（拾取 + Gizmo + 属性面板输入） */
    editEnabled: boolean
    showJoints: boolean
    showBones: boolean
    showModel: boolean
}

/** 骨架预设来源：把「预设 id → 定义/外观」的映射交给外壳注入，骨骼层保持与体形无关 */
export interface SkeletonPresetSource {
    readonly defaultPresetId: string
    readonly presetIds: readonly string[]
    readonly presetOf: (presetId: string) => SkeletonPreset
}

/** 骨架实体（纯视觉，不创建物理 body；编辑模式物理冻结）。
 *  骨骼可视化：关节 = 小球，骨骼段 = 细长菱形连接段；外观部件（可选，由注入预设装配）随关节 Group 变换。 */
export interface SkeletonEntity {
    readonly id: number
    readonly name: string
    /** 创建该实体时使用的预设 id（体形切换 / undo 恢复用） */
    readonly presetId: string
    /** 桥接骨架（写局部 pose 时同步 Group，场景图级联；实体编辑以它为真源） */
    readonly skeleton: Skeleton
    readonly visuals: JointVisuals
    /** 外观部件（模型层，骨骼层覆盖其上；由注入的预设装配） */
    readonly appearance: SkeletonAppearance
    /** 可拾取网格（关节小球 + 骨骼段菱形 + 外观部件） */
    readonly meshes: readonly Mesh[]
}

/** 骨骼实体上下文（多骨架并存 + 聚焦隔离） */
export interface SkeletonEntitiesContext {
    /** 新建指定预设骨架实体并聚焦 */
    addPreset: (presetId?: string, name?: string) => SkeletonEntity
    /** 从骨架定义重建实体（导入/undo 用）并聚焦 */
    addFromDefinition: (definition: SkeletonDefinition, name?: string, presetId?: string) => SkeletonEntity
    remove: (id: number) => void
    getEntityList: () => readonly SkeletonEntity[]
    getFocus: () => SkeletonEntity | undefined
    focus: (id: number) => void
    select: (selection: SkeletonSelection | undefined) => void
    getSelection: () => SkeletonSelection | undefined
    /** 全部可拾取网格（仅骨骼辅助层：关节小球 + 骨骼段菱形） */
    getMeshes: () => readonly Mesh[]
    /** 视图设置（编辑开关 + 三层显示） */
    getViewSettings: () => Readonly<SkeletonViewSettings>
    /** 更新视图设置并立即应用到全部骨架 */
    setViewSettings: (patch: Partial<SkeletonViewSettings>) => void
    /** 级联编辑设置（面板与指针共享的可变对象） */
    getCascadeSettings: () => JointCascadeSettings
    /** 领域编辑后刷新：FK + 写回场景图 + 部件按骨骼段长度缩放 */
    refresh: () => void
    /** 以场景为真源：聚焦骨架从 Group 读回局部 */
    syncFromScene: () => void
    panel: PanelContext
    /** 每帧：FK 重算（骨架静止时无操作，动画播放时驱动场景图） */
    updater: (dt: number) => void
}

export const setupSkeletonEntities = (scene: Scene, presets: SkeletonPresetSource): SkeletonEntitiesContext => {
    const entities = new Map<number, SkeletonEntity>()
    let nextId = 1
    let focusId: number | undefined
    let selection: SkeletonSelection | undefined
    /* 级联编辑设置：面板修改、指针读取 */
    const cascadeSettings: JointCascadeSettings = {
        enabled: DEFAULT_CASCADE_ENABLED,
        depth: DEFAULT_CASCADE_DEPTH,
    }
    const viewSettings: SkeletonViewSettings = {
        editEnabled: true,
        showJoints: true,
        showBones: true,
        showModel: true,
    }

    /** 把当前视图设置应用到单个骨架实体 */
    const applyViewSettings = (entity: SkeletonEntity): void => {
        entity.visuals.setJointsVisible(viewSettings.showJoints)
        entity.visuals.setBonesVisible(viewSettings.showBones)
        for (const mesh of entity.appearance.partMeshes) mesh.visible = viewSettings.showModel
    }

    const addPreset = (presetId = presets.defaultPresetId, name?: string): SkeletonEntity =>
        addFromDefinition(presets.presetOf(presetId).createDefinition(), name, presetId)

    const addFromDefinition = (definition: SkeletonDefinition, name?: string, presetId = presets.defaultPresetId): SkeletonEntity => {
        /* scaffold 是「定义 → 关节树/骨骼」的一次性构建输入：createJointVisuals 据其建 Group 层级，
         * 再把局部 pose/骨骼段复制进以场景 Group 为绑定的 bridge；实体骨架以 bridge 为准，scaffold 随后弃用 */
        const scaffold = skeletonFromDefinition(definition)
        const visuals = createJointVisuals(scaffold, scene)
        /* 模型层：方块人外观部件装配到关节 Group 上（随骨架变换；由预设注入） */
        const appearance = presets.presetOf(presetId).mountAppearance(visuals.groups)
        const entity: SkeletonEntity = {
            id: nextId,
            name: name ?? translate({key: 'entity.skeleton_name', args: [String(nextId)]}),
            presetId,
            skeleton: visuals.bridge,
            visuals,
            appearance,
            /* 拾取只覆盖骨骼辅助层，模型部件不参与（避免躯干部件把点击映射到髋部关节） */
            meshes: [...visuals.gizmos.values(), ...visuals.boneVisuals.values()],
        }
        nextId += 1
        entities.set(entity.id, entity)
        focusId = entity.id
        applyViewSettings(entity)
        refreshFocusVisibility()
        return entity
    }

    const remove = (id: number): void => {
        const entity = entities.get(id)
        if (entity === undefined) return
        entity.visuals.cleanup()
        entity.appearance.cleanup()
        entities.delete(id)
        if (focusId === id) {
            focusId = [...entities.keys()][0]
        }
        refreshFocusVisibility()
        if (selection !== undefined) {
            selection = undefined
            focusPanel(undefined)
        }
    }

    /** 聚焦隔离：只显示当前聚焦骨架（体形切换 / 导入 / undo 重建时不叠加多具骨架） */
    const refreshFocusVisibility = (): void => {
        for (const entity of entities.values()) {
            entity.visuals.rootGroup.visible = entity.id === focusId
        }
    }

    const getFocus = (): SkeletonEntity | undefined =>
        focusId !== undefined ? entities.get(focusId) : undefined

    const focus = (id: number): void => {
        if (!entities.has(id)) return
        focusId = id
        selection = undefined
        refreshFocusVisibility()
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

    const setViewSettings = (patch: Partial<SkeletonViewSettings>): void => {
        const next: SkeletonViewSettings = {...viewSettings, ...patch}
        const changed = next.editEnabled !== viewSettings.editEnabled
            || next.showJoints !== viewSettings.showJoints
            || next.showBones !== viewSettings.showBones
            || next.showModel !== viewSettings.showModel
        if (!changed) return
        viewSettings.editEnabled = next.editEnabled
        viewSettings.showJoints = next.showJoints
        viewSettings.showBones = next.showBones
        viewSettings.showModel = next.showModel
        for (const entity of entities.values()) applyViewSettings(entity)
        /* 隐藏当前选中层时清除选中，避免不可见图层仍可被 Gizmo 编辑 */
        if (selection !== undefined) {
            if (selection.kind === 'joint' && !viewSettings.showJoints) select(undefined)
            else if (selection.kind === 'bone' && !viewSettings.showBones) select(undefined)
            else if (selection !== undefined) focusPanel(panel)
        }
    }

    const refresh = (): void => {
        for (const entity of entities.values()) {
            /* 段长 = 派生缓存（真源为关节位置）：刷新时从实际距离回写，保证面板/部件与骨架一致 */
            syncBoneLengths(entity.skeleton)
            entity.visuals.resizeBoneVisuals()
            entity.appearance.resize?.(entity.skeleton)
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
            /* 依赖骨骼变换的程序化部件（翅膜等）在关节写入后再重建 */
            entity.appearance.update?.()
        }
    }

    const ctxWithoutPanel = {
        addPreset,
        addFromDefinition,
        remove,
        getEntityList: (): readonly SkeletonEntity[] => [...entities.values()],
        getFocus,
        focus,
        select,
        getSelection: (): SkeletonSelection | undefined => selection,
        getMeshes: (): readonly Mesh[] => {
            /* 只拾取当前聚焦骨架的骨骼辅助层：其余体形骨架与模型部件均不参与 */
            const focus = getFocus()
            return focus !== undefined ? focus.meshes.filter(mesh => mesh.visible) : []
        },
        getViewSettings: (): Readonly<SkeletonViewSettings> => ({...viewSettings}),
        setViewSettings,
        getCascadeSettings: (): JointCascadeSettings => cascadeSettings,
        refresh,
        syncFromScene,
        updater,
    }

    /** 重连父关节：Group 层级与领域骨架同时重挂，再用场景局部变换回写桥接骨架（世界位置保持） */
    const reparentJoint = (jointId: string, parentId: string | undefined): void => {
        const entity = getFocus()
        if (entity === undefined) return
        const joint = entity.skeleton.findJoint(jointId)
        const childGroup = entity.visuals.groups.get(jointId)
        if (joint === undefined || childGroup === undefined) return
        if (parentId === undefined) {
            if (joint.parent === undefined) return
            disconnectJoint(joint)
            entity.visuals.rootGroup.attach(childGroup)
        } else {
            if (parentId === jointId) return
            const parent = entity.skeleton.findJoint(parentId)
            const parentGroup = entity.visuals.groups.get(parentId)
            if (parent === undefined || parentGroup === undefined) return
            /* connectJoint 内部校验自环 / 祖先，非法重连直接抛错，不产生半完成状态 */
            connectJoint(parent, joint)
            parentGroup.attach(childGroup)
        }
        entity.visuals.bridge.syncFromScene()
        entity.visuals.resizeBoneVisuals()
    }

    const panel = createSkeletonPanel({
        getFocus,
        getSelection: (): SkeletonSelection | undefined => selection,
        getCascadeSettings: (): JointCascadeSettings => cascadeSettings,
        isEditingEnabled: (): boolean => viewSettings.editEnabled,
        refresh,
        reparentJoint,
        reopen: (): void => {
            if (selection !== undefined) focusPanel(panel)
        },
    })

    return {...ctxWithoutPanel, panel}
}
