import { PerspectiveCamera, Vector3 } from 'three'

const MOVE_STEP = 0.04

export const setupCameraInfoPanel = (camera: PerspectiveCamera) => {
    const el = document.createElement('div')
    el.id = 'camera-info'
    el.style.cssText = `
        position: fixed; top: 16px; left: 16px;
        background: rgba(0,0,0,.7); color: #fff;
        font: 14px/1.6 monospace; padding: 12px 16px;
        border-radius: 8px; pointer-events: none;
        min-width: 280px;
    `
    document.body.appendChild(el)

    const keys: Record<string, boolean> = {}
    window.addEventListener('keydown', e => { keys[e.code] = true })
    window.addEventListener('keyup', e => { keys[e.code] = false })

    const toDeg = (v: number) => (v * 180 / Math.PI).toFixed(1)

    const forward = new Vector3()
    const right = new Vector3()

    const tick = () => {
        requestAnimationFrame(tick)

        camera.getWorldDirection(forward)
        right.crossVectors(forward, camera.up).normalize()

        if (keys['KeyW']) camera.position.add(forward.clone().multiplyScalar(MOVE_STEP))
        if (keys['KeyS']) camera.position.add(forward.clone().multiplyScalar(-MOVE_STEP))
        if (keys['KeyA']) camera.position.add(right.clone().multiplyScalar(-MOVE_STEP))
        if (keys['KeyD']) camera.position.add(right.clone().multiplyScalar(MOVE_STEP))
        if (keys['KeyE']) camera.position.add(camera.up.clone().multiplyScalar(MOVE_STEP))
        if (keys['KeyQ']) camera.position.add(camera.up.clone().multiplyScalar(-MOVE_STEP))

        el.innerHTML = `
            pos: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}
            rot: ${toDeg(camera.rotation.x)}°, ${toDeg(camera.rotation.y)}°, ${toDeg(camera.rotation.z)}°
            zoom: ${camera.zoom.toFixed(2)}
        `.trim()
    }

    tick()
}
