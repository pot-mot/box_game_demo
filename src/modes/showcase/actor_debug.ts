import {BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments} from 'three'
import type {Scene} from 'three'
import type {CreatureModel} from '../../entity/character/appearance/types.ts'
import type {HurtBlockProfile} from '../../character/hurt_blocks.ts'
import {worldizeHurtBlock} from '../../character/hurt_blocks.ts'
import {syncHurtDebugBox, syncWeaponDebugBox} from '../../entity/character/combat_vfx/hitbox_debug.ts'
import {ATTACK_HIT_BOX_COLOR, TARGET_HIT_BOX_COLOR} from '../../entity/character/combat_vfx/constants.ts'

/** 展示角色可切换的调试箱种类：物理碰撞箱 / 受击箱 / 攻击箱 */
export const SHOWCASE_DEBUG_KINDS = ['collision', 'hurt', 'attack'] as const
export type ShowcaseDebugKind = typeof SHOWCASE_DEBUG_KINDS[number]

/** 展示角色的调试可视化（默认全隐；每种可独立开关） */
export interface ActorDebug {
    readonly setVisible: (kind: ShowcaseDebugKind, on: boolean) => void
    /** 逐帧同步（在角色动画 / 根姿态写完之后调用） */
    readonly tick: () => void
    readonly dispose: () => void
}

/* 模块级共享的单位立方体棱线与材质（各实例只从场景增删，不销毁共享资源） */
const _unitEdges = new EdgesGeometry(new BoxGeometry(1, 1, 1))
const _hurtMat = new LineBasicMaterial({color: TARGET_HIT_BOX_COLOR})
const _attackMat = new LineBasicMaterial({color: ATTACK_HIT_BOX_COLOR})

/**
 * 为展示角色创建调试箱可视化：
 * - **碰撞箱**：显示模型自带的半胶囊碰撞可视化 mesh（`model.colliderMeshes`）；
 * - **受击箱**：按体形 `hurtProfile` 逐块世界化后的盒线框（跟随关节动画）；
 * - **攻击箱**：当前武器的本地命中箱 OBB 线框（跟随武器模型，所见即所判）。
 */
export const createActorDebug = (
    scene: Scene,
    model: CreatureModel,
    hurtProfile: HurtBlockProfile | undefined,
): ActorDebug => {
    const hurtBoxes: LineSegments[] = []
    const hurtCount = hurtProfile?.length ?? 0
    for (let i = 0; i < hurtCount; i++) {
        const box = new LineSegments(_unitEdges, _hurtMat)
        box.matrixAutoUpdate = false
        box.visible = false
        scene.add(box)
        hurtBoxes.push(box)
    }
    const attackBox = new LineSegments(_unitEdges, _attackMat)
    attackBox.matrixAutoUpdate = false
    attackBox.visible = false
    scene.add(attackBox)
    /* 副手（左手）攻击箱：双持时跟随副手武器模型 */
    const offhandAttackBox = new LineSegments(_unitEdges, _attackMat)
    offhandAttackBox.matrixAutoUpdate = false
    offhandAttackBox.visible = false
    scene.add(offhandAttackBox)

    /* 默认全关：模型自带的碰撞可视化初始隐藏 */
    for (const m of model.colliderMeshes) m.visible = false

    let hurt = false
    let attack = false

    const setVisible = (kind: ShowcaseDebugKind, on: boolean): void => {
        if (kind === 'collision') {
            for (const m of model.colliderMeshes) m.visible = on
        } else if (kind === 'hurt') {
            hurt = on
            if (!on) for (const box of hurtBoxes) box.visible = false
        } else {
            attack = on
            if (!on) {
                attackBox.visible = false
                offhandAttackBox.visible = false
            }
        }
    }

    const tick = (): void => {
        if (!hurt && !attack) return
        model.group.updateWorldMatrix(true, true)
        if (hurt && hurtProfile !== undefined) {
            for (let i = 0; i < hurtProfile.length && i < hurtBoxes.length; i++) {
                const def = hurtProfile[i]
                const box = hurtBoxes[i]
                const joint = model.jointGroups.get(def.jointId)
                if (joint === undefined) {
                    box.visible = false
                    continue
                }
                joint.updateWorldMatrix(true, false)
                syncHurtDebugBox(box, worldizeHurtBlock(def, joint.matrixWorld.elements))
                box.matrixWorldNeedsUpdate = true
                box.visible = true
            }
        }
        /* 攻击箱：仅在确有武器命中箱时才可见（否则隐藏，避免残留单位盒停在原点） */
        if (attack) {
            const mainGroup = model.weaponGroup
            const mainBox = model.weaponHitBox
            if (mainGroup !== null && mainBox !== null) {
                mainGroup.updateWorldMatrix(true, false)
                syncWeaponDebugBox(attackBox, mainGroup.matrixWorld, mainBox.center, mainBox.half)
                attackBox.matrixWorldNeedsUpdate = true
            }
            attackBox.visible = mainGroup !== null && mainBox !== null
            const offGroup = model.offhandWeaponGroup
            const offBox = model.offhandWeaponHitBox
            if (offGroup !== null && offBox !== null) {
                offGroup.updateWorldMatrix(true, false)
                syncWeaponDebugBox(offhandAttackBox, offGroup.matrixWorld, offBox.center, offBox.half)
                offhandAttackBox.matrixWorldNeedsUpdate = true
            }
            offhandAttackBox.visible = offGroup !== null && offBox !== null
        }
    }

    return {
        setVisible,
        tick,
        dispose: () => {
            for (const box of hurtBoxes) scene.remove(box)
            scene.remove(attackBox)
            scene.remove(offhandAttackBox)
        },
    }
}
