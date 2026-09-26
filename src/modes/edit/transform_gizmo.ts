/**
 * 3D 变换 Gizmo——平移轴（红/黄/蓝 → X/Y/Z）+ 旋转圆弧。
 * 通用实现：通过回调通知调用方平移/旋转结果，不依赖特定实体类型。
 */
import {
    Group, Line, Mesh as ThreeMesh, LineBasicMaterial, MeshBasicMaterial, BufferGeometry, Object3D,
    CylinderGeometry, TorusGeometry, Vector3, Plane, Raycaster, Quaternion, DoubleSide,
    type PerspectiveCamera,
} from 'three'

/** 红=X，黄=Y，蓝=Z */
const AXIS_COLORS = {x: 0xff3333, y: 0xdddd33, z: 0x3366ff} as const
const GIZMO_AXIS_LENGTH = 1.2
const GIZMO_ARC_RADIUS = 0.8
const GIZMO_TUBE = 0.02
/** 拾取圆柱半径（不可见 Mesh 射线检测体积） */
export const GIZMO_PICK_CYLINDER_RADIUS = 0.05
/** 拾取圆柱起点偏移：避开原点处的关节小球/旋转锥体（骨骼编辑）与实体中心 */
export const GIZMO_PICK_START_OFFSET = 0.15
/** 平移轴常态/悬停/选中三档透明度 */
export const GIZMO_OPACITY_NORMAL = 0.5
export const GIZMO_OPACITY_HOVER = 0.7
export const GIZMO_OPACITY_ACTIVE = 1
/** 旋转圆弧常态/悬停/选中三档透明度（低于平移轴，避免遮挡实体） */
export const GIZMO_ARC_OPACITY_NORMAL = 0.3
export const GIZMO_ARC_OPACITY_HOVER = 0.55
export const GIZMO_ARC_OPACITY_ACTIVE = 0.8

export type GizmoPartType = 'translate_x' | 'translate_y' | 'translate_z' | 'rotate_x' | 'rotate_y' | 'rotate_z'

/** 拖拽回调：调用方通过回调应用变换到具体实体 */
export interface GizmoDragCallbacks {
    /** 平移回调：接收沿轴投影后的新世界坐标 */
    onTranslate: (newWorldPos: Vector3) => void
    /** 旋转回调：接收新四元数（世界空间） */
    onRotate: (newWorldQuat: Quaternion) => void
}

export interface DragState {
    readonly partType: GizmoPartType
    readonly callbacks: GizmoDragCallbacks
    readonly startHit: Vector3
    readonly plane: Plane
    readonly entityStartPos: Vector3
    readonly entityStartQuat: Quaternion
    /** 世界空间轴（局部轴经 gizmo 对齐旋转变换） */
    readonly worldAxis: Vector3
    /** 旋转拖拽用：上一帧的平面角度（用于跨 ±π 展开，实现连续超过 360° 旋转） */
    lastAngle: number
    /** 旋转拖拽用：自起手累计的旋转角（可超过 ±2π） */
    accumulatedAngle: number
}

export interface TransformGizmo {
    readonly group: Group
    hitTest: (raycaster: Raycaster) => GizmoPartType | undefined
    startDrag: (
        partType: GizmoPartType,
        entityWorldPos: Vector3,
        entityWorldQuat: Quaternion,
        callbacks: GizmoDragCallbacks,
        camera: PerspectiveCamera,
        raycaster: Raycaster,
    ) => DragState | undefined
    updateDrag: (state: DragState, camera: PerspectiveCamera, raycaster: Raycaster) => void
    setVisible: (v: boolean) => void
    /** 设置悬停部件（透明度提升一档） */
    setHoverPart: (part: GizmoPartType | undefined) => void
    /** 设置拖拽中部件（透明度最高档） */
    setActivePart: (part: GizmoPartType | undefined) => void
    /** 显示/隐藏旋转圆弧（全部轴，无法旋转的目标隐藏） */
    setRotateVisible: (v: boolean) => void
    /** 显示/隐藏指定轴的旋转圆弧（角色仅保留水平面 Y 轴） */
    setRotateAxisVisible: (axis: 'x' | 'y' | 'z', v: boolean) => void
    dispose: () => void
}

/** 获取轴名称对应的单位向量 */
const axisVec = (key: 'x' | 'y' | 'z'): Vector3 =>
    new Vector3(key === 'x' ? 1 : 0, key === 'y' ? 1 : 0, key === 'z' ? 1 : 0)

/** 从 partType 提取轴 key（安全查找表替代字符串拆分+断言） */
const AXIS_KEY_MAP: Record<GizmoPartType, 'x' | 'y' | 'z'> = {
    translate_x: 'x', translate_y: 'y', translate_z: 'z',
    rotate_x: 'x', rotate_y: 'y', rotate_z: 'z',
}
/** 供测试与外部使用：从 partType 提取轴 key */
export const partAxis = (part: GizmoPartType): 'x' | 'y' | 'z' => AXIS_KEY_MAP[part]

/** 旋转轴遍历顺序 */
const ROTATE_AXES = ['x', 'y', 'z'] as const
/** 旋转圆弧部件类型按轴映射（避免模板字符串断言） */
const ROTATE_PART_BY_AXIS: Record<'x' | 'y' | 'z', GizmoPartType> = {
    x: 'rotate_x', y: 'rotate_y', z: 'rotate_z',
}

/** 为平移构建约束平面（包含轴与视线的平面，视线平行轴时降级） */
export const buildTranslatePlane = (axis: Vector3, center: Vector3, cameraPos: Vector3): Plane => {
    const viewDir = cameraPos.clone().sub(center).normalize()
    let planeNormal = new Vector3().crossVectors(axis, viewDir).cross(axis).normalize()
    if (planeNormal.lengthSq() < 0.001) {
        planeNormal = new Vector3().crossVectors(axis, new Vector3(0, 1, 0)).normalize()
        if (planeNormal.lengthSq() < 0.001) {
            planeNormal = new Vector3().crossVectors(axis, new Vector3(1, 0, 0)).normalize()
        }
    }
    const plane = new Plane()
    plane.setFromNormalAndCoplanarPoint(planeNormal, center)
    return plane
}

/** 为旋转构建约束平面：垂直于旋转轴，过实体中心 */
export const buildRotatePlane = (axis: Vector3, center: Vector3): Plane => {
    const plane = new Plane()
    plane.setFromNormalAndCoplanarPoint(axis, center)
    return plane
}

/** 将世界点投影到平面上并返回平面局部 2D 坐标（相对于中心） */
export const projectToPlane2D = (point: Vector3, plane: Plane, center: Vector3): {u: number; v: number} => {
    const local = point.clone().sub(center)
    const normal = plane.normal
    let tangentU = new Vector3(1, 0, 0)
    if (Math.abs(normal.dot(tangentU)) > 0.9) tangentU = new Vector3(0, 1, 0)
    tangentU.crossVectors(normal, tangentU).normalize()
    const tangentV = new Vector3().crossVectors(normal, tangentU).normalize()
    return {u: local.dot(tangentU), v: local.dot(tangentV)}
}

export const createTransformGizmo = (): TransformGizmo => {
    const group = new Group()
    group.name = 'transform-gizmo'
    /** 全部拾取对象（射线检测用） */
    const translatePickParts: Object3D[] = []
    /** 可见旋转弧与拾取对象按轴分组 */
    const rotateVisualsByAxis: Record<'x' | 'y' | 'z', Object3D[]> = {x: [], y: [], z: []}
    const rotatePickByAxis: Record<'x' | 'y' | 'z', Object3D[]> = {x: [], y: [], z: []}
    /** 部件 → 可见材质（透明度状态机控制） */
    const partMaterials = new Map<GizmoPartType, LineBasicMaterial | MeshBasicMaterial>()
    /** 悬停/拖拽中的部件 */
    let hoverPart: GizmoPartType | undefined
    let activePart: GizmoPartType | undefined
    let rotateVisible = true
    /** 各轴圆弧可见性（角色隐藏 X/Z，仅保留水平面 Y） */
    const rotateAxisVisible: Record<'x' | 'y' | 'z', boolean> = {x: true, y: true, z: true}

    /** 按 hover/active 状态刷新全部可见材质透明度（平移轴与圆弧各有一组档位） */
    const refreshOpacity = (): void => {
        for (const [part, material] of partMaterials) {
            /** 圆弧使用更低的透明度档位 */
            const isArc = part.startsWith('rotate')
            const normal = isArc ? GIZMO_ARC_OPACITY_NORMAL : GIZMO_OPACITY_NORMAL
            const hover = isArc ? GIZMO_ARC_OPACITY_HOVER : GIZMO_OPACITY_HOVER
            const active = isArc ? GIZMO_ARC_OPACITY_ACTIVE : GIZMO_OPACITY_ACTIVE
            if (part === activePart) {
                material.opacity = active
            } else if (part === hoverPart) {
                material.opacity = hover
            } else {
                material.opacity = normal
            }
        }
    }

    /* ── 平移轴 ── */
    const buildTranslateAxis = (dir: Vector3, color: number, partType: GizmoPartType): void => {
        /** 轴线与锥体共享材质，透明度统一控制 */
        const material = new LineBasicMaterial({
            color, depthTest: false, transparent: true, opacity: GIZMO_OPACITY_NORMAL,
        })
        const lineGeo = new BufferGeometry().setFromPoints([
            new Vector3(0, 0, 0),
            dir.clone().multiplyScalar(GIZMO_AXIS_LENGTH),
        ])
        const line = new Line(lineGeo, material)
        line.renderOrder = 999
        group.add(line)

        const coneGeo = new CylinderGeometry(0, 0.05, 0.18, 8)
        const coneEdges = new Line(coneGeo, material)
        coneEdges.renderOrder = 999
        coneEdges.position.copy(dir.clone().multiplyScalar(GIZMO_AXIS_LENGTH))
        if (dir.x === 1) coneEdges.rotation.z = -Math.PI / 2
        else if (dir.z === 1) coneEdges.rotation.x = Math.PI / 2
        group.add(coneEdges)
        partMaterials.set(partType, material)

        /** 粗拾取圆柱（不可见 Mesh，射线检测命中实心三角面；
         *  起点避开原点，防止覆盖关节小球/旋转锥体） */
        const pickLen = GIZMO_AXIS_LENGTH - GIZMO_PICK_START_OFFSET
        const pickGeo = new CylinderGeometry(GIZMO_PICK_CYLINDER_RADIUS, GIZMO_PICK_CYLINDER_RADIUS, pickLen, 6)
        const pickCyl = new ThreeMesh(pickGeo, new MeshBasicMaterial({visible: false}))
        pickCyl.renderOrder = 999
        pickCyl.userData.gizmoPart = partType
        pickCyl.position.copy(dir.clone().multiplyScalar(GIZMO_PICK_START_OFFSET + pickLen / 2))
        if (dir.x === 1) pickCyl.rotation.z = -Math.PI / 2
        else if (dir.z === 1) pickCyl.rotation.x = Math.PI / 2
        group.add(pickCyl)
        translatePickParts.push(pickCyl)
    }

    /* ── 旋转圆弧 ── */
    const buildRotateArc = (axis: Vector3, color: number, partType: GizmoPartType): void => {
        const key = partAxis(partType)
        /** 实体管状弧：粗细随 gizmo 整体缩放适应视图 */
        const torusGeo = new TorusGeometry(GIZMO_ARC_RADIUS, GIZMO_TUBE, 8, 48, Math.PI * 1.5)
        const arcMaterial = new MeshBasicMaterial({
            color, depthTest: false, transparent: true, opacity: GIZMO_ARC_OPACITY_NORMAL, side: DoubleSide,
        })
        const arc = new ThreeMesh(torusGeo, arcMaterial)
        arc.renderOrder = 998
        /** torus 默认在 XY 平面，绕 Z 轴旋转 */
        if (axis.x === 1) arc.rotation.y = Math.PI / 2
        else if (axis.y === 1) arc.rotation.x = Math.PI / 2
        group.add(arc)
        rotateVisualsByAxis[key].push(arc)
        partMaterials.set(partType, arcMaterial)

        const pickGeo = new TorusGeometry(GIZMO_ARC_RADIUS, 0.08, 6, 32, Math.PI * 1.5)
        const pickArc = new ThreeMesh(pickGeo, new MeshBasicMaterial({visible: false}))
        pickArc.renderOrder = 998
        pickArc.userData.gizmoPart = partType
        if (axis.x === 1) pickArc.rotation.y = Math.PI / 2
        else if (axis.y === 1) pickArc.rotation.x = Math.PI / 2
        group.add(pickArc)
        rotatePickByAxis[key].push(pickArc)
    }

    buildTranslateAxis(new Vector3(1, 0, 0), AXIS_COLORS.x, 'translate_x')
    buildTranslateAxis(new Vector3(0, 1, 0), AXIS_COLORS.y, 'translate_y')
    buildTranslateAxis(new Vector3(0, 0, 1), AXIS_COLORS.z, 'translate_z')
    buildRotateArc(new Vector3(1, 0, 0), AXIS_COLORS.x, 'rotate_x')
    buildRotateArc(new Vector3(0, 1, 0), AXIS_COLORS.y, 'rotate_y')
    buildRotateArc(new Vector3(0, 0, 1), AXIS_COLORS.z, 'rotate_z')

    /** 预构建拾取对象组合（全轴可见时），避免 hitTest 每帧新建数组 */
    const allPickParts: Object3D[] = [
        ...translatePickParts,
        ...rotatePickByAxis.x, ...rotatePickByAxis.y, ...rotatePickByAxis.z,
    ]
    /** 当前参与射线检测的拾取对象（随圆弧可见性重建） */
    let activePickParts: Object3D[] = allPickParts

    /** 按 rotateVisible + 各轴可见性重建拾取对象组合 */
    const rebuildPickParts = (): void => {
        if (!rotateVisible) {
            activePickParts = translatePickParts
            return
        }
        /** 全轴可见时复用预构建数组 */
        if (rotateAxisVisible.x && rotateAxisVisible.y && rotateAxisVisible.z) {
            activePickParts = allPickParts
            return
        }
        const parts: Object3D[] = [...translatePickParts]
        for (const key of ROTATE_AXES) {
            if (rotateAxisVisible[key]) parts.push(...rotatePickByAxis[key])
        }
        activePickParts = parts
    }

    /** 综合整体开关与各轴开关刷新圆弧可见性 */
    const refreshRotateVisibility = (): void => {
        for (const key of ROTATE_AXES) {
            const visible = rotateVisible && rotateAxisVisible[key]
            for (const visual of rotateVisualsByAxis[key]) {
                visual.visible = visible
            }
        }
        rebuildPickParts()
    }

    group.visible = false

    const VALID_GIZMO_PARTS = new Set<string>([
        'translate_x', 'translate_y', 'translate_z',
        'rotate_x', 'rotate_y', 'rotate_z',
    ])

    const hitTest = (raycaster: Raycaster): GizmoPartType | undefined => {
        if (!group.visible) return undefined
        /** 同步世界矩阵：gizmo 位置/旋转可能刚被 updater 更新，raycast 依赖 matrixWorld */
        group.updateMatrixWorld(true)
        const hits = raycaster.intersectObjects(activePickParts, false)
        if (hits.length === 0) return undefined
        const part = hits[0].object.userData.gizmoPart
        if (typeof part === 'string' && VALID_GIZMO_PARTS.has(part)) {
            return part as GizmoPartType
        }
        return undefined
    }

    const startDrag = (
        partType: GizmoPartType,
        entityWorldPos: Vector3,
        entityWorldQuat: Quaternion,
        callbacks: GizmoDragCallbacks,
        camera: PerspectiveCamera,
        raycaster: Raycaster,
    ): DragState | undefined => {
        const center = entityWorldPos.clone()
        const isTranslate = partType.startsWith('translate')
        /** 局部轴经 gizmo 对齐旋转变换到世界空间（gizmo 跟随实体旋转） */
        const worldAxis = axisVec(partAxis(partType)).applyQuaternion(group.quaternion).normalize()

        const plane = isTranslate
            ? buildTranslatePlane(worldAxis, center, camera.position)
            : buildRotatePlane(worldAxis, center)

        const startHit = new Vector3()
        if (!raycaster.ray.intersectPlane(plane, startHit)) return undefined

        /* 旋转拖拽：记录起手平面角度作为累计基准 */
        const start2D = projectToPlane2D(startHit, plane, center)
        const startAngle = Math.atan2(start2D.v, start2D.u)

        return {
            partType,
            callbacks,
            startHit,
            plane,
            entityStartPos: entityWorldPos.clone(),
            entityStartQuat: entityWorldQuat.clone(),
            worldAxis,
            lastAngle: startAngle,
            accumulatedAngle: 0,
        }
    }

    const updateDrag = (state: DragState, _camera: PerspectiveCamera, raycaster: Raycaster): void => {
        const currentHit = new Vector3()
        if (!raycaster.ray.intersectPlane(state.plane, currentHit)) return

        const isTranslate = state.partType.startsWith('translate')

        if (isTranslate) {
            const axis = state.worldAxis
            const delta = currentHit.clone().sub(state.startHit)
            const projected = delta.dot(axis)
            const newPos = state.entityStartPos.clone().add(axis.clone().multiplyScalar(projected))
            state.callbacks.onTranslate(newPos)
        } else {
            /** 旋转：在约束平面上计算角度差，逐帧展开避免 ±π 跳变 */
            const axis = state.worldAxis
            const center = state.entityStartPos
            const cur2D = projectToPlane2D(currentHit, state.plane, center)
            const curAngle = Math.atan2(cur2D.v, cur2D.u)
            let step = curAngle - state.lastAngle
            /** 单帧步进展开到 (-π, π]，累计后即可连续旋转任意圈数 */
            if (step > Math.PI) step -= 2 * Math.PI
            else if (step < -Math.PI) step += 2 * Math.PI
            state.accumulatedAngle += step
            state.lastAngle = curAngle

            const deltaQuat = new Quaternion().setFromAxisAngle(axis, state.accumulatedAngle)
            const newQuat = deltaQuat.multiply(state.entityStartQuat.clone())
            state.callbacks.onRotate(newQuat)
        }
    }

    const setVisible = (v: boolean): void => {
        group.visible = v
    }

    const setHoverPart = (part: GizmoPartType | undefined): void => {
        if (hoverPart === part) return
        hoverPart = part
        refreshOpacity()
    }

    const setActivePart = (part: GizmoPartType | undefined): void => {
        if (activePart === part) return
        activePart = part
        refreshOpacity()
    }

    const setRotateVisible = (v: boolean): void => {
        if (rotateVisible === v) return
        rotateVisible = v
        refreshRotateVisibility()
        /** 圆弧隐藏时清除相关状态 */
        if (!v) {
            if (hoverPart?.startsWith('rotate') === true) {
                hoverPart = undefined
                refreshOpacity()
            }
            if (activePart?.startsWith('rotate') === true) {
                activePart = undefined
                refreshOpacity()
            }
        }
    }

    const setRotateAxisVisible = (axis: 'x' | 'y' | 'z', v: boolean): void => {
        if (rotateAxisVisible[axis] === v) return
        rotateAxisVisible[axis] = v
        refreshRotateVisibility()
        /** 该轴圆弧隐藏时清除其 hover/active 状态 */
        if (!v) {
            const partType = ROTATE_PART_BY_AXIS[axis]
            if (hoverPart === partType) {
                hoverPart = undefined
                refreshOpacity()
            }
            if (activePart === partType) {
                activePart = undefined
                refreshOpacity()
            }
        }
    }

    const dispose = (): void => {
        /** 轴/锥体共享材质：Set 去重后统一释放 */
        const materials = new Set<LineBasicMaterial | MeshBasicMaterial>()
        for (const child of group.children) {
            if (child instanceof Line || child instanceof ThreeMesh) {
                child.geometry.dispose()
                const mat = child.material
                if (mat instanceof LineBasicMaterial || mat instanceof MeshBasicMaterial) {
                    materials.add(mat)
                }
            }
        }
        for (const material of materials) material.dispose()
        group.clear()
    }

    return {
        group, hitTest, startDrag, updateDrag, setVisible,
        setHoverPart, setActivePart, setRotateVisible, setRotateAxisVisible, dispose,
    }
}
