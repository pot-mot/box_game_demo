import {describe, it, expect, beforeAll, vi} from 'vitest'
import {BODY_FORMS, BODY_FORM_IDS, bodyFormOf} from '../body_form/index.ts'
import {isKnownWeaponId} from '../../../character/weapon/weapon_runtime.ts'

/** happy-dom 无 canvas 2d：注入桩使人形头部纹理生成可在测试下运行（与 base_clips.test 同法） */
const stubCanvas2d = (): void => {
    const fakeCtx = new Proxy({}, {
        get: (_t, prop) => (prop === 'canvas' ? null : (): void => {}),
        set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const el = originalCreate(tag, options)
        if (tag === 'canvas') Object.defineProperty(el, 'getContext', {value: () => fakeCtx})
        return el
    })
}

beforeAll(() => stubCanvas2d())

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
            const skeleton = form.buildSkeleton()
            const jointIds = new Set(skeleton.joints.map(joint => joint.id))

            it('碰撞布局节点均在骨架内', () => {
                expect(form.colliderLayout.length).toBeGreaterThan(0)
                for (const spec of form.colliderLayout) {
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
                const ids = form.hurtProfile.map(block => block.id)
                expect(new Set(ids).size).toBe(ids.length)
                for (const block of form.hurtProfile) {
                    expect(jointIds.has(block.jointId), block.id).toBe(true)
                }
            })

            it('武器表非空且都归属该体形；默认武器为已知 id 且在表内', () => {
                expect(form.weapons.length).toBeGreaterThan(0)
                for (const weapon of form.weapons) {
                    expect(weapon.formId, weapon.id).toBe(form.id)
                }
                expect(isKnownWeaponId(form.defaultWeaponId)).toBe(true)
                expect(form.weapons.map(w => w.id)).toContain(form.defaultWeaponId)
            })

            it('模型可构建、可装配默认武器并释放', () => {
                const model = form.createModel({speed: 3, jumpHeight: 2, scale: 1}, 0)
                expect(model.jointGroups.size).toBeGreaterThan(0)
                model.equipWeapon({main: undefined})
                model.dispose()
            })

            it('动画系统工厂返回带 update 的系统', () => {
                const system = form.createAnimation({})
                expect(typeof system.update).toBe('function')
            })
        })
    }
})
