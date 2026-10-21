import {isPoseWithPosition, type JointEulers, type JointPose} from '../creature_runtime/pose.ts'

const finiteTriple = (value: readonly number[], label: string): readonly [number, number, number] => {
    if (value.length !== 3 || !value.every(Number.isFinite)) {
        throw new Error(`${label} 必须是 3 个有限数值`)
    }
    return [value[0], value[1], value[2]]
}

/** 校验单个姿态的旋转/位置均为有限三元组 */
export const assertFinitePose = (pose: JointPose, jointId: string): void => {
    const rotation = isPoseWithPosition(pose) ? pose.rotation : pose
    finiteTriple(rotation, `关节 ${jointId} 的旋转`)
    if (isPoseWithPosition(pose)) finiteTriple(pose.position, `关节 ${jointId} 的位置`)
}

/**
 * 语义动作姿态合成：按关节合并多个姿态片段。
 * - 旋转分量相加（适合「相对静止姿态」的语义偏移叠加）；
 * - 位置后写覆盖（同一关节只应由一个片段声明位置）；
 * - 未出现在任何片段中的关节保持骨架静止姿态。
 */
export const mergePoses = (...parts: readonly JointEulers[]): JointEulers => {
    const rotations = new Map<string, [number, number, number]>()
    const positions = new Map<string, [number, number, number]>()
    const order: string[] = []

    for (const part of parts) {
        for (const [jointId, pose] of Object.entries(part)) {
            assertFinitePose(pose, jointId)
            const rotation = isPoseWithPosition(pose) ? pose.rotation : pose
            const current = rotations.get(jointId)
            if (current === undefined) {
                order.push(jointId)
                rotations.set(jointId, [rotation[0], rotation[1], rotation[2]])
            } else {
                current[0] += rotation[0]
                current[1] += rotation[1]
                current[2] += rotation[2]
            }
            if (isPoseWithPosition(pose)) {
                const position = finiteTriple(pose.position, `关节 ${jointId} 的位置`)
                positions.set(jointId, [position[0], position[1], position[2]])
            }
        }
    }

    const merged: Record<string, JointPose> = {}
    for (const jointId of order) {
        const rotation = rotations.get(jointId)
        if (rotation === undefined) continue
        const position = positions.get(jointId)
        merged[jointId] = position === undefined
            ? [rotation[0], rotation[1], rotation[2]]
            : {rotation: [rotation[0], rotation[1], rotation[2]], position: [position[0], position[1], position[2]]}
    }
    return merged
}
