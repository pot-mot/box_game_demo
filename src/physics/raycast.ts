import RAPIER from '@dimforge/rapier3d-compat'
import {COLLISION_CATEGORY_BIT, collisionCategoryOf, type CollisionCategory} from './collision_category.ts'
import type {SharedWorld} from './world.ts'

/**
 * 一次射线命中的结果（世界空间）。所有字段来自 Rapier 查询管线（BVH 加速），
 * 不依赖渲染 mesh，故地形 trimesh 三角形数量再大也不影响单次查询成本。
 */
export interface RayHit {
    /** 命中距离（time of impact），方向向量须为单位向量 */
    readonly toi: number
    readonly pointX: number
    readonly pointY: number
    readonly pointZ: number
    readonly normalX: number
    readonly normalY: number
    readonly normalZ: number
    /** 命中碰撞体的语义类别（未标注类别的辅助碰撞体为 undefined） */
    readonly category: CollisionCategory | undefined
    /** 命中碰撞体所属刚体 handle（无父刚体为 -1） */
    readonly bodyHandle: number
    /** 命中碰撞体世界 AABB 顶部 Y（供「能否跳过」高度判定；未知形状退化为 +∞） */
    readonly topY: number
}

/** 射线查询过滤：类别用位掩码（0 = 不限制），另可排除指定刚体 */
export interface RayQueryFilter {
    /** 仅命中这些类别（0 表示不限制；未标注类别的碰撞体在限定类别时被排除） */
    readonly includeMask: number
    /** 排除这些类别 */
    readonly excludeMask: number
    /** 排除的刚体 handle（自身 / 战斗目标等） */
    readonly excludeBodies: readonly number[]
}

/** 默认过滤器：命中一切、不排除任何刚体 */
export const RAY_FILTER_ALL: RayQueryFilter = {includeMask: 0, excludeMask: 0, excludeBodies: []}

export interface RapierRayCaster {
    /** 最近命中；无命中返回 undefined */
    castOne: (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxToi: number, filter?: RayQueryFilter) => RayHit | undefined
}

const _ray = new RAPIER.Ray({x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 1})

/** 网格形状的局部 AABB（顶点遍历一次后缓存；形状对象随碰撞体缓存，重建碰撞体会换新形状对象 → 缓存失效） */
interface LocalAabb {
    minX: number
    minY: number
    minZ: number
    maxX: number
    maxY: number
    maxZ: number
}
const _meshAabbCache = new WeakMap<RAPIER.Shape, LocalAabb>()

const localAabbOf = (vertices: Float32Array): LocalAabb => {
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i + 2 < vertices.length; i += 3) {
        const x = vertices[i]
        const y = vertices[i + 1]
        const z = vertices[i + 2]
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        if (z < minZ) minZ = z
        if (z > maxZ) maxZ = z
    }
    return {minX, minY, minZ, maxX, maxY, maxZ}
}

/** 世界旋转矩阵第 1 行（y 行），由四元数导出 */
const rotationRowY = (q: {readonly x: number; readonly y: number; readonly z: number; readonly w: number}): [number, number, number] => {
    const {x, y, z, w} = q
    return [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)]
}

/**
 * 碰撞体世界 AABB 顶部 Y：
 *  - 盒 / 球 / 胶囊：按旋转 y 行对半长投影求和；
 *  - trimesh / 凸多面体：局部顶点 AABB（缓存）经旋转 y 行投影求和；
 *  - 其余形状：退化为 +∞（视为高墙，宁可让 AI 绕行也不要误判为可跳过而原地跳跃）。
 */
const colliderTopY = (collider: RAPIER.Collider): number => {
    const t = collider.translation()
    const [r10, r11, r12] = rotationRowY(collider.rotation())
    const shape = collider.shape
    let hx: number
    let hy: number
    let hz: number
    if (shape instanceof RAPIER.Cuboid) {
        hx = shape.halfExtents.x
        hy = shape.halfExtents.y
        hz = shape.halfExtents.z
    } else if (shape instanceof RAPIER.Ball) {
        hx = shape.radius
        hy = shape.radius
        hz = shape.radius
    } else if (shape instanceof RAPIER.Capsule) {
        hx = shape.radius
        hy = shape.halfHeight + shape.radius
        hz = shape.radius
    } else if (shape instanceof RAPIER.TriMesh || shape instanceof RAPIER.ConvexPolyhedron) {
        const vertices = shape.vertices
        if (vertices.length < 3) return t.y
        let aabb = _meshAabbCache.get(shape)
        if (aabb === undefined) {
            aabb = localAabbOf(vertices)
            _meshAabbCache.set(shape, aabb)
        }
        /* 线性和在盒上的最大值 = 各轴取正贡献端之和 */
        const topLocal = Math.max(r10 * aabb.minX, r10 * aabb.maxX)
            + Math.max(r11 * aabb.minY, r11 * aabb.maxY)
            + Math.max(r12 * aabb.minZ, r12 * aabb.maxZ)
        return t.y + topLocal
    } else {
        return Number.POSITIVE_INFINITY
    }
    return t.y + Math.abs(r10) * hx + Math.abs(r11) * hy + Math.abs(r12) * hz
}

/** 命中 → 复用结果对象（point = origin + dir * toi，dir 须为单位向量）。
 *  调用方须在下次 castOne 前读完字段（本模块内所有调用点均立即消费）。 */
interface MutableRayHit {
    toi: number
    pointX: number
    pointY: number
    pointZ: number
    normalX: number
    normalY: number
    normalZ: number
    category: CollisionCategory | undefined
    bodyHandle: number
    topY: number
}
const _hitResult: MutableRayHit = {
    toi: 0, pointX: 0, pointY: 0, pointZ: 0,
    normalX: 0, normalY: 0, normalZ: 0,
    category: undefined, bodyHandle: -1, topY: 0,
}

const fillHit = (
    collider: RAPIER.Collider,
    toi: number,
    normal: {readonly x: number; readonly y: number; readonly z: number},
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
): RayHit => {
    _hitResult.toi = toi
    _hitResult.pointX = ox + dx * toi
    _hitResult.pointY = oy + dy * toi
    _hitResult.pointZ = oz + dz * toi
    _hitResult.normalX = normal.x
    _hitResult.normalY = normal.y
    _hitResult.normalZ = normal.z
    _hitResult.category = collisionCategoryOf(collider.collisionGroups())
    _hitResult.bodyHandle = collider.parent()?.handle ?? -1
    _hitResult.topY = colliderTopY(collider)
    return _hitResult
}

/**
 * 基于 Rapier 查询管线的射线投射器（预建 BVH，单次查询对碰撞体数量近似对数级）。
 * 与 `THREE.Raycaster` 的区别：查询的是物理碰撞体而非渲染三角网，地形 / 建筑 trimesh
 * 三角形再多也不会拖慢；同时天然获得世界系法线与命中类别 / 刚体 handle。
 */
export const createRapierRayCaster = (shared: SharedWorld): RapierRayCaster => {
    const {world} = shared

    /* 闭包对 filter 取「引用」而非解构，故读的是调用时的实时字段；按 filter 对象缓存谓词，
     * 同一后端复用一个 filter 对象 → 命中缓存、零闭包分配（不同后端各自的 filter 各缓存一份） */
    const makePredicate = (filter: RayQueryFilter): ((collider: RAPIER.Collider) => boolean) =>
        (collider: RAPIER.Collider): boolean => {
            const groups = collider.collisionGroups()
            const category = collisionCategoryOf(groups)
            if (category !== undefined) {
                const bit = COLLISION_CATEGORY_BIT[category]
                if ((filter.excludeMask & bit) !== 0) return false
                if (filter.includeMask !== 0 && (filter.includeMask & bit) === 0) return false
            } else if (filter.includeMask !== 0) {
                return false
            }
            if (filter.excludeBodies.length > 0) {
                const parent = collider.parent()
                if (parent !== null && filter.excludeBodies.includes(parent.handle)) return false
            }
            return true
        }

    const predicateCache = new WeakMap<RayQueryFilter, (collider: RAPIER.Collider) => boolean>()
    const predicateFor = (filter: RayQueryFilter): ((collider: RAPIER.Collider) => boolean) => {
        let p = predicateCache.get(filter)
        if (p === undefined) {
            p = makePredicate(filter)
            predicateCache.set(filter, p)
        }
        return p
    }

    const castOne: RapierRayCaster['castOne'] = (ox, oy, oz, dx, dy, dz, maxToi, filter = RAY_FILTER_ALL) => {
        _ray.origin.x = ox
        _ray.origin.y = oy
        _ray.origin.z = oz
        _ray.dir.x = dx
        _ray.dir.y = dy
        _ray.dir.z = dz
        const hit = world.castRayAndGetNormal(
            _ray, maxToi, true,
            /* 传感器（投掷物 / 掉落物 / 水域等）不阻挡：仅实体碰撞体参与感知查询 */
            RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined, undefined, undefined,
            predicateFor(filter),
        )
        if (hit === null) return undefined
        return fillHit(hit.collider, hit.timeOfImpact, hit.normal, ox, oy, oz, dx, dy, dz)
    }

    return {castOne}
}
