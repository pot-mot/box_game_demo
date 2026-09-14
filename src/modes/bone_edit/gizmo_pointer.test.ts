import {describe, it, expect, vi, beforeEach} from 'vitest'
import {Group, PerspectiveCamera} from 'three'
import {createTransformGizmo} from '../edit/transform_gizmo.ts'
import {setupBoneGizmoPointer, isGizmoActive} from './gizmo_pointer.ts'
import {createSkeleton} from '../../skeleton/skeleton.ts'
import {createSkeletonJoint} from '../../skeleton/joint.ts'
import type {SkeletonSceneBridge} from '../../entity/skeleton/render/bridge.ts'
import type {SkeletonEntitiesContext, SkeletonEntity, SkeletonSelection} from '../../entity/skeleton/world.ts'
import type {BoneEditHistory} from './history.ts'

/** 测试相机：位于 (0,0,5) 看向原点（gizmo 默认在原点） */
const testCamera = (): PerspectiveCamera => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    return camera
}

/** 单根关节骨架（world 变换缓存已重算） */
const makeSkeleton = (): ReturnType<typeof createSkeleton> => {
    const skel = createSkeleton()
    skel.addJoint(createSkeletonJoint('root', 'joint_1'))
    skel.updateWorldTransforms()
    return skel
}

/** 最小骨架实体：gizmo 指针只用 skeleton，visuals/appearance 为空洞实现 */
const fakeEntity = (): SkeletonEntity => {
    const skeleton = makeSkeleton()
    const bridge: SkeletonSceneBridge = Object.assign(skeleton, {syncFromScene: () => {}})
    return {
        id: 1,
        name: '测试骨架',
        skeleton,
        visuals: {
            rootGroup: new Group(),
            groups: new Map(),
            gizmos: new Map(),
            boneVisuals: new Map(),
            bridge,
            resizeBoneVisuals: () => {},
            cleanup: () => {},
        },
        appearance: {
            boneParts: new Map(),
            partMeshes: [],
            cleanup: () => {},
        },
        meshes: [],
    }
}

/** mock 世界上下文：未用成员返回占位（never/空实现） */
const fakeWorld = (opts: {
    focus?: SkeletonEntity | undefined
    selection?: SkeletonSelection | undefined
    refresh?: () => void
}): SkeletonEntitiesContext => ({
    addPreset: () => { throw new Error('测试未使用 addPreset') },
    addFromDefinition: () => { throw new Error('测试未使用 addFromDefinition') },
    remove: () => {},
    getEntityList: () => [],
    getFocus: () => opts.focus,
    focus: () => {},
    select: () => {},
    getSelection: () => opts.selection,
    getMeshes: () => [],
    getCascadeSettings: () => ({enabled: true, depth: 16}),
    refresh: opts.refresh ?? (() => {}),
    syncFromScene: () => {},
    panel: {render: () => {}, destroy: () => {}},
    updater: () => {},
})

/** mock 历史：startEdit/endEdit 用 spy 断言调用 */
const fakeHistory = (): BoneEditHistory => ({
    startEdit: vi.fn(),
    endEdit: vi.fn(),
    undo: () => {},
    redo: () => {},
    canUndo: () => false,
    canRedo: () => false,
    clear: () => {},
})

/** 屏幕坐标 (0.15, 0.15) 归一化对应的像素（happy-dom 默认 1024×768）：
 *  相机 (0,0,5) 下命中 gizmo rotate_z 拾取环（transform_gizmo.test.ts 已验证） */
const HIT_X = ((0.15 + 1) / 2) * 1024
const HIT_Y = ((1 - 0.15) / 2) * 768

describe('bone_edit gizmo 指针交互', () => {
    beforeEach(() => {
        /* 模块级拖拽标志应在上一个测试被清理 */
        expect(isGizmoActive()).toBe(false)
    })

    it('鼠标从未移动时 getHoverPart 不检测（NaN 哨兵避免屏幕中心误命中）', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        const pointer = setupBoneGizmoPointer(
            fakeWorld({}), camera, gizmo, fakeHistory(), () => {},
        )
        /* gizmo 可见且屏幕中心射线能命中部件，但无 pointermove → 不检测 */
        expect(pointer.getHoverPart(camera)).toBeUndefined()
        pointer.destroy()
        gizmo.dispose()
    })

    it('pointermove 后 getHoverPart 检测到悬停部件', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        const pointer = setupBoneGizmoPointer(
            fakeWorld({}), camera, gizmo, fakeHistory(), () => {},
        )
        pointer.handlePointerMove(new PointerEvent('pointermove', {clientX: HIT_X, clientY: HIT_Y}))
        expect(pointer.getHoverPart(camera)).toBe('rotate_z')
        pointer.destroy()
        gizmo.dispose()
    })

    it('未命中 gizmo 的 pointerdown 不消费事件', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        const pointer = setupBoneGizmoPointer(
            fakeWorld({focus: fakeEntity(), selection: {kind: 'joint', id: 'joint_1'}}),
            camera, gizmo, fakeHistory(), () => {},
        )
        /* 屏幕角落不命中任何部件 */
        const consumed = pointer.handlePointerDown(
            new PointerEvent('pointerdown', {clientX: 10, clientY: 10, button: 0}),
        )
        expect(consumed).toBe(false)
        expect(pointer.isDragging()).toBe(false)
        expect(isGizmoActive()).toBe(false)
        pointer.destroy()
        gizmo.dispose()
    })

    it('无关节选中时命中 gizmo 也不进入拖拽', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        const pointer = setupBoneGizmoPointer(
            fakeWorld({focus: fakeEntity()}),
            camera, gizmo, fakeHistory(), () => {},
        )
        const consumed = pointer.handlePointerDown(
            new PointerEvent('pointerdown', {clientX: HIT_X, clientY: HIT_Y, button: 0}),
        )
        expect(consumed).toBe(false)
        expect(pointer.isDragging()).toBe(false)
        pointer.destroy()
        gizmo.dispose()
    })

    it('pointerdown 命中后进入拖拽：hover 暂停、active 返回部件、orbit 禁用', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        const history = fakeHistory()
        const orbit: boolean[] = []
        const pointer = setupBoneGizmoPointer(
            fakeWorld({focus: fakeEntity(), selection: {kind: 'joint', id: 'joint_1'}}),
            camera, gizmo, history, (v) => { orbit.push(v) },
        )
        const consumed = pointer.handlePointerDown(
            new PointerEvent('pointerdown', {clientX: HIT_X, clientY: HIT_Y, button: 0}),
        )
        expect(consumed).toBe(true)
        expect(pointer.isDragging()).toBe(true)
        expect(isGizmoActive()).toBe(true)
        expect(pointer.getActivePart()).toBe('rotate_z')
        /* 拖拽中 hover 检测暂停 */
        expect(pointer.getHoverPart(camera)).toBeUndefined()
        expect(orbit).toContain(false)
        expect(history.startEdit).toHaveBeenCalledTimes(1)

        /* 左键释放结束拖拽 */
        pointer.handlePointerUp(new PointerEvent('pointerup', {button: 0}))
        expect(pointer.isDragging()).toBe(false)
        expect(isGizmoActive()).toBe(false)
        expect(orbit.at(-1)).toBe(true)
        expect(history.endEdit).toHaveBeenCalledTimes(1)
        pointer.destroy()
        gizmo.dispose()
    })

    it('非左键 pointerup 不结束拖拽', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        const pointer = setupBoneGizmoPointer(
            fakeWorld({focus: fakeEntity(), selection: {kind: 'joint', id: 'joint_1'}}),
            camera, gizmo, fakeHistory(), () => {},
        )
        pointer.handlePointerDown(
            new PointerEvent('pointerdown', {clientX: HIT_X, clientY: HIT_Y, button: 0}),
        )
        expect(pointer.isDragging()).toBe(true)
        pointer.handlePointerUp(new PointerEvent('pointerup', {button: 2}))
        expect(pointer.isDragging()).toBe(true)
        /* 左键释放正常结束 */
        pointer.handlePointerUp(new PointerEvent('pointerup', {button: 0}))
        expect(pointer.isDragging()).toBe(false)
        pointer.destroy()
        gizmo.dispose()
    })

    it('handlePointerCancel 中断拖拽：状态清理并恢复 orbit', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        const history = fakeHistory()
        const orbit: boolean[] = []
        const pointer = setupBoneGizmoPointer(
            fakeWorld({focus: fakeEntity(), selection: {kind: 'joint', id: 'joint_1'}}),
            camera, gizmo, history, (v) => { orbit.push(v) },
        )
        pointer.handlePointerDown(
            new PointerEvent('pointerdown', {clientX: HIT_X, clientY: HIT_Y, button: 0}),
        )
        expect(pointer.isDragging()).toBe(true)

        pointer.handlePointerCancel()
        expect(pointer.isDragging()).toBe(false)
        expect(isGizmoActive()).toBe(false)
        expect(orbit.at(-1)).toBe(true)
        expect(history.endEdit).toHaveBeenCalledTimes(1)

        /* 无拖拽时 cancel 无副作用 */
        pointer.handlePointerCancel()
        expect(history.endEdit).toHaveBeenCalledTimes(1)
        pointer.destroy()
        gizmo.dispose()
    })

    it('拖拽移动驱动旋转级联并刷新世界', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        const refresh = vi.fn()
        const entity = fakeEntity()
        const pointer = setupBoneGizmoPointer(
            fakeWorld({focus: entity, selection: {kind: 'joint', id: 'joint_1'}, refresh}),
            camera, gizmo, fakeHistory(), () => {},
        )
        pointer.handlePointerDown(
            new PointerEvent('pointerdown', {clientX: HIT_X, clientY: HIT_Y, button: 0}),
        )
        expect(pointer.isDragging()).toBe(true)

        /* 水平移动：绕 Z 轴角度变化 → rotateJointCascade → refresh */
        const movedX = ((0.35 + 1) / 2) * 1024
        pointer.handlePointerMove(new PointerEvent('pointermove', {clientX: movedX, clientY: HIT_Y}))
        expect(refresh).toHaveBeenCalled()
        /* 根关节旋转被修改（非单位四元数） */
        const joint = entity.skeleton.findJoint('joint_1')
        expect(joint).toBeDefined()
        if (joint !== undefined) {
            const notIdentity = Math.abs(joint.rotation.w) < 1 - 1e-9
            expect(notIdentity).toBe(true)
        }
        pointer.destroy()
        gizmo.dispose()
    })
})
