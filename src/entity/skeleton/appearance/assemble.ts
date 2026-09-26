import {Mesh, type Group} from 'three'
import type {Skeleton} from '../../../skeleton/skeleton.ts'
import {
    createHeadBoxPart,
    createTwoFaceBoxPart,
    disposeBoxPart,
    type BoxPartPalette,
    type TrackedBoxPart,
} from '../../../render/box_parts.ts'
import {PRESET_PART_SIZES} from '../preset.ts'

/** 部件 ↔ 骨骼段绑定（resize 用）：baseHeight = 长度 1 倍时的基准高度 */
export interface BonePartBinding {
    readonly boneId: string | undefined
    readonly part: TrackedBoxPart
    readonly baseHeight: number
}

/** 方块人外观装配结果 */
export interface CharacterAppearance {
    /** 骨骼段 id → 部件绑定（供 length 变化时缩放） */
    readonly boneParts: ReadonlyMap<string, BonePartBinding>
    /** 全部部件 mesh（raycast 拾取用） */
    readonly partMeshes: readonly Mesh[]
    readonly cleanup: () => void
}

/**
 * 把方块人外观部件装配到关节 Group 层级上（预设骨架约定 id）：
 * 部件随 head 关节变换，长度随对应骨骼段 length 缩放（resizeBoneParts）。
 * 无对应关节 id 的部件跳过（骨架被编辑后部件可能缺失）。
 */
export const assembleCharacterAppearance = (
    groups: ReadonlyMap<string, Group>,
    palette: BoxPartPalette,
): CharacterAppearance => {
    const s = PRESET_PART_SIZES
    const parts: BonePartBinding[] = []
    const boneParts = new Map<string, BonePartBinding>()
    const partMeshes: Mesh[] = []

    const mount = (
        jointId: string,
        boneId: string | undefined,
        w: number,
        h: number,
        d: number,
        paletteKey: 'body' | 'leg' | 'head',
        offsetY?: number,
    ): void => {
        const group = groups.get(jointId)
        if (group === undefined) return
        const part = paletteKey === 'head'
            ? createHeadBoxPart(w, h, d, palette)
            : createTwoFaceBoxPart(w, h, d, paletteKey === 'body' ? palette.bodyColor : palette.legColor)
        /* 默认部件从挂载关节向下延伸（肢体）；躯干/头等向上挂载部件由 offsetY 显式给出 */
        part.mesh.position.y = offsetY ?? -h / 2
        /* 拾取标记：部件归属的挂载关节与骨骼段 */
        part.mesh.userData.jointId = jointId
        if (boneId !== undefined) part.mesh.userData.boneId = boneId
        group.add(part.mesh)
        const binding: BonePartBinding = {boneId, part, baseHeight: h}
        parts.push(binding)
        partMeshes.push(part.mesh)
        if (boneId !== undefined) boneParts.set(boneId, binding)
    }

    /* 躯干：从髋部（spine 关节）向上延伸至肩部；头：从颈根（headNeck）向上延伸（与生产模型一致）；
     * 肢体默认从挂载关节向下延伸 */
    mount('spine', undefined, s.bodyW, s.bodyH, s.bodyD, 'body', s.bodyH / 2)
    mount('headNeck', undefined, s.headW, s.headH, s.headW, 'head', s.headH / 2)

    mount('rightArmShoulder', 'rightUpperArm', s.armW, s.upperArmH, s.armD, 'body')
    mount('rightArmElbow', 'rightForearm', s.armW * 0.8, s.forearmH, s.armD * 0.8, 'body')
    mount('rightHandPivot', undefined, s.armW * 0.7, s.forearmH * 0.7, s.armD * 0.7, 'body')
    mount('leftArmShoulder', 'leftUpperArm', s.armW, s.upperArmH, s.armD, 'body')
    mount('leftArmElbow', 'leftForearm', s.armW * 0.8, s.forearmH, s.armD * 0.8, 'body')
    mount('leftHandPivot', undefined, s.armW * 0.7, s.forearmH * 0.7, s.armD * 0.7, 'body')

    mount('rightLegHip', 'rightThigh', s.legW, s.thighH, s.legD, 'leg')
    mount('rightLegKnee', 'rightShin', s.legW * 0.85, s.shinH, s.legD * 0.85, 'leg')
    mount('leftLegHip', 'leftThigh', s.legW, s.thighH, s.legD, 'leg')
    mount('leftLegKnee', 'leftShin', s.legW * 0.85, s.shinH, s.legD * 0.85, 'leg')

    const cleanup = (): void => {
        for (const {part} of parts) disposeBoxPart(part)
        parts.splice(0)
    }

    return {boneParts, partMeshes, cleanup}
}

/** 按骨骼段两端关节实际距离缩放部件（面板/IK/拖拽修改后调用）；零长段保留基准形态。
 *  直接用世界距离而非 `bone.length`，避免拖拽关节后 length 缓存未同步导致的部件与骨架不一致。 */
export const resizeBoneParts = (skeleton: Skeleton, appearance: CharacterAppearance): void => {
    for (const [boneId, binding] of appearance.boneParts) {
        const bone = skeleton.findBone(boneId)
        if (bone === undefined) continue
        const headPos = skeleton.getWorldPosition(bone.head.id)
        const tailPos = skeleton.getWorldPosition(bone.tail.id)
        if (headPos === undefined || tailPos === undefined) continue
        const length = headPos.distanceTo(tailPos)
        if (length <= 0) continue
        const scale = length / binding.baseHeight
        binding.part.mesh.scale.y = scale
        binding.part.mesh.position.y = -binding.baseHeight * scale / 2
    }
}