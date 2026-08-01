import {Group, Mesh, BoxGeometry, MeshStandardMaterial} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import type {CharacterModel} from './types.ts'
import {
    HEAD_COLOR,
    BODY_COLOR,
    LEG_COLOR,
    MELEE_WEAPON_COLOR,
    RANGED_WEAPON_COLOR,
    MELEE_WEAPON_SIZE,
    RANGED_WEAPON_SIZE,
    WEAPON_Y_OFFSET,
    HEAD_RATIO,
    BODY_RATIO,
    LEG_RATIO,
    ARM_WIDTH_RATIO,
    LEG_WIDTH_RATIO,
    ARM_X_GAP,
    LEG_X_GAP,
    MODEL_ROUGHNESS,
} from './constants.ts'

interface TrackedMesh {
    mesh: Mesh
    geometry: BoxGeometry
    material: MeshStandardMaterial
}

/** 构建完整的方块人模型 Group 层级，返回模型引用 + 武器挂载点 */
export const createCharacterModel = (config: CharacterConfig): CharacterModel => {
    const tracked: TrackedMesh[] = []

    const createBoxPart = (w: number, h: number, d: number, color: number): TrackedMesh => {
        const geometry = new BoxGeometry(w, h, d)
        const material = new MeshStandardMaterial({
            color,
            roughness: MODEL_ROUGHNESS,
            metalness: 0.1,
        })
        const mesh = new Mesh(geometry, material)
        mesh.castShadow = true
        const tm: TrackedMesh = {mesh, geometry, material}
        tracked.push(tm)
        return tm
    }

    const H = config.height
    const R = config.radius

    const headH = H * HEAD_RATIO
    const bodyH = H * BODY_RATIO
    const legH = H * LEG_RATIO

    const bodyW = R * 2
    const bodyD = R * 2
    const headW = bodyW

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

    const hipY = -H / 2 + legH
    const shoulderY = hipY + bodyH
    const bodyCenterY = hipY + bodyH / 2

    const shoulderX = bodyW / 2 + ARM_X_GAP
    const hipX = LEG_X_GAP

    const group = new Group()

    // ── 右腿 ──
    const rightLegHip = new Group()
    rightLegHip.position.set(hipX, hipY, 0)
    const rightThighTM = createBoxPart(legW, hipH, legD, LEG_COLOR)
    rightThighTM.mesh.position.y = -hipH / 2
    rightLegHip.add(rightThighTM.mesh)

    const rightLegKnee = new Group()
    rightLegKnee.position.y = -hipH
    rightLegHip.add(rightLegKnee)
    const rightShinTM = createBoxPart(shinW, shinH, shinD, LEG_COLOR)
    rightShinTM.mesh.position.y = -shinH / 2
    rightLegKnee.add(rightShinTM.mesh)

    group.add(rightLegHip)

    // ── 左腿 ──
    const leftLegHip = new Group()
    leftLegHip.position.set(-hipX, hipY, 0)
    const leftThighTM = createBoxPart(legW, hipH, legD, LEG_COLOR)
    leftThighTM.mesh.position.y = -hipH / 2
    leftLegHip.add(leftThighTM.mesh)

    const leftLegKnee = new Group()
    leftLegKnee.position.y = -hipH
    leftLegHip.add(leftLegKnee)
    const leftShinTM = createBoxPart(shinW, shinH, shinD, LEG_COLOR)
    leftShinTM.mesh.position.y = -shinH / 2
    leftLegKnee.add(leftShinTM.mesh)

    group.add(leftLegHip)

    // ── 身体 ──
    const bodyTM = createBoxPart(bodyW, bodyH, bodyD, BODY_COLOR)
    bodyTM.mesh.position.y = bodyCenterY
    group.add(bodyTM.mesh)

    // ── 右臂 ──
    const rightArmShoulder = new Group()
    rightArmShoulder.position.set(shoulderX, shoulderY, 0)
    const rightUpperArmTM = createBoxPart(armW, upperArmH, armD, BODY_COLOR)
    rightUpperArmTM.mesh.position.y = -upperArmH / 2
    rightArmShoulder.add(rightUpperArmTM.mesh)

    const rightArmElbow = new Group()
    rightArmElbow.position.y = -upperArmH
    rightArmShoulder.add(rightArmElbow)
    const rightForearmTM = createBoxPart(forearmW, forearmH, forearmD, BODY_COLOR)
    rightForearmTM.mesh.position.y = -forearmH / 2
    rightArmElbow.add(rightForearmTM.mesh)

    const rightHandPivot = new Group()
    rightHandPivot.position.y = -forearmH
    rightArmElbow.add(rightHandPivot)

    group.add(rightArmShoulder)

    // ── 左臂 ──
    const leftArmShoulder = new Group()
    leftArmShoulder.position.set(-shoulderX, shoulderY, 0)
    const leftUpperArmTM = createBoxPart(armW, upperArmH, armD, BODY_COLOR)
    leftUpperArmTM.mesh.position.y = -upperArmH / 2
    leftArmShoulder.add(leftUpperArmTM.mesh)

    const leftArmElbow = new Group()
    leftArmElbow.position.y = -upperArmH
    leftArmShoulder.add(leftArmElbow)
    const leftForearmTM = createBoxPart(forearmW, forearmH, forearmD, BODY_COLOR)
    leftForearmTM.mesh.position.y = -forearmH / 2
    leftArmElbow.add(leftForearmTM.mesh)

    const leftHandPivot = new Group()
    leftHandPivot.position.y = -forearmH
    leftArmElbow.add(leftHandPivot)

    group.add(leftArmShoulder)

    // ── 头 ──
    const headNeck = new Group()
    headNeck.position.y = shoulderY
    const headTM = createBoxPart(headW, headH, bodyW, HEAD_COLOR)
    headTM.mesh.position.y = headH / 2
    headNeck.add(headTM.mesh)
    group.add(headNeck)

    let weaponMesh: Mesh | null = null
    let weaponGeometry: BoxGeometry | null = null
    let weaponMaterial: MeshStandardMaterial | null = null

    const removeWeapon = (): void => {
        if (weaponMesh) {
            rightHandPivot.remove(weaponMesh)
            weaponGeometry?.dispose()
            weaponMaterial?.dispose()
            weaponMesh = null
            weaponGeometry = null
            weaponMaterial = null
        }
    }

    const equipWeapon = (type: 'melee' | 'ranged'): void => {
        removeWeapon()
        const [w, h, d] = type === 'melee' ? MELEE_WEAPON_SIZE : RANGED_WEAPON_SIZE
        const color = type === 'melee' ? MELEE_WEAPON_COLOR : RANGED_WEAPON_COLOR
        weaponGeometry = new BoxGeometry(w, h, d)
        weaponMaterial = new MeshStandardMaterial({
            color,
            roughness: 0.4,
            metalness: 0.3,
        })
        weaponMesh = new Mesh(weaponGeometry, weaponMaterial)
        weaponMesh.castShadow = true
        weaponMesh.position.y = WEAPON_Y_OFFSET
        rightHandPivot.add(weaponMesh)
    }

    const dispose = (): void => {
        removeWeapon()
        for (const tm of tracked.splice(0)) {
            tm.mesh.removeFromParent()
            tm.geometry.dispose()
            tm.material.dispose()
        }
    }

    return {
        group,
        headNeck,
        head: headTM.mesh,
        body: bodyTM.mesh,
        rightArmShoulder,
        rightUpperArm: rightUpperArmTM.mesh,
        rightArmElbow,
        rightForearm: rightForearmTM.mesh,
        rightHandPivot,
        leftArmShoulder,
        leftUpperArm: leftUpperArmTM.mesh,
        leftArmElbow,
        leftForearm: leftForearmTM.mesh,
        leftHandPivot,
        rightLegHip,
        rightThigh: rightThighTM.mesh,
        rightLegKnee,
        rightShin: rightShinTM.mesh,
        leftLegHip,
        leftThigh: leftThighTM.mesh,
        leftLegKnee,
        leftShin: leftShinTM.mesh,
        equipWeapon,
        removeWeapon,
        dispose,
    }
}
