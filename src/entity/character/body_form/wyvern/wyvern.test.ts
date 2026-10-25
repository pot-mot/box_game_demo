import {describe, it, expect} from 'vitest'
import {Mesh} from 'three'
import {BASE_CLIP_STATES} from '../../../../character/state_machine/types.ts'
import {findWeaponPreset, weaponAttacksOf} from '../../../../character/weapon/catalog.ts'
import {breathModuleOf} from '../../../../character/weapon/breath_module.ts'
import {composeClawAndBreath} from '../../../../character/combat/breath_runtime.ts'
import {createCombatComponent, setCombatAttackModule, setCombatBreath, setCombatWeapon} from '../../../../character/combat/types.ts'
import {createWeaponRuntime} from '../../../../character/weapon/weapon_runtime.ts'
import {bodyFormOf, isKnownBodyFormId} from '../../body_form/index.ts'
import {WYVERN_BODY_FORM} from './body_form.ts'
import {buildWyvernSkeleton, WYVERN_COLLIDER_LAYOUT} from './skeleton/skeleton.ts'
import {wyvernAttackClip, wyvernBaseClip} from './skeleton_animation/clips.ts'
import {WYVERN_BREATH_MODULES} from './equipment/breath.ts'
import {wyvernAttackPose, wyvernPose} from './skeleton_animation/pose_fns.ts'
import {isPoseWithPosition, type JointPose} from '../common/creature_runtime/pose.ts'
import {createBoneAnimationPlayer} from '../../../../skeleton/anim/player.ts'
import {createCharacterSkeletonBridge} from '../../appearance/skeleton_bridge.ts'

const STATES = BASE_CLIP_STATES

describe('双足飞龙体形（forms/wyvern）', () => {
    it('骨架含翼爪 / 四翼指 / 四节尾', () => {
        expect(isKnownBodyFormId('wyvern')).toBe(true)
        expect(bodyFormOf('wyvern')).toBe(WYVERN_BODY_FORM)
        const ids = new Set(buildWyvernSkeleton().joints.map(joint => joint.id))
        for (const id of [
            'wingLClaw', 'wingRClaw', 'wingLFingerA', 'wingLFingerD', 'wingRFingerA',
            'tailC', 'tailD', 'mouthMount',
        ]) {
            expect(ids.has(id), id).toBe(true)
        }
    })

    it('碰撞布局：足底主胶囊 + 随躯干/头部旋转的贴合碰撞体', () => {
        const definition = buildWyvernSkeleton()
        const ids = new Set(definition.joints.map(joint => joint.id))
        expect(WYVERN_COLLIDER_LAYOUT[0]?.nodeId).toBe('groundCollider')
        expect(WYVERN_COLLIDER_LAYOUT[0]?.kind).toBe('capsule')
        for (const collider of WYVERN_COLLIDER_LAYOUT) expect(ids.has(collider.nodeId), collider.nodeId).toBe(true)
        expect(definition.joints.find(joint => joint.id === 'bodyCollider')?.parentId).toBe('body')
        expect(definition.joints.find(joint => joint.id === 'headCollider')?.parentId).toBe('head')
    })

    it('放松 / 移动时双前爪保持分居两侧，普通攻击不越过身体中线', () => {
        const model = WYVERN_BODY_FORM.createModel({speed: 3, jumpHeight: 1, scale: 1}, 0)
        const bridge = createCharacterSkeletonBridge(model)
        const clawX = (id: string): number => bridge.getWorldPosition(id)?.x ?? Number.NaN

        for (const state of ['idle', 'walking', 'floating', 'jumping', 'falling'] as const) {
            const player = createBoneAnimationPlayer(bridge, wyvernBaseClip(state))
            for (const ratio of [0, 0.25, 0.5, 0.75]) {
                player.seek(wyvernBaseClip(state).duration * ratio)
                bridge.updateWorldTransforms()
                expect(clawX('wingLClaw'), state).toBeLessThan(-0.2)
                expect(clawX('wingRClaw'), state).toBeGreaterThan(0.2)
            }
        }

        const weapon = findWeaponPreset('wyvern_claw')
        if (weapon === undefined) throw new Error('龙爪未注册')
        const attacks = weaponAttacksOf(weapon)
        /* 甩尾段整体旋转 360°，双爪随身体交换左右，不作为中线约束样本 */
        const segments = [
            ...attacks.chains.light.steps.slice(0, 3).map(id => attacks.segments[id]!),
            attacks.segments[attacks.chains.light.steps[4]!]!,
            ...attacks.chains.air.steps.map(id => attacks.segments[id]!),
        ]
        for (const segment of segments) {
            const clip = wyvernAttackClip(segment)
            const player = createBoneAnimationPlayer(bridge, clip)
            for (let t = 0; t <= clip.duration; t += clip.duration / 12) {
                player.seek(t)
                bridge.updateWorldTransforms()
                expect(clawX('wingLClaw'), segment.id).toBeLessThan(-0.05)
                expect(clawX('wingRClaw'), segment.id).toBeGreaterThan(0.05)
            }
        }
        model.dispose()
    })

    it('翅膜由骨骼驱动：翼指转动后膜面顶点跟随拉伸', () => {
        const model = WYVERN_BODY_FORM.createModel({speed: 3, jumpHeight: 1, scale: 1}, 0)
        expect(model.updateDeform).toBeDefined()
        const membranes: Mesh[] = []
        model.group.traverse(object => {
            if (object instanceof Mesh && object.userData.deform === 'wing_membrane') membranes.push(object)
        })
        expect(membranes).toHaveLength(2)
        const geometry = membranes[0]!.geometry
        const before = Array.from(geometry.getAttribute('position').array as Float32Array)
        for (const fingerId of ['wingLFingerA', 'wingRFingerA']) {
            const finger = model.jointGroups.get(fingerId)
            if (finger === undefined) throw new Error(`缺少翼指关节 ${fingerId}`)
            finger.rotation.x += 0.6
            finger.rotation.z += 0.3
        }
        model.updateDeform!()
        const after = Array.from(geometry.getAttribute('position').array as Float32Array)
        expect(after.every(Number.isFinite)).toBe(true)
        expect(after.some((value, index) => Math.abs(value - before[index]!) > 1e-4)).toBe(true)
        model.dispose()
    })

    it('爪击轻击为完整五段，命中挂点按爪 / 口 / 尾 / 双爪切换；爪模组重击为重爪', () => {
        const weapon = findWeaponPreset('wyvern_claw')
        if (weapon === undefined) throw new Error('龙爪未注册')
        const attacks = weaponAttacksOf(weapon)
        expect(attacks.chains.light.steps).toHaveLength(5)
        expect(attacks.chains.heavy.steps).toHaveLength(1)
        expect(attacks.chains.heavy.steps[0]).toBe('wyvern_claw_claw_heavy_1')
        expect(attacks.chains.air.steps).toHaveLength(2)
        const segments = attacks.chains.light.steps.map(id => attacks.segments[id]!)
        expect(segments[0]?.hitMountJointIds).toEqual(['wingRWrist', 'wingRClaw'])
        expect(segments[1]?.hitMountJointIds).toEqual(['wingLWrist', 'wingLClaw'])
        expect(segments[2]?.hitMountJointIds).toEqual(['mouthMount', 'jaw'])
        expect(segments[3]?.hitMountJointIds).toEqual(['tailC', 'tailD'])
        expect(segments[4]?.hitMountJointIds?.length).toBe(4)
    })


    it('爪模组包含重爪段与完整命中关节', () => {
        const weapon = findWeaponPreset('wyvern_claw')
        if (weapon === undefined) throw new Error('龙爪未注册')
        expect(weapon.attackModules.map(module => module.id)).toEqual(['claw', 'breath'])
        const attacks = weaponAttacksOf(weapon)
        const heavy = attacks.segments[attacks.chains.heavy.steps[0]!]!
        expect(heavy.id).toBe('wyvern_claw_claw_heavy_1')
        expect(heavy.hitMountJointIds).toEqual(['wingLWrist', 'wingRWrist', 'wingLClaw', 'wingRClaw'])
        expect(wyvernAttackClip(heavy).duration).toBeGreaterThan(0)
    })

    it('三件吐息模组已注册，且装备槽只对 wyvern 开放', () => {
        expect(WYVERN_BREATH_MODULES.map(m => m.breathKind).sort()).toEqual(['fireball', 'fireball', 'laser', 'lightning'])
        expect(breathModuleOf('breath_fireball')?.breathKind).toBe('fireball')
        expect(breathModuleOf('breath_lightning')?.breathKind).toBe('lightning')
        expect(breathModuleOf('breath_laser')?.breathKind).toBe('laser')
        expect(WYVERN_BODY_FORM.equipSlots.some(slot => slot.kind === 'weapon' && slot.bodyPart === 'breath')).toBe(true)
        expect(bodyFormOf('wolf').equipSlots.some(slot => slot.kind === 'weapon' && slot.bodyPart === 'breath')).toBe(false)
    })

    it('装备吐息后组合出 heavy 链，并把段映射到吐息模组', () => {
        const weapon = findWeaponPreset('wyvern_claw')
        if (weapon === undefined) throw new Error('龙爪未注册')
        const claw = weaponAttacksOf(weapon)
        const module = breathModuleOf('breath_lightning')
        if (module === undefined) throw new Error('雷电吐息未注册')
        const composed = composeClawAndBreath(claw, {module, attacks: weaponAttacksOf(module)})
        expect(composed.attacks.chains.light.steps).toHaveLength(5)
        expect(composed.attacks.chains.heavy.steps).toHaveLength(1)
        const heavyId = composed.attacks.chains.heavy.steps[0]!
        expect(composed.attackWeapons.get(heavyId)?.id).toBe('breath_lightning')
        expect(composed.attacks.segments[heavyId]?.attackWeaponId).toBe('breath_lightning')
    })

    it('换武器 / 持握模式重建运行时后仍保留吐息重击链', () => {
        const module = breathModuleOf('breath_fireball')
        if (module === undefined) throw new Error('火球吐息未注册')
        const runtime = createWeaponRuntime('wyvern_claw')
        const combat = createCombatComponent(runtime, 0, () => true, {tendencyId: 'hostileExceptSelf'}, 18)
        setCombatBreath(combat, {module, attacks: weaponAttacksOf(module)})
        expect(setCombatAttackModule(combat, 'breath')).toBe(true)
        expect(combat.attacks.chains.heavy.steps).toHaveLength(1)

        /* 模拟面板 / 模组切换：整体替换主武器运行时后仍保留当前 breath 模组 */
        setCombatWeapon(combat, createWeaponRuntime('wyvern_claw'))
        expect(setCombatAttackModule(combat, 'breath')).toBe(true)
        expect(combat.attacks.chains.heavy.steps).toHaveLength(1)
        expect(combat.attackWeapons.get(combat.attacks.chains.heavy.steps[0]!)?.id).toBe('breath_fireball')
    })

    it('基础 / 攻击 clip 可烘焙，五段各自产生独立 clip', () => {
        for (const state of STATES) {
            expect(wyvernBaseClip(state).duration, state).toBeGreaterThan(0)
        }
        const weapon = findWeaponPreset('wyvern_claw')
        if (weapon === undefined) throw new Error('龙爪未注册')
        const attacks = weaponAttacksOf(weapon)
        const clips = attacks.chains.light.steps.map(id => wyvernAttackClip(attacks.segments[id]!))
        expect(clips).toHaveLength(5)
        expect(new Set(clips.map(clip => clip.name)).size).toBe(5)
        for (const clip of clips) expect(clip.jointTracks.length).toBeGreaterThan(0)
    })

    it('每个攻击 clip 覆盖完整骨架（不出现骨骼轨道丢失）', () => {
        const weapon = findWeaponPreset('wyvern_claw')
        if (weapon === undefined) throw new Error('龙爪未注册')
        const attacks = weaponAttacksOf(weapon)
        const jointIds = new Set(buildWyvernSkeleton().joints.map(joint => joint.id))
        const segments = [
            ...attacks.chains.light.steps.map(id => attacks.segments[id]!),
            ...attacks.chains.air.steps.map(id => attacks.segments[id]!),
        ]
        for (const segment of segments) {
            const clip = wyvernAttackClip(segment)
            const covered = new Set(clip.jointTracks.map(track => track.targetId))
            expect([...jointIds].filter(id => !covered.has(id)), segment.id).toEqual([])
        }
    })

    it('翼击起手首帧回到 idle 姿态，且前摇肘关节不反折', () => {
        const weapon = findWeaponPreset('wyvern_claw')
        if (weapon === undefined) throw new Error('龙爪未注册')
        const attacks = weaponAttacksOf(weapon)
        const idle = wyvernPose('idle')(0, 1)
        const eulerOf = (pose: JointPose): readonly [number, number, number] =>
            isPoseWithPosition(pose) ? pose.rotation : pose
        const segments = [
            ...attacks.chains.light.steps.slice(0, 2).map(id => attacks.segments[id]!),
            attacks.segments[attacks.chains.light.steps[4]!]!,
            ...attacks.chains.air.steps.map(id => attacks.segments[id]!),
        ]
        for (const segment of segments) {
            const start = wyvernAttackPose(segment)(0, segment.duration + segment.recovery)
            for (const [jointId, pose] of Object.entries(start)) {
                const idlePose = idle[jointId]
                if (idlePose === undefined) continue
                const startRotation = eulerOf(pose)
                const idleRotation = eulerOf(idlePose)
                for (let axis = 0; axis < 3; axis++) {
                    expect(Math.abs(startRotation[axis]! - idleRotation[axis]!), `${segment.id}:${jointId}`).toBeLessThan(1e-6)
                }
            }
        }
        /* 前摇/挥击中翼肘不能大幅向反方向折（原实现 +0.72rad 会导致前臂穿入躯干） */
        for (const segment of segments) {
            const pose = wyvernAttackPose(segment)(segment.duration * 0.45, segment.duration + segment.recovery)
            for (const jointId of ['wingLElbow', 'wingRElbow']) {
                const elbow = pose[jointId]
                if (elbow === undefined) continue
                expect(Math.abs(eulerOf(elbow)[0]), `${segment.id}:${jointId}`).toBeLessThan(0.3)
            }
        }
    })

    it('甩尾 / 翼击 / 吐息收招时清除尾部与躯干残留', () => {
        const weapon = findWeaponPreset('wyvern_claw')
        if (weapon === undefined) throw new Error('龙爪未注册')
        const attacks = weaponAttacksOf(weapon)
        const normalise = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle))
        const yawOf = (pose: JointPose): number => isPoseWithPosition(pose) ? pose.rotation[1] : pose[1]
        const endPoseOf = (id: string) => {
            const segment = attacks.segments[id]!
            const total = segment.duration + segment.recovery
            return wyvernAttackPose(segment)(total, total)
        }

        const tailEnd = endPoseOf(attacks.chains.light.steps[3]!)
        expect(Math.abs(normalise(yawOf(tailEnd.body!)))).toBeLessThan(1e-6)
        const idle = wyvernPose('idle')(0, 1)
        for (const id of ['tailA', 'tailB', 'tailC', 'tailD']) {
            expect(yawOf(tailEnd[id]!), id).toBeCloseTo(yawOf(idle[id]!), 6)
        }

        const clawEnd = endPoseOf(attacks.chains.light.steps[0]!)
        expect(Math.abs(yawOf(clawEnd.body!))).toBeLessThan(1e-6)

        const module = breathModuleOf('breath_laser')
        if (module === undefined) throw new Error('激光吐息未注册')
        const breathAttacks = weaponAttacksOf(module)
        const breath = breathAttacks.segments[breathAttacks.chains.heavy.steps[0]!]!
        const breathEnd = wyvernAttackPose(breath)(breath.duration + breath.recovery, breath.duration + breath.recovery)
        expect(yawOf(breathEnd.jaw!)).toBeCloseTo(0, 6)
    })
})
