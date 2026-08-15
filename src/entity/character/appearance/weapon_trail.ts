import {
    BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial,
    AdditiveBlending, DoubleSide, type Scene, type Vector3,
} from 'three'

/** 轨迹采样点数（环形缓冲容量） */
const TRAIL_POINTS = 16

/** 轨迹半宽（m，随点龄线性收窄至 0） */
const TRAIL_HALF_WIDTH = 0.035

/** 单个采样点的存活时间（秒），超龄点从尾部剔除 */
const TRAIL_LIFETIME = 0.18

/** 轨迹颜色（暖金色，加法混合） */
const TRAIL_COLOR = 0xffd070

/** 激活时的最大不透明度 */
const TRAIL_MAX_OPACITY = 0.5

/** 触发显示所需最少采样点数 */
const TRAIL_MIN_POINTS = 2

export interface WeaponTrail {
    /** 每帧调用：active 时记录刀尖世界坐标并显示拖尾，非 active 时随点龄衰减消隐 */
    update: (dt: number, tipWorld: Vector3, active: boolean) => void
    /**
     * 设置不透明度全局缩放系数（1 = 正常）。供外部场景（如展示页聚焦变暗）同步压暗：
     * 材质 opacity 每帧由 update 覆写，直接改材质会被冲掉，必须经此系数下发。
     */
    setOpacityScale: (scale: number) => void
    /** 从场景移除并释放资源 */
    dispose: () => void
}

/**
 * 刀光拖尾：刀尖世界坐标的时序环形缓冲 → 水平展开的三角带 ribbon。
 * 宽度按点龄收窄（新粗旧细），加法混合半透明，未激活时随最旧点消隐。
 */
export const createWeaponTrail = (scene: Scene): WeaponTrail => {
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
        color: TRAIL_COLOR,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
    })
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.visible = false
    scene.add(mesh)

    /* 不透明度全局缩放系数（默认 1，行为与生产一致；由 setOpacityScale 下发） */
    let opacityScale = 1
    const setOpacityScale = (scale: number): void => {
        opacityScale = scale
    }

    /* 环形缓冲：oldest → newest */
    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []
    const ages: number[] = []

    const update = (dt: number, tipWorld: Vector3, active: boolean): void => {
        for (let i = 0; i < ages.length; i++) ages[i] += dt

        if (active) {
            xs.push(tipWorld.x)
            ys.push(tipWorld.y)
            zs.push(tipWorld.z)
            ages.push(0)
            if (xs.length > TRAIL_POINTS) {
                xs.shift(); ys.shift(); zs.shift(); ages.shift()
            }
        }

        /* 剔除超龄尾部（含非激活态下的自然消隐） */
        while (xs.length > 0 && ages[0] > TRAIL_LIFETIME) {
            xs.shift(); ys.shift(); zs.shift(); ages.shift()
        }

        const n = xs.length
        mesh.visible = n >= TRAIL_MIN_POINTS
        if (!mesh.visible) {
            material.opacity = 0
            return
        }

        /* 不透明度：激活时全量，非激活时随最新点年龄衰减（整体淡出）；整体乘缩放系数 */
        material.opacity = opacityScale * (active
            ? TRAIL_MAX_OPACITY
            : TRAIL_MAX_OPACITY * Math.max(0, 1 - ages[n - 1] / TRAIL_LIFETIME))

        /* 重建 ribbon：每点取水平垂直侧向（dir × up），宽度随点龄收窄 */
        for (let i = 0; i < TRAIL_POINTS; i++) {
            const j = Math.min(i, n - 1)
            const px = xs[j]
            const py = ys[j]
            const pz = zs[j]
            const prevJ = Math.max(0, j - 1)
            const nextJ = Math.min(n - 1, j + 1)
            let dx = xs[nextJ] - xs[prevJ]
            let dz = zs[nextJ] - zs[prevJ]
            const dl = Math.hypot(dx, dz)
            /* 侧向 = normalize(dir × up) = normalize(-dz, 0, dx)；竖直挥砍退化时取 (1,0,0) */
            let sx = 1
            let sz = 0
            if (dl > 1e-5) {
                sx = -dz / dl
                sz = dx / dl
            } else {
                dx = 1
            }
            void dx
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

    const dispose = (): void => {
        scene.remove(mesh)
        geometry.dispose()
        material.dispose()
    }

    return {update, setOpacityScale, dispose}
}
