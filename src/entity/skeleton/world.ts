import {Mesh, type Scene} from 'three'
import type {PanelContext} from '../box/base/ui'
import type {Skeleton, JointCascadeSettings} from '../../skeleton/skeleton.ts'
import {syncBoneLengths} from '../../skeleton/bone.ts'
import {skeletonFromDefinition, type SkeletonDefinition} from '../../skeleton/anim/serialization.ts'
import {createJointVisuals, createRotationGizmo, disposeRotationGizmo, type JointVisuals} from './render/joint_groups.ts'
import type {SkeletonAppearance, SkeletonPreset} from './appearance.ts'
import {createSkeletonPanel} from './ui/panel.ts'
import {focusPanel} from '../../ui/entity_control_panel.ts'
import {DEFAULT_CASCADE_DEPTH, DEFAULT_CASCADE_ENABLED} from './constants.ts'

/** 骨架实体选中项 */
export interface SkeletonSelection {
    readonly kind: 'joint' | 'bone'
    readonly id: string
}

/** 骨架实体（纯视觉，不创建物理 body；编辑模式物理冻结）。
 *  骨骼可视化：关节 = 小球，骨骼段 = 细长菱形连接段；外观部件（可选，由注入预设装配）随关节 Group 变换。 */
export interface SkeletonEntity {
    readonly id: number
    readonly name: string
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
    /** 新建人形预设骨架实体并聚焦 */
    addPreset: (name?: string) => SkeletonEntity
    /** 从骨架定义重建实体（导入/undo 用）并聚焦 */
    addFromDefinition: (definition: SkeletonDefinition, name?: string) => SkeletonEntity
    remove: (id: number) => void
    getEntityList: () => readonly SkeletonEntity[]
    getFocus: () => SkeletonEntity | undefined
    focus: (id: number) => void
    select: (selection: SkeletonSelection | undefined) => void
    getSelection: () => SkeletonSelection | undefined
    /** 全部可拾取网格（含选中关节的旋转指针） */
    getMeshes: () => readonly Mesh[]
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

export const setupSkeletonEntities = (scene: Scene, preset: SkeletonPreset): SkeletonEntitiesContext => {
    const entities = new Map<number, SkeletonEntity>()
    let nextId = 1
    let focusId: number | undefined
    let selection: SkeletonSelection | undefined
    /* 选中关节的旋转指针（方向三角形），随选中变化创建/销毁 */
    let rotationGizmo: Mesh | undefined
    /* 级联编辑设置：面板修改、指针读取 */
    const cascadeSettings: JointCascadeSettings = {
        enabled: DEFAULT_CASCADE_ENABLED,
        depth: DEFAULT_CASCADE_DEPTH,
    }

    const disposeRotationGizmoMesh = (): void => {
        if (rotationGizmo !== undefined) {
            disposeRotationGizmo(rotationGizmo)
            rotationGizmo = undefined
        }
    }

    const addPreset = (name?: string): SkeletonEntity =>
        addFromDefinition(preset.createDefinition(), name)

    const addFromDefinition = (definition: SkeletonDefinition, name?: string): SkeletonEntity => {
        /* scaffold 是「定义 → 关节树/骨骼」的一次性构建输入：createJointVisuals 据其建 Group 层级，
         * 再把局部 pose/骨骼段复制进以场景 Group 为绑定的 bridge；实体骨架以 bridge 为准，scaffold 随后弃用 */
        const scaffold = skeletonFromDefinition(definition)
        const visuals = createJointVisuals(scaffold, scene)
        /* 模型层：方块人外观部件装配到关节 Group 上（随骨架变换；由预设注入） */
        const appearance = preset.mountAppearance(visuals.groups)
        const entity: SkeletonEntity = {
            id: nextId,
            name: name ?? `骨架${nextId}`,
            skeleton: visuals.bridge,
            visuals,
            appearance,
            meshes: [...visuals.gizmos.values(), ...visuals.boneVisuals.values(), ...appearance.partMeshes],
        }
        nextId += 1
        entities.set(entity.id, entity)
        focusId = entity.id
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
        if (selection !== undefined) {
            selection = undefined
            disposeRotationGizmoMesh()
            focusPanel(undefined)
        }
    }

    const getFocus = (): SkeletonEntity | undefined =>
        focusId !== undefined ? entities.get(focusId) : undefined

    const focus = (id: number): void => {
        if (!entities.has(id)) return
        focusId = id
        selection = undefined
        disposeRotationGizmoMesh()
        focusPanel(undefined)
    }

    const select = (next: SkeletonSelection | undefined): void => {
        selection = next
        disposeRotationGizmoMesh()
        /* 选中关节 → 显示方向三角形指针（旋转手柄） */
        if (next !== undefined && next.kind === 'joint') {
            const entity = getFocus()
            const group = entity?.visuals.groups.get(next.id)
            if (entity !== undefined && group !== undefined) {
                rotationGizmo = createRotationGizmo(group, next.id)
            }
        }
        if (next === undefined) {
            focusPanel(undefined)
            return
        }
        focusPanel(panel)
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
            const meshes = [...entities.values()].flatMap(e => e.meshes)
            if (rotationGizmo !== undefined) meshes.push(rotationGizmo)
            return meshes
        },
        getCascadeSettings: (): JointCascadeSettings => cascadeSettings,
        refresh,
        syncFromScene,
        updater,
    }

    const panel = createSkeletonPanel({
        getFocus,
        getSelection: (): SkeletonSelection | undefined => selection,
        getCascadeSettings: (): JointCascadeSettings => cascadeSettings,
        refresh,
        reopen: (): void => {
            if (selection !== undefined) focusPanel(panel)
        },
    })

    return {...ctxWithoutPanel, panel}
}
