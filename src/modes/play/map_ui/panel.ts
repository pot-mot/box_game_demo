import type {BuildingGeneratorContext} from '../../../entity/building_generator/types/index.ts'

const MAP_W = 480
const MAP_H = 360

export interface MapMarker {
    key: string
    kind: 'teleport' | 'save_point'
    name: string
    x: number
    z: number
    known: boolean
}

export interface MapPanel {
    setVisible: (v: boolean) => void
    isVisible: () => boolean
    toggle: () => void
    beginTeleportSelect: (onPick: (key: string) => void) => void
    update: (playerX: number, playerZ: number, playerYaw: number) => void
    dispose: () => void
}

/** 地图面板：俯视绘制建筑范围、玩家与传送/存档点；支持传送选点 */
export const createMapPanel = (
    building: BuildingGeneratorContext,
    getMarkers: () => MapMarker[],
): MapPanel => {
    const root = document.createElement('div')
    root.style.cssText = [
        'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
        'display:none', 'z-index:55', 'background:rgba(12,12,16,0.94)', 'color:#eee',
        'border:1px solid #444', 'border-radius:10px', 'padding:12px',
        'font:13px system-ui, sans-serif', 'user-select:none',
    ].join(';')
    const title = document.createElement('div')
    title.style.cssText = 'font-weight:700;margin-bottom:8px;color:#8ecae6'
    title.textContent = '地图'
    root.appendChild(title)
    const canvas = document.createElement('canvas')
    canvas.width = MAP_W
    canvas.height = MAP_H
    canvas.style.cssText = 'display:block;border:1px solid #333;border-radius:6px;background:#0a0a0c'
    root.appendChild(canvas)
    const hint = document.createElement('div')
    hint.style.cssText = 'margin-top:6px;color:#aaa;min-height:18px'
    root.appendChild(hint)
    /* 惰性挂载：首次显示时才加入 DOM，避免 play 启动即多出一个 canvas、多一个 WebGL 无关元素 */
    let mounted = false
    const mount = (): void => {
        if (mounted) return
        document.body.appendChild(root)
        mounted = true
    }

    const ctx = canvas.getContext('2d')!
    let visible = false
    let pickMode = false
    let onPick: ((key: string) => void) | undefined
    let playerX = 0
    let playerZ = 0
    let playerYaw = 0
    let hoverKey: string | undefined

    const computeBounds = (): {minX: number; minZ: number; maxX: number; maxZ: number} => {
        let minX = Infinity
        let minZ = Infinity
        let maxX = -Infinity
        let maxZ = -Infinity
        const worlds = building.getAll()
        for (const world of worlds) {
            const p = world.group.position
            const sx = world.config.sizeX
            const sz = world.config.sizeZ
            minX = Math.min(minX, p.x)
            minZ = Math.min(minZ, p.z)
            maxX = Math.max(maxX, p.x + sx)
            maxZ = Math.max(maxZ, p.z + sz)
        }
        if (!Number.isFinite(minX)) {
            const r = 30
            return {minX: playerX - r, minZ: playerZ - r, maxX: playerX + r, maxZ: playerZ + r}
        }
        /* 至少覆盖玩家附近区域 */
        minX = Math.min(minX, playerX - 5)
        minZ = Math.min(minZ, playerZ - 5)
        maxX = Math.max(maxX, playerX + 5)
        maxZ = Math.max(maxZ, playerZ + 5)
        return {minX, minZ, maxX, maxZ}
    }

    let currentBounds = {minX: 0, minZ: 0, maxX: 1, maxZ: 1}
    const project = (x: number, z: number): [number, number] => {
        const b = currentBounds
        const spanX = Math.max(b.maxX - b.minX, 1)
        const spanZ = Math.max(b.maxZ - b.minZ, 1)
        const scale = Math.min((MAP_W - 24) / spanX, (MAP_H - 24) / spanZ)
        const ox = (MAP_W - spanX * scale) / 2
        const oy = (MAP_H - spanZ * scale) / 2
        return [ox + (x - b.minX) * scale, oy + (z - b.minZ) * scale]
    }

    const draw = (): void => {
        currentBounds = computeBounds()
        ctx.clearRect(0, 0, MAP_W, MAP_H)
        /* 建筑范围 */
        for (const world of building.getAll()) {
            const p = world.group.position
            const [x0, y0] = project(p.x, p.z)
            const [x1, y1] = project(p.x + world.config.sizeX, p.z + world.config.sizeZ)
            ctx.fillStyle = 'rgba(120,120,140,0.18)'
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
            ctx.strokeStyle = 'rgba(160,160,180,0.5)'
            ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
        }
        /* 标记 */
        for (const m of getMarkers()) {
            const [mx, my] = project(m.x, m.z)
            const isHover = hoverKey === m.key
            ctx.beginPath()
            if (m.kind === 'teleport') {
                ctx.fillStyle = m.known ? (isHover ? '#ffe08a' : '#8ecae6') : '#555'
                ctx.moveTo(mx, my - 7)
                ctx.lineTo(mx + 7, my)
                ctx.lineTo(mx, my + 7)
                ctx.lineTo(mx - 7, my)
                ctx.closePath()
            } else {
                ctx.fillStyle = '#e76f51'
                ctx.arc(mx, my, 6, 0, Math.PI * 2)
            }
            ctx.fill()
            ctx.fillStyle = m.known ? '#ddd' : '#777'
            ctx.font = '10px system-ui'
            ctx.fillText(m.name, mx + 9, my + 3)
        }
        /* 玩家 */
        const [px, py] = project(playerX, playerZ)
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(playerYaw)
        ctx.beginPath()
        ctx.moveTo(0, -8)
        ctx.lineTo(5, 7)
        ctx.lineTo(-5, 7)
        ctx.closePath()
        ctx.fillStyle = '#ffd166'
        ctx.fill()
        ctx.restore()
    }

    const pickAt = (clientX: number, clientY: number): MapMarker | undefined => {
        const rect = canvas.getBoundingClientRect()
        const mx = (clientX - rect.left) * (MAP_W / rect.width)
        const my = (clientY - rect.top) * (MAP_H / rect.height)
        let best: MapMarker | undefined
        let bestD = 14
        for (const m of getMarkers()) {
            if (m.kind !== 'teleport' || !m.known) continue
            const [x, y] = project(m.x, m.z)
            const d = Math.hypot(x - mx, y - my)
            if (d < bestD) { bestD = d; best = m }
        }
        return best
    }

    canvas.addEventListener('mousemove', (e) => {
        const m = pickAt(e.clientX, e.clientY)
        const next = m?.key
        if (next !== hoverKey) {
            hoverKey = next
            canvas.style.cursor = m !== undefined ? 'pointer' : 'default'
            draw()
        }
    })
    canvas.addEventListener('click', (e) => {
        if (!pickMode) return
        const m = pickAt(e.clientX, e.clientY)
        if (m !== undefined) onPick?.(m.key)
    })

    const setVisible = (v: boolean): void => {
        visible = v
        if (v) mount()
        root.style.display = v ? 'block' : 'none'
        if (v) draw()
    }

    return {
        setVisible,
        isVisible: () => visible,
        toggle: () => setVisible(!visible),
        beginTeleportSelect: (pick) => {
            pickMode = true
            onPick = pick
            hint.textContent = '点击已解锁的传送点进行传送'
            setVisible(true)
        },
        update: (x, z, yaw) => {
            playerX = x
            playerZ = z
            playerYaw = yaw
            if (visible) draw()
        },
        dispose: () => {
            root.remove()
        },
    }
}
