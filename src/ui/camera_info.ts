import {type PerspectiveCamera} from 'three'
import {translate} from '../i18n/index.ts'

const toDeg = (v: number) => (v * 180 / Math.PI).toFixed(1)

export const setupCameraInfo = (camera: PerspectiveCamera): () => void => {
    const el = document.createElement('div')
    el.id = 'camera-info'
    el.className = 'dc-panel dc-mono'
    el.style.cssText = 'position:fixed;top:50px;left:16px;padding:12px 16px;pointer-events:none;min-width:280px;'
    document.body.appendChild(el)

    const posSpan = document.createElement('div')
    const rotSpan = document.createElement('div')
    const zoomSpan = document.createElement('div')
    el.appendChild(posSpan)
    el.appendChild(rotSpan)
    el.appendChild(zoomSpan)

    return () => {
        posSpan.textContent = translate({key: 'camera.pos', args: [camera.position.x.toFixed(2), camera.position.y.toFixed(2), camera.position.z.toFixed(2)]})
        rotSpan.textContent = translate({key: 'camera.rot', args: [toDeg(camera.rotation.x), toDeg(camera.rotation.y), toDeg(camera.rotation.z)]})
        zoomSpan.textContent = translate({key: 'camera.zoom', args: [camera.zoom.toFixed(2)]})
    }
}
