import type {Object3D} from 'three'
import {collisionCategoryMask} from '../../../physics/collision_category.ts'
import {createRapierRayCaster, type RayHit, type RayQueryFilter} from '../../../physics/raycast.ts'
import type {SharedWorld} from '../../../physics/world.ts'
import type {NavRayCaster, NavRayHit} from '../ai/nav/raycast.ts'
import type {LosRayCaster} from '../ai/line_of_sight.ts'

/** 把角色 mesh 解析为其物理刚体 handle（用于在射线查询中排除自身 / 战斗目标） */
export type MeshBodyResolver = (mesh: Object3D | null) => number | undefined

/* 导航感知排除区域（area）与隐式基础地面（ground）——与旧 mesh 列表一致：
 * 旧障碍列表来自各实体 system（不含基础平面），基础平面的坑洞回退由 footY 判定承担 */
const NAV_EXCLUDE_MASK = collisionCategoryMask(['area', 'ground'])

const toNavHit = (h: RayHit): NavRayHit => ({
    toi: h.toi,
    normalY: h.normalY,
    pointY: h.pointY,
    isCharacter: h.category === 'character',
    topY: h.topY,
})

/**
 * Rapier 后端导航射线投射器：把导航 cast 映射到碰撞体 BVH 射线查询。
 * 地形 trimesh 三角形数量不影响单次成本（与旧 three Raycaster 全量扫面形成量级差异）。
 */
export const createRapierNavRayCaster = (shared: SharedWorld, resolveBody: MeshBodyResolver): NavRayCaster => {
    const rc = createRapierRayCaster(shared)
    const filter = {includeMask: 0, excludeMask: NAV_EXCLUDE_MASK, excludeBodies: [] as number[]}

    const setExcludes = (self: Object3D | null, ignored: Object3D | null): void => {
        filter.excludeBodies.length = 0
        const s = resolveBody(self)
        if (s !== undefined) filter.excludeBodies.push(s)
        const t = resolveBody(ignored)
        if (t !== undefined) filter.excludeBodies.push(t)
    }

    const cast: NavRayCaster['cast'] = (ox, oy, oz, dx, dy, dz, maxToi, _includeGround) => {
        /* Rapier 侧障碍 / 地面同属碰撞体，统一按 NAV_EXCLUDE_MASK（排除水域）查询即可 */
        const h = rc.castOne(ox, oy, oz, dx, dy, dz, maxToi, filter as RayQueryFilter)
        return h === undefined ? undefined : toNavHit(h)
    }

    return {setExcludes, cast}
}

/**
 * Rapier 后端视线射线投射器：命中一切场景几何（除被排除的自身 / 目标），
 * 地形遮挡由碰撞体 BVH 承担。
 */
export const createRapierLosRayCaster = (shared: SharedWorld, resolveBody: MeshBodyResolver): LosRayCaster => {
    const rc = createRapierRayCaster(shared)
    const filter = {includeMask: 0, excludeMask: 0, excludeBodies: [] as number[]}

    const castDistance: LosRayCaster['castDistance'] = (
        ox, oy, oz, dx, dy, dz, maxToi, excludeSelf, excludeTarget,
    ) => {
        filter.excludeBodies.length = 0
        const s = resolveBody(excludeSelf)
        if (s !== undefined) filter.excludeBodies.push(s)
        const t = resolveBody(excludeTarget)
        if (t !== undefined) filter.excludeBodies.push(t)
        const h = rc.castOne(ox, oy, oz, dx, dy, dz, maxToi, filter as RayQueryFilter)
        return h === undefined ? Infinity : h.toi
    }

    return {beginFrame: () => {}, castDistance}
}
