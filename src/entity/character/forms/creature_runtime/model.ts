import {BufferGeometry, CapsuleGeometry, Euler, Float32BufferAttribute, Quaternion, Vector3, type Group, Mesh, MeshBasicMaterial} from 'three'
import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'
import {skeletonFromDefinition} from '../../../../skeleton/anim/serialization.ts'
import {createJointHierarchy} from '../../../../skeleton/render/joint_hierarchy.ts'
import type {CharacterMaterialId} from '../../../../render/character_materials.ts'
import {createMeshBuilder, type MeshBuilder} from '../../appearance/mesh_builder.ts'
import {createWeaponMesh, WEAPON_MESH_GRIPS, type WeaponMeshConfig, type WeaponLocalHitBox} from '../../appearance/weapon_mesh.ts'
import {COLLIDER_MESH_OPACITY} from '../../render/constants.ts'
import {WEAPON_GRIP_FLEX} from '../../appearance/constants.ts'
import type {CreatureModel, WeaponEquipConfig} from '../../appearance/types.ts'
import type {BodyAppearance, ColliderSpec} from '../../body_form/types.ts'

/** 体形部件几何形状（半写实基元 + 自定义三角扇） */
export type CreatureShape =
    | {readonly kind: 'box'; readonly w: number; readonly h: number; readonly d: number}
    | {readonly kind: 'frustum'; readonly wTop: number; readonly wBottom: number; readonly h: number; readonly depthRatio?: number}
    | {readonly kind: 'tube'; readonly rTop: number; readonly rBottom: number; readonly h: number; readonly sides?: number; readonly depthRatio?: number}
    | {readonly kind: 'ellipsoid'; readonly rx: number; readonly ry: number; readonly rz: number; readonly widthSegments?: number; readonly heightSegments?: number}
    | {readonly kind: 'capsule'; readonly radius: number; readonly h: number; readonly capSegments?: number; readonly radialSegments?: number}
    | {readonly kind: 'cylinder'; readonly rTop: number; readonly rBottom: number; readonly h: number; readonly segments?: number}
    | {readonly kind: 'cone'; readonly r: number; readonly h: number; readonly segments?: number}
    | {readonly kind: 'sphere'; readonly r: number; readonly widthSegments?: number; readonly heightSegments?: number}
    /** 三角扇（翅膜等薄片）：`points` 为关节局部顶点，按首点扇形三角化 */
    | {readonly kind: 'fan'; readonly points: readonly (readonly [number, number, number])[]}

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
    readonly scale: number
}

/** 单个武器槽（与人类似，但无惯用手镜像 / 双手 IK；挂点可随武器覆盖重定向） */
interface WeaponSlot {
    /** 当前挂点（可能被武器 `mountJointId` 覆盖） */
    mountJoint: Group
    /** 体形默认挂点（武器未指定 `mountJointId` 时回退到此，避免覆盖后残留） */
    readonly defaultMountJoint: Group
    mountJointId: string | undefined
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
        case 'capsule': return b.capsule(shape.radius, shape.h, shape.capSegments ?? 6, shape.radialSegments ?? 12)
        case 'cylinder': return b.cylinder(shape.rTop, shape.rBottom, shape.h, shape.segments ?? 8)
        case 'cone': return b.cone(shape.r, shape.h, shape.segments ?? 8)
        case 'sphere': return b.sphere(shape.r, shape.widthSegments ?? 8, shape.heightSegments ?? 6)
        case 'fan': {
            const geom = createFanGeometry(shape.points)
            b.trackGeometry(geom)
            return geom
        }
    }
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
    for (const spec of partSpecs) {
        const joint = groups.get(spec.jointId)
        if (joint === undefined) continue
        const geometry = buildPartGeometry(builder, spec.shape)
        const material = builder.materialById(spec.material, spec.color)
        const off = spec.offset ?? [0, 0, 0]
        const rot = spec.rot ?? [0, 0, 0]
        const mesh = builder.add(geometry, material, off[0], off[1], off[2], rot[0], rot[1], rot[2], joint)
        if (spec.scale !== undefined) mesh.scale.set(spec.scale[0], spec.scale[1], spec.scale[2])
        mesh.userData.jointId = spec.jointId
        partMeshes.push(mesh)
    }
    const colliderMeshes = createColliderDebugMeshes(groups, colliderLayout)
    const cleanup = (): void => {
        for (const mesh of partMeshes) mesh.removeFromParent()
        partMeshes.length = 0
        builder.dispose()
        for (const mesh of colliderMeshes) {
            mesh.removeFromParent()
            mesh.geometry.dispose()
            if (mesh.material instanceof MeshBasicMaterial) mesh.material.dispose()
        }
        colliderMeshes.length = 0
    }
    return {boneParts: new Map(), jointParts: new Map(), partMeshes, colliderMeshes, cleanup}
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
        mountJoint, defaultMountJoint: mountJoint, mountJointId, group: null, hitCenter: null, tip: null, hitBox: null, cleanup: null, gripY: 0, supportGripOffset: 0, meshConfig: undefined,
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
    const equipSlot = (slot: WeaponSlot, meshConfig: WeaponMeshConfig | undefined, mountJointId: string | undefined): void => {
        if (slot.meshConfig === meshConfig && slot.mountJointId === mountJointId) return
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
        slot.mountJoint.add(result.group)
        slot.mountJoint.rotation.set(WEAPON_GRIP_FLEX, 0, 0)
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
        equipSlot(mainSlot, equipConfig.main, equipConfig.mainMountJointId)
        if (offSlot !== undefined) equipSlot(offSlot, equipConfig.offhand, equipConfig.offMountJointId)
        setOffhandStowed(equipConfig.offhandStowed === true)
    }
    const removeWeapon = (): void => {
        clearSlot(mainSlot)
        if (offSlot !== undefined) clearSlot(offSlot)
    }
    const dispose = (): void => {
        removeWeapon()
        appearance.cleanup()
        hierarchy.cleanup()
    }

    return {
        group,
        jointGroups: groups,
        jointParts: appearance.jointParts,
        colliderMeshes: appearance.colliderMeshes,
        equipWeapon,
        setOffhandStowed,
        /* 体形无惯用手差异：空操作 */
        setHandedness: () => {},
        removeWeapon,
        /* 无护甲 / 肢体槽：空操作（体形固有外观） */
        equipArmor: () => {},
        removeArmor: () => {},
        equipLimbs: () => {},
        removeLimbs: () => {},
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
