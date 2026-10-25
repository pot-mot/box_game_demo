import {
    BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, LineLoop,
    BufferGeometry, BufferAttribute, Matrix4, Vector3, Quaternion, Euler,
    type Scene,
} from 'three'
import {
    ATTACK_HIT_BOX_COLOR, ATTACK_HIT_BOX_INACTIVE_OPACITY, TARGET_HIT_BOX_COLOR,
    ATTACK_DETECT_BOX_COLOR, VISION_FAN_COLOR,
} from './constants.ts'
import {VISION_FAN_RAY_COUNT} from '../ai/constants.ts'
import type {WorldHurtBlock} from '../../../character/hurt_blocks.ts'

/** 受击子块调试线框容量（人形 12 块，留余量） */
const HURT_DEBUG_CAPACITY = 32

/** 武器 / 检测箱调试线框容量（攻击箱、检测箱均为数组） */
const ATTACK_DEBUG_CAPACITY = 12

/* 模块级共享的单位立方体棱线几何与材质（各实例通过 scale/matrix 调整尺寸，
 * 实体删除时只从场景移除，不销毁共享资源） */
const _unitEdges = new EdgesGeometry(new BoxGeometry(1, 1, 1))
const _targetBoxMat = new LineBasicMaterial({color: TARGET_HIT_BOX_COLOR})
const _detectBoxMat = new LineBasicMaterial({color: ATTACK_DETECT_BOX_COLOR})
const _visionMat = new LineBasicMaterial({color: VISION_FAN_COLOR})

/** 视线扇形调试线段顶点数：扇形扫描射线（步长 45°，共 VISION_FAN_RAY_COUNT 条）+ 目标连线 1 段，每段 2 顶点 */
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
const _localQuat = new Quaternion()
const _localEuler = new Euler()

/** 单个角色的战斗判定调试线框集合 */
export interface AttackHitBoxes {
    /** 攻击判定箱线框（红）：逐项跟随绑定关节 + 局部坐标 / 旋转 */
    readonly weaponBoxes: LineSegments[]
    /** 副手（左手）攻击判定箱线框 */
    readonly offhandWeaponBoxes: LineSegments[]
    /** 受击箱线框（青）：中心 = body 位置，半长由角色 scale 决定，随朝向旋转 */
    readonly targetBox: LineSegments
    /** 受击子块线框池（青）：按 entity.hurtBlocks 逐块摆位；容量 HURT_DEBUG_CAPACITY */
    readonly hurtBoxes: LineSegments[]
    /** 攻击检测箱线框（橙）：逐项跟随绑定关节 */
    readonly detectBoxes: LineSegments[]
    /** 远程子弹攻击箱预览（红）：枪口 / 武器附近的子弹命中体积 */
    readonly projectileBox: LineSegments
    /** 远程射程圆环（橙）：半径 = weapon.range，与圆形距离出招门控同源（仅远程） */
    readonly rangeRing: LineLoop
    /** 视线检测调试线段（蓝）：扇形扫描射线（截断到遮挡点）+ 当前目标连线（每帧写入顶点） */
    readonly visionFan: LineSegments
    /** 视线扇形顶点缓冲（长度 = VISION_FAN_VERTEX_COUNT × 3，直接写入后调 markVisionDirty） */
    readonly visionPositions: Float32Array
    /** 标记视线扇形顶点已更新（提交 GPU） */
    markVisionDirty: () => void
    /** 攻击箱命中窗口状态：激活时 100% 不透明，未激活时半透明（默认 50%） */
    setAttackActive: (active: boolean) => void
    /** 从场景移除（几何 / 共享材质不销毁，实例攻击材质释放） */
    dispose: () => void
}

/** 创建角色的战斗判定调试线框（初始隐藏，可见性由 setCollisionVisible 控制） */
export const createAttackHitBoxes = (scene: Scene): AttackHitBoxes => {
    /* 攻击箱材质为实例级：命中窗口激活时切换不透明度，不能与其他角色共享 */
    const attackMat = new LineBasicMaterial({
        color: ATTACK_HIT_BOX_COLOR,
        transparent: true,
        opacity: ATTACK_HIT_BOX_INACTIVE_OPACITY,
    })
    const weaponBoxes: LineSegments[] = []
    const offhandWeaponBoxes: LineSegments[] = []
    const detectBoxes: LineSegments[] = []
    for (let i = 0; i < ATTACK_DEBUG_CAPACITY; i++) {
        const weaponBox = new LineSegments(_unitEdges, attackMat)
        weaponBox.matrixAutoUpdate = false
        weaponBox.visible = false
        scene.add(weaponBox)
        weaponBoxes.push(weaponBox)
        const offhandBox = new LineSegments(_unitEdges, attackMat)
        offhandBox.matrixAutoUpdate = false
        offhandBox.visible = false
        scene.add(offhandBox)
        offhandWeaponBoxes.push(offhandBox)
        const detectBox = new LineSegments(_unitEdges, _detectBoxMat)
        detectBox.matrixAutoUpdate = false
        detectBox.visible = false
        scene.add(detectBox)
        detectBoxes.push(detectBox)
    }

    const projectileBox = new LineSegments(_unitEdges, attackMat)
    projectileBox.matrixAutoUpdate = false
    projectileBox.visible = false
    scene.add(projectileBox)

    const targetBox = new LineSegments(_unitEdges, _targetBoxMat)

    /* 受击子块线框池（青色，与 targetBox 同材质）：逐块矩阵驱动 */
    const hurtBoxes: LineSegments[] = []
    for (let i = 0; i < HURT_DEBUG_CAPACITY; i++) {
        const box = new LineSegments(_unitEdges, _targetBoxMat)
        box.matrixAutoUpdate = false
        box.visible = false
        scene.add(box)
        hurtBoxes.push(box)
    }
    /* 射程圆环与检测箱同为「AI 出招触发区」语义，共用橙色材质 */
    const rangeRing = new LineLoop(_ringGeo, _detectBoxMat)

    const visionPositions = new Float32Array(VISION_FAN_VERTEX_COUNT * 3)
    const visionGeo = new BufferGeometry()
    const visionAttr = new BufferAttribute(visionPositions, 3)
    visionGeo.setAttribute('position', visionAttr)
    const visionFan = new LineSegments(visionGeo, _visionMat)
    /* 顶点逐帧改写，禁用视锥剔除避免包围盒滞后误剔除 */
    visionFan.frustumCulled = false

    targetBox.visible = false
    rangeRing.visible = false
    visionFan.visible = false
    scene.add(targetBox)
    scene.add(rangeRing)
    scene.add(visionFan)

    return {
        weaponBoxes,
        offhandWeaponBoxes,
        targetBox,
        hurtBoxes,
        detectBoxes,
        projectileBox,
        rangeRing,
        visionFan,
        visionPositions,
        markVisionDirty: () => { visionAttr.needsUpdate = true },
        setAttackActive: (active: boolean) => {
            attackMat.opacity = active ? 1 : ATTACK_HIT_BOX_INACTIVE_OPACITY
        },
        dispose: () => {
            for (const box of weaponBoxes) scene.remove(box)
            for (const box of offhandWeaponBoxes) scene.remove(box)
            for (const box of detectBoxes) scene.remove(box)
            scene.remove(projectileBox)
            scene.remove(targetBox)
            scene.remove(rangeRing)
            scene.remove(visionFan)
            for (const box of hurtBoxes) scene.remove(box)
            visionGeo.dispose()
            attackMat.dispose()
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
    localRotation?: {x: number; y: number; z: number},
): void => {
    _localPos.set(localCenter.x, localCenter.y, localCenter.z)
    _localScale.set(localHalf.x * 2, localHalf.y * 2, localHalf.z * 2)
    if (localRotation === undefined) {
        _localQuat.copy(_identityQuat)
    } else {
        _localEuler.set(localRotation.x, localRotation.y, localRotation.z, 'XYZ')
        _localQuat.setFromEuler(_localEuler)
    }
    _localMat.compose(_localPos, _localQuat, _localScale)
    box.matrix.copy(matrixWorld).multiply(_localMat)
}

/**
 * 用受击块世界变换（中心 + 三轴）装配单位棱线矩阵，使线框与判定形状一致（盒精确；球/柱用包围尺寸近似）。
 * 设置 visible 由调用方在本帧统一处理（未使用到的线框由 world.ts 隐藏）。
 */
export const syncHurtDebugBox = (box: LineSegments, b: WorldHurtBlock): void => {
    let sx: number
    let sy: number
    let sz: number
    if (b.kind === 'box') {
        sx = b.half.x * 2; sy = b.half.y * 2; sz = b.half.z * 2
    } else if (b.kind === 'sphere') {
        sx = b.radius * 2; sy = b.radius * 2; sz = b.radius * 2
    } else {
        sx = b.radius * 2; sy = b.halfHeight * 2; sz = b.radius * 2
    }
    const a0 = b.axes[0]
    const a1 = b.axes[1]
    const a2 = b.axes[2]
    box.matrix.set(
        a0.x * sx, a1.x * sy, a2.x * sz, b.center.x,
        a0.y * sx, a1.y * sy, a2.y * sz, b.center.y,
        a0.z * sx, a1.z * sy, a2.z * sz, b.center.z,
        0, 0, 0, 1,
    )
}
