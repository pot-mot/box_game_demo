import {type PerspectiveCamera} from 'three'

export function setupCameraInfo(camera: PerspectiveCamera): () => void {
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

    const toDeg = (v: number) => (v * 180 / Math.PI).toFixed(1)

    return () => {
        el.innerHTML = [
            `pos: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`,
            `rot: ${toDeg(camera.rotation.x)}°, ${toDeg(camera.rotation.y)}°, ${toDeg(camera.rotation.z)}°`,
            `zoom: ${camera.zoom.toFixed(2)}`,
        ].join('\n')
    }
}
