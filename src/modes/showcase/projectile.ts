import {BoxGeometry, EdgesGeometry, Euler, LineBasicMaterial, LineSegments, Quaternion, Vector3, type Scene} from 'three'
import type {RangedWeaponConfig} from '../../character/weapon/ranged_weapon.ts'
import {DEFAULT_PROJECTILE_GRAVITY_SCALE} from '../../character/weapon/ranged_weapon.ts'
import {PROJECTILE_KILL_Y, PROJECTILE_RADIUS} from '../../entity/character/projectile/constants.ts'
import {ATTACK_HIT_BOX_COLOR} from '../../entity/character/combat_vfx/constants.ts'
import {createProjectileVisualPool} from '../../entity/character/projectile/mesh.ts'
import type {ProjectileVisual} from '../../entity/character/projectile/types.ts'

const _debugGeometry = new EdgesGeometry(new BoxGeometry(1, 1, 1))
const _debugMaterial = new LineBasicMaterial({color: ATTACK_HIT_BOX_COLOR})

interface ShowcaseProjectile {
    visual: ProjectileVisual
    /** 子弹攻击箱调试线框（仅子弹调试开关开启时可见） */
    debugBox: LineSegments
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
    gravityScale: number
    lifetime: number
    elapsed: number
    spin: boolean
}

export interface ShowcaseProjectiles {
    readonly spawn: (
        weapon: RangedWeaponConfig,
        origin: {x: number; y: number; z: number},
        direction: {x: number; y: number; z: number},
        throwAngle: number,
        charge?: number,
    ) => void
    readonly update: (dt: number) => void
    readonly clear: () => void
    /** 在飞弹丸数量（测试 / 调试用） */
    readonly count: () => number
    /** 子弹攻击箱调试线框显隐（跟随展示角色「攻击箱」开关） */
    readonly setAttackDebugVisible: (visible: boolean) => void
    readonly dispose: () => void
}

const _up = new Vector3(0, 1, 0)
const _dir = new Vector3()
const _quat = new Quaternion()
const _euler = new Euler()

/**
 * 展示模式专用弹丸：只播放真实弹丸视觉与弹道，**不创建物理碰撞体、不结算伤害 / 受击 / 爆炸**。
 * 复用生产弹丸视觉池（箭 / 弩矢 / 弹头 / 魔法球 / 投掷物），行为与 `projectile/system.ts` 的视觉部分一致。
 */
export const createShowcaseProjectiles = (scene: Scene): ShowcaseProjectiles => {
    const visuals = createProjectileVisualPool(scene)
    const active: ShowcaseProjectile[] = []
    let attackDebugVisible = false

    const spawn: ShowcaseProjectiles['spawn'] = (weapon, origin, direction, throwAngle, charge) => {
        const curve = weapon.charge
        const chargeT = charge !== undefined ? Math.max(0, Math.min(1, charge)) : 0
        const speedScale = curve !== undefined && charge !== undefined
            ? curve.minSpeedScale + (curve.maxSpeedScale - curve.minSpeedScale) * chargeT
            : 1
        const lifetimeScale = curve !== undefined && charge !== undefined
            ? curve.minLifetimeScale + (curve.maxLifetimeScale - curve.minLifetimeScale) * chargeT
            : 1
        const speed = weapon.projectileSpeed * speedScale
        const hSpeed = speed * Math.cos(throwAngle)
        const vSpeed = speed * Math.sin(throwAngle)
        const visual = visuals.acquire(weapon.projectile, weapon.mesh)
        visual.group.position.set(origin.x, origin.y, origin.z)
        const debugBox = new LineSegments(_debugGeometry, _debugMaterial)
        debugBox.scale.setScalar(PROJECTILE_RADIUS * 2)
        debugBox.position.set(origin.x, origin.y, origin.z)
        debugBox.visible = attackDebugVisible
        scene.add(debugBox)
        const shot: ShowcaseProjectile = {
            visual,
            debugBox,
            x: origin.x,
            y: origin.y,
            z: origin.z,
            vx: direction.x * hSpeed,
            vy: vSpeed,
            vz: direction.z * hSpeed,
            gravityScale: weapon.projectileGravityScale ?? DEFAULT_PROJECTILE_GRAVITY_SCALE,
            lifetime: weapon.projectileLifetime * lifetimeScale,
            elapsed: 0,
            spin: weapon.projectile.spin === true,
        }
        active.push(shot)
    }

    const release = (index: number): void => {
        const shot = active[index]
        if (shot === undefined) return
        active.splice(index, 1)
        shot.debugBox.removeFromParent()
        visuals.release(shot.visual)
    }

    const update: ShowcaseProjectiles['update'] = (dt) => {
        for (let i = active.length - 1; i >= 0; i--) {
            const shot = active[i]!
            shot.lifetime -= dt
            if (shot.lifetime <= 0 || shot.y < PROJECTILE_KILL_Y) {
                release(i)
                continue
            }
            shot.elapsed += dt
            shot.vy -= 9.81 * shot.gravityScale * dt
            shot.x += shot.vx * dt
            shot.y += shot.vy * dt
            shot.z += shot.vz * dt
            shot.visual.group.position.set(shot.x, shot.y, shot.z)
            shot.debugBox.position.set(shot.x, shot.y, shot.z)
            shot.debugBox.visible = attackDebugVisible
            if (shot.visual.orientation === 'velocity') {
                _dir.set(shot.vx, shot.vy, shot.vz)
                if (_dir.lengthSq() > 1e-8) {
                    _dir.normalize()
                    _quat.setFromUnitVectors(_up, _dir)
                    shot.visual.group.quaternion.copy(_quat)
                }
            } else if (shot.visual.orientation === 'physics') {
                _euler.set(shot.elapsed * (shot.spin ? 16 : 0), 0, shot.elapsed * (shot.spin ? 5 : 0), 'XYZ')
                shot.visual.group.quaternion.setFromEuler(_euler)
            }
            shot.visual.animate?.(shot.elapsed)
            shot.visual.trail?.update(dt, shot.x, shot.y, shot.z)
        }
    }

    const clear = (): void => {
        while (active.length > 0) release(active.length - 1)
    }

    return {
        spawn,
        update,
        clear,
        count: () => active.length,
        setAttackDebugVisible: (visible) => {
            attackDebugVisible = visible
            for (const shot of active) shot.debugBox.visible = visible
        },
        dispose: () => {
            clear()
            visuals.dispose()
        },
    }
}
