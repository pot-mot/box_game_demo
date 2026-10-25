import type {EntityInfoSource} from '../entity/box/base/types/entity_info.ts'
import type {FragmentData} from '../entity/destroyed/types'
import type {TerrainContext} from '../entity/terrain/base/types'
import type {GameMode} from '../modes/constants'
import type {EntityType} from '../entity/constants.ts'
import type {LockPointConfig} from '../character/lock_point.ts'
import type {SaveData, SavableEntity, FragmentDataJSON, QuatJSON, ModeInfoJSON, CameraInfoJSON, EntitySourceMap} from './types.ts'
import {SAVE_FORMAT_VERSION} from './types.ts'
import {bodyFormOf} from '../entity/character/body_form/index.ts'
import {findWeaponPreset} from '../character/weapon/catalog.ts'
import {findArmorPreset, findLimbPreset} from '../character/armor/catalog.ts'
import type {EquipmentState} from '../character/equipment/types.ts'
import {EMPTY_EQUIPMENT_STATE, equipmentEntriesOf, withEquipmentAt} from '../character/equipment/types.ts'

/** 将 {x, y, z} 转为 [x, y, z] */
const vec3ToTuple = (v: {x: number; y: number; z: number}): [number, number, number] =>
    [v.x, v.y, v.z]

/** 将 {x, y, z, w} 转为 [x, y, z, w] */
const quatToTuple = (q: {x: number; y: number; z: number; w: number}): QuatJSON =>
    [q.x, q.y, q.z, q.w]

/** 将 FragmentData 转为 JSON-safe 格式 */
const fragmentDataToJSON = (fd: FragmentData): FragmentDataJSON => ({
    renderVertices: Array.from(fd.renderVertices),
    renderIndices: fd.renderIndices,
    hullVertices: fd.hullVertices.map(v => vec3ToTuple(v)),
    hullFaces: fd.hullFaces,
    centroid: fd.centroid,
    massRatio: fd.massRatio,
    boxSize: fd.boxSize,
})

/** 导出可持久化装备：剔除未声明槽位、跨体形武器、天然武器与未知 id */
const equipmentToSave = (state: EquipmentState, bodyFormId: string): EquipmentState => {
    const plan = bodyFormOf(bodyFormId)
    const allowedSlots = new Set(plan.equipSlots.map(slot => `${slot.kind}:${slot.bodyPart}`))
    let out: EquipmentState = EMPTY_EQUIPMENT_STATE
    for (const entry of equipmentEntriesOf(state)) {
        if (!allowedSlots.has(entry.key)) continue
        if (entry.kind === 'weapon') {
            const weapon = findWeaponPreset(entry.itemId)
            if (weapon === undefined || weapon.formId !== plan.id) continue
            if (!weapon.equipBodyParts.includes(entry.bodyPart)) continue
        } else {
            const piece = entry.kind === 'armor' ? findArmorPreset(entry.itemId) : findLimbPreset(entry.itemId)
            if (piece === undefined || piece.slot !== entry.bodyPart) continue
            if (piece.allowedBodyFormIds !== undefined && !piece.allowedBodyFormIds.includes(plan.id)) continue
        }
        out = withEquipmentAt(out, entry.kind, entry.bodyPart, entry.itemId)
    }
    return out
}

/** 收集当前世界所有可序列化实体的状态 */
export const collectWorldState = (
    systems: Map<string, EntityInfoSource>,
    terrainSources: TerrainContext[],
    mode: GameMode,
    cameraPos?: {x: number; y: number; z: number},
    cameraRot?: {x: number; y: number; z: number},
    prevModeInfo?: ModeInfoJSON,
): SaveData => {
    const entities: SavableEntity[] = []

    const getSource = <K extends EntityType>(key: K): EntitySourceMap[K] | undefined =>
        systems.get(key) as EntitySourceMap[K] | undefined

    // 箱子（统一类型：刚体配置 + 各特性可选运行态）
    const boxes = getSource('box')
    if (boxes?.getAll) {
        for (const e of boxes.getAll()) {
            const dest = e.runtime.destructible
            const burn = e.runtime.burning
            const elastic = e.runtime.elastic
            entities.push({
                type: 'box',
                config: e.config,
                position: vec3ToTuple(e.body.translation()),
                quaternion: quatToTuple(e.body.rotation()),
                ...(dest !== undefined && !dest.destroyed
                    ? {destructible: {
                        health: dest.health,
                        ...(dest.collisions.length > 0 ? {collisions: dest.collisions} : {}),
                        ...(dest.collisionHistory.length > 0 ? {collisionHistory: dest.collisionHistory} : {}),
                        ...(dest.cooldowns.size > 0 ? {cooldowns: Array.from(dest.cooldowns.entries())} : {}),
                    }}
                    : {}),
                ...(burn !== undefined ? {burning: {health: burn.health}} : {}),
                ...(elastic !== undefined ? {elastic: {def: elastic.def, vel: elastic.vel}} : {}),
            })
        }
    }

    // 区域（几何 + 视觉材质 + 物理场；无刚体，用自身 transform）
    const areas = getSource('area')
    if (areas?.getAll) {
        for (const e of areas.getAll()) {
            entities.push({
                type: 'area',
                config: e.config,
                position: [e.transform.x, e.transform.y, e.transform.z],
                quaternion: [e.transform.qx, e.transform.qy, e.transform.qz, e.transform.qw],
            })
        }
    }

    // 地形
    for (const ts of terrainSources) {
        const all = ts.getAll()
        for (const e of all) {
            entities.push({
                type: 'terrain',
                config: e.config,
                position: [e.mesh.position.x, e.mesh.position.y, e.mesh.position.z],
                quaternion: quatToTuple(e.mesh.quaternion),
                heights: e.heights,
            })
        }
    }

    // 建筑生成器（显式压缩体素数据；无建筑时不写入）
    const building = getSource('building_generator')
    if (building?.getAll) {
        const worlds = building.getSaveWorlds()
        if (worlds.length > 0) {
            entities.push({type: 'building_generator', worlds})
        }
    }

    // 交互物（显式配置 + 运行态）
    const interactable = getSource('interactable')
    if (interactable?.getAll) {
        for (const entry of interactable.getSave()) {
            entities.push({
                type: 'interactable',
                config: entry.config,
                position: entry.position,
                yawQuarter: entry.yawQuarter,
                progress: entry.progress,
                target: entry.target,
                on: entry.on,
                container: entry.container,
                health: entry.health,
            })
        }
    }

    // 掉落物
    const itemEntities = getSource('item')
    if (itemEntities?.getAll) {
        for (const entry of itemEntities.getSave()) {
            entities.push({
                type: 'item',
                config: {defId: entry.defId, count: entry.count},
                position: entry.position,
                quaternion: entry.quaternion,
            })
        }
    }

    // 角色
    const character = getSource('character')
    if (character?.getAll) {
        for (const e of character.getAll()) {
            /* position 存脚底原点（实体原点语义）：物理身体中心回退半高 */
            const bodyPos = e.body.translation()
            const halfH = bodyFormOf(e.state.config.bodyFormId).base.centerOffsetY * e.state.config.scale
            entities.push({
                type: 'character',
                config: {
                    speed: e.state.config.speed,
                    jumpHeight: e.state.config.jumpHeight,
                    scale: e.state.config.scale,
                    /* 体形计划（基础模组）：缺省 humanoid */
                    bodyFormId: e.state.config.bodyFormId,
                    /* 体形专属状态（attackModule + 人形 handedness） */
                    bodyState: e.state.bodyState,
                    peaceStrategy: e.state.ai.peaceStrategy,
                    combatStrategy: e.state.ai.combatStrategy,
                    tendency: e.state.combat.tendencyConfig,
                    faction: e.state.combat.faction,
                    maxHealth: e.state.combat.maxHealth,
                    /* 基础防御 + 基础攻击 + 装备状态（limb / weapon / armor 分层） */
                    defense: e.state.combat.baseDefense,
                    baseAttack: e.state.combat.baseAttack,
                    equipment: equipmentToSave(e.state.combat.equipment, bodyFormOf(e.state.config.bodyFormId).id),
                    /* 额外锁定点（拷贝为 JSON-safe 元组；缺省 = 仅默认身体中心点） */
                    lockPoints: e.state.lockPoints.map((point): LockPointConfig => ({
                        jointId: point.jointId,
                        offset: [point.offset[0], point.offset[1], point.offset[2]],
                    })),
                    /* 韧性 / 倒地属性（写实际值；旧代码读到缺字段安全回退默认） */
                    poiseMax: e.state.combat.basePoiseMax,
                    poiseRegenDelay: e.state.combat.poiseRegenDelay,
                    poiseRegenPerSec: e.state.combat.poiseRegenPerSec,
                    knockdownDuration: e.state.combat.knockdownDuration,
                    getUpDuration: e.state.combat.getUpDuration,
                    isPlayer: e.state.identity.isPlayer,
                    navEnabled: e.state.ai.navEnabled,
                    /* 行为原点策略 / 间隔 / 追击半径（写实际值；旧代码读到缺字段安全回退默认） */
                    originStrategy: e.state.ai.originStrategy,
                    originInterval: e.state.ai.originInterval,
                    chaseLeashRadius: e.state.ai.chaseLeashRadius,
                    /* AI 反应式举盾窗口 / 冷却（写实际值；旧代码读到缺字段安全回退默认） */
                    aiBlockDuration: e.state.ai.aiBlockDuration,
                    aiBlockCooldown: e.state.ai.aiBlockCooldown,
                    /* 飞行开关 / 体力基础配置（写实际值；旧代码读到缺字段安全回退默认） */
                    flightEnabled: e.state.config.flightEnabled === true,
                    ...(e.state.config.stamina !== undefined ? {stamina: e.state.config.stamina} : {}),
                },
                health: e.state.combat.health,
                position: [bodyPos.x, bodyPos.y - halfH, bodyPos.z],
                quaternion: quatToTuple(e.body.rotation()),
                /* 刚体 lockRotations，朝向不在 body 上，单独从 facingAngles 持久化 */
                facing: character.getFacing(e.state.identity.id),
            })
        }
    }

    // 碎片
    const frag = getSource('fragment/common')
    if (frag?.getAll) {
        for (const e of frag.getAll()) {
            entities.push({
                type: 'fragment/common',
                config: e.config,
                position: vec3ToTuple(e.body.translation()),
                quaternion: quatToTuple(e.body.rotation()),
                data: fragmentDataToJSON(e.fragmentData),
            })
        }
    }

    // ── 构建 modeInfo（保留另一模式的已有数据）──
    const modeInfo: ModeInfoJSON = prevModeInfo ? {...prevModeInfo} : {}
    const cameraInfo: CameraInfoJSON | undefined = cameraPos
        ? {position: vec3ToTuple(cameraPos), rotate: [cameraRot?.x ?? 0, cameraRot?.y ?? 0, cameraRot?.z ?? 0]}
        : undefined

    if (mode === 'edit') {
        if (cameraInfo) modeInfo.edit = {cameraInfo}
        // 不清除 play 数据
    } else if (mode === 'play') {
        const playEntry: NonNullable<typeof modeInfo.play> = {}
        if (cameraInfo) playEntry.cameraInfo = cameraInfo
        if (playEntry.cameraInfo) modeInfo.play = playEntry
        // 不清除 edit 数据
    } else if (mode === 'bone_edit') {
        if (cameraInfo) modeInfo.boneEdit = {cameraInfo}
        // 不清除 edit/play 数据
    }

    return {
        version: SAVE_FORMAT_VERSION,
        entities,
        modeInfo: modeInfo.edit || modeInfo.play || modeInfo.boneEdit ? modeInfo : undefined,
    }
}

/** 下载存档为 JSON 文件 */
export const saveWorldToFile = (data: SaveData): void => {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `box-demo-save-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
}
