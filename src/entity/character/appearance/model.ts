import {Group, Mesh, BoxGeometry, MeshStandardMaterial, CanvasTexture, NearestFilter} from 'three'
import type {CharacterConfig} from '../../../character/types.ts'
import type {CharacterModel, CharacterColorPalette} from './types.ts'
import type {WeaponMeshConfig} from './weapon_mesh.ts'
import {createWeaponMesh} from './weapon_mesh.ts'
import {
    HEAD_RATIO,
    BODY_RATIO,
    LEG_RATIO,
    ARM_WIDTH_RATIO,
    LEG_WIDTH_RATIO,
    ARM_X_GAP,
    LEG_X_GAP,
    MODEL_ROUGHNESS,
    BODY_DEPTH_RATIO,
    BACK_DARKEN_RATIO,
    SIDE_DARKEN_RATIO,
    FACE_CANVAS_SIZE,
    SELECT_PALETTE,
    darken,
} from './constants.ts'

interface TrackedMesh {
    mesh: Mesh
    geometry: BoxGeometry
    materials: readonly MeshStandardMaterial[]
}

/** BoxGeometry 面序：0=+X右, 1=-X左, 2=+Y顶, 3=-Y底, 4=+Z前, 5=-Z后 */
const createMaterial = (color: number, map?: CanvasTexture): MeshStandardMaterial =>
    new MeshStandardMaterial({
        color,
        roughness: MODEL_ROUGHNESS,
        metalness: 0.1,
        map,
    })

/** 创建正面亮 / 侧面暗 / 背面最暗的多材质 Box */
const createTwoFaceBox = (w: number, h: number, d: number, frontColor: number): TrackedMesh => {
    const geometry = new BoxGeometry(w, h, d)
    const sideColor = darken(frontColor, SIDE_DARKEN_RATIO)
    const backColor2 = darken(frontColor, BACK_DARKEN_RATIO)
    const mats = [
        createMaterial(sideColor),
        createMaterial(sideColor),
        createMaterial(frontColor),
        createMaterial(darken(frontColor, 0.6)),
        createMaterial(frontColor),
        createMaterial(backColor2),
    ]
    const mesh = new Mesh(geometry, mats)
    mesh.castShadow = true
    return {mesh, geometry, materials: mats}
}

/** 创建头部：前面=脸部 CanvasTexture，其他面=头发色 */
const createHeadBox = (w: number, h: number, d: number, palette: CharacterColorPalette): TrackedMesh => {
    const geometry = new BoxGeometry(w, h, d)
    const faceTexture = drawFaceCanvas(palette.skinColor)

    const mats = [
        createMaterial(palette.hairColor),
        createMaterial(palette.hairColor),
        createMaterial(palette.hairColor),
        createMaterial(palette.skinColor),
        createMaterial(palette.skinColor, faceTexture),
        createMaterial(darken(palette.hairColor, 0.8)),
    ]
    const mesh = new Mesh(geometry, mats)
    mesh.castShadow = true
    return {mesh, geometry, materials: mats}
}

/** Canvas 绘制像素风脸部 */
const drawFaceCanvas = (skinColor: number): CanvasTexture => {
    const size = FACE_CANVAS_SIZE
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const r = (skinColor >> 16) & 0xff
    const g = (skinColor >> 8) & 0xff
    const b = skinColor & 0xff
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, size, size)

    const ex = 38
    const ey = 46
    const ew = 11
    const eh = 13

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(ex, ey, ew, eh, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size - ex, ey, ew, eh, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.ellipse(ex + 2, ey + 1, 5, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size - ex - 2, ey + 1, 5, 6, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#332020'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(size / 2, 70, 16, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()

    const texture = new CanvasTexture(canvas)
    texture.minFilter = NearestFilter
    texture.magFilter = NearestFilter
    return texture
}

/** 构建完整的方块人模型 Group 层级，返回模型引用 + 武器挂载点 */
export const createCharacterModel = (config: CharacterConfig, faction: number): CharacterModel => {
    const palette = SELECT_PALETTE(faction)
    const tracked: TrackedMesh[] = []

    const H = config.height
    const R = config.radius

    const headH = H * HEAD_RATIO
    const bodyH = H * BODY_RATIO
    const legH = H * LEG_RATIO

    const bodyW = R * 2
    const bodyD = bodyW * BODY_DEPTH_RATIO
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
    const rightThighTM = createTwoFaceBox(legW, hipH, legD, palette.legColor)
    rightThighTM.mesh.position.y = -hipH / 2
    rightLegHip.add(rightThighTM.mesh)
    tracked.push(rightThighTM)

    const rightLegKnee = new Group()
    rightLegKnee.position.y = -hipH
    rightLegHip.add(rightLegKnee)
    const rightShinTM = createTwoFaceBox(shinW, shinH, shinD, palette.legColor)
    rightShinTM.mesh.position.y = -shinH / 2
    rightLegKnee.add(rightShinTM.mesh)
    tracked.push(rightShinTM)

    group.add(rightLegHip)

    // ── 左腿 ──
    const leftLegHip = new Group()
    leftLegHip.position.set(-hipX, hipY, 0)
    const leftThighTM = createTwoFaceBox(legW, hipH, legD, palette.legColor)
    leftThighTM.mesh.position.y = -hipH / 2
    leftLegHip.add(leftThighTM.mesh)
    tracked.push(leftThighTM)

    const leftLegKnee = new Group()
    leftLegKnee.position.y = -hipH
    leftLegHip.add(leftLegKnee)
    const leftShinTM = createTwoFaceBox(shinW, shinH, shinD, palette.legColor)
    leftShinTM.mesh.position.y = -shinH / 2
    leftLegKnee.add(leftShinTM.mesh)
    tracked.push(leftShinTM)

    group.add(leftLegHip)

    // ── 身体 ──
    const bodyTM = createTwoFaceBox(bodyW, bodyH, bodyD, palette.bodyColor)
    bodyTM.mesh.position.y = bodyCenterY
    group.add(bodyTM.mesh)
    tracked.push(bodyTM)

    // ── 右臂 ──
    const rightArmShoulder = new Group()
    rightArmShoulder.position.set(shoulderX, shoulderY, 0)
    const rightUpperArmTM = createTwoFaceBox(armW, upperArmH, armD, palette.bodyColor)
    rightUpperArmTM.mesh.position.y = -upperArmH / 2
    rightArmShoulder.add(rightUpperArmTM.mesh)
    tracked.push(rightUpperArmTM)

    const rightArmElbow = new Group()
    rightArmElbow.position.y = -upperArmH
    rightArmShoulder.add(rightArmElbow)
    const rightForearmTM = createTwoFaceBox(forearmW, forearmH, forearmD, palette.bodyColor)
    rightForearmTM.mesh.position.y = -forearmH / 2
    rightArmElbow.add(rightForearmTM.mesh)
    tracked.push(rightForearmTM)

    const rightHandPivot = new Group()
    rightHandPivot.position.y = -forearmH
    rightArmElbow.add(rightHandPivot)

    group.add(rightArmShoulder)

    // ── 左臂 ──
    const leftArmShoulder = new Group()
    leftArmShoulder.position.set(-shoulderX, shoulderY, 0)
    const leftUpperArmTM = createTwoFaceBox(armW, upperArmH, armD, palette.bodyColor)
    leftUpperArmTM.mesh.position.y = -upperArmH / 2
    leftArmShoulder.add(leftUpperArmTM.mesh)
    tracked.push(leftUpperArmTM)

    const leftArmElbow = new Group()
    leftArmElbow.position.y = -upperArmH
    leftArmShoulder.add(leftArmElbow)
    const leftForearmTM = createTwoFaceBox(forearmW, forearmH, forearmD, palette.bodyColor)
    leftForearmTM.mesh.position.y = -forearmH / 2
    leftArmElbow.add(leftForearmTM.mesh)
    tracked.push(leftForearmTM)

    const leftHandPivot = new Group()
    leftHandPivot.position.y = -forearmH
    leftArmElbow.add(leftHandPivot)

    group.add(leftArmShoulder)

    // ── 头 ──
    const headNeck = new Group()
    headNeck.position.y = shoulderY
    const headTM = createHeadBox(headW, headH, bodyW, palette)
    headTM.mesh.position.y = headH / 2
    headNeck.add(headTM.mesh)
    tracked.push(headTM)
    group.add(headNeck)

    let weaponGroup: Group | null = null
    let weaponHitCenter: Mesh | null = null
    let weaponCleanup: (() => void) | null = null

    const removeWeapon = (): void => {
        if (weaponGroup) {
            rightHandPivot.remove(weaponGroup)
            weaponCleanup?.()
            weaponGroup = null
            weaponHitCenter = null
            weaponCleanup = null
        }
    }

    const equipWeapon = (meshConfig: WeaponMeshConfig): void => {
        removeWeapon()
        const result = createWeaponMesh(meshConfig)
        weaponGroup = result.group
        weaponHitCenter = result.hitCenter
        weaponCleanup = result.cleanup
        rightHandPivot.add(weaponGroup)
    }

    const dispose = (): void => {
        removeWeapon()
        for (const tm of tracked.splice(0)) {
            tm.mesh.removeFromParent()
            tm.geometry.dispose()
            for (const mat of tm.materials) mat.dispose()
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
        get weaponMesh() { return weaponHitCenter },
        dispose,
    }
}
