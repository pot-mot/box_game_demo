import {type PerspectiveCamera} from 'three'
import type {SpawnMode} from '../input/pointer_interaction.ts'

const toDeg = (v: number) => (v * 180 / Math.PI).toFixed(1)

export const setupCameraInfo = (camera: PerspectiveCamera, getSpawnMode: () => SpawnMode): () => void => {
    const el = document.createElement('div')
    el.id = 'camera-info'
    el.style.cssText = [
        'position: fixed; top: 16px; left: 16px;',
        'background: rgba(0,0,0,.7); color: #fff;',
        'font: 14px/1.6 monospace; padding: 12px 16px;',
        'border-radius: 8px; pointer-events: none;',
        'min-width: 280px;',
    ].join(' ')
    document.body.appendChild(el)

    const posSpan = document.createElement('div')
    const rotSpan = document.createElement('div')
    const zoomSpan = document.createElement('div')
    const modeSpan = document.createElement('div')
    modeSpan.style.cssText = 'color:#8cf;margin-top:4px'
    el.appendChild(posSpan)
    el.appendChild(rotSpan)
    el.appendChild(zoomSpan)
    el.appendChild(modeSpan)

    return () => {
        posSpan.textContent = `pos: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`
        rotSpan.textContent = `rot: ${toDeg(camera.rotation.x)}°, ${toDeg(camera.rotation.y)}°, ${toDeg(camera.rotation.z)}°`
        zoomSpan.textContent = `zoom: ${camera.zoom.toFixed(2)}`
        const mode = getSpawnMode()
        modeSpan.textContent = `[1] Common  [2] Destruction  (${mode === 'common' ? '>> Common <<' : '>> Destruction <<'})`
    }
}
