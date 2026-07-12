import type { BoxConfig } from '../types/physics.ts'
import type { PhysicsContext } from '../types/physics.ts'

const DEFAULT_CONFIG: BoxConfig = {
  width: 1,
  height: 1,
  depth: 1,
  mass: 0,
  friction: 0.3,
}

export interface PanelContext {
  loadBox: (config: BoxConfig) => void
  clearSelection: () => void
  getDefaults: () => BoxConfig
}

export const setupBoxControlPanel = (physics: PhysicsContext): PanelContext => {
  const el = document.createElement('div')
  el.id = 'box-control'
  el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: rgba(0,0,0,.75); color: #fff;
    font: 13px/1.5 monospace; padding: 16px 20px;
    border-radius: 10px; min-width: 200px;
    user-select: none;
  `
  el.innerHTML = `
    <div style="font-weight:700;margin-bottom:10px;font-size:14px">Box Control</div>
    <label>X <input type="range" min="0.1" max="5" step="0.1" value="1">
         <input type="number" min="0.1" max="5" step="0.1" value="1"></label>
    <label>Y <input type="range" min="0.1" max="5" step="0.1" value="1">
         <input type="number" min="0.1" max="5" step="0.1" value="1"></label>
    <label>Z <input type="range" min="0.1" max="5" step="0.1" value="1">
         <input type="number" min="0.1" max="5" step="0.1" value="1"></label>
    <label>Mass <input type="range" min="0" max="20" step="0.1" value="0">
           <input type="number" min="0" max="20" step="0.1" value="0"></label>
    <label>Friction <input type="range" min="0" max="1" step="0.01" value="0.3">
           <input type="number" min="0" max="1" step="0.01" value="0.3"></label>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="bc-apply" style="flex:1">Apply</button>
      <button id="bc-delete" style="flex:1">Delete</button>
    </div>
  `
  document.body.appendChild(el)

  const labels = el.querySelectorAll('label')
  const ranges: HTMLInputElement[] = []
  const numbers: HTMLInputElement[] = []
  for (const label of labels) {
    const r = label.querySelector('input[type="range"]') as HTMLInputElement
    const n = label.querySelector('input[type="number"]') as HTMLInputElement
    ranges.push(r)
    numbers.push(n)
    const sync = () => { n.value = r.value; r.value = n.value }
    r.addEventListener('input', sync)
    n.addEventListener('input', sync)
  }
  const applyBtn = el.querySelector('#bc-apply') as HTMLButtonElement
  const deleteBtn = el.querySelector('#bc-delete') as HTMLButtonElement

  const readConfig = (): BoxConfig => ({
    width: parseFloat(ranges[0].value),
    height: parseFloat(ranges[1].value),
    depth: parseFloat(ranges[2].value),
    mass: parseFloat(ranges[3].value),
    friction: parseFloat(ranges[4].value),
  })

  const writeConfig = (cfg: BoxConfig) => {
    const vals = [cfg.width, cfg.height, cfg.depth, cfg.mass, cfg.friction]
    for (let i = 0; i < 5; i++) {
      ranges[i].value = String(vals[i])
      numbers[i].value = String(vals[i])
    }
  }

  const enableForm = (enabled: boolean) => {
    const color = enabled ? '#fff' : '#666'
    const pointer = enabled ? 'auto' : 'none'
    el.style.color = color
    for (const r of ranges) r.style.pointerEvents = pointer
    for (const n of numbers) n.style.pointerEvents = pointer
    applyBtn.style.pointerEvents = pointer
    deleteBtn.style.pointerEvents = pointer
  }
  enableForm(false)

  const loadBox = (cfg: BoxConfig) => {
    writeConfig(cfg)
    enableForm(true)
  }

  const clearSelection = () => {
    writeConfig(DEFAULT_CONFIG)
    enableForm(false)
  }

  applyBtn.addEventListener('click', () => {
    const cfg = readConfig()
    const sel = physics.getSelected()
    if (sel) physics.updateBox(sel.id, cfg)
  })

  deleteBtn.addEventListener('click', () => {
    const sel = physics.getSelected()
    if (sel) {
      physics.removeBox(sel.id)
      clearSelection()
    }
  })

  return { loadBox, clearSelection, getDefaults: () => DEFAULT_CONFIG }
}
