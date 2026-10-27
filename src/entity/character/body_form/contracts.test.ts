import {describe, it, expect} from 'vitest'
import type {Group} from 'three'
import {BODY_FORMS, BODY_FORM_IDS, bodyFormOf} from './index.ts'
import {isKnownWeaponId} from '../../../character/weapon/weapon_runtime.ts'
import {validateEquipmentModules} from './common/equipment.ts'
import {resolveBodyFormBase} from './common/base.ts'
import {addDamageProfiles} from '../../../character/combat/defense.ts'
import {EMPTY_EQUIPMENT_STATE} from '../../../character/equipment/types.ts'
import {weaponAttacksOf} from '../../../character/weapon/catalog.ts'
import {orderedSegments} from '../../../character/weapon/attack_chain.ts'
import {DEFAULT_FORM_CLIP_VARIANT} from './common/skeleton_animation/form_animation.ts'
import {BASE_CLIP_STATES} from '../../../character/state_machine/types.ts'
import type {AnimationContext} from '../appearance/types.ts'

/** 场景图节点数（用于验证装备外观挂载 / 卸载） */
const objectCount = (group: Group): number => {
    let count = 0
    group.traverse(() => { count += 1 })
    return count
}

/** 各体形计划的公共不变量（人形 / 狼 / 马 / wyvern 一体验证） */
describe('体形计划公共契约（全部注册体形）', () => {
    it('注册表非空且 bodyFormOf 回退人形', () => {
        /* 人形 / 狼 / 马 / wyvern */
        expect(BODY_FORM_IDS.length).toBeGreaterThanOrEqual(4)
        expect(bodyFormOf(undefined).id).toBe('humanoid')
        expect(bodyFormOf('nope').id).toBe('humanoid')
    })

    for (const id of BODY_FORM_IDS) {
        describe(`体形 ${id}`, () => {
            const form = BODY_FORMS[id]
            const skeleton = form.skeleton.build()
            const jointIds = new Set(skeleton.joints.map(joint => joint.id))

            it('碰撞布局节点均在骨架内', () => {
                expect(form.skeleton.colliderLayout.length).toBeGreaterThan(0)
                for (const spec of form.skeleton.colliderLayout) {
                    expect(jointIds.has(spec.nodeId), spec.nodeId).toBe(true)
                }
            })

            it('骨骼段与关节一样完整声明：头尾关节存在、id 不与关节冲突且长度有效', () => {
                expect(skeleton.bones.length).toBeGreaterThan(0)
                const boneIds = new Set<string>()
                for (const bone of skeleton.bones) {
                    expect(jointIds.has(bone.headJointId), `${bone.id}:head`).toBe(true)
                    expect(jointIds.has(bone.tailJointId), `${bone.id}:tail`).toBe(true)
                    expect(boneIds.has(bone.id), bone.id).toBe(false)
                    expect(jointIds.has(bone.id), `${bone.id} 不应与关节 id 冲突`).toBe(false)
                    expect(bone.length, bone.id).toBeGreaterThanOrEqual(0)
                    boneIds.add(bone.id)
                }
            })

            it('受击子块关节均在骨架内且 id 唯一', () => {
                const ids = form.skeleton.hurtProfile.map(block => block.id)
                expect(new Set(ids).size).toBe(ids.length)
                for (const block of form.skeleton.hurtProfile) {
                    expect(jointIds.has(block.jointId), block.id).toBe(true)
                }
            })

            it('状态基线自洽：尺寸 / 中心偏移 / 眼高', () => {
                expect(form.base.size.width).toBeGreaterThan(0)
                expect(form.base.size.height).toBeGreaterThan(0)
                expect(form.base.size.depth).toBeGreaterThan(0)
                expect(form.base.centerOffsetY).toBeGreaterThanOrEqual(0)
                expect(form.base.eyeHeight).toBeGreaterThan(0)
            })

            it('装备模组与槽位 / 挂载骨骼一致', () => {
                expect(validateEquipmentModules(form.equipSlots, form.equipmentModules)).toEqual([])
            })

            it('最终数值严格按「基础 + 装备」公式计算', () => {
                const weapon = form.weapons[0]!
                const armor = form.armorPieces?.[0]
                const equipment = {
                    weapon: {},
                    armor: armor === undefined ? {} : {[armor.slot]: armor.id},
                    limb: {},
                }
                const final = resolveBodyFormBase(form.base, weapon, equipment, form.id)
                const expectedHealth = typeof form.base.baseHealth === 'function'
                    ? form.base.baseHealth(weapon)
                    : form.base.baseHealth
                expect(final.maxHealth).toBe(expectedHealth)
                expect(final.defense).toEqual(
                    armor === undefined ? form.base.baseDefense : addDamageProfiles(form.base.baseDefense, armor.defense),
                )
                expect(final.attackBonus).toEqual(
                    armor === undefined ? form.base.baseAttack : addDamageProfiles(form.base.baseAttack, armor.attack),
                )
                expect(final.moveSpeedMultiplier).toBeCloseTo(
                    form.base.baseMoveSpeedMultiplier * (armor?.moveSpeedMultiplier ?? 1),
                    10,
                )
                expect(final.poise).toBe(form.base.basePoise + (armor?.poise ?? 0))
            })

            it('每个声明槽位都有可装备内容', () => {
                for (const slot of form.equipSlots) {
                    expect(
                        form.equipmentModules.some(module => module.kind === slot.kind && module.slot === slot.bodyPart),
                        `${form.id}:${slot.kind}:${slot.bodyPart}`,
                    ).toBe(true)
                }
            })

            it('武器表非空且都归属该体形；每个武器槽默认武器为已知 id 且在该体形武器 / 吐息表内', () => {
                expect(form.weapons.length).toBeGreaterThan(0)
                for (const weapon of form.weapons) {
                    expect(weapon.formId, weapon.id).toBe(form.id)
                }
                for (const [slot, weaponId] of Object.entries(form.defaultWeaponLoadout)) {
                    expect(isKnownWeaponId(weaponId), `${form.id}/${slot}`).toBe(true)
                    expect(
                        form.weapons.some(weapon => weapon.id === weaponId)
                        || (form.breathModules ?? []).some(module => module.id === weaponId),
                        `${form.id}/${slot}`,
                    ).toBe(true)
                }
            })

            it('模型可构建、可装配默认武器并释放', () => {
                const model = form.createModel({speed: 3, jumpHeight: 2, scale: 1}, 0)
                expect(model.jointGroups.size).toBeGreaterThan(0)
                model.equipWeapon({main: undefined})
                model.dispose()
            })

            it('装备外观真实挂载到场景图，清空装备后完全卸载', () => {
                const model = form.createModel({speed: 3, jumpHeight: 2, scale: 1}, 0)
                const armor = form.armorPieces?.[0]
                const limb = form.limbPieces?.[0]
                const state = {
                    weapon: {},
                    armor: armor === undefined ? {} : {[armor.slot]: armor.id},
                    limb: limb === undefined ? {} : {[limb.slot]: limb.id},
                }
                expect(model.equipEquipmentState, form.id).toBeDefined()
                const empty = objectCount(model.group)
                model.equipEquipmentState?.(state)
                if (armor !== undefined || limb !== undefined) {
                    expect(objectCount(model.group), form.id).toBeGreaterThan(empty)
                }
                model.equipEquipmentState?.(EMPTY_EQUIPMENT_STATE)
                expect(objectCount(model.group), form.id).toBe(empty)
                model.dispose()
            })

            it('动画 provider 同时提供运行时系统与编辑器预览 clip', () => {
                const system = form.animation.createSystem({})
                expect(typeof system.update).toBe('function')

                const base = form.animation.previewClip({
                    kind: 'base',
                    state: 'idle',
                    variant: DEFAULT_FORM_CLIP_VARIANT,
                })
                expect(base.duration, `${form.id}:idle`).toBeGreaterThan(0)

                const weapon = form.weapons[0]!
                const segment = orderedSegments(weaponAttacksOf(weapon, weapon.attackModules[0]!.id))[0]
                expect(segment, form.id).toBeDefined()
                const attack = form.animation.previewClip({
                    kind: 'attack',
                    segment: segment!,
                    variant: DEFAULT_FORM_CLIP_VARIANT,
                })
                expect(attack.duration, `${form.id}:attack`).toBeGreaterThan(0)
            })
        })
    }
})

/** 全部体形 / 全部基础状态：状态过渡混合不得移动根关节（否则编辑模式战斗会闪回出生点） */
describe('动画状态过渡：根关节不参与混合', () => {
    const ctx = (stateTime: number, attackSegment?: AnimationContext['attackSegment']): AnimationContext => ({
        stateTime,
        horizontalSpeed: 0,
        attackSegment,
        attackPhase: undefined,
        attackPhaseProgress: 0,
        attackTotalProgress: 0.2,
        attackPhaseIndex: 0,
        attackCharge: 0,
        attackHolding: false,
        weaponHeld: false,
    })

    for (const id of BODY_FORM_IDS) {
        it(id, () => {
            const form = BODY_FORMS[id]
            const model = form.createModel({speed: 3, jumpHeight: 2, scale: 1}, 0)
            const root = model.jointGroups.get('root')
            if (root === undefined) throw new Error(`${id} 缺少 root 关节`)
            const system = form.animation.createSystem({})

            root.position.set(5, 0, 5)
            system.update(1 / 60, model, 'idle', ctx(0))
            for (const state of BASE_CLIP_STATES) {
                /* 第一次 update 建立该状态快照；随后模拟物理把根移到新位置，混合不能再把它拉回快照 */
                root.position.set(6, 0, 6)
                system.update(1 / 60, model, state, ctx(0.2))
                root.position.set(7, 0, 7)
                system.update(1 / 60, model, state, ctx(0.25))
                expect(root.position.x, `${id}:${state}:x`).toBeCloseTo(7)
                expect(root.position.z, `${id}:${state}:z`).toBeCloseTo(7)
            }

            /* 攻击动作同样走同一快照函数：验证攻击状态切换也不移动根关节 */
            const weapon = form.weapons[0]!
            const segment = orderedSegments(weaponAttacksOf(weapon, weapon.attackModules[0]!.id))[0]
            if (segment !== undefined) {
                root.position.set(6, 0, 6)
                system.update(1 / 60, model, 'attacking', ctx(0, segment))
                root.position.set(7, 0, 7)
                system.update(1 / 60, model, 'attacking', ctx(0.02, segment))
                expect(root.position.x, `${id}:attacking:x`).toBeCloseTo(7)
                expect(root.position.z, `${id}:attacking:z`).toBeCloseTo(7)
            }
            model.dispose()
        })
    }
})
