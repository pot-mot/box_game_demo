import {
    AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh,
    MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, type Material, type Scene,
} from 'three'
import {lightenColor} from '../../../render/constants.ts'
import type {ProjectileVisualSpec} from '../../../character/weapon/projectile_visual.ts'
import {createWeaponMesh, type WeaponMeshConfig} from '../appearance/weapon_mesh.ts'
import {createObjectPool, type ObjectPool} from './pool.ts'
import {createProjectileTrail} from './trail.ts'
import type {ProjectileVisual} from './types.ts'
import {
    ARROW_LENGTH, BOLT_LENGTH, BULLET_LENGTH, ORB_CORE_RADIUS, ORB_DEFAULT_COLOR,
    ORB_GLOW_RADIUS, ORB_PULSE_AMPLITUDE, ORB_PULSE_SPEED, VISUAL_POOL_MAX,
} from './constants.ts'

/**
 * 弹丸视觉构建器（**独立 build 模块**）—— 每种视觉 kind 一个 `gen`，
 * 与 `weapon_mesh.ts` / `armor_mesh.ts` 同构：构建器只负责「弹丸长什么样」，
 * 池化 / 场景挂载 / 朝向驱动由 `createProjectileVisualPool` 与弹丸系统负责。
 *
 * 共享策略：
 * - 箭矢 / 弩矢 / 弹头的几何与材质为**模块级单例**（颜色固定，全实例共享）；
 * - 魔法球的材质含逐武器颜色，随实例创建并在销毁时释放；
 * - 投掷物复用 `createWeaponMesh`（每实例独立资源，池化复用）。
 */

// ── 共享几何 / 材质（物理弹体） ──

const ARROW_SHAFT_GEOM = new CylinderGeometry(0.012, 0.012, ARROW_LENGTH * 0.72, 6)
const ARROW_HEAD_GEOM = new ConeGeometry(0.028, ARROW_LENGTH * 0.22, 6)
const ARROW_FEATHER_GEOM = new BoxGeometry(0.004, ARROW_LENGTH * 0.16, ARROW_LENGTH * 0.09)
const ARROW_SHAFT_MAT = new MeshStandardMaterial({color: 0x8a6b3a, roughness: 0.7, metalness: 0.05})
const ARROW_HEAD_MAT = new MeshStandardMaterial({color: 0xc4c4c4, roughness: 0.3, metalness: 0.7})
const ARROW_FEATHER_MAT = new MeshStandardMaterial({color: 0xe8e2d0, roughness: 0.85, metalness: 0})

const BOLT_SHAFT_GEOM = new CylinderGeometry(0.018, 0.018, BOLT_LENGTH * 0.66, 6)
const BOLT_HEAD_GEOM = new ConeGeometry(0.032, BOLT_LENGTH * 0.26, 6)
const BOLT_VANE_GEOM = new BoxGeometry(0.004, BOLT_LENGTH * 0.14, BOLT_LENGTH * 0.11)
const BOLT_SHAFT_MAT = new MeshStandardMaterial({color: 0x5a4630, roughness: 0.7, metalness: 0.05})
const BOLT_HEAD_MAT = new MeshStandardMaterial({color: 0x8d9298, roughness: 0.25, metalness: 0.8})
const BOLT_VANE_MAT = new MeshStandardMaterial({color: 0xb0b0b0, roughness: 0.85, metalness: 0})

const BULLET_BODY_GEOM = new CylinderGeometry(0.026, 0.03, BULLET_LENGTH * 0.6, 6)
const BULLET_TIP_GEOM = new ConeGeometry(0.026, BULLET_LENGTH * 0.4, 6)
const BULLET_MAT = new MeshStandardMaterial({color: 0xd9b24a, roughness: 0.35, metalness: 0.85})

const ORB_CORE_GEOM = new SphereGeometry(ORB_CORE_RADIUS, 10, 8)
const ORB_GLOW_GEOM = new SphereGeometry(ORB_GLOW_RADIUS, 10, 8)

/** 从武器模型推导魔法球颜色（法杖取球颜色 / 魔杖取宝石颜色） */
const magicColorOf = (mesh: WeaponMeshConfig): number | undefined => {
    switch (mesh.id) {
        case 'staff': return mesh.orbColor
        case 'magic_wand': return mesh.gemColor
        default: return undefined
    }
}

/** 组装 +Y 为前向的箭矢 / 弩矢 */
const buildShaftBody = (
    shaft: CylinderGeometry, head: ConeGeometry,
    shaftMat: MeshStandardMaterial, headMat: MeshStandardMaterial,
    length: number,
): ProjectileVisual => {
    const group = new Group()
    const shaftMesh = new Mesh(shaft, shaftMat)
    shaftMesh.position.y = -length * 0.08
    group.add(shaftMesh)

    const headMesh = new Mesh(head, headMat)
    headMesh.position.y = length * 0.36
    group.add(headMesh)

    return {
        group,
        orientation: 'velocity',
        trailMesh: undefined,
        trail: undefined,
        animate: undefined,
        /* 几何 / 材质为模块级单例，实例销毁只解挂子节点 */
        dispose: () => { group.clear() },
    }
}

const genArrow = (): ProjectileVisual => {
    const visual = buildShaftBody(
        ARROW_SHAFT_GEOM, ARROW_HEAD_GEOM, ARROW_SHAFT_MAT, ARROW_HEAD_MAT, ARROW_LENGTH,
    )
    const featherY = -ARROW_LENGTH * 0.34
    for (const dz of [-1, 1]) {
        const feather = new Mesh(ARROW_FEATHER_GEOM, ARROW_FEATHER_MAT)
        feather.position.set(0, featherY, dz * ARROW_LENGTH * 0.06)
        feather.rotation.set(Math.PI / 2, 0, 0)
        visual.group.add(feather)
    }
    return visual
}

const genBolt = (): ProjectileVisual => {
    const visual = buildShaftBody(
        BOLT_SHAFT_GEOM, BOLT_HEAD_GEOM, BOLT_SHAFT_MAT, BOLT_HEAD_MAT, BOLT_LENGTH,
    )
    const vaneY = -BOLT_LENGTH * 0.3
    for (const dz of [-1, 1]) {
        const vane = new Mesh(BOLT_VANE_GEOM, BOLT_VANE_MAT)
        vane.position.set(0, vaneY, dz * BOLT_LENGTH * 0.05)
        visual.group.add(vane)
    }
    return visual
}

const genBullet = (): ProjectileVisual => {
    const group = new Group()
    const body = new Mesh(BULLET_BODY_GEOM, BULLET_MAT)
    body.position.y = -BULLET_LENGTH * 0.2
    group.add(body)
    const tip = new Mesh(BULLET_TIP_GEOM, BULLET_MAT)
    tip.position.y = BULLET_LENGTH * 0.3
    group.add(tip)
    return {
        group,
        orientation: 'none',
        trailMesh: undefined,
        trail: undefined,
        animate: undefined,
        dispose: () => { group.clear() },
    }
}

const genMagicOrb = (color: number): ProjectileVisual => {
    const group = new Group()
    const coreMat = new MeshBasicMaterial({color})
    const glowMat = new MeshBasicMaterial({
        color: lightenColor(color, 1.35), transparent: true, opacity: 0.35,
        blending: AdditiveBlending, depthWrite: false,
    })
    const core = new Mesh(ORB_CORE_GEOM, coreMat)
    group.add(core)
    const glow = new Mesh(ORB_GLOW_GEOM, glowMat)
    glow.renderOrder = 1
    group.add(glow)

    const trail = createProjectileTrail(lightenColor(color, 1.2))
    const materials: Material[] = [coreMat, glowMat]

    return {
        group,
        orientation: 'none',
        trailMesh: trail.mesh,
        trail,
        animate: (elapsed: number) => {
            const pulse = 1 + Math.sin(elapsed * ORB_PULSE_SPEED) * ORB_PULSE_AMPLITUDE
            glow.scale.setScalar(pulse)
            core.scale.setScalar(2 - pulse)
        },
        dispose: () => {
            group.clear()
            for (const m of materials) m.dispose()
            trail.dispose()
        },
    }
}

const genThrownWeapon = (meshConfig: WeaponMeshConfig): ProjectileVisual => {
    const weapon = createWeaponMesh(meshConfig)
    /* 外层 root 承担物理位移 / 旋转，内层武器模型保留烘焙的握持变换，
     * 使投掷物绕自身握把姿态翻滚（朝向由物理旋转驱动） */
    const root = new Group()
    root.add(weapon.group)
    return {
        group: root,
        orientation: 'physics',
        trailMesh: undefined,
        trail: undefined,
        animate: undefined,
        dispose: () => {
            root.clear()
            weapon.cleanup()
        },
    }
}

const buildVisual = (spec: ProjectileVisualSpec, meshConfig: WeaponMeshConfig): ProjectileVisual => {
    switch (spec.kind) {
        case 'arrow': return genArrow()
        case 'bolt': return genBolt()
        case 'bullet': return genBullet()
        case 'thrown_weapon': return genThrownWeapon(meshConfig)
        case 'magic_orb': {
            const color = spec.color ?? magicColorOf(meshConfig) ?? ORB_DEFAULT_COLOR
            return genMagicOrb(color)
        }
    }
}

/** 视觉签名：同类同色（魔法球）/ 同模型参数（投掷物）共享池 */
const visualSignature = (spec: ProjectileVisualSpec, meshConfig: WeaponMeshConfig): string => {
    switch (spec.kind) {
        case 'magic_orb': return `orb:${spec.color ?? magicColorOf(meshConfig) ?? ORB_DEFAULT_COLOR}`
        /* 投掷物直接复用武器模型：签名必须包含完整 mesh 参数，
         * 否则同一 model id 的不同参数（覆写 / 测试）会复用首份几何 */
        case 'thrown_weapon': return `weapon:${JSON.stringify(meshConfig)}`
        default: return spec.kind
    }
}

/** 弹丸视觉池：按签名分桶，`acquire` 挂场景、`release` 摘场景并重置轨迹 */
export interface ProjectileVisualPool {
    readonly acquire: (spec: ProjectileVisualSpec, meshConfig: WeaponMeshConfig) => ProjectileVisual
    readonly release: (visual: ProjectileVisual) => void
    /** 当前借出（在飞）实例数 */
    readonly activeCount: () => number
    /** 当前空闲实例总数 */
    readonly pooledCount: () => number
    readonly dispose: () => void
}

export const createProjectileVisualPool = (scene: Scene): ProjectileVisualPool => {
    const pools = new Map<string, ObjectPool<ProjectileVisual>>()
    const signatureOf = new WeakMap<ProjectileVisual, string>()
    /** 当前借出（在飞）实例：dispose 时需连同场景挂载一并释放，避免泄漏 */
    const active = new Set<ProjectileVisual>()

    const attach = (visual: ProjectileVisual): void => {
        scene.add(visual.group)
        if (visual.trailMesh !== undefined) scene.add(visual.trailMesh)
    }
    const detach = (visual: ProjectileVisual): void => {
        visual.group.removeFromParent()
        visual.trailMesh?.removeFromParent()
        visual.trail?.reset()
    }

    const createSignaturePool = (
        spec: ProjectileVisualSpec, meshConfig: WeaponMeshConfig,
    ): ObjectPool<ProjectileVisual> =>
        createObjectPool<ProjectileVisual>(
            () => buildVisual(spec, meshConfig),
            detach,
            (visual) => {
                detach(visual)
                visual.dispose()
            },
            VISUAL_POOL_MAX,
        )

    const poolFor = (signature: string, spec: ProjectileVisualSpec, meshConfig: WeaponMeshConfig): ObjectPool<ProjectileVisual> => {
        let pool = pools.get(signature)
        if (pool === undefined) {
            pool = createSignaturePool(spec, meshConfig)
            pools.set(signature, pool)
        }
        return pool
    }

    return {
        acquire: (spec, meshConfig) => {
            const signature = visualSignature(spec, meshConfig)
            const visual = poolFor(signature, spec, meshConfig).acquire()
            signatureOf.set(visual, signature)
            visual.trail?.reset()
            attach(visual)
            active.add(visual)
            return visual
        },
        release: (visual) => {
            if (!active.delete(visual)) return
            const signature = signatureOf.get(visual)
            const pool = signature !== undefined ? pools.get(signature) : undefined
            if (pool === undefined) {
                /* 异常路径：无归属池（签名缺失 / 池已销毁），直接释放避免泄漏 */
                detach(visual)
                visual.dispose()
                return
            }
            pool.release(visual)
        },
        activeCount: () => active.size,
        pooledCount: () => {
            let total = 0
            for (const pool of pools.values()) total += pool.size()
            return total
        },
        dispose: () => {
            /* 借出中的实例同样摘场景 + 释放资源（空闲栈由各池 dispose 处理） */
            for (const visual of active) {
                detach(visual)
                visual.dispose()
            }
            active.clear()
            for (const pool of pools.values()) pool.dispose()
            pools.clear()
        },
    }
}

/** 供测试断言：某视觉规格解析出的签名 */
export {visualSignature as projectileVisualSignature, buildVisual as buildProjectileVisual}

/** 解析弹丸主色（显式颜色 > 武器模型颜色 > 缺省） */
export const projectileColorOf = (spec: ProjectileVisualSpec, meshConfig: WeaponMeshConfig): number =>
    spec.color ?? magicColorOf(meshConfig) ?? ORB_DEFAULT_COLOR
