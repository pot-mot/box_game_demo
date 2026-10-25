import type {Scene} from 'three'
import type {CreatureModel} from '../appearance/types.ts'
import type {WorldHurtBlock} from '../../../character/hurt_blocks.ts'
import type {CharacterDebugView as CharacterDebugViewKind} from '../../../character/debug_views.ts'
import type {MeleeDetectBoxSpec} from '../../../character/weapon/melee_weapon.ts'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP} from '../ai/constants.ts'
import {
    createAttackHitBoxes,
    syncHurtDebugBox,
    syncWeaponDebugBox,
    type AttackHitBoxes,
} from '../combat_vfx/hitbox_debug.ts'

/** 受击箱回退（无受击子块时使用的整体身体盒） */
export interface DebugHurtFallback {
    readonly x: number
    readonly y: number
    readonly z: number
    readonly yaw: number
    readonly halfX: number
    readonly halfY: number
    readonly halfZ: number
}

/** 攻击箱同步参数 */
export interface DebugAttackOptions {
    readonly ranged: boolean
    readonly offhandEnabled: boolean
    readonly projectileRadius: number
}

/** 视线扇形目标点 */
export interface DebugVisionTarget {
    readonly x: number
    readonly y: number
    readonly z: number
}

/**
 * 角色调试可视化基本能力（character 渲染层）：
 * 碰撞箱 / 攻击箱 / 受击箱 / 攻击检测区 / 视线扇形。
 * 各模式只负责按自身开关调用 `setVisible` 并提供当前帧数据，不再各自复制线框与同步逻辑。
 */
export interface CharacterDebugView {
    readonly hitBoxes: AttackHitBoxes
    /** 体形切换后更新模型引用 */
    setModel: (model: CreatureModel) => void
    setVisible: (view: CharacterDebugViewKind, visible: boolean) => void
    isVisible: (view: CharacterDebugViewKind) => boolean
    /** 攻击命中窗口：激活时攻击箱 100% 不透明，否则半透明 */
    setAttackActive: (active: boolean) => void
    /** 双手共持时副手挂背，不显示副手攻击箱 */
    setOffhandAttackEnabled: (enabled: boolean) => void
    /** 同步受击箱；无受击子块时回退到 fallback 身体盒（fallback 省略则隐藏） */
    syncHurt: (blocks: readonly (WorldHurtBlock | undefined)[] | undefined, fallback?: DebugHurtFallback) => void
    /** 同步武器攻击箱与远程弹丸预览 */
    syncAttack: (options: DebugAttackOptions) => void
    /** 同步攻击检测区（近战检测箱 / 远程射程圆环） */
    syncDetect: (meleeBoxes: readonly MeleeDetectBoxSpec[] | undefined, range: number | undefined, x: number, y: number, z: number) => void
    /** 同步视线扇形；distances 由调用方的 LOS 扫描写入，省略时使用完整半径 */
    syncVision: (
        x: number, eyeY: number, z: number,
        yaw: number, length: number,
        distances?: Float32Array,
        target?: DebugVisionTarget,
    ) => void
    dispose: () => void
}

const syncWeaponBoxes = (
    model: CreatureModel,
    boxes: readonly import('../../../character/weapon/mesh_config.ts').WeaponAttackBoxSpec[],
    targets: readonly import('three').LineSegments[],
    show: boolean,
): void => {
    for (let i = 0; i < targets.length; i++) {
        const spec = boxes[i]
        if (!show || spec === undefined) { targets[i].visible = false; continue }
        const joint = model.jointGroups.get(spec.jointId)
        if (joint === undefined) { targets[i].visible = false; continue }
        joint.updateWorldMatrix(true, false)
        syncWeaponDebugBox(targets[i], joint.matrixWorld, spec.center, spec.half, spec.rotation)
        targets[i].visible = true
    }
}

const syncDetectBoxes = (
    model: CreatureModel,
    boxes: readonly MeleeDetectBoxSpec[],
    targets: readonly import('three').LineSegments[],
    show: boolean,
): void => {
    for (let i = 0; i < targets.length; i++) {
        const spec = boxes[i]
        if (!show || spec === undefined) { targets[i].visible = false; continue }
        const joint = model.jointGroups.get(spec.jointId)
        if (joint === undefined) { targets[i].visible = false; continue }
        joint.updateWorldMatrix(true, false)
        syncWeaponDebugBox(targets[i], joint.matrixWorld, spec.offset, {
            x: spec.size.x / 2, y: spec.size.y / 2, z: spec.size.z / 2,
        }, spec.rotation)
        targets[i].visible = true
    }
}

/** 创建单个角色的调试可视化（初始全部隐藏） */
export const createCharacterDebugView = (scene: Scene, model: CreatureModel): CharacterDebugView => {
    const hitBoxes = createAttackHitBoxes(scene)
    const visible: Record<CharacterDebugViewKind, boolean> = {
        collision: false,
        attack: false,
        hurt: false,
        detect: false,
        vision: false,
    }
    let currentModel = model
    let offhandAttackEnabled = true

    const applyCollisionVisibility = (): void => {
        for (const mesh of currentModel.colliderMeshes) mesh.visible = visible.collision
    }
    applyCollisionVisibility()

    const hideHurt = (): void => {
        hitBoxes.targetBox.visible = false
        for (const box of hitBoxes.hurtBoxes) box.visible = false
    }
    const hideAttack = (): void => {
        for (const box of hitBoxes.weaponBoxes) box.visible = false
        for (const box of hitBoxes.offhandWeaponBoxes) box.visible = false
        hitBoxes.projectileBox.visible = false
    }
    const hideDetect = (): void => {
        for (const box of hitBoxes.detectBoxes) box.visible = false
        hitBoxes.rangeRing.visible = false
    }

    return {
        hitBoxes,
        setModel: (next) => {
            currentModel = next
            applyCollisionVisibility()
        },
        setVisible: (view, on) => {
            visible[view] = on
            if (view === 'collision') applyCollisionVisibility()
            if (view === 'hurt' && !on) hideHurt()
            if (view === 'attack' && !on) hideAttack()
            if (view === 'detect' && !on) hideDetect()
            if (view === 'vision' && !on) hitBoxes.visionFan.visible = false
        },
        isVisible: (view) => visible[view],
        setAttackActive: (active) => hitBoxes.setAttackActive(active),
        setOffhandAttackEnabled: (enabled) => {
            offhandAttackEnabled = enabled
            if (!enabled) for (const box of hitBoxes.offhandWeaponBoxes) box.visible = false
        },
        syncHurt: (blocks, fallback) => {
            if (!visible.hurt) { hideHurt(); return }
            if (blocks !== undefined && blocks.length > 0) {
                hitBoxes.targetBox.visible = false
                for (let i = 0; i < hitBoxes.hurtBoxes.length; i++) {
                    const box = hitBoxes.hurtBoxes[i]
                    const block = blocks[i]
                    if (block === undefined) { box.visible = false; continue }
                    syncHurtDebugBox(box, block)
                    box.visible = true
                }
                return
            }
            if (fallback === undefined) { hideHurt(); return }
            hitBoxes.targetBox.position.set(fallback.x, fallback.y, fallback.z)
            hitBoxes.targetBox.scale.set(fallback.halfX * 2, fallback.halfY * 2, fallback.halfZ * 2)
            hitBoxes.targetBox.rotation.y = fallback.yaw
            hitBoxes.targetBox.visible = true
            for (const box of hitBoxes.hurtBoxes) box.visible = false
        },
        syncAttack: (options) => {
            if (!visible.attack) { hideAttack(); return }
            syncWeaponBoxes(currentModel, currentModel.weaponAttackBoxes, hitBoxes.weaponBoxes, true)
            syncWeaponBoxes(
                currentModel,
                currentModel.offhandWeaponAttackBoxes ?? [],
                hitBoxes.offhandWeaponBoxes,
                offhandAttackEnabled,
            )
            const weaponGroup = currentModel.weaponGroup
            if (options.ranged && weaponGroup !== null) {
                weaponGroup.updateWorldMatrix(true, false)
                const previewBox = currentModel.weaponAttackBoxes[0]
                const center = previewBox?.center ?? {x: 0, y: 0, z: 0}
                syncWeaponDebugBox(hitBoxes.projectileBox, weaponGroup.matrixWorld, center, {
                    x: options.projectileRadius, y: options.projectileRadius, z: options.projectileRadius,
                })
                hitBoxes.projectileBox.visible = true
            } else {
                hitBoxes.projectileBox.visible = false
            }
        },
        syncDetect: (meleeBoxes, range, x, y, z) => {
            if (!visible.detect) { hideDetect(); return }
            if (meleeBoxes !== undefined) {
                syncDetectBoxes(currentModel, meleeBoxes, hitBoxes.detectBoxes, true)
            } else {
                for (const box of hitBoxes.detectBoxes) box.visible = false
            }
            if (range !== undefined) {
                hitBoxes.rangeRing.position.set(x, y, z)
                hitBoxes.rangeRing.scale.set(range, 1, range)
                hitBoxes.rangeRing.visible = true
            } else {
                hitBoxes.rangeRing.visible = false
            }
        },
        syncVision: (x, eyeY, z, yaw, length, distances, target) => {
            if (!visible.vision) { hitBoxes.visionFan.visible = false; return }
            const vp = hitBoxes.visionPositions
            let p = 0
            for (let i = 0; i < VISION_FAN_RAY_COUNT; i++) {
                const a = yaw - VISION_FAN_HALF_ANGLE + i * VISION_FAN_RAY_STEP
                const r = distances !== undefined ? Math.min(distances[i], length) : length
                vp[p++] = x; vp[p++] = eyeY; vp[p++] = z
                vp[p++] = x + Math.sin(a) * r; vp[p++] = eyeY; vp[p++] = z + Math.cos(a) * r
            }
            vp[p++] = x; vp[p++] = eyeY; vp[p++] = z
            if (target !== undefined) {
                vp[p++] = target.x; vp[p++] = target.y; vp[p++] = target.z
            } else {
                vp[p++] = x; vp[p++] = eyeY; vp[p++] = z
            }
            hitBoxes.markVisionDirty()
            hitBoxes.visionFan.visible = true
        },
        dispose: () => hitBoxes.dispose(),
    }
}
