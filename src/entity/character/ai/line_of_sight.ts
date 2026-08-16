import {Raycaster, Vector3, type Mesh, type Object3D} from 'three'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP} from './constants.ts'

const _origin = new Vector3()
const _targetDir = new Vector3()
const _raycaster = new Raycaster()
const _meshes: Object3D[] = []

export interface LineOfSightChecker {
    hasLOS: (fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number) => boolean
    /** 扇形扫描：从 (fromX, fromY, fromZ) 向 yaw ±半角内发射 VISION_FAN_RAY_COUNT 条水平射线（每 10° 一条），
     * 把每条射线最近遮挡物距离写入 out（无遮挡写 maxDist）；out 长度须 ≥ VISION_FAN_RAY_COUNT */
    castFan: (fromX: number, fromY: number, fromZ: number, yaw: number, maxDist: number, out: Float32Array) => void
}

export const createLineOfSightChecker = (
    getBlockingMeshes: () => readonly Mesh[],
): LineOfSightChecker => {
    const collectMeshes = (): void => {
        const src = getBlockingMeshes()
        _meshes.length = 0
        for (let i = 0; i < src.length; i++) _meshes[i] = src[i]
    }

    const hasLOS = (fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): boolean => {
        _origin.set(fromX, fromY, fromZ)
        _targetDir.set(toX - fromX, toY - fromY, toZ - fromZ)
        const dist = _targetDir.length()
        if (dist < 0.001) return true
        _targetDir.normalize()
        _raycaster.set(_origin, _targetDir)
        _raycaster.far = dist
        collectMeshes()
        const hits = _raycaster.intersectObjects(_meshes, false)
        for (const hit of hits) {
            if (hit.distance < dist - 0.05) return false
        }
        return true
    }

    const castFan = (fromX: number, fromY: number, fromZ: number, yaw: number, maxDist: number, out: Float32Array): void => {
        _origin.set(fromX, fromY, fromZ)
        _raycaster.far = maxDist
        collectMeshes()
        for (let i = 0; i < VISION_FAN_RAY_COUNT; i++) {
            const a = yaw - VISION_FAN_HALF_ANGLE + i * VISION_FAN_RAY_STEP
            _targetDir.set(Math.sin(a), 0, Math.cos(a))
            _raycaster.set(_origin, _targetDir)
            const hits = _raycaster.intersectObjects(_meshes, false)
            /* intersectObjects 结果按距离升序，取最近命中；无命中则射线直达侦测半径 */
            out[i] = hits.length > 0 ? hits[0].distance : maxDist
        }
    }

    return {hasLOS, castFan}
}
