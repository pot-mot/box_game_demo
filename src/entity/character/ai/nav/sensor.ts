import {Raycaster, Vector3, Box3, Matrix3, type Object3D, type Intersection} from 'three'
import type {CharacterEntity} from '../../../../character/types.ts'
import type {NavSenseOutput, NavSensor} from './types.ts'
import type {NavConfig} from './types.ts'
import {
    RAY_HORIZONTAL_ANGLES, RAY_PITCH_ANGLES, SIDE_SCAN_ANGLES,
    WALKABLE_NORMAL_MIN_Y,
} from './constants.ts'
import {CHARACTER_BASE_SIZE} from '../../constants.ts'

const _raycaster = new Raycaster()
const _origin = new Vector3()
const _forward = new Vector3()
const _right = new Vector3()
const _normalMatrix = new Matrix3()
const _worldNormal = new Vector3()

/**
 * 命中面法线转到世界空间后取 Y 分量：
 * `hit.face.normal` 是几何空间法线，地形/箱子可能带旋转（setTransform），
 * 直接读本地 Y 会把可行走坡面误判为墙壁（或反之）。
 */
const worldNormalY = (hit: Intersection<Object3D>): number => {
    if (!hit.face) return 0
    _normalMatrix.getNormalMatrix(hit.object.matrixWorld)
    _worldNormal.copy(hit.face.normal).applyMatrix3(_normalMatrix)
    const len = _worldNormal.length()
    return len > 1e-6 ? _worldNormal.y / len : 0
}

export type {NavSensor}

/**
 * 创建导航感知传感器
 *
 * obstacleMeshesGetter:   返回当前帧障碍物 mesh（箱子、碎片、地形等，排除 area/）
 * groundMeshesGetter:     返回地形高度场 mesh（仅用于坑洞探针）
 * characterMeshesGetter:  返回其他角色的 mesh（命中时强制归为 blocked_wall，避免误判为可跳过）
 */
export const createNavSensor = (
    obstacleMeshesGetter: () => readonly Object3D[],
    groundMeshesGetter: () => readonly Object3D[],
    characterMeshesGetter: () => readonly Object3D[],
): NavSensor => {
    const sense = (
        entity: CharacterEntity,
        forwardX: number,
        forwardZ: number,
        config: NavConfig,
    ): NavSenseOutput => {
        const scale = entity.config.scale
        const jumpHeight = entity.config.jumpHeight
        const pos = entity.body.translation()
        const bh = CHARACTER_BASE_SIZE.height * scale

        /* 射线起点：碰撞箱底部略上方 */
        const footX = pos.x
        const footY = pos.y - bh / 2 + 0.1
        const footZ = pos.z

        /* 前方方向向量的长度与归一化 */
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
        _forward.set(forwardX / fLen, 0, forwardZ / fLen)
        _right.set(-_forward.z, 0, _forward.x)

        /* 获取当前帧 mesh 列表并排除自身 */
        const rawObstacles = obstacleMeshesGetter()
        const rawCharacters = characterMeshesGetter()
        const selfMesh = entity.mesh as Object3D
        const obstacles: Object3D[] = []
        const charSet = new WeakSet<Object3D>()
        for (const m of rawCharacters) {
            if (m !== selfMesh) charSet.add(m)
        }
        for (const m of rawObstacles) {
            if (m !== selfMesh) obstacles.push(m)
        }
        const grounds = groundMeshesGetter()

        /* ── 前方扇面检测 ── */
        let minHitDist = Infinity
        let blockTopY = -Infinity /** 命中对象的世界包围盒顶部 Y */
        let hitIsCharacter = false /** 最近命中是否来自角色 mesh */
        let centerWalkableHit = false /** 正前方命中可行走坡面（地形向上延伸） */

        for (const hAngle of RAY_HORIZONTAL_ANGLES) {
            /* 将 forward 旋转 hAngle 得到水平方向 */
            const cosH = Math.cos(hAngle)
            const sinH = Math.sin(hAngle)
            const dirX = _forward.x * cosH - _forward.z * sinH
            const dirZ = _forward.x * sinH + _forward.z * cosH

            /* 侧向偏移：沿 right 方向移动 */
            const latOffset = Math.abs(sinH) * config.checkRadius
            const ox = footX + _right.x * latOffset * Math.sign(sinH)
            const oz = footZ + _right.z * latOffset * Math.sign(sinH)

            for (const pitch of RAY_PITCH_ANGLES) {
                /* 仰角方向 */
                const cosP = Math.cos(pitch)
                const sinP = Math.sin(pitch)
                const rdx = dirX * cosP
                const rdz = dirZ * cosP
                const rdy = sinP

                _origin.set(ox, footY, oz)
                _raycaster.set(_origin, new Vector3(rdx, rdy, rdz))

                const hits = _raycaster.intersectObjects(obstacles, false)
                if (hits.length > 0 && hits[0].distance < config.checkDistance) {
                    /* 面法线过滤：可行走表面（如斜坡）不视为障碍物 */
                    const normalY = worldNormalY(hits[0])
                    if (normalY >= WALKABLE_NORMAL_MIN_Y) {
                        /* 上坡时坑洞探针起点位于坡面内部必然 miss，
                         * 正前方（hAngle=0）命中可行走坡面说明地形持续向上延伸，
                         * 不可能同时是坑洞 → 兜底视为有地面 */
                        if (hAngle === 0) centerWalkableHit = true
                        continue
                    }

                    if (hits[0].distance < minHitDist) {
                        minHitDist = hits[0].distance
                        hitIsCharacter = charSet.has(hits[0].object)
                    }
                    /* 获取命中对象的世界包围盒顶部高度 */
                    const bbox = new Box3().setFromObject(hits[0].object)
                    if (bbox.max.y > blockTopY) {
                        blockTopY = bbox.max.y
                    }
                }
            }
        }

        /* ── 侧向扫描 ── */
        let leftClear = true
        let rightClear = true

        for (const hAngle of SIDE_SCAN_ANGLES) {
            const cosH = Math.cos(hAngle)
            const sinH = Math.sin(hAngle)
            const dirX = _forward.x * cosH - _forward.z * sinH
            const dirZ = _forward.x * sinH + _forward.z * cosH

            _origin.set(footX, footY, footZ)
            _raycaster.set(_origin, new Vector3(dirX, 0, dirZ))

            const hits = _raycaster.intersectObjects(obstacles, false)
            /* 面法线过滤：可行走表面不视为障碍物 */
            const firstHit = hits[0]
            const blocked = firstHit !== undefined
                && firstHit.distance < config.checkDistance * 1.2
                && worldNormalY(firstHit) < WALKABLE_NORMAL_MIN_Y

            if (hAngle < 0 && blocked) {
                leftClear = false
            } else if (hAngle > 0 && blocked) {
                rightClear = false
            }
        }

        /* ── 前方坑洞探针 ── */
        /* 从自身脚底高度向下探测，超过跳跃高度则视为不可安全下落 */
        const probeX = footX + _forward.x * config.checkDistance
        const probeZ = footZ + _forward.z * config.checkDistance
        _origin.set(probeX, footY, probeZ)
        _raycaster.set(_origin, new Vector3(0, -1, 0))

        let groundAhead = false
        /* 探针是否完全未命中任何 mesh（下方只剩隐式无限平面 y=0，需要回退判定） */
        let probeMissed = true
        /* 同时检查地面 mesh 和障碍 mesh（角色可能站在箱子上，箱子也应视为地面） */
        const probeTargets = [...grounds as Object3D[], ...obstacles]
        if (probeTargets.length > 0) {
            const groundHits = _raycaster.intersectObjects(probeTargets, false)
            if (groundHits.length > 0) {
                probeMissed = false
                /* 命中点距离在跳跃高度范围内则判定为可安全到达 */
                groundAhead = groundHits[0].distance <= jumpHeight
            }
            /* 命中点在 jumpHeight 之外，或完全未命中 → 有待回退检查 */
        } else {
            /* 无任何 mesh 可查 → 假定平坦世界有地面 */
            groundAhead = true
        }

        /* 回退：探针完全未命中 → 下方只剩隐式无限平面 y=0（物理地面，非 mesh）。
         * 脚底到平面距离在跳跃高度内即安全可走（角色在基础平面/浅坑内不误判坑洞）；
         * 超出跳跃高度则是真实落差（悬崖/深坑），保持 blocked_pit 阻止主动下跳 */
        if (!groundAhead && probeMissed) {
            groundAhead = footY <= jumpHeight
        }
        /* 上坡时探针起点在坡面内部必然 miss，用正前方可行走坡面命中兜底 */
        if (!groundAhead && centerWalkableHit) {
            groundAhead = true
        }

        /* ── 分类 ── */
        if (minHitDist < Infinity) {
            /* 障碍顶部相对脚底的高度 */
            const obstacleTopRelative = blockTopY - footY
            /* 命中角色 mesh 时强制归为 blocked_wall（跳越角色不可靠），否则按高度判定 */
            if (hitIsCharacter || obstacleTopRelative > jumpHeight) {
                return {
                    result: 'blocked_wall',
                    obstacleDistance: minHitDist,
                    obstacleHeight: obstacleTopRelative,
                    leftClear,
                    rightClear,
                    groundAhead,
                }
            }
            return {
                result: 'blocked_low',
                obstacleDistance: minHitDist,
                obstacleHeight: obstacleTopRelative,
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

    return {sense}
}
