import {BufferAttribute, BufferGeometry, CapsuleGeometry, DynamicDrawUsage, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3, type Group, Mesh, MeshBasicMaterial, type MeshStandardMaterial} from 'three'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {createJointHierarchy} from '../../../../../skeleton/render/joint_hierarchy.ts'
import type {CharacterMaterialId} from '../../../../../render/character_materials.ts'
import {createMeshBuilder, type MeshBuilder} from '../../../appearance/mesh_builder.ts'
import {createWeaponMesh, WEAPON_MESH_GRIPS, type WeaponMeshConfig, type WeaponLocalHitBox} from '../../../appearance/weapon_mesh.ts'
import {COLLIDER_MESH_OPACITY} from '../../../render/constants.ts'
import {WEAPON_GRIP_FLEX} from '../../../appearance/constants.ts'
import type {CreatureModel, WeaponEquipConfig} from '../../../appearance/types.ts'
import type {BodyAppearance, ColliderSpec, EquipmentAppearanceBuilder} from '../types.ts'
import type {EquipSlotDef, EquipmentState} from '../../../../../character/equipment/types.ts'

/** 体形部件几何形状（半写实基元 + 自定义三角扇） */
export type CreatureShape =
    | {readonly kind: 'box'; readonly w: number; readonly h: number; readonly d: number}
    | {readonly kind: 'frustum'; readonly wTop: number; readonly wBottom: number; readonly h: number; readonly depthRatio?: number}
    | {readonly kind: 'tube'; readonly rTop: number; readonly rBottom: number; readonly h: number; readonly sides?: number; readonly depthRatio?: number}
    | {readonly kind: 'ellipsoid'; readonly rx: number; readonly ry: number; readonly rz: number; readonly widthSegments?: number; readonly heightSegments?: number}
    | {readonly kind: 'cone'; readonly r: number; readonly h: number; readonly segments?: number}
    | {readonly kind: 'sphere'; readonly r: number; readonly widthSegments?: number; readonly heightSegments?: number}
    /** 三角扇（薄片）：`points` 为关节局部顶点，按首点扇形三角化 */
    | {readonly kind: 'fan'; readonly points: readonly (readonly [number, number, number])[]}
    /**
     * 骨骼驱动的翅膜：顶点由翼根 / 翼肘 / 翼腕与各翼指末端实时计算，
     * 翼指张开、腕部挥动时膜面跟随拉伸，避免刚性扇形与骨架裂开。
     * `fingers[].tip` 为翼指关节局部末端坐标（与对应骨段几何一致）。
     */
    | {
        readonly kind: 'wing_membrane'
        readonly shoulderJointId: string
        readonly elbowJointId: string
        readonly wristJointId: string
        readonly fingers: readonly {
            readonly jointId: string
            readonly tip: readonly [number, number, number]
        }[]
    }

/** 体形部件（低多面体网格挂在关节上，材质取自统一材质库；受击块走 hurtProfile 显式形状） */
export interface CreaturePartSpec {
    readonly jointId: string
    readonly shape: CreatureShape
    readonly material: CharacterMaterialId
    /** 覆盖材质缺省基色（种族 / 部位配色） */
    readonly color?: number
    /** 相对关节局部的平移（缺省 = 原点） */
    readonly offset?: readonly [number, number, number]
    /** 覆盖部件局部朝向（rx/ry/rz 弧度） */
    readonly rot?: readonly [number, number, number]
    /** 覆盖部件局部缩放 */
    readonly scale?: readonly [number, number, number]
}

export interface CreatureModelSpec {
    readonly skeleton: SkeletonDefinition
    readonly parts: readonly CreaturePartSpec[]
    readonly mainMountId: string
    readonly offMountId?: string
    readonly backMountId?: string
    readonly colliderLayout: readonly ColliderSpec[]
    readonly equipSlots?: readonly EquipSlotDef[]
    /** 体形装备外观构建器（由 `appearance/equipment.ts` 提供；缺省 = 不显示装备外观） */
    readonly equipmentAppearance?: EquipmentAppearanceBuilder
    readonly scale: number
}

/** 单个武器槽（与人类似，但无惯用手镜像 / 双手 IK；挂点可随武器覆盖重定向） */
interface WeaponSlot {
    /** 当前挂点（可能被武器 `mountJointId` 覆盖） */
    mountJoint: Group
    /** 体形默认挂点（武器未指定 `mountJointId` 时回退到此，避免覆盖后残留） */
    readonly defaultMountJoint: Group
    mountJointId: string | undefined
    mountRotation: readonly [number, number, number]
    group: Group | null
    hitCenter: Mesh | null
    tip: Mesh | null
    hitBox: WeaponLocalHitBox | null
    cleanup: (() => void) | null
    gripY: number
    supportGripOffset: number
    meshConfig: WeaponMeshConfig | undefined
}

const requireGroup = (groups: ReadonlyMap<string, Group>, jointId: string, what: string): Group => {
    const group = groups.get(jointId)
    if (group === undefined) throw new Error(`${what} 缺少关节 ${jointId}`)
    return group
}

/** 计算把默认 +Y 轴对齐到给定方向的欧拉角（部件沿骨骼段方向摆放用） */
export const alignYTo = (x: number, y: number, z: number): readonly [number, number, number] => {
    const len = Math.hypot(x, y, z) || 1
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(x / len, y / len, z / len))
    const e = new Euler().setFromQuaternion(q, 'XYZ')
    return [e.x, e.y, e.z]
}

/** 由顶点数组构建三角扇几何（扇形三角化 + 计算法线 + 平面 UV；供翅膜等薄片） */
const createFanGeometry = (points: readonly (readonly [number, number, number])[]): BufferGeometry => {
    const positions: number[] = []
    const uvs: number[] = []
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity
    for (const p of points) {
        if (p[0] < minX) minX = p[0]
        if (p[0] > maxX) maxX = p[0]
        if (p[2] < minZ) minZ = p[2]
        if (p[2] > maxZ) maxZ = p[2]
    }
    const spanX = maxX - minX || 1
    const spanZ = maxZ - minZ || 1
    const uvOf = (p: readonly [number, number, number]): [number, number] => [(p[0] - minX) / spanX, (p[2] - minZ) / spanZ]
    for (let i = 1; i < points.length - 1; i++) {
        const a = points[0]
        const b = points[i]
        const c = points[i + 1]
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
        const ua = uvOf(a); const ub = uvOf(b); const uc = uvOf(c)
        uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1])
    }
    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geom.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geom.computeVertexNormals()
    return geom
}

/** 按形状构建几何并登记到 builder（生命周期随 builder 统一释放） */
const buildPartGeometry = (b: MeshBuilder, shape: CreatureShape): BufferGeometry => {
    switch (shape.kind) {
        case 'box': return b.box(shape.w, shape.h, shape.d)
        case 'frustum': return b.frustum(shape.wTop, shape.wBottom, shape.h, shape.depthRatio ?? 1)
        case 'tube': return b.tube(shape.rTop, shape.rBottom, shape.h, shape.sides ?? 12, shape.depthRatio ?? 1)
        case 'ellipsoid': return b.ellipsoid(shape.rx, shape.ry, shape.rz, shape.widthSegments ?? 12, shape.heightSegments ?? 8)
        case 'cone': return b.cone(shape.r, shape.h, shape.segments ?? 8)
        case 'sphere': return b.sphere(shape.r, shape.widthSegments ?? 8, shape.heightSegments ?? 6)
        case 'fan': {
            const geom = createFanGeometry(shape.points)
            b.trackGeometry(geom)
            return geom
        }
        case 'wing_membrane':
            throw new Error('wing_membrane 需由 createWingMembrane 构建（动态几何）')
    }
}

/**
 * 骨骼驱动翅膜：几何顶点按「翼根 → 翼肘 → 翼腕 → 各翼指末端」的扇形组织，
 * 每帧从各关节 Group 的当前变换重建顶点，使膜面随骨架拉伸而不是刚性跟随腕部。
 */
const createWingMembrane = (
    groups: ReadonlyMap<string, Group>,
    shape: Extract<CreatureShape, {kind: 'wing_membrane'}>,
    material: MeshStandardMaterial,
): {mesh: Mesh; update: () => void} => {
    const shoulder = requireGroup(groups, shape.shoulderJointId, 'wing_membrane')
    const elbow = requireGroup(groups, shape.elbowJointId, 'wing_membrane')
    const wrist = requireGroup(groups, shape.wristJointId, 'wing_membrane')
    const fingers = shape.fingers.map(finger => ({
        group: requireGroup(groups, finger.jointId, 'wing_membrane'),
        tip: new Vector3().fromArray([...finger.tip]),
    }))

    const vertexCount = 3 + fingers.length
    const positions = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)
    /* 顶点顺序：0 翼根、1 翼肘、2 翼腕（扇心）、3.. 各翼指末端 */
    const setUv = (index: number, u: number, v: number): void => {
        uvs[index * 2] = u
        uvs[index * 2 + 1] = v
    }
    setUv(0, 0, 0)
    setUv(1, 0.12, 0.02)
    setUv(2, 0.3, 0.5)
    for (let i = 0; i < fingers.length; i++) setUv(3 + i, 0.35 + i * 0.15, 0.98)

   /* 扇心（翼腕）连接外缘：翼根→翼肘→翼指……→翼根 */
    const rim = [0, 1, ...fingers.map((_, i) => 3 + i)]
    const indices: number[] = []
    for (let i = 0; i < rim.length; i++) {
        indices.push(2, rim[i], rim[(i + 1) % rim.length])
    }

    const geometry = new BufferGeometry()
    geometry.setIndex(indices)
    /* 必须直接持有 positions 引用（Float32BufferAttribute 会复制数组，导致逐帧写入无效） */
    const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage)
    geometry.setAttribute('position', positionAttribute)
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    const mesh = new Mesh(geometry, material)
    mesh.castShadow = true
    mesh.userData.deform = 'wing_membrane'
    wrist.add(mesh)

    const wristInverse = new Matrix4()
    const worldPos = new Vector3()
    const writeVertex = (index: number, value: Vector3): void => {
        positions[index * 3] = value.x
        positions[index * 3 + 1] = value.y
        positions[index * 3 + 2] = value.z
    }
    const update = (): void => {
        wrist.updateWorldMatrix(true, false)
        wristInverse.copy(wrist.matrixWorld).invert()
        worldPos.setFromMatrixPosition(shoulder.matrixWorld).applyMatrix4(wristInverse)
        writeVertex(0, worldPos)
        worldPos.setFromMatrixPosition(elbow.matrixWorld).applyMatrix4(wristInverse)
        writeVertex(1, worldPos)
        worldPos.set(0, 0, 0)
        writeVertex(2, worldPos)
        for (let i = 0; i < fingers.length; i++) {
            const finger = fingers[i]
            /* 翼指关节与腕同点、仅旋转：末端 = 关节局部位移 + 旋转后的骨段方向 */
            worldPos.copy(finger.tip).applyQuaternion(finger.group.quaternion).add(finger.group.position)
            writeVertex(3 + i, worldPos)
        }
        positionAttribute.needsUpdate = true
        geometry.computeBoundingSphere()
        geometry.computeVertexNormals()
    }
    update()
    return {mesh, update}
}

/** 碰撞体可视化 mesh（edit / bone_edit 显示；与真实碰撞体几何同源） */
const createColliderDebugMeshes = (groups: ReadonlyMap<string, Group>, layout: readonly ColliderSpec[]): Mesh[] => {
    const meshes: Mesh[] = []
    for (const spec of layout) {
        const joint = groups.get(spec.nodeId)
        if (joint === undefined) continue
        const geom = spec.kind === 'capsule'
            ? new CapsuleGeometry(spec.radius, spec.halfHeight * 2, 6, 12)
            : new CapsuleGeometry(Math.max(spec.half.x, spec.half.z), Math.max(0.001, spec.half.y * 2), 6, 12)
        const mesh = new Mesh(geom, new MeshBasicMaterial({color: 0x888888, transparent: true, opacity: COLLIDER_MESH_OPACITY, depthWrite: false}))
        mesh.userData.colliderDebug = true
        mesh.position.y = spec.offsetY
        joint.add(mesh)
        meshes.push(mesh)
    }
    return meshes
}

/**
 * 装配体形低多面体部件到关节层级，返回通用外观。
 * 部件用统一材质库逐实例材质；受击块由 `hurtProfile` 的显式 `shape.half`（关节矩阵世界化）承担，
 * 故 `jointParts` 为空（`refreshHurtBlocks` 无部件时回退 profile 形状）。
 */
export const createCreatureAppearance = (
    groups: ReadonlyMap<string, Group>,
    partSpecs: readonly CreaturePartSpec[],
    colliderLayout: readonly ColliderSpec[],
): BodyAppearance => {
    const builder = createMeshBuilder()
    const partMeshes: Mesh[] = []
    const deformers: (() => void)[] = []
    for (const spec of partSpecs) {
        const joint = groups.get(spec.jointId)
        if (joint === undefined) continue
        const material = builder.materialById(spec.material, spec.color)
        if (spec.shape.kind === 'wing_membrane') {
            const membrane = createWingMembrane(groups, spec.shape, material)
            builder.trackGeometry(membrane.mesh.geometry)
            membrane.mesh.userData.jointId = spec.jointId
            partMeshes.push(membrane.mesh)
            deformers.push(membrane.update)
            continue
        }
        const geometry = buildPartGeometry(builder, spec.shape)
        const off = spec.offset ?? [0, 0, 0]
        const rot = spec.rot ?? [0, 0, 0]
        const mesh = builder.add(geometry, material, off[0], off[1], off[2], rot[0], rot[1], rot[2], joint)
        if (spec.scale !== undefined) mesh.scale.set(spec.scale[0], spec.scale[1], spec.scale[2])
        mesh.userData.jointId = spec.jointId
        partMeshes.push(mesh)
    }
    const colliderMeshes = createColliderDebugMeshes(groups, colliderLayout)
    const update = deformers.length > 0
        ? (): void => { for (const deformer of deformers) deformer() }
        : undefined
    const cleanup = (): void => {
        for (const mesh of partMeshes) mesh.removeFromParent()
        partMeshes.length = 0
        deformers.length = 0
        builder.dispose()
        for (const mesh of colliderMeshes) {
            mesh.removeFromParent()
            mesh.geometry.dispose()
            if (mesh.material instanceof MeshBasicMaterial) mesh.material.dispose()
        }
        colliderMeshes.length = 0
    }
    return {boneParts: new Map(), jointParts: new Map(), partMeshes, colliderMeshes, cleanup, ...(update !== undefined ? {update} : {})}
}

/**
 * 通用四足 / 飞龙体形模型构建器（跨体形复用，非人形）：按骨架定义建 Group 层级、装配低多面体部件、
 * 挂武器位（口 / 侧挂点）、建碰撞体可视化，返回实现 `CreatureModel` 的门面。
 */
export const createCreatureModel = (spec: CreatureModelSpec): CreatureModel => {
    const scaffold = skeletonFromDefinition(spec.skeleton)
    const hierarchy = createJointHierarchy(scaffold)
    const groups = hierarchy.groups
    const group = requireGroup(groups, 'root', 'CreatureModel')
    group.scale.set(spec.scale, spec.scale, spec.scale)

    const appearance = createCreatureAppearance(groups, spec.parts, spec.colliderLayout)

    const createSlot = (mountJoint: Group, mountJointId: string | undefined): WeaponSlot => ({
        mountJoint, defaultMountJoint: mountJoint, mountJointId, mountRotation: [WEAPON_GRIP_FLEX, 0, 0], group: null, hitCenter: null, tip: null, hitBox: null, cleanup: null, gripY: 0, supportGripOffset: 0, meshConfig: undefined,
    })
    const mainSlot = createSlot(requireGroup(groups, spec.mainMountId, 'CreatureModel'), spec.mainMountId)
    const offSlot = spec.offMountId !== undefined ? createSlot(requireGroup(groups, spec.offMountId, 'CreatureModel'), spec.offMountId) : undefined
    const backJoint = spec.backMountId !== undefined ? groups.get(spec.backMountId) : undefined

    const clearSlot = (slot: WeaponSlot): void => {
        if (slot.group !== null) slot.mountJoint.remove(slot.group)
        slot.cleanup?.()
        slot.group = null; slot.hitCenter = null; slot.tip = null; slot.hitBox = null; slot.cleanup = null
        slot.gripY = 0; slot.supportGripOffset = 0; slot.meshConfig = undefined
        slot.mountJoint.rotation.set(0, 0, 0)
    }
    const equipSlot = (
        slot: WeaponSlot,
        meshConfig: WeaponMeshConfig | undefined,
        mountJointId: string | undefined,
        mountRotation: readonly [number, number, number] | undefined,
    ): void => {
        if (slot.meshConfig === meshConfig && slot.mountJointId === mountJointId && slot.mountRotation === mountRotation) return
        clearSlot(slot)
        if (meshConfig === undefined) return
        const result = createWeaponMesh(meshConfig)
        slot.group = result.group; slot.hitCenter = result.hitCenter; slot.tip = result.tip; slot.hitBox = result.hitBox
        slot.cleanup = result.cleanup; slot.gripY = result.gripY; slot.supportGripOffset = result.supportGripOffset
        slot.meshConfig = meshConfig
        /* 挂点覆盖：武器可指定专属挂点关节（如马踢击挂前蹄、飞龙爪击挂翼爪）；
         * 未指定时回退体形默认挂点（否则换装后会残留上一个武器的专属挂点） */
        slot.mountJoint = mountJointId !== undefined ? requireGroup(groups, mountJointId, 'CreatureModel') : slot.defaultMountJoint
        slot.mountJointId = mountJointId
        slot.mountRotation = mountRotation ?? [WEAPON_GRIP_FLEX, 0, 0]
        slot.mountJoint.add(result.group)
        slot.mountJoint.rotation.set(slot.mountRotation[0], slot.mountRotation[1], slot.mountRotation[2])
    }
    /** 装备外观：由体形 `appearance/equipment.ts` 构建真实网格，模型只负责生命周期与换装 */
    let equipmentAppearance: {dispose: () => void} | undefined
    const clearEquipmentVisuals = (): void => {
        equipmentAppearance?.dispose()
        equipmentAppearance = undefined
    }
    const equipEquipmentState = (state: EquipmentState): void => {
        clearEquipmentVisuals()
        if (spec.equipmentAppearance === undefined) return
        const builder = createMeshBuilder()
        equipmentAppearance = spec.equipmentAppearance(state, {
            groups,
            builder,
            equipSlots: spec.equipSlots ?? [],
        })
    }

    const setOffhandStowed = (stowed: boolean): void => {
        if (offSlot === undefined) return
        const slotGroup = offSlot.group
        if (slotGroup === null) return
        const target = stowed && backJoint !== undefined ? backJoint : offSlot.mountJoint
        if (slotGroup.parent !== target) target.add(slotGroup)
        const id = offSlot.meshConfig?.id
        const grip = id !== undefined ? WEAPON_MESH_GRIPS[id] : undefined
        slotGroup.quaternion.setFromEuler(new Euler(grip?.rx ?? 0, grip?.ry ?? 0, grip?.rz ?? 0))
    }
    const equipWeapon = (equipConfig: WeaponEquipConfig): void => {
        equipSlot(mainSlot, equipConfig.main, equipConfig.mainMountJointId, equipConfig.mainMountRotation)
        if (offSlot !== undefined) equipSlot(offSlot, equipConfig.offhand, equipConfig.offMountJointId, undefined)
        setOffhandStowed(equipConfig.offhandStowed === true)
    }
    const removeWeapon = (): void => {
        clearSlot(mainSlot)
        if (offSlot !== undefined) clearSlot(offSlot)
    }
    const dispose = (): void => {
        clearEquipmentVisuals()
        removeWeapon()
        appearance.cleanup()
        hierarchy.cleanup()
    }

    return {
        group,
        jointGroups: groups,
        jointParts: appearance.jointParts,
        colliderMeshes: appearance.colliderMeshes,
        ...(appearance.update !== undefined ? {updateDeform: appearance.update} : {}),
        equipWeapon,
        equipEquipmentState,
        setOffhandStowed,
        removeWeapon,
        get weaponMesh() { return mainSlot.hitCenter },
        get weaponTip() { return mainSlot.tip },
        get weaponGroup() { return mainSlot.group },
        get weaponHitBox() { return mainSlot.hitBox },
        get weaponGripY() { return mainSlot.gripY },
        get weaponSupportGripOffset() { return mainSlot.supportGripOffset },
        get offhandWeaponMesh() { return offSlot?.hitCenter ?? null },
        get offhandWeaponTip() { return offSlot?.tip ?? null },
        get offhandWeaponGroup() { return offSlot?.group ?? null },
        get offhandWeaponHitBox() { return offSlot?.hitBox ?? null },
        get offhandWeaponGripY() { return offSlot?.gripY ?? 0 },
        recolor: () => {},
        dispose,
    }
}
