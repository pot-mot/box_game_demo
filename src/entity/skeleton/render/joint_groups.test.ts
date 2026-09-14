import {describe, it, expect} from 'vitest'
import {Mesh, MeshBasicMaterial, OctahedronGeometry, Scene, SphereGeometry} from 'three'
import {createSkeleton} from '../../../skeleton/skeleton.ts'
import {createSkeletonJoint, connectJoint} from '../../../skeleton/joint.ts'
import {createSkeletonBone} from '../../../skeleton/bone.ts'
import {createJointVisuals, createRotationGizmo, disposeRotationGizmo, setSelectedVisual, clearSelectedVisuals} from './joint_groups.ts'
import {BONE_DIAMOND_COLOR, BONE_DIAMOND_SELECTED_COLOR, BONE_DIAMOND_THICKNESS, JOINT_GIZMO_COLOR, JOINT_GIZMO_SELECTED_COLOR} from '../constants.ts'

/** 构建 root → mid → tail 链（mid 沿 +Y 偏移 2，tail 沿 +Y 偏移 1，骨骼段 len=1） */
const buildSkeleton = (): ReturnType<typeof createSkeleton> => {
    const skeleton = createSkeleton()
    const root = createSkeletonJoint('root', 'root')
    const mid = createSkeletonJoint('mid', 'mid')
    const tail = createSkeletonJoint('tail', 'tail')
    connectJoint(root, mid)
    connectJoint(mid, tail)
    mid.position.set(0, 2, 0)
    tail.position.set(0, 1, 0)
    skeleton.addJoint(root)
    skeleton.addJoint(mid)
    skeleton.addJoint(tail)
    skeleton.addBone(createSkeletonBone('mid_bone', mid, tail, 1, 'mid_bone'))
    return skeleton
}

describe('骨骼可视化（关节小球 + 骨骼段菱形）', () => {
    it('关节 = 小球（SphereGeometry），数量与关节一致', () => {
        const skeleton = buildSkeleton()
        const visuals = createJointVisuals(skeleton, new Scene())
        expect(visuals.gizmos.size).toBe(3)
        for (const gizmo of visuals.gizmos.values()) {
            expect(gizmo.geometry).toBeInstanceOf(SphereGeometry)
            expect((gizmo.material as MeshBasicMaterial).color.getHex()).toBe(JOINT_GIZMO_COLOR)
        }
        visuals.cleanup()
    })

    it('骨骼段 = 菱形（OctahedronGeometry），位置/方向/长度对准 head→tail', () => {
        const skeleton = buildSkeleton()
        const visuals = createJointVisuals(skeleton, new Scene())
        expect(visuals.boneVisuals.size).toBe(1)
        const diamond = visuals.boneVisuals.get('mid_bone')!
        expect(diamond).toBeInstanceOf(Mesh)
        expect(diamond.geometry).toBeInstanceOf(OctahedronGeometry)
        /* 菱形挂 head（mid）group 下：局部位置 = tail 局部中点（0, 0.5, 0），方向 +Y，拉伸到实际距离，细长厚度 */
        const midGroup = visuals.groups.get('mid')!
        expect(diamond.parent).toBe(midGroup)
        expect(diamond.position.y).toBeCloseTo(0.5)
        expect(diamond.scale.y).toBeCloseTo(1)
        expect(diamond.scale.x).toBeCloseTo(BONE_DIAMOND_THICKNESS)
        visuals.cleanup()
    })

    it('菱形带拾取标记（boneId + 挂载 jointId）', () => {
        const skeleton = buildSkeleton()
        const visuals = createJointVisuals(skeleton, new Scene())
        const diamond = visuals.boneVisuals.get('mid_bone')!
        expect(diamond.userData.boneId).toBe('mid_bone')
        expect(diamond.userData.jointId).toBe('mid')
        visuals.cleanup()
    })

    it('关节小球带拾取标记（jointId）', () => {
        const skeleton = buildSkeleton()
        const visuals = createJointVisuals(skeleton, new Scene())
        const gizmo = visuals.gizmos.get('tail')!
        expect(gizmo.userData.jointId).toBe('tail')
        visuals.cleanup()
    })

    it('选中高亮：joint 高亮小球、bone 高亮菱形；clear 还原默认色', () => {
        const skeleton = buildSkeleton()
        const visuals = createJointVisuals(skeleton, new Scene())
        /* 高亮关节小球 */
        setSelectedVisual(visuals, {kind: 'joint', id: 'root'}, true)
        expect((visuals.gizmos.get('root')!.material as MeshBasicMaterial).color.getHex()).toBe(JOINT_GIZMO_SELECTED_COLOR)
        /* 高亮骨骼菱形 */
        setSelectedVisual(visuals, {kind: 'bone', id: 'mid_bone'}, true)
        expect((visuals.boneVisuals.get('mid_bone')!.material as MeshBasicMaterial).color.getHex()).toBe(BONE_DIAMOND_SELECTED_COLOR)
        /* 清除还原 */
        clearSelectedVisuals(visuals)
        expect((visuals.gizmos.get('root')!.material as MeshBasicMaterial).color.getHex()).toBe(JOINT_GIZMO_COLOR)
        expect((visuals.boneVisuals.get('mid_bone')!.material as MeshBasicMaterial).color.getHex()).toBe(BONE_DIAMOND_COLOR)
        visuals.cleanup()
    })

    it('resizeBoneVisuals 随关节位置更新菱形（始终连接 head→tail 实际距离）', () => {
        const skeleton = buildSkeleton()
        const visuals = createJointVisuals(skeleton, new Scene())
        const diamond = visuals.boneVisuals.get('mid_bone')!
        expect(diamond.scale.y).toBeCloseTo(1)
        /* 移动 tail 关节（局部 +Y 偏移 1 → 实际距离 2），菱形跟随拉伸 */
        visuals.bridge.findJoint('tail')!.position.set(0, 2, 0)
        visuals.bridge.updateWorldTransforms()
        visuals.resizeBoneVisuals()
        expect(diamond.scale.y).toBeCloseTo(2)
        /* 段长过小隐藏（退化段） */
        visuals.bridge.findJoint('tail')!.position.set(0, 0.001, 0)
        visuals.bridge.updateWorldTransforms()
        visuals.resizeBoneVisuals()
        expect(diamond.visible).toBe(false)
        visuals.cleanup()
    })

    it('旋转指针（方向三角形）创建/挂载/销毁', () => {
        const skeleton = buildSkeleton()
        const visuals = createJointVisuals(skeleton, new Scene())
        const group = visuals.groups.get('mid')!
        const gizmo = createRotationGizmo(group, 'mid')
        expect(gizmo.parent).toBe(group)
        expect(gizmo.userData.jointId).toBe('mid')
        expect(gizmo.userData.rotHandle).toBe(true)
        disposeRotationGizmo(gizmo)
        expect(gizmo.parent).toBeNull()
        visuals.cleanup()
    })

    it('骨骼层覆盖渲染：小球/菱形 depthTest=false + renderOrder=1（压模型层上方）', () => {
        const skeleton = buildSkeleton()
        const visuals = createJointVisuals(skeleton, new Scene())
        for (const gizmo of visuals.gizmos.values()) {
            const material = gizmo.material as MeshBasicMaterial
            expect(material.depthTest).toBe(false)
            expect(gizmo.renderOrder).toBe(1)
        }
        const diamond = visuals.boneVisuals.get('mid_bone')!
        const material = diamond.material as MeshBasicMaterial
        expect(material.depthTest).toBe(false)
        expect(diamond.renderOrder).toBe(1)
        visuals.cleanup()
    })
})