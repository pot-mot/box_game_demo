import {Group, Mesh} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import type {CharacterModel, CharacterColorPalette, WeaponEquipConfig} from './types.ts'
import {createWeaponMesh, type WeaponMeshConfig, type WeaponLocalHitBox} from './weapon_mesh.ts'
import {SELECT_PALETTE} from './constants.ts'
import {
    HEAD_RATIO,
    BODY_RATIO,
    LEG_RATIO,
    HEAD_WIDTH_RATIO,
    ARM_WIDTH_RATIO,
    LEG_WIDTH_RATIO,
    ARM_X_GAP,
    LEG_X_GAP,
    BODY_DEPTH_RATIO,
    MODEL_BASE_HEIGHT,
    MODEL_BASE_WIDTH,
} from '../../../render/constants.ts'
import {
    createTwoFaceBoxPart,
    createHeadBoxPart,
    recolorTwoFaceBoxPart,
    recolorHeadBoxPart,
    disposeBoxPart,
    type TrackedBoxPart,
} from '../../../render/box_parts.ts'

/** 单个武器槽（主手/副手各一）：武器骨骼挂点 + 武器网格状态 */
interface WeaponSlot {
    readonly mountJoint: Group
    group: Group | null
    hitCenter: Mesh | null
    tip: Mesh | null
    hitBox: WeaponLocalHitBox | null
    cleanup: (() => void) | null
    /** 握把中心在武器本地 Y 轴上的坐标（负值 = 在原点下方），供双手副握点计算 */
    gripY: number
}

/** 构建完整的方块人模型 Group 层级，返回模型引用 + 武器挂载点 */
export const createCharacterModel = (config: CharacterConfig, faction: number): CharacterModel => {
    const palette: CharacterColorPalette = SELECT_PALETTE(faction)
    const tracked: TrackedBoxPart[] = []

    const H = MODEL_BASE_HEIGHT
    const bodyW = MODEL_BASE_WIDTH
    const bodyD = bodyW * BODY_DEPTH_RATIO

    const headH = H * HEAD_RATIO
    const bodyH = H * BODY_RATIO
    const legH = H * LEG_RATIO

    const headW = bodyW * HEAD_WIDTH_RATIO

    const armW = bodyW * ARM_WIDTH_RATIO
    const armD = bodyW * ARM_WIDTH_RATIO
    const forearmW = armW * 0.8
    const forearmD = armD * 0.8

    const legW = bodyW * LEG_WIDTH_RATIO
    const legD = bodyW * LEG_WIDTH_RATIO
    const shinW = legW * 0.85
    const shinD = legD * 0.85

    const hipH = legH / 2
    const shinH = legH / 2
    const upperArmH = bodyH / 2
    const forearmH = bodyH / 2

    /* 模型原点在脚底（地面）：髋部关节高度 = 腿长，躯干/头向上延伸，腿向下垂到 y=0 */
    const hipY = legH

    const shoulderX = bodyW / 2 + ARM_X_GAP
    const hipX = LEG_X_GAP

    const group = new Group()

    // ── 右腿 ──
    const rightLegHip = new Group()
    rightLegHip.position.set(hipX, hipY, 0)
    const rightThighPart = createTwoFaceBoxPart(legW, hipH, legD, palette.legColor)
    rightThighPart.mesh.position.y = -hipH / 2
    rightLegHip.add(rightThighPart.mesh)
    tracked.push(rightThighPart)

    const rightLegKnee = new Group()
    rightLegKnee.position.y = -hipH
    rightLegHip.add(rightLegKnee)
    const rightShinPart = createTwoFaceBoxPart(shinW, shinH, shinD, palette.legColor)
    rightShinPart.mesh.position.y = -shinH / 2
    rightLegKnee.add(rightShinPart.mesh)
    tracked.push(rightShinPart)

    group.add(rightLegHip)

    // ── 左腿 ──
    const leftLegHip = new Group()
    leftLegHip.position.set(-hipX, hipY, 0)
    const leftThighPart = createTwoFaceBoxPart(legW, hipH, legD, palette.legColor)
    leftThighPart.mesh.position.y = -hipH / 2
    leftLegHip.add(leftThighPart.mesh)
    tracked.push(leftThighPart)

    const leftLegKnee = new Group()
    leftLegKnee.position.y = -hipH
    leftLegHip.add(leftLegKnee)
    const leftShinPart = createTwoFaceBoxPart(shinW, shinH, shinD, palette.legColor)
    leftShinPart.mesh.position.y = -shinH / 2
    leftLegKnee.add(leftShinPart.mesh)
    tracked.push(leftShinPart)

    group.add(leftLegHip)

    // ── 躯干 spine 关节（髋部 pivot：旋转/平移同时带动 躯干+双臂+头，实现拧腰/前倾动力链） ──
    const spine = new Group()
    spine.position.set(0, hipY, 0)
    group.add(spine)

    const bodyPart = createTwoFaceBoxPart(bodyW, bodyH, bodyD, palette.bodyColor)
    bodyPart.mesh.position.y = bodyH / 2
    spine.add(bodyPart.mesh)
    tracked.push(bodyPart)

    // ── 右臂 ──
    const rightArmShoulder = new Group()
    rightArmShoulder.position.set(shoulderX, bodyH, 0)
    const rightUpperArmPart = createTwoFaceBoxPart(armW, upperArmH, armD, palette.bodyColor)
    rightUpperArmPart.mesh.position.y = -upperArmH / 2
    rightArmShoulder.add(rightUpperArmPart.mesh)
    tracked.push(rightUpperArmPart)

    const rightArmElbow = new Group()
    rightArmElbow.position.y = -upperArmH
    rightArmShoulder.add(rightArmElbow)
    const rightForearmPart = createTwoFaceBoxPart(forearmW, forearmH, forearmD, palette.bodyColor)
    rightForearmPart.mesh.position.y = -forearmH / 2
    rightArmElbow.add(rightForearmPart.mesh)
    tracked.push(rightForearmPart)

    const rightHandPivot = new Group()
    rightHandPivot.position.y = -forearmH
    rightArmElbow.add(rightHandPivot)

    /* 动态腕关节：动画器驱动（攻击对齐/刃面偏转），静止时为单位变换；武器经右武器挂点挂其下 */
    const rightWristPivot = new Group()
    rightHandPivot.add(rightWristPivot)

    /* 右手武器挂点（可动画关节，静止为单位变换；武器模型自带固有握持，直接挂其下） */
    const rightWeaponMount = new Group()
    rightWristPivot.add(rightWeaponMount)

    spine.add(rightArmShoulder)

    // ── 左臂 ──
    const leftArmShoulder = new Group()
    leftArmShoulder.position.set(-shoulderX, bodyH, 0)
    const leftUpperArmPart = createTwoFaceBoxPart(armW, upperArmH, armD, palette.bodyColor)
    leftUpperArmPart.mesh.position.y = -upperArmH / 2
    leftArmShoulder.add(leftUpperArmPart.mesh)
    tracked.push(leftUpperArmPart)

    const leftArmElbow = new Group()
    leftArmElbow.position.y = -upperArmH
    leftArmShoulder.add(leftArmElbow)
    const leftForearmPart = createTwoFaceBoxPart(forearmW, forearmH, forearmD, palette.bodyColor)
    leftForearmPart.mesh.position.y = -forearmH / 2
    leftArmElbow.add(leftForearmPart.mesh)
    tracked.push(leftForearmPart)

    const leftHandPivot = new Group()
    leftHandPivot.position.y = -forearmH
    leftArmElbow.add(leftHandPivot)

    /* 左腕动态关节 + 左手武器挂点（双持副手武器挂其下；双手 IK 末端） */
    const leftWristPivot = new Group()
    leftHandPivot.add(leftWristPivot)
    const leftWeaponMount = new Group()
    leftWristPivot.add(leftWeaponMount)

    spine.add(leftArmShoulder)

    // ── 头 ──
    const headNeck = new Group()
    headNeck.position.y = bodyH
    const headPart = createHeadBoxPart(headW, headH, headW, palette)
    headPart.mesh.position.y = headH / 2
    headNeck.add(headPart.mesh)
    tracked.push(headPart)
    spine.add(headNeck)

    group.scale.set(config.scale, config.scale, config.scale)

    const createSlot = (mountJoint: Group): WeaponSlot => ({
        mountJoint, group: null, hitCenter: null, tip: null, hitBox: null, cleanup: null, gripY: 0,
    })
    const rightSlot = createSlot(rightWeaponMount)
    const leftSlot = createSlot(leftWeaponMount)

    const clearSlot = (slot: WeaponSlot): void => {
        if (slot.group !== null) slot.mountJoint.remove(slot.group)
        slot.cleanup?.()
        slot.group = null
        slot.hitCenter = null
        slot.tip = null
        slot.hitBox = null
        slot.cleanup = null
        slot.gripY = 0
    }

    const equipSlot = (slot: WeaponSlot, meshConfig: WeaponMeshConfig | undefined): void => {
        clearSlot(slot)
        if (meshConfig === undefined) return
        /* 武器模型已自带固有握持（握把中心在模型原点）；直接挂到武器骨骼下，朝向完全由骨骼动画控制 */
        const result = createWeaponMesh(meshConfig)
        slot.group = result.group
        slot.hitCenter = result.hitCenter
        slot.tip = result.tip
        slot.hitBox = result.hitBox
        slot.cleanup = result.cleanup
        slot.gripY = result.gripY
        slot.mountJoint.add(result.group)
    }

    const removeWeapon = (): void => {
        clearSlot(rightSlot)
        clearSlot(leftSlot)
    }

    const equipWeapon = (equipConfig: WeaponEquipConfig): void => {
        equipSlot(rightSlot, equipConfig.main)
        equipSlot(leftSlot, equipConfig.offhand)
    }

    /** 根据新调色板原地更新所有部位材质颜色（不重建几何体） */
    const recolor = (newPalette: CharacterColorPalette): void => {
        recolorTwoFaceBoxPart(bodyPart.mesh, newPalette.bodyColor)
        recolorTwoFaceBoxPart(rightUpperArmPart.mesh, newPalette.bodyColor)
        recolorTwoFaceBoxPart(rightForearmPart.mesh, newPalette.bodyColor)
        recolorTwoFaceBoxPart(leftUpperArmPart.mesh, newPalette.bodyColor)
        recolorTwoFaceBoxPart(leftForearmPart.mesh, newPalette.bodyColor)
        recolorTwoFaceBoxPart(rightThighPart.mesh, newPalette.legColor)
        recolorTwoFaceBoxPart(rightShinPart.mesh, newPalette.legColor)
        recolorTwoFaceBoxPart(leftThighPart.mesh, newPalette.legColor)
        recolorTwoFaceBoxPart(leftShinPart.mesh, newPalette.legColor)
        recolorHeadBoxPart(headPart.mesh, newPalette)
    }

    const dispose = (): void => {
        removeWeapon()
        for (const part of tracked.splice(0)) {
            disposeBoxPart(part)
        }
    }

    return {
        group,
        spine,
        headNeck,
        head: headPart.mesh,
        body: bodyPart.mesh,
        rightArmShoulder,
        rightUpperArm: rightUpperArmPart.mesh,
        rightArmElbow,
        rightForearm: rightForearmPart.mesh,
        rightHandPivot,
        rightWristPivot,
        leftArmShoulder,
        leftUpperArm: leftUpperArmPart.mesh,
        leftArmElbow,
        leftForearm: leftForearmPart.mesh,
        leftHandPivot,
        leftWristPivot,
        rightWeaponMount,
        leftWeaponMount,
        rightLegHip,
        rightThigh: rightThighPart.mesh,
        rightLegKnee,
        rightShin: rightShinPart.mesh,
        leftLegHip,
        leftThigh: leftThighPart.mesh,
        leftLegKnee,
        leftShin: leftShinPart.mesh,
        equipWeapon,
        removeWeapon,
        recolor,
        get weaponMesh() { return rightSlot.hitCenter },
        get weaponTip() { return rightSlot.tip },
        get weaponGroup() { return rightSlot.group },
        get weaponHitBox() { return rightSlot.hitBox },
        get weaponGripY() { return rightSlot.gripY },
        get offhandWeaponMesh() { return leftSlot.hitCenter },
        get offhandWeaponTip() { return leftSlot.tip },
        get offhandWeaponGroup() { return leftSlot.group },
        get offhandWeaponHitBox() { return leftSlot.hitBox },
        get offhandWeaponGripY() { return leftSlot.gripY },
        dispose,
    }
}