import {
    AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute,
    Mesh, MeshBasicMaterial,
} from 'three'
import {
    TRAIL_HALF_WIDTH, TRAIL_LIFETIME, TRAIL_MAX_OPACITY, TRAIL_MIN_POINTS, TRAIL_POINTS,
} from './constants.ts'

/**
 * 弹丸轨迹（ribbon）—— 沿弹丸世界坐标记录时序环形缓冲，
 * 展开为水平三角带，宽度随点龄收窄、加法混合半透明。魔法球使用。
 *
 * 网格由调用方（视觉池）加入 / 移出场景，轨迹自身不持有场景引用。
 */
export interface ProjectileTrail {
    /** 世界坐标轨迹网格（加入场景后生效；未加入时不显示） */
    readonly mesh: Mesh
    /** 每帧调用：记录当前位置并按点龄消隐 */
    readonly update: (dt: number, x: number, y: number, z: number) => void
    /** 清空采样点并隐藏（复用前重置） */
    readonly reset: () => void
    readonly dispose: () => void
}

export const createProjectileTrail = (color: number): ProjectileTrail => {
    const positions = new Float32Array(TRAIL_POINTS * 2 * 3)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))

    const indices: number[] = []
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geometry.setIndex(indices)

    const material = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
    })
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.visible = false
    mesh.renderOrder = 1

    /* 环形缓冲：oldest → newest */
    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []
    const ages: number[] = []

    const reset = (): void => {
        xs.length = 0
        ys.length = 0
        zs.length = 0
        ages.length = 0
        mesh.visible = false
        material.opacity = 0
    }

    const update = (dt: number, x: number, y: number, z: number): void => {
        for (let i = 0; i < ages.length; i++) ages[i] += dt

        xs.push(x)
        ys.push(y)
        zs.push(z)
        ages.push(0)
        if (xs.length > TRAIL_POINTS) {
            xs.shift(); ys.shift(); zs.shift(); ages.shift()
        }

        while (xs.length > 0 && ages[0] > TRAIL_LIFETIME) {
            xs.shift(); ys.shift(); zs.shift(); ages.shift()
        }

        const n = xs.length
        mesh.visible = n >= TRAIL_MIN_POINTS
        if (!mesh.visible) {
            material.opacity = 0
            return
        }

        material.opacity = TRAIL_MAX_OPACITY

        for (let i = 0; i < TRAIL_POINTS; i++) {
            const j = Math.min(i, n - 1)
            const px = xs[j]
            const py = ys[j]
            const pz = zs[j]
            const prevJ = Math.max(0, j - 1)
            const nextJ = Math.min(n - 1, j + 1)
            const dx = xs[nextJ] - xs[prevJ]
            const dz = zs[nextJ] - zs[prevJ]
            const dl = Math.hypot(dx, dz)
            /* 侧向 = normalize(dir × up) = normalize(-dz, 0, dx)；竖直弹道退化时取 (1,0,0) */
            let sx = 1
            let sz = 0
            if (dl > 1e-5) {
                sx = -dz / dl
                sz = dx / dl
            }
            const w = TRAIL_HALF_WIDTH * Math.max(0, 1 - ages[j] / TRAIL_LIFETIME)
            const base = i * 6
            positions[base] = px + sx * w
            positions[base + 1] = py
            positions[base + 2] = pz + sz * w
            positions[base + 3] = px - sx * w
            positions[base + 4] = py
            positions[base + 5] = pz - sz * w
        }
        geometry.attributes.position.needsUpdate = true
    }

    return {
        mesh,
        update,
        reset,
        dispose: () => {
            geometry.dispose()
            material.dispose()
        },
    }
}
