import {type Scene} from 'three'
import {Body, BODY_TYPES, Cylinder, Sphere, Vec3} from 'cannon-es'
import type {SharedWorld} from '../../../physics/world.ts'
import type {PlayerConfig, PlayerEntity} from '../types'
import {createPlayerMesh} from '../render'
import {DEFAULT_PLAYER_CONFIG, PLAYER_COLLISION_GROUP, PLAYER_COLLISION_MASK} from '../constants.ts'
import {PLAYER_LINEAR_DAMPING} from './constants.ts'

export interface PlayerContext {
    getPlayer: () => PlayerEntity | undefined
    spawn: (x: number, y: number, z: number, config?: PlayerConfig) => PlayerEntity
    remove: () => void
    syncPositions: () => void
    move: (dx: number, dz: number) => void
    jump: () => void
}

/** 创建玩家物理实体和网格 */
export const setupPlayer = (scene: Scene, shared: SharedWorld): PlayerContext => {
    const {world} = shared
    let player: PlayerEntity | undefined
    let nextId = 1

    const spawn = (x: number, y: number, z: number, config?: PlayerConfig): PlayerEntity => {
        const cfg = config ?? DEFAULT_PLAYER_CONFIG
        const mesh = createPlayerMesh(cfg)
        mesh.position.set(x, y, z)
        scene.add(mesh)

        // 胶囊体：Cylinder + 上下两个 Sphere
        const body = new Body({
            mass: 1,
            type: BODY_TYPES.DYNAMIC,
            linearDamping: PLAYER_LINEAR_DAMPING,
            fixedRotation: true,
            collisionFilterGroup: PLAYER_COLLISION_GROUP,
            collisionFilterMask: PLAYER_COLLISION_MASK,
        })

        const r = cfg.radius
        const cylH = cfg.height - r * 2
        // 柱体居中
        body.addShape(new Cylinder(r, r, cylH, 8), new Vec3(0, 0, 0))
        // 上半球
        body.addShape(new Sphere(r), new Vec3(0, cylH / 2, 0))
        // 下半球
        body.addShape(new Sphere(r), new Vec3(0, -cylH / 2, 0))

        body.position.set(x, y, z)
        world.addBody(body)

        const id = nextId++
        player = {id, config: cfg, mesh, body, rowText: `Player #${id}`}
        return player
    }

    const remove = (): void => {
        if (!player) return
        scene.remove(player.mesh)
        world.removeBody(player.body)
        player.mesh.geometry.dispose()
        const mat = player.mesh.material
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat.dispose()
        player = undefined
    }

    const syncPositions = (): void => {
        if (!player) return
        player.mesh.position.set(player.body.position.x, player.body.position.y, player.body.position.z)
        player.mesh.quaternion.identity()
    }

    const getPlayer = (): PlayerEntity | undefined => player

    // 移动：沿水平方向施加速度（保留重力 y）
    const move = (dx: number, dz: number): void => {
        if (!player) return
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.001) {
            // 无输入时缓慢减速
            player.body.velocity.x *= 0.85
            player.body.velocity.z *= 0.85
            return
        }
        const speed = player.config.speed
        player.body.velocity.x = (dx / len) * speed
        player.body.velocity.z = (dz / len) * speed
    }

    // 跳跃：仅在接近地面时允许
    const jump = (): void => {
        if (!player) return
        if (Math.abs(player.body.velocity.y) > 0.05) return
        const jumpVel = Math.sqrt(2 * 9.82 * player.config.jumpHeight)
        player.body.velocity.y = jumpVel
    }

    return {getPlayer, spawn, remove, syncPositions, move, jump}
}
