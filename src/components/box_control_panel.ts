import type {BoxConfig} from '../types/physics.ts'
import type {PhysicsContext} from '../types/physics.ts'

export interface PanelContext {
    showForBox: (config: BoxConfig, pos: { x: number; y: number; z: number }, rotDeg: {
        x: number;
        y: number;
        z: number
    }) => void
    hide: () => void
}

export const setupBoxControlPanel = (physics: PhysicsContext): PanelContext => {
    const el = document.createElement('div')
    el.id = 'box-control'
    el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: rgba(0,0,0,.75); color: #fff;
    font: 13px/1.5 monospace; padding: 16px 20px;
    border-radius: 10px; min-width: 230px;
    user-select: none; display: none;
  `
    el.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;font-size:14px">Box Control</div>
    <div style="border-top:1px solid #555;padding:4px 0">Pos</div>
    <label>X <input type="number" step="0.01"></label>
    <label>Y <input type="number" step="0.01"></label>
    <label>Z <input type="number" step="0.01"></label>
    <div style="border-top:1px solid #555;padding:4px 0">Rot (°)</div>
    <label>X <input type="number" step="0.1"></label>
    <label>Y <input type="number" step="0.1"></label>
    <label>Z <input type="number" step="0.1"></label>
    <div style="border-top:1px solid #555;padding:4px 0">Size</div>
    <label>X <input type="number" min="0.1" step="0.1" value="1"></label>
    <label>Y <input type="number" min="0.1" step="0.1" value="1"></label>
    <label>Z <input type="number" min="0.1" step="0.1" value="1"></label>
    <div style="border-top:1px solid #555;padding:4px 0">
      <label>Mass <input type="number" min="0" step="0.1" value="0" style="width:80px"></label>
    </div>
    <label>Friction <input type="number" min="0" max="1" step="0.01" value="0.3" style="width:80px"></label>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="bc-apply" style="flex:1">Apply</button>
      <button id="bc-delete" style="flex:1">Delete</button>
    </div>
  `
    document.body.appendChild(el)

    const inputs = el.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const iPos = [inputs[0], inputs[1], inputs[2]]
    const iRot = [inputs[3], inputs[4], inputs[5]]
    const iSize = [inputs[6], inputs[7], inputs[8]]
    const iMass = inputs[9]
    const iFriction = inputs[10]
    const applyBtn = el.querySelector('#bc-apply') as HTMLButtonElement
    const deleteBtn = el.querySelector('#bc-delete') as HTMLButtonElement

    applyBtn.addEventListener('click', () => {
        const sel = physics.getSelected()
        if (!sel) return
        const pos = {
            x: parseFloat(iPos[0].value),
            y: parseFloat(iPos[1].value),
            z: parseFloat(iPos[2].value),
        }
        const rotDeg = {
            x: parseFloat(iRot[0].value),
            y: parseFloat(iRot[1].value),
            z: parseFloat(iRot[2].value),
        }
        physics.setBoxTransform(sel.id, pos, rotDeg)
        physics.updateBox(sel.id, {
            width: parseFloat(iSize[0].value),
            height: parseFloat(iSize[1].value),
            depth: parseFloat(iSize[2].value),
            mass: parseFloat(iMass.value),
            friction: parseFloat(iFriction.value),
        })
    })

    deleteBtn.addEventListener('click', () => {
        const sel = physics.getSelected()
        if (sel) {
            physics.removeBox(sel.id)
            hide()
        }
    })

    const showForBox = (
        config: BoxConfig,
        pos: { x: number; y: number; z: number },
        rotDeg: { x: number; y: number; z: number },
    ) => {
        el.style.display = 'block'
        iPos[0].value = pos.x.toFixed(2)
        iPos[1].value = pos.y.toFixed(2)
        iPos[2].value = pos.z.toFixed(2)
        iRot[0].value = rotDeg.x.toFixed(1)
        iRot[1].value = rotDeg.y.toFixed(1)
        iRot[2].value = rotDeg.z.toFixed(1)
        iSize[0].value = String(config.width)
        iSize[1].value = String(config.height)
        iSize[2].value = String(config.depth)
        iMass.value = String(config.mass)
        iFriction.value = String(config.friction)
    }

    const hide = () => {
        el.style.display = 'none'
    }

    return {showForBox, hide}
}
