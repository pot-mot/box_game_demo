import {Raycaster, Vector3, type Mesh, type Object3D} from 'three'

const _origin = new Vector3()
const _targetDir = new Vector3()
const _raycaster = new Raycaster()
const _meshes: Object3D[] = []

export interface LineOfSightChecker {
    hasLOS: (fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number) => boolean
}

export const createLineOfSightChecker = (
    getBlockingMeshes: () => readonly Mesh[],
): LineOfSightChecker => ({
    hasLOS(fromX, fromY, fromZ, toX, toY, toZ) {
        _origin.set(fromX, fromY, fromZ)
        _targetDir.set(toX - fromX, toY - fromY, toZ - fromZ)
        const dist = _targetDir.length()
        if (dist < 0.001) return true
        _targetDir.normalize()
        _raycaster.set(_origin, _targetDir)
        const src = getBlockingMeshes()
        _meshes.length = 0
        for (let i = 0; i < src.length; i++) _meshes[i] = src[i]
        const hits = _raycaster.intersectObjects(_meshes, false)
        for (const hit of hits) {
            if (hit.distance < dist - 0.05) return false
        }
        return true
    },
})
