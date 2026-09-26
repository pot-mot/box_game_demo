import type {StateHandler} from '../types.ts'

export const DYING_DURATION = 0.6

/** 倒下时长（秒）：与死亡 clip 的动作时长一致（0 → 90°），之后保持倒地直到死亡计时结束 */
export const DYING_FALL_DURATION = 0.3

/** 缓动（easeInOutQuad，与原死亡 clip 的根旋转一致） */
const easeInOutQuad = (p: number): number =>
    p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2

/**
 * 死亡状态：角色保持死亡 clip 的直立姿态，**倒地方向由最后受击的冲击方向决定**。
 * 近战 / 远程 / 爆炸伤害事件携带 `dirX` / `dirZ`（世界水平单位向量），world.ts 存入
 * `combat.lastHitDirX/Z`；本状态在进入时取该方向（无记录时默认沿面朝方向向后倒），
 * 并按 `DYING_FALL_DURATION` 推进 `dyingFallAngle`（0 → π/2）。
 * 世界层按「上 × 倒向」轴把模型旋转该角度（叠加最后朝向），因此放置/游玩模式
 * 能按受击方向倒地，骨骼编辑器预览的 clip 仍为直立姿态。
 */
export const dyingHandler: StateHandler = {
    enter: (entity) => {
        entity.combat.attackActive = false
        entity.body.setLinvel({x: 0, y: 0, z: 0}, true)
        /* 倒下方向 = 最后受击冲击方向（来源 → 受击者）；无记录时默认向后倒（沿面朝反方向） */
        const {lastHitDirX, lastHitDirZ} = entity.combat
        const len = Math.hypot(lastHitDirX, lastHitDirZ)
        if (len > 1e-3) {
            entity.dyingFallDirX = lastHitDirX / len
            entity.dyingFallDirZ = lastHitDirZ / len
        } else {
            const yaw = entity.appearanceGroup.rotation.y
            entity.dyingFallDirX = -Math.sin(yaw)
            entity.dyingFallDirZ = -Math.cos(yaw)
        }
        entity.dyingFallAngle = 0
    },
    update: (dt, _input, entity) => {
        entity.body.setLinvel({x: 0, y: 0, z: 0}, true)
        if (!entity.isDying) {
            entity.isDying = true
            entity.dyingTimer = 0
        }
        entity.dyingTimer = (entity.dyingTimer ?? 0) + dt
        const progress = Math.min(Math.max(entity.dyingTimer / DYING_FALL_DURATION, 0), 1)
        entity.dyingFallAngle = Math.PI / 2 * easeInOutQuad(progress)
        if (entity.dyingTimer >= DYING_DURATION) {
            entity.combat.isDead = true
        }
    },
    exit: () => {},
    transitions: [],
}
