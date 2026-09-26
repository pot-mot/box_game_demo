import {
    BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, LineLoop,
    BufferGeometry, BufferAttribute, Matrix4, Vector3, Quaternion,
    type Scene,
} from 'three'
import {
    ATTACK_HIT_BOX_COLOR, TARGET_HIT_BOX_COLOR,
    ATTACK_DETECT_BOX_COLOR, VISION_FAN_COLOR,
} from './constants.ts'
import {VISION_FAN_RAY_COUNT} from '../ai/constants.ts'

/* 模块级共享的单位立方体棱线几何与材质（各实例通过 scale/matrix 调整尺寸，
 * 实体删除时只从场景移除，不销毁共享资源） */
const _unitEdges = new EdgesGeometry(new BoxGeometry(1, 1, 1))
const _weaponBoxMat = new LineBasicMaterial({color: ATTACK_HIT_BOX_COLOR})
const _targetBoxMat = new LineBasicMaterial({color: TARGET_HIT_BOX_COLOR})
const _detectBoxMat = new LineBasicMaterial({color: ATTACK_DETECT_BOX_COLOR})
const _visionMat = new LineBasicMaterial({color: VISION_FAN_COLOR})

/** 视线扇形调试线段顶点数：扇形扫描射线（每 10° 一条，共 VISION_FAN_RAY_COUNT 条）+ 目标连线 1 段，每段 2 顶点 */
export const VISION_FAN_VERTEX_COUNT = (VISION_FAN_RAY_COUNT + 1) * 2

/* 射程圆环单位几何：XZ 平面半径 1 的正多边形（实例经 scale 缩放到实际射程） */
const RANGE_RING_SEGMENTS = 48
const _ringGeo = (() => {
    const positions = new Float32Array(RANGE_RING_SEGMENTS * 3)
    for (let i = 0; i < RANGE_RING_SEGMENTS; i++) {
        const a = (i / RANGE_RING_SEGMENTS) * Math.PI * 2
        positions[i * 3] = Math.cos(a)
        positions[i * 3 + 1] = 0
        positions[i * 3 + 2] = Math.sin(a)
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    return geo
})()

/* 武器命中箱矩阵装配复用对象（避免每帧分配） */
const _localMat = new Matrix4()
const _localPos = new Vector3()
const _localScale = new Vector3()
const _identityQuat = new Quaternion()

/** 单个角色的战斗判定调试线框集合 */
export interface AttackHitBoxes {
    /** 攻击判定箱线框（红）：跟随武器模型 matrixWorld，几何 = 武器本地命中箱 */
    readonly weaponBox: LineSegments
    /** 副手（左手）攻击判定箱线框：双持时跟随副手武器模型 */
    readonly offhandWeaponBox: LineSegments
    /** 受击箱线框（青）：中心 = body 位置，半长由角色 scale 决定，随朝向旋转 */
    readonly targetBox: LineSegments
    /** 攻击检测箱线框（橙）：与角色位置/朝向绑定，覆盖身前与两侧（仅近战） */
    readonly detectBox: LineSegments
    /** 远程射程圆环（橙）：半径 = weapon.range，与圆形距离出招门控同源（仅远程） */
    readonly rangeRing: LineLoop
    /** 视线检测调试线段（蓝）：扇形扫描射线（截断到遮挡点）+ 当前目标连线（每帧写入顶点） */
    readonly visionFan: LineSegments
    /** 视线扇形顶点缓冲（长度 = VISION_FAN_VERTEX_COUNT × 3，直接写入后调 markVisionDirty） */
    readonly visionPositions: Float32Array
    /** 标记视线扇形顶点已更新（提交 GPU） */
    markVisionDirty: () => void
    /** 从场景移除（几何/材质为模块级共享，不销毁） */
    dispose: () => void
}

/** 创建角色的战斗判定调试线框（初始隐藏，可见性由 setCollisionVisible 控制） */
export const createAttackHitBoxes = (scene: Scene): AttackHitBoxes => {
    const weaponBox = new LineSegments(_unitEdges, _weaponBoxMat)
    /* 命中箱完全由 matrix（matrixWorld × 本地盒变换）驱动，禁用自动矩阵 */
    weaponBox.matrixAutoUpdate = false

    /* 副手命中箱（双持）：与主手同规格，独立矩阵 */
    const offhandWeaponBox = new LineSegments(_unitEdges, _weaponBoxMat)
    offhandWeaponBox.matrixAutoUpdate = false

    const targetBox = new LineSegments(_unitEdges, _targetBoxMat)
    const detectBox = new LineSegments(_unitEdges, _detectBoxMat)
    /* 射程圆环与检测箱同为「AI 出招触发区」语义，共用橙色材质 */
    const rangeRing = new LineLoop(_ringGeo, _detectBoxMat)

    const visionPositions = new Float32Array(VISION_FAN_VERTEX_COUNT * 3)
    const visionGeo = new BufferGeometry()
    const visionAttr = new BufferAttribute(visionPositions, 3)
    visionGeo.setAttribute('position', visionAttr)
    const visionFan = new LineSegments(visionGeo, _visionMat)
    /* 顶点逐帧改写，禁用视锥剔除避免包围盒滞后误剔除 */
    visionFan.frustumCulled = false

    weaponBox.visible = false
    offhandWeaponBox.visible = false
    targetBox.visible = false
    detectBox.visible = false
    rangeRing.visible = false
    visionFan.visible = false
    scene.add(weaponBox)
    scene.add(offhandWeaponBox)
    scene.add(targetBox)
    scene.add(detectBox)
    scene.add(rangeRing)
    scene.add(visionFan)

    return {
        weaponBox,
        offhandWeaponBox,
        targetBox,
        detectBox,
        rangeRing,
        visionFan,
        visionPositions,
        markVisionDirty: () => { visionAttr.needsUpdate = true },
        dispose: () => {
            scene.remove(weaponBox)
            scene.remove(offhandWeaponBox)
            scene.remove(targetBox)
            scene.remove(detectBox)
            scene.remove(rangeRing)
            scene.remove(visionFan)
            visionGeo.dispose()
        },
    }
}

/**
 * 装配武器命中箱线框矩阵：matrixWorld ×（平移到本地盒中心 × 缩放到盒尺寸）。
 * 单位棱线几何经此变换后与武器本地命中箱 OBB 完全重合，保证所见即所判。
 */
export const syncWeaponDebugBox = (
    box: LineSegments,
    matrixWorld: Matrix4,
    localCenter: {x: number; y: number; z: number},
    localHalf: {x: number; y: number; z: number},
): void => {
    _localPos.set(localCenter.x, localCenter.y, localCenter.z)
    _localScale.set(localHalf.x * 2, localHalf.y * 2, localHalf.z * 2)
    _localMat.compose(_localPos, _identityQuat, _localScale)
    box.matrix.copy(matrixWorld).multiply(_localMat)
}
