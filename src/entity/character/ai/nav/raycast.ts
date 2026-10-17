import {Raycaster, Vector3, Box3, Matrix3, type Object3D, type Intersection} from 'three'

/**
 * 一次导航感知命中（与射线源无关的通用结果）。
 * mesh 后端与 Rapier 后端都产出该结构，导航分类逻辑只依赖它。
 */
export interface NavRayHit {
    /** 命中距离 */
    toi: number
    /** 命中面世界系法线 Y 分量（用于可行走判定） */
    normalY: number
    /** 命中点世界 Y */
    pointY: number
    /** 命中是否来自角色（强制归为墙） */
    isCharacter: boolean
    /** 命中障碍世界 AABB 顶部 Y（blocked_low / blocked_wall 判定用） */
    topY: number
}

/**
 * 导航射线后端：把「一条射线」抽象为 cast，屏蔽底层是渲染 mesh 还是 Rapier 碰撞体。
 * 生产用 Rapier 后端（BVH，地形三角形再多也不慢）；单测用 mesh 后端（无需物理世界）。
 */
export interface NavRayCaster {
    /** 每次感知前设置需排除的 mesh（自身 + 战斗中当前目标） */
    setExcludes: (selfMesh: Object3D | null, ignoredMesh: Object3D | null) => void
    /** 最近命中；includeGround 为 true 时命中目标额外并入地面 mesh（坑洞探针用），否则仅障碍 */
    cast: (
        ox: number, oy: number, oz: number,
        dx: number, dy: number, dz: number,
        maxToi: number,
        includeGround: boolean,
    ) => NavRayHit | undefined
}

const _raycaster = new Raycaster()
const _origin = new Vector3()
const _dir = new Vector3()
const _normalMatrix = new Matrix3()
const _worldNormal = new Vector3()
const _bbox = new Box3()

/** 命中面法线转到世界空间后取 Y 分量（地形 / 箱子可能带旋转 / 倾斜 / 翻转） */
const worldNormalY = (hit: Intersection<Object3D>): number => {
    if (!hit.face) return 0
    _normalMatrix.getNormalMatrix(hit.object.matrixWorld)
    _worldNormal.copy(hit.face.normal).applyMatrix3(_normalMatrix)
    const len = _worldNormal.length()
    return len > 1e-6 ? _worldNormal.y / len : 0
}

/**
 * mesh 后端：把障碍 / 地面 / 角色 mesh 列表封装为 NavRayCaster（单测 / 无物理世界场景使用）。
 * 命中目标 = 地面 mesh + 障碍 mesh（调用方保证障碍列表已排除区域 area）。
 */
export const createMeshNavRayCaster = (
    obstacleMeshesGetter: () => readonly Object3D[],
    groundMeshesGetter: () => readonly Object3D[],
    characterMeshesGetter: () => readonly Object3D[],
): NavRayCaster => {
    let selfMesh: Object3D | null = null
    let ignoredMesh: Object3D | null = null

    const setExcludes = (self: Object3D | null, ignored: Object3D | null): void => {
        selfMesh = self
        ignoredMesh = ignored
    }

    const cast: NavRayCaster['cast'] = (ox, oy, oz, dx, dy, dz, maxToi, includeGround) => {
        const targets: Object3D[] = []
        const charSet = new WeakSet<Object3D>()
        for (const m of characterMeshesGetter()) {
            if (m !== selfMesh && m !== ignoredMesh) charSet.add(m)
        }
        if (includeGround) {
            /* 同时检查地面 mesh 和障碍 mesh（角色可能站在箱子上，箱子也应视为地面） */
            for (const m of groundMeshesGetter()) {
                if (m !== selfMesh && m !== ignoredMesh) targets.push(m)
            }
        }
        for (const m of obstacleMeshesGetter()) {
            /* 忽略自身与「战斗中当前目标」：目标不计入障碍，避免被当作墙绕行 */
            if (m !== selfMesh && m !== ignoredMesh) targets.push(m)
        }
        if (targets.length === 0) return undefined

        _origin.set(ox, oy, oz)
        _dir.set(dx, dy, dz)
        _raycaster.near = 0
        _raycaster.far = maxToi
        _raycaster.set(_origin, _dir)
        const hits = _raycaster.intersectObjects(targets, false)
        if (hits.length === 0) return undefined
        const hit = hits[0]
        _bbox.setFromObject(hit.object)
        return {
            toi: hit.distance,
            normalY: worldNormalY(hit),
            pointY: hit.point.y,
            isCharacter: charSet.has(hit.object),
            topY: _bbox.max.y,
        }
    }

    return {setExcludes, cast}
}
