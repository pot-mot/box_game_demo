import {Mesh, MeshBasicMaterial, SphereGeometry, type Scene, type Vector3} from 'three'
import {LOCK_MARKER_DIAMETER} from './constants.ts'

/** 锁定标记（目标头顶白点）控制器 */
export interface LockMarker {
    /** 每帧更新标记位置；传入 undefined 时隐藏标记 */
    readonly update: (point: Vector3 | undefined) => void
}

/**
 * 创建锁定标记：白色圆点，关闭深度测试以便不被目标模型遮挡，
 * 由 play 模式每帧传入 `PlayerLockOn.getAimPoint()` 命中的锁定点坐标。
 */
export const setupLockMarker = (scene: Scene): LockMarker => {
    const geometry = new SphereGeometry(LOCK_MARKER_DIAMETER / 2, 12, 12)
    const material = new MeshBasicMaterial({color: 0xffffff, depthTest: false, depthWrite: false})
    const marker = new Mesh(geometry, material)
    marker.renderOrder = 1000
    marker.visible = false
    scene.add(marker)

    const update = (point: Vector3 | undefined): void => {
        marker.visible = point !== undefined
        if (point) marker.position.copy(point)
    }

    return {update}
}
