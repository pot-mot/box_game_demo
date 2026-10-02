import type {Scene} from 'three'
import {v3Set, type RapVector3} from '../../../physics/rapier_utils.ts'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import {resolvePhases} from '../../../character/combat/attack_phases.ts'
import {createProjectileSystem} from '../projectile/system.ts'

/**
 * 远程开火控制层 —— 只负责「何时开火、朝哪个方向、几发散布」，
 * 弹丸的物理 / 生命期 / 命中 / 爆炸 / 视觉 / 特效全部委托给
 * `entity/character/projectile` 分包（`createProjectileSystem`）。
 *
 * 开火时机 = `release` 阶段开始的那一帧（先拉弓 / 举枪，释放帧才出弹，每段只发射一次）；
 * 弹道水平方向：**玩家 = 瞄准方向（相机前方）**，保证子弹准确飞向玩家对着的方向；
 * 非玩家（AI）= 武器实际朝向（`world.ts` 每帧从武器骨骼采样的 `muzzleDir`），
 * 保留「背身开火按枪口」的既有行为。无相应数据时回退到段起手记录的瞄准方向。
 */

/** 当前段阶段名（无段/阶段用尽时 undefined；开火门控用） */
const activePhaseName = (combat: CombatComponent): string | undefined => {
    const segment = combat.activeSegment
    if (segment === undefined) return undefined
    const phases = resolvePhases(segment.phases)
    return combat.phaseIndex < phases.length ? phases[combat.phaseIndex].name : undefined
}

const _tmpVec: RapVector3 = {x: 0, y: 0, z: 0}

export const createRangedExecutor = (
    shared: SharedWorld,
    scene: Scene,
): SkillExecutor & {
    updateBullets: (dt: number, allCharacters: readonly CharacterEntity[]) => void
    getBulletCount: () => number
    clear: () => void
} => {
    const projectiles = createProjectileSystem(shared, scene)
    const firedThisAttack = new Set<number>()
    const attackDirections = new Map<number, {dx: number; dz: number}>()

    const start = (
        _combat: CombatComponent,
        entity: CharacterEntity,
        direction: RapVector3,
        _ctx: ExecutorContext,
    ): void => {
        firedThisAttack.delete(entity.id)
        attackDirections.set(entity.id, {dx: direction.x, dz: direction.z})
    }

    const update = (
        _dt: number,
        combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        const weapon = combat.weapon
        if (weapon.type !== 'ranged') return

        if (firedThisAttack.has(entity.id) || combat.attackHolding || activePhaseName(combat) !== 'release') return
        firedThisAttack.add(entity.id)

        const dir = attackDirections.get(entity.id)
        const aimReady = Math.hypot(combat.attackDirX, combat.attackDirZ) > 0.001
        const muzzleReady = Math.hypot(combat.muzzleDirX, combat.muzzleDirZ) > 0.001
        /* 玩家：弹道水平方向严格取瞄准方向（相机前方）——玩家以准心瞄准，
         * 不把武器骨骼姿态偏差（各武器可达 ~10°~25°）与上一帧采样延迟带入弹道。
         * 非玩家（AI）：沿用武器实际朝向（`muzzleDir`），保留「背身开火按枪口」的既有行为。
         * 两者都缺数据时回退到段起手记录的瞄准方向。 */
        const useAim = entity.isPlayer && aimReady
        const fallbackDx = dir?.dx ?? combat.attackDirX
        const fallbackDz = dir?.dz ?? combat.attackDirZ
        const ndx = useAim ? combat.attackDirX : (muzzleReady ? combat.muzzleDirX : fallbackDx)
        const ndz = useAim ? combat.attackDirZ : (muzzleReady ? combat.muzzleDirZ : fallbackDz)
        const dirLen = Math.hypot(ndx, ndz)
        const fixedDx = dirLen < 0.001 ? 0 : ndx / dirLen
        const fixedDz = dirLen < 0.001 ? 1 : ndz / dirLen

        const throwAngle = weapon.throwAngle ?? 0
        const spreadCount = weapon.spreadCount ?? 1
        /* 玩家蓄力：把蓄力值交给弹丸系统按武器 charge 曲线缩放速度/伤害/生命期；AI 不蓄力 */
        const chargeProp = entity.isPlayer ? {charge: combat.attackCharge} : {}

        if (spreadCount > 1) {
            const halfSpread = (weapon.spreadAngle ?? 0) / 2
            for (let i = 0; i < spreadCount; i++) {
                const offset = -halfSpread + (i / (spreadCount - 1)) * halfSpread * 2
                const cosOff = Math.cos(offset)
                const sinOff = Math.sin(offset)
                const px = fixedDx * cosOff - fixedDz * sinOff
                const pz = fixedDx * sinOff + fixedDz * cosOff
                v3Set(_tmpVec, px, 0, pz)
                projectiles.spawn({owner: entity, direction: _tmpVec, weapon, throwAngle, ...chargeProp})
            }
        } else {
            v3Set(_tmpVec, fixedDx, 0, fixedDz)
            projectiles.spawn({owner: entity, direction: _tmpVec, weapon, throwAngle, ...chargeProp})
        }
    }

    const end = (
        _combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        attackDirections.delete(entity.id)
    }

    return {
        type: 'ranged',
        start,
        update,
        end,
        updateBullets: (dt, allCharacters) => { projectiles.update(dt, allCharacters) },
        getBulletCount: () => projectiles.count(),
        clear: () => { projectiles.clear() },
    }
}
