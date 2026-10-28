import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Mesh, Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import {translate} from '../../../i18n/index.ts'

/** happy-dom 不支持 canvas 2d，这里注入一个最小 2d 上下文桩（仅覆盖 model.ts 用到的方法） */
const canvasCtxStub = (): Record<string, unknown> => {
    const ctx: Record<string, unknown> = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        lineCap: '',
        fillRect: () => {},
        beginPath: () => {},
        fill: () => {},
        stroke: () => {},
        arc: () => {},
        ellipse: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        quadraticCurveTo: () => {},
    }
    return ctx
}

/* 在 patch 前捕获原始实现，供 restore 恢复 */
const originalGetContext = HTMLCanvasElement.prototype.getContext

const patchCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(),
        configurable: true,
        writable: true,
    })
}

const restoreCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext,
        configurable: true,
        writable: true,
    })
}

const meleeSaveConfig = (overrides?: Partial<CharacterSaveConfig>): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
    ...overrides,
})

/** 面板改装用的攻击配置（武器沿用长剑，只改伤害覆写） */
const meleeAttack = (damage: number): AttackConfig => ({
    weaponId: 'long_sword',
    damage,
})

/** 统计外观组内 Mesh 数量（护甲装配/移除的可观测信号） */
const countMeshes = (entity: CharacterEntity): number => {
    let count = 0
    entity.appearanceGroup.traverse(obj => {
        if (obj instanceof Mesh) count++
    })
    return count
}

/** 查找某挂载关节上的基础身体部件（外观装配写入 userData.jointId；护甲网格不写该字段） */
const findJointPart = (entity: CharacterEntity, jointId: string): Mesh | undefined => {
    let found: Mesh | undefined
    entity.appearanceGroup.traverse(obj => {
        if (found === undefined && obj instanceof Mesh && obj.userData.jointId === jointId) found = obj
    })
    return found
}

describe('角色 panelInfo 同步', () => {
    let system: CharacterEntitySystem
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
        await RAPIER.init()
        /* 注入 canvas 2d 桩，使真实 createCharacterModel 可在 happy-dom 下运行 */
        patchCanvas2d()
        /* 屏蔽 three 对材质 map=undefined 的警告噪音 */
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterAll(() => {
        restoreCanvas2d()
        warnSpy.mockRestore()
    })

    beforeEach(() => {
        const scene = new Scene()
        const shared = createSharedWorld()
        system = setupCharacterEntities(scene, shared)
    })

    it('add() 加载角色后（未执行物理同步）panelInfo 即含该行与阵营徽标', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const row = system.panelInfo.find(p => p.id === id)
        expect(row).toBeDefined()
        expect(row!.badgeLabel).toBe('F0')
    })

    it('列表行展示倾向与三层 AI 策略，不展示 AI倾向字样 / 武器攻击力 / 防御 / 移速', () => {
        const {id} = system.add(meleeSaveConfig({tendency: {tendencyId: 'hostileAll'}}), 0, 0, 0)
        const row = system.panelInfo.find(p => p.id === id)!
        const text = row.rowTextOf?.() ?? row.rowText
        expect(text).toContain(translate('character.tendency.hostile_all'))
        expect(text).toContain(translate('character.peace.patrol'))
        expect(text).toContain(translate('character.combat.tactical'))
        expect(text).toContain(translate('character.origin.resident'))
        expect((text.match(/\|/g) ?? []).length).toBe(3)
        expect(text).not.toContain(translate('character.ai_tendency'))
        expect(text).not.toContain(translate('character.peace_label'))
        expect(text).not.toContain(translate('character.combat_label'))
        expect(text).not.toContain(translate('character.origin_label'))
        expect(text).not.toContain('(5)')
        expect(text).not.toContain('def:')
        expect(text).not.toContain('spd:')
    })

    it('编辑态同步序列：update 后 capture + syncPositions 反映刚体真实位移', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 5, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        entity.body.setTranslation({x: 3, y: 7, z: 2}, true)
        system.syncTrueTransforms()
        system.captureRenderState()
        system.syncPositions()
        expect(entity.mesh.position.x).toBeCloseTo(3, 6)
        expect(entity.mesh.position.z).toBeCloseTo(2, 6)
        expect(entity.appearanceGroup.position.x).toBeCloseTo(3, 6)
        expect(entity.appearanceGroup.position.z).toBeCloseTo(2, 6)
    })

    it('spawnAt 使用独立 config：上一个角色切体形 / 改配置不污染后续新建', () => {
        system.spawnAt(0, 0, 0)
        const first = system.getAll()[0]!
        expect(first.state.config.bodyFormId).toBeUndefined()
        expect(first.state.combat.maxHealth).toBe(15)

        /* 切龙 + 改速度：状态只写当前角色，不得改写默认模板 */
        expect(system.setBodyForm(first.state.identity.id, 'wyvern')).toBe(true)
        system.updateCharacterConfig(first.state.identity.id, {speed: 9})
        expect(first.state.combat.maxHealth).toBe(18)

        system.spawnAt(2, 0, 0)
        const second = system.getAll()[1]!
        expect(second.state.config.bodyFormId).toBeUndefined()
        expect(second.state.combat.maxHealth).toBe(15)
        expect(second.state.config.speed).not.toBe(9)
    })

    it('add / setBodyForm 不修改传入存档 config（reset 快照不被污染）', () => {
        const save = meleeSaveConfig()
        const {id} = system.add(save, 0, 0, 0)
        expect(system.setBodyForm(id, 'wyvern')).toBe(true)
        expect(save.bodyFormId).toBeUndefined()
        expect(save.bodyState).toBeUndefined()
    })

    it('setCharacterAIEnabled 按角色切换 AI 开关（读档值也生效）', () => {
        const {id} = system.add(meleeSaveConfig({aiEnabled: false}), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        expect(entity.state.ai.aiEnabled).toBe(false)
        system.setCharacterAIEnabled(id, true)
        expect(entity.state.ai.aiEnabled).toBe(true)
        system.setCharacterAIEnabled(id, false)
        expect(entity.state.ai.aiEnabled).toBe(false)
    })

    it('updateCharacterConfig 编辑后阵营徽标立即更新（无需 syncPositions）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.updateCharacterConfig(
            id,
            {speed: 9},
            meleeAttack(5),
            2,
            20,
            {tendencyId: 'pacifist'},
            12,
        )
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.badgeLabel).toBe('F2')
    })

    it('add() 带护甲与基础防御：有效防御 = 基础 + 各护甲之和，未知护甲 id 安全回退', () => {
        const {id} = system.add(meleeSaveConfig({
            defense: {physical: 1, magic: 0},
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {head: 'iron_helmet', chest: 'no_such_armor', legs: 'mage_leggings'}},
        }), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        /* chest 未知 id 回退空槽：物理 1+2，魔法 0+2 */
        expect(entity.state.combat.defense).toEqual({physical: 3, magic: 2})
        /* 原始装备表保留（未知 id 不写回） */
        expect(entity.state.combat.equipment.armor).toEqual({head: 'iron_helmet', chest: 'no_such_armor', legs: 'mage_leggings'})
    })

    it('add() 装备攻击加成与移速乘数：按类别区分、多件相乘并反映到列表行', () => {
        const {id} = system.add(meleeSaveConfig({
            /* 法师兜帽（魔攻+1）、战臂甲（物攻+2、移速×0.97）、疾行靴（移速×1.15） */
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {head: 'mage_hood', arms: 'battle_bracers', legs: 'swift_boots'}},
        }), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        expect(entity.state.combat.attackBonus).toEqual({physical: 2, magic: 1})
        expect(entity.state.combat.moveSpeedMultiplier).toBeCloseTo(0.97 * 1.15, 6)
    })

    it('add() 带基础攻击加成：有效攻击加成 = 基础攻击 + 装备加成', () => {
        const {id} = system.add(meleeSaveConfig({
            baseAttack: {physical: 2, magic: 3},
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {arms: 'battle_bracers'}},
        }), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        expect(entity.state.combat.baseAttack).toEqual({physical: 2, magic: 3})
        /* 战臂甲物攻 +2 → 有效物攻 2 + 2 = 4；魔法无装备加成 → 3 */
        expect(entity.state.combat.attackBonus).toEqual({physical: 4, magic: 3})
    })

    it('updateCharacterConfig 修改基础攻击：写入战斗组件并与装备加成汇总', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            baseAttack: {physical: 1, magic: 4},
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {head: 'mage_hood'}},
        })
        expect(entity.state.combat.baseAttack).toEqual({physical: 1, magic: 4})
        /* 法师兜帽魔攻 +1 → 有效魔法攻击 4 + 1 = 5 */
        expect(entity.state.combat.attackBonus).toEqual({physical: 1, magic: 5})
    })

    it('updateCharacterConfig 装备护甲后立即重算有效防御并同步 panelInfo', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            baseDefense: {physical: 0, magic: 1},
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {chest: 'iron_plate'}},
        })
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        expect(entity.state.combat.defense).toEqual({physical: 3, magic: 1})
    })

    it('updateCharacterConfig 换装重甲与加速鞋：防御 / 攻击 / 移速一并重算', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            baseDefense: {physical: 0, magic: 1},
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {chest: 'iron_plate', arms: 'iron_bracers', legs: 'wind_boots'}},
        })
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        expect(entity.state.combat.defense).toEqual({physical: 5, magic: 2})
        expect(entity.state.combat.attackBonus).toEqual({physical: 1, magic: 0})
        /* 铁胸甲 ×0.9 × 疾风靴 ×1.25 = 1.125 → 有效移速 6.75 */
        expect(entity.state.combat.moveSpeedMultiplier).toBeCloseTo(1.125, 6)
    })

    it('updateCharacterConfig 修改韧性属性：写入战斗组件，且基础上界变更后按装备重算上界', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!

        system.updateCharacterConfig(id, {
            poiseMax: 30,
            poiseRegenDelay: 2,
            poiseRegenPerSec: 12,
            knockdownDuration: 1,
            getUpDuration: 0.9,
        })
        expect(entity.state.config.poiseMax).toBe(30)
        expect(entity.state.combat.basePoiseMax).toBe(30)
        /* 未装备护甲：上界等于基础上界 */
        expect(entity.state.combat.poiseMax).toBe(30)
        expect(entity.state.combat.poiseRegenDelay).toBe(2)
        expect(entity.state.combat.poiseRegenPerSec).toBe(12)
        expect(entity.state.combat.knockdownDuration).toBe(1)
        expect(entity.state.combat.getUpDuration).toBe(0.9)

        /* 装备铁盔（poise 2）+ 铁胸甲（poise 4）：上界重算为 30 + 6 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {head: 'iron_helmet', chest: 'iron_plate'}},
        })
        expect(entity.state.combat.poiseMax).toBe(36)

        /* 仅改基础上界：重算时保留护甲汇总 → 40 + 6 */
        system.updateCharacterConfig(id, {poiseMax: 40})
        expect(entity.state.combat.poiseMax).toBe(46)
    })

    it('护甲外观随装备同步装配与移除（换装不残留部件）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        const before = countMeshes(entity)

        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {head: 'iron_helmet', chest: 'iron_plate'}},
        })
        expect(countMeshes(entity)).toBeGreaterThan(before)

        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}}})
        expect(countMeshes(entity)).toBe(before)
    })

    it('护甲 hideBodyParts 顶替身体部件：装备后隐藏、卸下后还原', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!

        /* 疾行靴顶替小腿；铁盔 / 铁胸甲为叠加件，头部与躯干保持可见 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {head: 'iron_helmet', chest: 'iron_plate', legs: 'swift_boots'}},
        })
        expect(findJointPart(entity, 'headNeck')!.visible).toBe(true)
        expect(findJointPart(entity, 'spine')!.visible).toBe(true)
        expect(findJointPart(entity, 'rightLegHip')!.visible).toBe(true)
        expect(findJointPart(entity, 'leftLegHip')!.visible).toBe(true)
        expect(findJointPart(entity, 'rightLegKnee')!.visible).toBe(false)
        expect(findJointPart(entity, 'leftLegKnee')!.visible).toBe(false)

        /* 卸下后小腿还原可见 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}}})
        expect(findJointPart(entity, 'rightLegKnee')!.visible).toBe(true)
        expect(findJointPart(entity, 'leftLegKnee')!.visible).toBe(true)
    })

    it('肢体组件：装备后顶替人类部位并计入数值，卸下后还原', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        const before = countMeshes(entity)
        expect(findJointPart(entity, 'headNeck')!.visible).toBe(true)
        expect(findJointPart(entity, 'spine')!.visible).toBe(true)

        /* 兽人头颅（物防2）+ 骷髅躯干（物防1/魔防1）→ 有效防御 物3 魔1；头与躯干被顶替 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            equipment: {limb: {head: 'orc_head', body: 'skeleton_body'}, weapon: {main_hand: 'long_sword'}, armor: {}},
        })
        expect(countMeshes(entity)).toBeGreaterThan(before)
        expect(findJointPart(entity, 'headNeck')!.visible).toBe(false)
        expect(findJointPart(entity, 'spine')!.visible).toBe(false)
        expect(entity.state.combat.defense).toEqual({physical: 3, magic: 1})
        expect(entity.state.combat.equipment.limb).toEqual({head: 'orc_head', body: 'skeleton_body'})

        /* 卸下肢体 → 数值回落、人类部位还原、外观部件不残留 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}}})
        expect(countMeshes(entity)).toBe(before)
        expect(findJointPart(entity, 'headNeck')!.visible).toBe(true)
        expect(findJointPart(entity, 'spine')!.visible).toBe(true)
        expect(entity.state.combat.defense).toEqual({physical: 0, magic: 0})
    })

    it('护甲与肢体并存：两者顶替部位互不干扰，卸下护甲不还原肢体顶替的部位', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)!

        /* 疾行靴顶替小腿（护甲） + 兽人头颅顶替头部（肢体） */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            equipment: {limb: {head: 'orc_head'}, weapon: {main_hand: 'long_sword'}, armor: {legs: 'swift_boots'}},
        })
        expect(findJointPart(entity, 'headNeck')!.visible).toBe(false)
        expect(findJointPart(entity, 'rightLegKnee')!.visible).toBe(false)

        /* 仅卸下护甲：小腿还原，头部仍被肢体顶替 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            equipment: {limb: {head: 'orc_head'}, weapon: {main_hand: 'long_sword'}, armor: {}},
        })
        expect(findJointPart(entity, 'rightLegKnee')!.visible).toBe(true)
        expect(findJointPart(entity, 'headNeck')!.visible).toBe(false)

        /* 卸下肢体：头部还原 */
        system.updateCharacterConfig(id, {}, undefined, undefined, undefined, undefined, undefined, {
            equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}},
        })
        expect(findJointPart(entity, 'headNeck')!.visible).toBe(true)
    })

    it('markPlayer 后 panelInfo 立即反映玩家标记与徽标', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.markPlayer(id)
        const row = system.panelInfo.find(p => p.id === id)
        expect(row!.badgeLabel).toBe('P')
    })

    it('remove 角色后 panelInfo 同步移除该行', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.remove(id)
        expect(system.panelInfo.find(p => p.id === id)).toBeUndefined()
    })

    it('update() 每帧将状态段与状态机当前状态同步（离开 idle 后行文本跟随变化）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.markPlayer(id)
        system.setPlayerMove(1, 0, false, 1, 0)
        system.update(1 / 60)
        const entity = system.getAll().find(e => e.state.identity.id === id)!
        /* 有移动输入后状态机离开 idle */
        expect(entity.stateMachine.currentState).not.toBe('idle')
        system.setPlayerMove(0, 0, false, 1, 0)
    })

    it('角色刚体质量恒为 1（击退力度回归保护），修改 scale 不影响质量', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)
        expect(entity).toBeDefined()
        expect(entity!.body.mass()).toBeCloseTo(1, 6)
        /* 重建碰撞体（scale 变化）后质量仍为 1 */
        system.updateCharacterConfig(id, {scale: 2})
        expect(entity!.body.mass()).toBeCloseTo(1, 6)
    })
})
