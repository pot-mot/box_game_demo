import {Raycaster, Vector3, type Mesh, type Object3D} from 'three'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP} from './constants.ts'

const _origin = new Vector3()
const _targetDir = new Vector3()
const _raycaster = new Raycaster()
const _meshes: Object3D[] = []

/**
 * 视线射线后端：把「一条射线的最近遮挡距离」抽象出来。
 * mesh 后端（单测）用 three Raycaster；Rapier 后端（生产）用碰撞体 BVH，地形三角形再多也不慢。
 */
export interface LosRayCaster {
    /** 每帧 / 每次批量查询前收集遮挡网格（Rapier 后端为 no-op） */
    beginFrame: () => void
    /** 最近命中距离；无命中返回 Infinity。excludeSelf / excludeTarget 为需跳过的 mesh（映射到碰撞体） */
    castDistance: (
        ox: number, oy: number, oz: number,
        dx: number, dy: number, dz: number,
        maxToi: number,
        excludeSelf: Object3D | null,
        excludeTarget: Object3D | null,
    ) => number
}

/** 视线检查：`ignoreMesh` 用于排除目标自身的网格（射线终点落在目标体内时不算遮挡） */
export interface LineOfSightChecker {
    hasLOS: (fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, ignoreMesh?: Object3D, selfMesh?: Object3D) => boolean
    /** 扇形扫描：从 (fromX, fromY, fromZ) 向 yaw ±半角内发射 VISION_FAN_RAY_COUNT 条水平射线（步长 45°），
     * 把每条射线最近遮挡物距离写入 out（无遮挡写 maxDist）；out 长度须 ≥ VISION_FAN_RAY_COUNT。
     * `selfMesh` 为发射者自身网格 / 碰撞体，须排除（否则射线起点落在自身体内会自遮挡）。 */
    castFan: (fromX: number, fromY: number, fromZ: number, yaw: number, maxDist: number, out: Float32Array, selfMesh?: Object3D) => void
    /** 收集遮挡网格（批量视线查询前调用一次），随后用 `hasLOSPrepared` 复用该列表，避免逐候选重建 */
    collectBlockers: () => void
    /** 复用最近一次 `collectBlockers` 收集的遮挡网格做视线判断（不重新收集） */
    hasLOSPrepared: (fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, ignoreMesh?: Object3D, selfMesh?: Object3D) => boolean
}

const createMeshLosRayCaster = (getBlockingMeshes: () => readonly Mesh[]): LosRayCaster => {
    const beginFrame = (): void => {
        const src = getBlockingMeshes()
        _meshes.length = 0
        for (let i = 0; i < src.length; i++) _meshes[i] = src[i]
    }

    const castDistance: LosRayCaster['castDistance'] = (
        ox, oy, oz, dx, dy, dz, maxToi, excludeSelf, excludeTarget,
    ) => {
        _origin.set(ox, oy, oz)
        _targetDir.set(dx, dy, dz)
        _raycaster.near = 0
        _raycaster.far = maxToi
        _raycaster.set(_origin, _targetDir)
        const hits = _raycaster.intersectObjects(_meshes, false)
        for (const hit of hits) {
            if (hit.object === excludeSelf || hit.object === excludeTarget) continue
            return hit.distance
        }
        return Infinity
    }

    return {beginFrame, castDistance}
}

/** 由射线后端构建视线检查器（mesh / Rapier 共用） */
export const buildLineOfSight = (caster: LosRayCaster): LineOfSightChecker => {
    const raycastLOS = (
        fromX: number, fromY: number, fromZ: number,
        toX: number, toY: number, toZ: number,
        ignoreMesh?: Object3D,
        selfMesh?: Object3D,
    ): boolean => {
        _targetDir.set(toX - fromX, toY - fromY, toZ - fromZ)
        const dist = _targetDir.length()
        if (dist < 0.001) return true
        _targetDir.x /= dist
        _targetDir.y /= dist
        _targetDir.z /= dist
        const hitDist = caster.castDistance(fromX, fromY, fromZ, _targetDir.x, _targetDir.y, _targetDir.z, dist,
            selfMesh ?? null, ignoreMesh ?? null)
        return !(hitDist < dist - 0.05)
    }

    const collectBlockers = (): void => { caster.beginFrame() }

    const hasLOS = (
        fromX: number, fromY: number, fromZ: number,
        toX: number, toY: number, toZ: number,
        ignoreMesh?: Object3D,
        selfMesh?: Object3D,
    ): boolean => {
        caster.beginFrame()
        return raycastLOS(fromX, fromY, fromZ, toX, toY, toZ, ignoreMesh, selfMesh)
    }

    const hasLOSPrepared = (
        fromX: number, fromY: number, fromZ: number,
        toX: number, toY: number, toZ: number,
        ignoreMesh?: Object3D,
        selfMesh?: Object3D,
    ): boolean => raycastLOS(fromX, fromY, fromZ, toX, toY, toZ, ignoreMesh, selfMesh)

    const castFan = (
        fromX: number, fromY: number, fromZ: number,
        yaw: number, maxDist: number,
        out: Float32Array,
        selfMesh?: Object3D,
    ): void => {
        _origin.set(fromX, fromY, fromZ)
        caster.beginFrame()
        for (let i = 0; i < VISION_FAN_RAY_COUNT; i++) {
            const a = yaw - VISION_FAN_HALF_ANGLE + i * VISION_FAN_RAY_STEP
            const dx = Math.sin(a)
            const dz = Math.cos(a)
            const d = caster.castDistance(fromX, fromY, fromZ, dx, 0, dz, maxDist, selfMesh ?? null, null)
            out[i] = d === Infinity ? maxDist : d
        }
    }

    return {hasLOS, castFan, collectBlockers, hasLOSPrepared}
}

/** mesh 后端视线检查器（单测 / 无物理世界场景） */
export const createLineOfSightChecker = (
    getBlockingMeshes: () => readonly Mesh[],
): LineOfSightChecker => buildLineOfSight(createMeshLosRayCaster(getBlockingMeshes))

/** Rapier 后端视线检查器（生产） */
export const createRapierLineOfSight = (caster: LosRayCaster): LineOfSightChecker => buildLineOfSight(caster)
