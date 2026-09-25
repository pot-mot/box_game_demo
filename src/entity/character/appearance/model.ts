import {Group, Mesh} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import type {CharacterModel, CharacterColorPalette} from './types.ts'
import type {WeaponMeshConfig, WeaponLocalHitBox} from './weapon_mesh.ts'
import {createWeaponMount} from './weapon_mount.ts'
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

    /* 动态腕关节：动画器驱动（攻击对齐/刃面偏转），静止时为单位变换；武器经静态握持 mount 挂其下 */
    const rightWristPivot = new Group()
    rightHandPivot.add(rightWristPivot)

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

    let weaponGroup: Group | null = null
    let weaponHitCenter: Mesh | null = null
    let weaponTipMesh: Mesh | null = null
    let weaponHitBoxData: WeaponLocalHitBox | null = null
    let weaponCleanup: (() => void) | null = null
    let weaponMount: Group | null = null
    let weaponGripTilt = 0

    const removeWeapon = (): void => {
        if (weaponGroup) {
            weaponMount?.remove(weaponGroup)
            weaponCleanup?.()
            weaponGroup = null
            weaponHitCenter = null
            weaponTipMesh = null
            weaponHitBoxData = null
            weaponCleanup = null
            weaponMount = null
            weaponGripTilt = 0
        }
    }

    const equipWeapon = (meshConfig: WeaponMeshConfig): void => {
        removeWeapon()
        /* 静态握持 mount 由共享装配函数创建（位置偏移 + 欧拉角，握把中心精确落于手腕节点） */
        const {mount, result, gripTilt} = createWeaponMount(meshConfig)
        weaponGroup = result.group
        weaponHitCenter = result.hitCenter
        weaponTipMesh = result.tip
        weaponHitBoxData = result.hitBox
        weaponCleanup = result.cleanup
        weaponMount = mount
        weaponGripTilt = gripTilt
        rightWristPivot.add(mount)
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
        get weaponMesh() { return weaponHitCenter },
        get weaponTip() { return weaponTipMesh },
        get weaponGroup() { return weaponGroup },
        get weaponHitBox() { return weaponHitBoxData },
        get weaponGripTilt() { return weaponGripTilt },
        dispose,
    }
}