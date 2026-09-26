import {BoxGeometry, Group, Mesh, MeshBasicMaterial} from 'three'
import {sampleClip} from '../../skeleton/anim/sampling.ts'
import type {SkeletonEntitiesContext} from '../../entity/skeleton/world.ts'
import type {AnimationStore} from './animation_store.ts'
import {ONION_SKIN_JOINT_SIZE, ONION_SKIN_STEP} from './constants.ts'

/** 洋葱皮：聚焦骨架前后帧的半透明关节副本 */
export interface OnionSkin {
    readonly isEnabled: () => boolean
    readonly toggle: () => void
    /** 播放/暂停时刷新前后帧采样 */
    readonly update: () => void
    /** 移除副本并关闭 */
    readonly clear: () => void
}

export const setupOnionSkin = (
    world: SkeletonEntitiesContext,
    store: AnimationStore,
    getPlayhead: () => number,
): OnionSkin => {
    let enabled = false
    let onionGroup: {root: Group; joints: Map<string, Group>} | undefined

    const setup = (): void => {
        const skeleton = world.getFocus()?.skeleton
        if (skeleton === undefined) return
        const root = new Group()
        const joints = new Map<string, Group>()
        for (const joint of skeleton.joints.values()) {
            joints.set(joint.id, new Group())
        }
        /* 半透明关节盒 */
        for (const joint of skeleton.joints.values()) {
            const group = joints.get(joint.id)!
            const parent = joint.parent !== undefined ? joints.get(joint.parent.id) : undefined
            if (parent !== undefined) parent.add(group)
            else root.add(group)
            const box = new Mesh(
                new BoxGeometry(ONION_SKIN_JOINT_SIZE, ONION_SKIN_JOINT_SIZE, ONION_SKIN_JOINT_SIZE),
                new MeshBasicMaterial({color: 0x88ccff, transparent: true, opacity: 0.35, depthWrite: false}),
            )
            group.add(box)
        }
        world.getFocus()?.visuals.rootGroup.add(root)
        onionGroup = {root, joints}
    }

    const clear = (): void => {
        onionGroup?.root.removeFromParent()
        onionGroup = undefined
    }

    const toggle = (): void => {
        enabled = !enabled
        if (enabled) setup()
        else clear()
    }

    const update = (): void => {
        if (!enabled) return
        const clip = store.current
        if (onionGroup === undefined || clip === undefined) return
        const playhead = getPlayhead()
        /* 前后帧采样：把采样 pose 应用到洋葱皮 Group 层级（层次与骨架同构，写局部即可） */
        for (const step of [0, -ONION_SKIN_STEP, ONION_SKIN_STEP]) {
            const pose = sampleClip(clip, playhead + step)
            for (const [jointId, jointPose] of pose.jointPoses) {
                const group = onionGroup.joints.get(jointId)
                if (group === undefined) continue
                group.position.copy(jointPose.position)
                group.quaternion.copy(jointPose.rotation)
            }
        }
    }

    return {isEnabled: () => enabled, toggle, update, clear}
}
