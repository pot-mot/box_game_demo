import {Raycaster, Vector2, Vector3, type PerspectiveCamera, type WebGLRenderer, type Mesh} from 'three'
import type {PhysicsContext} from '../types/physics.ts'
import type {PanelContext} from '../types/ui.ts'
import {SPAWN_DIST, CLICK_THRESHOLD} from './constants.ts'

const DEFAULT_CONFIG = {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3} as const

/**
 * 指针事件交互：左键点击选中/取消选中箱子，右键生成默认箱子。
 * 使用 pointer 事件而非 click 事件，配合 CLICK_THRESHOLD 区分点击与拖拽。
 */
export const setupPointerInteraction = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    physics: PhysicsContext,
    panel: PanelContext,
): void => {
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const forward = new Vector3()
    let pointerDownPos = {x: 0, y: 0}

    renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button === 0) {
            pointerDownPos = {x: e.clientX, y: e.clientY}
        }
    })

    renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
        if (e.button !== 0) return
        // 超过阈值则为拖拽（用于轨道旋转），不触发放射检测
        const dx = e.clientX - pointerDownPos.x
        const dy = e.clientY - pointerDownPos.y
        if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD) return

        pointer.x = (e.clientX / window.innerWidth) * 2 - 1
        pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(pointer, camera)

        // recursive = false 防止检测到 LineSegments 子对象
        const hits = raycaster.intersectObjects(physics.getBoxMeshes(), false)
        if (hits.length > 0) {
            const hitMesh = hits[0].object as Mesh
            const pb = physics.getBoxes().find(b => b.mesh === hitMesh)
            if (pb) {
                physics.selectBox(pb.id)
                const rotDeg = {
                    x: pb.mesh.rotation.x * 180 / Math.PI,
                    y: pb.mesh.rotation.y * 180 / Math.PI,
                    z: pb.mesh.rotation.z * 180 / Math.PI,
                }
                panel.showForBox(pb.config, pb.mesh.position, rotDeg)
                return
            }
        }
        // 点击空白区域 → 取消选中
        physics.selectBox(undefined)
        panel.hide()
    })

    // 右键在相机前方生成一个默认尺寸的箱子
    renderer.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
        camera.getWorldDirection(forward)
        const spawnPos = new Vector3().copy(camera.position).add(forward.clone().multiplyScalar(SPAWN_DIST))
        physics.addBox(DEFAULT_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
    })
}
