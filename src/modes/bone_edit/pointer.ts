import {Raycaster, Vector2, type PerspectiveCamera} from 'three'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import type {DragCoordinator} from './drag_state.ts'

/** 命中信息：关节小球 → joint；骨骼段菱形 → bone */
export interface PickHit {
    readonly kind: 'joint' | 'bone'
    readonly jointId: string
    readonly boneId: string | undefined
}

/** 关节与骨骼段命中距离接近时优先关节（关节小球通常位于骨骼段端点） */
const JOINT_PICK_PRIORITY = 0.02

/**
 * 视窗指针交互：只负责点击选中，不再直接拖拽关节/骨骼。
 * 变换统一由 Edit 模式的 Gizmo（平移轴 / 旋转圆弧）完成。
 */
export const setupBoneEditPointer = (
    world: SkeletonEntitiesContext,
    camera: PerspectiveCamera,
    canvas: HTMLElement,
    onPicked: (hit: PickHit) => void,
    coordinator: DragCoordinator,
): {destroy: () => void} => {
    const raycaster = new Raycaster()
    const ndc = new Vector2()

    const pick = (clientX: number, clientY: number): PickHit | undefined => {
        const rect = canvas.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return undefined
        ndc.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(ndc, camera)
        const hits = raycaster.intersectObjects([...world.getMeshes()], false)
        let jointHit: {distance: number; jointId: string} | undefined
        let boneHit: {distance: number; jointId: string; boneId: string} | undefined
        for (const hit of hits) {
            const userData = hit.object.userData
            const boneId = userData?.boneId
            if (typeof boneId === 'string') {
                if (boneHit === undefined) {
                    boneHit = {distance: hit.distance, jointId: String(userData.jointId ?? ''), boneId}
                }
                continue
            }
            const jointId = userData?.jointId
            if (typeof jointId === 'string' && jointHit === undefined) {
                jointHit = {distance: hit.distance, jointId}
            }
        }
        if (jointHit === undefined) {
            return boneHit !== undefined
                ? {kind: 'bone', jointId: boneHit.jointId, boneId: boneHit.boneId}
                : undefined
        }
        if (boneHit !== undefined && boneHit.distance + JOINT_PICK_PRIORITY < jointHit.distance) {
            return {kind: 'bone', jointId: boneHit.jointId, boneId: boneHit.boneId}
        }
        return {kind: 'joint', jointId: jointHit.jointId, boneId: undefined}
    }

    const onPointerDown = (e: PointerEvent): void => {
        if (e.button !== 0) return
        /** Gizmo 拖拽进行中或节点编辑被禁用时跳过 */
        if (coordinator.isGizmoActive()) return
        if (!world.getViewSettings().editEnabled) return
        const hit = pick(e.clientX, e.clientY)
        if (hit !== undefined) onPicked(hit)
    }

    canvas.addEventListener('pointerdown', onPointerDown)

    return {
        destroy: () => {
            canvas.removeEventListener('pointerdown', onPointerDown)
        },
    }
}
