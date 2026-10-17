import type {Object3D} from 'three'
import type {CharacterEntity} from '../../../../character/types.ts'
import type {NavSenseOutput, NavSensor} from './types.ts'
import type {NavConfig} from './types.ts'
import type {NavRayCaster} from './raycast.ts'
import {createMeshNavRayCaster} from './raycast.ts'
import {
    RAY_HORIZONTAL_ANGLES, RAY_PITCH_ANGLES, SIDE_SCAN_ANGLES,
    WALKABLE_NORMAL_MIN_Y,
} from './constants.ts'
import {CHARACTER_BASE_SIZE} from '../../constants.ts'

/** 坑洞探针向下投射的最大距离：只需判断最近命中是否在跳跃高度内 */
const PROBE_MAX_TOI = 1000

/** 前方扇面扫描结果（仅对障碍，不含地形；地形由竖直柱探针处理） */
type ForwardKind = 'clear' | 'blocked_low' | 'blocked_wall'
interface ForwardScan {
    kind: ForwardKind
    distance: number
    height: number
    /** 正前方命中可行走坡面（地形向上延伸），用于坑洞回退 */
    centerWalkable: boolean
}

/**
 * 前方扇面扫描（仅障碍，地形由调用方排除）：从脚部高度沿扇面射线探测。
 * 可行走面（世界法线 ny ≥ 阈值，如斜坡）不计为障碍；其余按高度判 blocked_low / blocked_wall。
 */
const scanForward = (
    caster: NavRayCaster,
    footX: number, footY: number, footZ: number,
    fx: number, fz: number,
    config: NavConfig,
    jumpHeight: number,
): ForwardScan => {
    const rightX = -fz
    const rightZ = fx

    let minHitDist = Infinity
    let blockTopY = -Infinity
    let hitIsCharacter = false
    let centerWalkable = false

    for (const hAngle of RAY_HORIZONTAL_ANGLES) {
        const cosH = Math.cos(hAngle)
        const sinH = Math.sin(hAngle)
        const dirX = fx * cosH - fz * sinH
        const dirZ = fx * sinH + fz * cosH

        /* 侧向偏移：沿 right 方向移动 */
        const latOffset = Math.abs(sinH) * config.checkRadius
        const ox = footX + rightX * latOffset * Math.sign(sinH)
        const oz = footZ + rightZ * latOffset * Math.sign(sinH)

        for (const pitch of RAY_PITCH_ANGLES) {
            const cosP = Math.cos(pitch)
            const sinP = Math.sin(pitch)
            const hit = caster.cast(ox, footY, oz, dirX * cosP, sinP, dirZ * cosP, config.checkDistance, false)
            if (hit === undefined) continue

            /* 面法线过滤：可行走表面（如斜坡）不视为障碍物 */
            if (hit.normalY >= WALKABLE_NORMAL_MIN_Y) {
                /* 上坡时坑洞探针起点位于坡面内部必然 miss，
                 * 正前方（hAngle=0）命中可行走坡面说明地形持续向上延伸，
                 * 不可能同时是坑洞 → 兜底视为有地面 */
                if (hAngle === 0) centerWalkable = true
                continue
            }

            if (hit.toi < minHitDist) {
                minHitDist = hit.toi
                hitIsCharacter = hit.isCharacter
            }
            if (hit.topY > blockTopY) blockTopY = hit.topY
        }
    }

    if (minHitDist < Infinity) {
        const relative = blockTopY - footY
        if (hitIsCharacter || relative > jumpHeight) {
            return {kind: 'blocked_wall', distance: minHitDist, height: relative, centerWalkable}
        }
        return {kind: 'blocked_low', distance: minHitDist, height: relative, centerWalkable}
    }
    return {kind: 'clear', distance: Infinity, height: 0, centerWalkable}
}

/**
 * 由射线后端构建导航感知传感器（mesh / Rapier 共用同一套分类逻辑）。
 * 命中目标统一为「地面 + 障碍（已排除区域 area）」，与旧实现一致。
 */
export const buildNavSensor = (caster: NavRayCaster): NavSensor => {
    const footOf = (entity: CharacterEntity): {x: number; y: number; z: number} => {
        const bh = CHARACTER_BASE_SIZE.height * entity.config.scale
        const pos = entity.body.translation()
        return {x: pos.x, y: pos.y - bh / 2 + 0.1, z: pos.z}
    }

    /** 前方扇面 + 坑洞探针（不含侧向扫描）：`sense` 与 `isForwardClear` 共用，避免重复射线 */
    const forwardAndGround = (
        entity: CharacterEntity,
        fx: number, fz: number,
        config: NavConfig,
        ignoredMesh?: Object3D | null,
    ): {fan: ForwardScan; groundAhead: boolean; foot: {x: number; y: number; z: number}; jumpHeight: number} => {
        const jumpHeight = entity.config.jumpHeight
        const foot = footOf(entity)
        caster.setExcludes(entity.mesh as Object3D, ignoredMesh ?? null)

        const fan = scanForward(caster, foot.x, foot.y, foot.z, fx, fz, config, jumpHeight)

        /* ── 前方坑洞探针 ── */
        /* 从自身脚底高度向下探测，超过跳跃高度则视为不可安全下落 */
        const probeX = foot.x + fx * config.checkDistance
        const probeZ = foot.z + fz * config.checkDistance
        const probeHit = caster.cast(probeX, foot.y, probeZ, 0, -1, 0, PROBE_MAX_TOI, true)
        let groundAhead = probeHit !== undefined && probeHit.toi <= jumpHeight

        /* 回退：探针完全未命中 → 下方只剩隐式无限平面 y=0（物理地面，非 mesh）。
         * 脚底到平面距离在跳跃高度内即安全可走；超出则为真实落差（悬崖/深坑） */
        if (!groundAhead && probeHit === undefined) {
            groundAhead = foot.y <= jumpHeight
        }
        /* 上坡时探针起点在坡面内部必然 miss，用正前方可行走坡面命中兜底 */
        if (!groundAhead && fan.centerWalkable) {
            groundAhead = true
        }
        return {fan, groundAhead, foot, jumpHeight}
    }

    const sense = (
        entity: CharacterEntity,
        forwardX: number,
        forwardZ: number,
        config: NavConfig,
        ignoredMesh?: Object3D | null,
    ): NavSenseOutput => {
        const fLen = Math.hypot(forwardX, forwardZ)
        if (fLen < 0.001) {
            return {
                result: 'clear',
                obstacleDistance: Infinity,
                obstacleHeight: 0,
                leftClear: true,
                rightClear: true,
                groundAhead: true,
            }
        }
        const fx = forwardX / fLen
        const fz = forwardZ / fLen

        const {fan, groundAhead, foot} = forwardAndGround(entity, fx, fz, config, ignoredMesh)

        /* ── 侧向扫描 ── */
        let leftClear = true
        let rightClear = true
        for (const hAngle of SIDE_SCAN_ANGLES) {
            const cosH = Math.cos(hAngle)
            const sinH = Math.sin(hAngle)
            const dirX = fx * cosH - fz * sinH
            const dirZ = fx * sinH + fz * cosH
            const hit = caster.cast(foot.x, foot.y, foot.z, dirX, 0, dirZ, config.checkDistance * 1.2, false)
            /* 面法线过滤：可行走表面不视为障碍物 */
            const blocked = hit !== undefined && hit.normalY < WALKABLE_NORMAL_MIN_Y
            if (hAngle < 0 && blocked) {
                leftClear = false
            } else if (hAngle > 0 && blocked) {
                rightClear = false
            }
        }

        /* ── 分类 ── */
        if (fan.kind !== 'clear') {
            return {
                result: fan.kind,
                obstacleDistance: fan.distance,
                obstacleHeight: fan.height,
                leftClear,
                rightClear,
                groundAhead,
            }
        }
        if (!groundAhead) {
            return {
                result: 'blocked_pit',
                obstacleDistance: config.checkDistance,
                obstacleHeight: 0,
                leftClear,
                rightClear,
                groundAhead: false,
            }
        }
        return {
            result: 'clear',
            obstacleDistance: Infinity,
            obstacleHeight: 0,
            leftClear: true,
            rightClear: true,
            groundAhead: true,
        }
    }

    /**
     * 轻量前向探测：仅前向扇面 + 坑洞探针（不含侧向扫描），供绕行候选方向试探使用。
     * 等价于 `sense(...).result === 'clear'`（侧向扫描只影响 left/rightClear），但省去 4 条侧向射线。
     */
    const isForwardClear = (
        entity: CharacterEntity,
        forwardX: number,
        forwardZ: number,
        config: NavConfig,
        ignoredMesh?: Object3D | null,
    ): boolean => {
        const fLen = Math.hypot(forwardX, forwardZ)
        if (fLen < 0.001) return false
        const fx = forwardX / fLen
        const fz = forwardZ / fLen
        const {fan, groundAhead} = forwardAndGround(entity, fx, fz, config, ignoredMesh)
        return fan.kind === 'clear' && groundAhead
    }

    return {sense, isForwardClear}
}

/**
 * mesh 后端导航传感器（单测 / 无物理世界场景）：由障碍 / 地面 / 角色 mesh getter 驱动。
 *
 * obstacleMeshesGetter:   返回当前帧障碍物 mesh（箱子、碎片、地形等，排除区域 area）
 * groundMeshesGetter:     返回地形高度场 mesh（仅用于坑洞探针）
 * characterMeshesGetter:  返回其他角色的 mesh（命中时强制归为 blocked_wall，避免误判为可跳过）
 */
export const createNavSensor = (
    obstacleMeshesGetter: () => readonly Object3D[],
    groundMeshesGetter: () => readonly Object3D[],
    characterMeshesGetter: () => readonly Object3D[],
): NavSensor =>
    buildNavSensor(createMeshNavRayCaster(obstacleMeshesGetter, groundMeshesGetter, characterMeshesGetter))

/**
 * Rapier 后端导航传感器（生产）：由碰撞体 BVH 射线投射，地形 trimesh 三角形数量不影响成本。
 */
export const createRapierNavSensor = (caster: NavRayCaster): NavSensor => buildNavSensor(caster)

export type {NavSensor}
