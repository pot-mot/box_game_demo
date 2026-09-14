import {describe, it, expect} from 'vitest'
import {
    PerspectiveCamera, Raycaster, Vector2, Vector3, Quaternion,
    Line, Mesh as ThreeMesh, LineBasicMaterial, MeshBasicMaterial,
} from 'three'
import {
    partAxis,
    buildTranslatePlane,
    buildRotatePlane,
    projectToPlane2D,
    createTransformGizmo,
    GIZMO_PICK_START_OFFSET,
    GIZMO_OPACITY_NORMAL,
    GIZMO_OPACITY_HOVER,
    GIZMO_OPACITY_ACTIVE,
    GIZMO_ARC_OPACITY_NORMAL,
    GIZMO_ARC_OPACITY_HOVER,
    GIZMO_ARC_OPACITY_ACTIVE,
    type TransformGizmo,
} from './transform_gizmo.ts'
import {JOINT_GIZMO_RADIUS, ROTATION_GIZMO_OFFSET, ROTATION_GIZMO_HEIGHT, ROTATION_GIZMO_RADIUS} from '../../entity/skeleton/constants.ts'
import {CHARACTER_ENTITY_TYPE, ENTITY_TYPE_VALUES} from '../../entity/constants.ts'

/** 从相机看向屏幕坐标的射线 */
const rayFromScreen = (camera: PerspectiveCamera, x: number, y: number): Raycaster => {
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(x, y), camera)
    return raycaster
}

/** 收集 gizmo 可见部件材质的透明度（跳过隐藏对象与不可见拾取 Mesh） */
const collectOpacities = (gizmo: TransformGizmo): number[] => {
    const out: number[] = []
    for (const child of gizmo.group.children) {
        if (!child.visible) continue
        if (child instanceof Line) {
            const mat = child.material
            if (mat instanceof LineBasicMaterial) out.push(mat.opacity)
        } else if (child instanceof ThreeMesh) {
            const mat = child.material
            if (mat instanceof MeshBasicMaterial && mat.visible) out.push(mat.opacity)
        }
    }
    return out
}

/** 测试用相机：位于 (0,0,5) 看向原点 */
const testCamera = (): PerspectiveCamera => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    return camera
}

describe('transform gizmo 纯数学函数', () => {
    it('partAxis 提取轴 key', () => {
        expect(partAxis('translate_x')).toBe('x')
        expect(partAxis('translate_y')).toBe('y')
        expect(partAxis('translate_z')).toBe('z')
        expect(partAxis('rotate_x')).toBe('x')
        expect(partAxis('rotate_y')).toBe('y')
        expect(partAxis('rotate_z')).toBe('z')
    })

    it('buildRotatePlane 平面垂直于旋转轴且过中心', () => {
        const center = new Vector3(1, 2, 3)
        const plane = buildRotatePlane(new Vector3(0, 1, 0), center)
        expect(plane.normal.x).toBeCloseTo(0, 6)
        expect(plane.normal.y).toBeCloseTo(1, 6)
        expect(plane.normal.z).toBeCloseTo(0, 6)
        /* 平面过中心：法线点积（中心-面上点）= 0 */
        expect(plane.distanceToPoint(center)).toBeCloseTo(0, 6)
    })

    it('buildTranslatePlane 平面包含平移轴且垂直于视线', () => {
        const center = new Vector3(0, 0, 0)
        const cameraPos = new Vector3(0, 0, 5)
        const axis = new Vector3(1, 0, 0)
        const plane = buildTranslatePlane(axis, center, cameraPos)
        /* 轴在平面上：法线与轴垂直 */
        expect(plane.normal.dot(axis)).toBeCloseTo(0, 6)
        /* 视线垂直于轴时法线平行于视线（屏幕平面）：三重叉积 (a×v)×a = v（当 a⊥v） */
        const viewDir = cameraPos.clone().sub(center).normalize()
        expect(Math.abs(plane.normal.dot(viewDir))).toBeCloseTo(1, 6)
        expect(plane.distanceToPoint(center)).toBeCloseTo(0, 6)
    })

    it('buildTranslatePlane 视线平行轴时降级为可用平面', () => {
        const center = new Vector3(0, 0, 0)
        const cameraPos = new Vector3(0, 0, 5)
        const axis = new Vector3(0, 0, 1)
        const plane = buildTranslatePlane(axis, center, cameraPos)
        /* 降级后法线仍与轴垂直（平面包含轴） */
        expect(plane.normal.dot(axis)).toBeCloseTo(0, 6)
        expect(plane.distanceToPoint(center)).toBeCloseTo(0, 6)
    })

    it('projectToPlane2D 计算平面局部 2D 坐标', () => {
        const plane = buildRotatePlane(new Vector3(0, 1, 0), new Vector3(0, 0, 0))
        /* 平面上距中心 (1, 0, 0) 的点，投影后模长 1 */
        const p = projectToPlane2D(new Vector3(1, 0, 0), plane, new Vector3(0, 0, 0))
        expect(Math.hypot(p.u, p.v)).toBeCloseTo(1, 6)
        /* 投影结果不随点在法线方向的偏移变化 */
        const q = projectToPlane2D(new Vector3(1, 3, 0), plane, new Vector3(0, 0, 0))
        expect(q.u).toBeCloseTo(p.u, 6)
        expect(q.v).toBeCloseTo(p.v, 6)
    })
})

describe('transform gizmo 拾取几何避让', () => {
    it('拾取圆柱起点偏移避开关节小球（骨骼编辑模式）', () => {
        /* 拾取圆柱从 GIZMO_PICK_START_OFFSET 处开始，关节小球（半径 JOINT_GIZMO_RADIUS）在原点，
         * 两者沿轴方向无重叠 */
        expect(GIZMO_PICK_START_OFFSET).toBeGreaterThan(JOINT_GIZMO_RADIUS)
    })

    it('旋转锥体半径小于关节小球半径（不遮挡小球正面拾取）', () => {
        expect(ROTATION_GIZMO_RADIUS).toBeLessThan(JOINT_GIZMO_RADIUS)
    })

    it('拾取圆柱起点偏移避开旋转锥体（骨骼编辑模式）', () => {
        /* 旋转锥体几何：ConeGeometry 中心在 mesh.position（z=ROTATION_GIZMO_OFFSET），
         * 半高 = ROTATION_GIZMO_HEIGHT/2；rotation.x=π/2 使尖端指向 +Z。
         * 尖端最大延伸 = ROTATION_GIZMO_OFFSET + ROTATION_GIZMO_HEIGHT/2，
         * 拾取圆柱沿各平移轴从 GIZMO_PICK_START_OFFSET 处开始，需大于该值 */
        const coneTipReach = ROTATION_GIZMO_OFFSET + ROTATION_GIZMO_HEIGHT / 2
        expect(GIZMO_PICK_START_OFFSET).toBeGreaterThan(coneTipReach)
    })
})

describe('transform gizmo 拖拽数学', () => {
    it('平移拖拽沿轴投影出正确位置', () => {
        const gizmo = createTransformGizmo()
        const camera = testCamera()
        const raycaster = rayFromScreen(camera, 0, 0)

        const received: Vector3[] = []
        const state = gizmo.startDrag(
            'translate_x',
            new Vector3(0, 0, 0),
            new Quaternion(),
            {
                onTranslate: (pos) => { received.push(pos.clone()) },
                onRotate: () => {},
            },
            camera,
            raycaster,
        )
        expect(state).toBeDefined()
        if (state === undefined) return
        expect(received).toHaveLength(0)

        /* 屏幕坐标右移 → 世界 X 增大；投影后 Y/Z 保持 0 */
        gizmo.updateDrag(state, camera, rayFromScreen(camera, 0.15, 0))
        expect(received.length).toBeGreaterThan(0)
        const pos = received[received.length - 1]
        expect(pos.x).toBeGreaterThan(0)
        expect(pos.y).toBeCloseTo(0, 6)
        expect(pos.z).toBeCloseTo(0, 6)
        gizmo.dispose()
    })

    it('旋转拖拽产生绕对应轴的四元数', () => {
        const gizmo = createTransformGizmo()
        const camera = testCamera()
        const raycaster = rayFromScreen(camera, 0, 0)

        const received: Quaternion[] = []
        /* 绕 Z 轴：约束平面 z=0，相机在 (0,0,5) 处（不在平面内，射线交点非退化） */
        const state = gizmo.startDrag(
            'rotate_z',
            new Vector3(0, 0, 0),
            new Quaternion(),
            {
                onTranslate: () => {},
                onRotate: (q) => { received.push(q.clone()) },
            },
            camera,
            raycaster,
        )
        expect(state).toBeDefined()
        if (state === undefined) return

        /* 屏幕水平移动 → 世界 X 方向（平面局部 v 轴） → 角度变化 */
        gizmo.updateDrag(state, camera, rayFromScreen(camera, 0.1, 0))
        expect(received.length).toBeGreaterThan(0)
        const q = received[received.length - 1]
        /* 绕 Z 轴旋转的四元数：x/y 分量为 0，z 分量非零 */
        expect(q.x).toBeCloseTo(0, 6)
        expect(q.y).toBeCloseTo(0, 6)
        expect(Math.abs(q.z)).toBeGreaterThan(0)
        gizmo.dispose()
    })

    it('隐藏状态下 hitTest 返回 undefined', () => {
        const gizmo = createTransformGizmo()
        const camera = testCamera()
        /* 默认隐藏 */
        const raycaster = rayFromScreen(camera, 0, 0)
        expect(gizmo.hitTest(raycaster)).toBeUndefined()
        gizmo.dispose()
    })

    it('gizmo 对齐实体旋转后使用世界轴（局部 X 绕 Y 转 90° → 世界 -Z）', () => {
        const gizmo = createTransformGizmo()
        const camera = testCamera()
        /* 模拟实体绕 Y 轴旋转 90°（gizmo 跟随实体旋转） */
        gizmo.group.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
        const state = gizmo.startDrag(
            'translate_x',
            new Vector3(0, 0, 0),
            new Quaternion(),
            {onTranslate: () => {}, onRotate: () => {}},
            camera,
            rayFromScreen(camera, 0, 0),
        )
        expect(state).toBeDefined()
        if (state === undefined) return
        expect(state.worldAxis.x).toBeCloseTo(0, 6)
        expect(state.worldAxis.y).toBeCloseTo(0, 6)
        expect(state.worldAxis.z).toBeCloseTo(-1, 6)
        gizmo.dispose()
    })

    it('对齐旋转后旋转拖拽绕变换后的世界轴（rotate_x → 世界 -Z 轴）', () => {
        const gizmo = createTransformGizmo()
        const camera = testCamera()
        gizmo.group.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)

        const received: Quaternion[] = []
        const state = gizmo.startDrag(
            'rotate_x',
            new Vector3(0, 0, 0),
            new Quaternion(),
            {onTranslate: () => {}, onRotate: (q) => { received.push(q.clone()) }},
            camera,
            rayFromScreen(camera, 0, 0),
        )
        expect(state).toBeDefined()
        if (state === undefined) return
        /* 局部 X 轴 → 世界 -Z：约束平面仍为 z=0，屏幕水平移动产生角度变化 */
        gizmo.updateDrag(state, camera, rayFromScreen(camera, 0.1, 0))
        expect(received.length).toBeGreaterThan(0)
        const q = received[received.length - 1]
        /* 绕 Z 轴的四元数：x/y 分量为 0 */
        expect(q.x).toBeCloseTo(0, 6)
        expect(q.y).toBeCloseTo(0, 6)
        expect(Math.abs(q.z)).toBeGreaterThan(0)
        gizmo.dispose()
    })
})

describe('角色实体类型常量', () => {
    it('CHARACTER_ENTITY_TYPE 包含在实体类型列表（edit 模式隐藏圆弧的识别依据）', () => {
        expect(ENTITY_TYPE_VALUES).toContain(CHARACTER_ENTITY_TYPE)
    })
})

describe('transform gizmo 高亮透明度', () => {
    it('三态切换：平移轴 0.5/0.7/1.0，圆弧 0.3/0.55/0.8', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        /* 常态：3 轴 × 2 对象（轴线+锥体共享材质）+ 3 弧 */
        const normal = collectOpacities(gizmo)
        expect(normal).toHaveLength(9)
        expect(normal.filter(o => o === GIZMO_OPACITY_NORMAL)).toHaveLength(6)
        expect(normal.filter(o => o === GIZMO_ARC_OPACITY_NORMAL)).toHaveLength(3)

        /* 悬停 translate_x：轴线+锥体（共享材质）升为 0.7 */
        gizmo.setHoverPart('translate_x')
        const hoverAxis = collectOpacities(gizmo)
        expect(hoverAxis.filter(o => o === GIZMO_OPACITY_HOVER)).toHaveLength(2)
        expect(hoverAxis.filter(o => o === GIZMO_OPACITY_NORMAL)).toHaveLength(4)
        expect(hoverAxis.filter(o => o === GIZMO_ARC_OPACITY_NORMAL)).toHaveLength(3)

        /* 悬停 rotate_z：该弧升为 0.55 */
        gizmo.setHoverPart('rotate_z')
        const hoverArc = collectOpacities(gizmo)
        expect(hoverArc.filter(o => o === GIZMO_ARC_OPACITY_HOVER)).toHaveLength(1)
        expect(hoverArc.filter(o => o === GIZMO_ARC_OPACITY_NORMAL)).toHaveLength(2)
        expect(hoverArc.filter(o => o === GIZMO_OPACITY_NORMAL)).toHaveLength(6)

        /* 选中 rotate_z：升为 0.8（同部件 active 覆盖 hover 的 0.55） */
        gizmo.setActivePart('rotate_z')
        const activeArc = collectOpacities(gizmo)
        expect(activeArc.filter(o => o === GIZMO_ARC_OPACITY_ACTIVE)).toHaveLength(1)
        expect(activeArc.filter(o => o === GIZMO_ARC_OPACITY_HOVER)).toHaveLength(0)
        expect(activeArc.filter(o => o === GIZMO_ARC_OPACITY_NORMAL)).toHaveLength(2)
        expect(activeArc.filter(o => o === GIZMO_OPACITY_NORMAL)).toHaveLength(6)

        /* 选中 translate_y：轴升为 1.0（rotate_z 仍为 hover 0.55） */
        gizmo.setActivePart('translate_y')
        const activeAxis = collectOpacities(gizmo)
        expect(activeAxis.filter(o => o === GIZMO_OPACITY_ACTIVE)).toHaveLength(2)
        expect(activeAxis.filter(o => o === GIZMO_OPACITY_NORMAL)).toHaveLength(4)
        expect(activeAxis.filter(o => o === GIZMO_ARC_OPACITY_HOVER)).toHaveLength(1)
        expect(activeAxis.filter(o => o === GIZMO_ARC_OPACITY_NORMAL)).toHaveLength(2)

        /* 清除状态恢复常态 */
        gizmo.setActivePart(undefined)
        gizmo.setHoverPart(undefined)
        const reset = collectOpacities(gizmo)
        expect(reset.filter(o => o === GIZMO_OPACITY_NORMAL)).toHaveLength(6)
        expect(reset.filter(o => o === GIZMO_ARC_OPACITY_NORMAL)).toHaveLength(3)
        gizmo.dispose()
    })

    it('同一部件 active 优先于 hover（平移轴）', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        gizmo.setHoverPart('translate_y')
        gizmo.setActivePart('translate_y')
        const ops = collectOpacities(gizmo)
        expect(ops).toContain(GIZMO_OPACITY_ACTIVE)
        /* 无 0.7（被 active 覆盖） */
        expect(ops).not.toContain(GIZMO_OPACITY_HOVER)
        gizmo.dispose()
    })

    it('同一部件 active 优先于 hover（圆弧）', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        gizmo.setHoverPart('rotate_y')
        gizmo.setActivePart('rotate_y')
        const ops = collectOpacities(gizmo)
        expect(ops).toContain(GIZMO_ARC_OPACITY_ACTIVE)
        /* 无 0.55（被 active 覆盖） */
        expect(ops).not.toContain(GIZMO_ARC_OPACITY_HOVER)
        gizmo.dispose()
    })
})

describe('transform gizmo 旋转圆弧可见性', () => {
    it('setRotateVisible(false) 隐藏全部可见弧', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        /* 可见弧：Mesh + 可见材质（区别于拾取 Mesh 的 hidden 材质） */
        const visibleArcs = gizmo.group.children.filter(c =>
            c instanceof ThreeMesh
            && c.material instanceof MeshBasicMaterial
            && c.material.visible
        )
        expect(visibleArcs).toHaveLength(3)
        expect(visibleArcs.every(a => a.visible)).toBe(true)

        gizmo.setRotateVisible(false)
        expect(visibleArcs.every(a => !a.visible)).toBe(true)

        gizmo.setRotateVisible(true)
        expect(visibleArcs.every(a => a.visible)).toBe(true)
        gizmo.dispose()
    })

    it('setRotateVisible(false) 后圆弧不参与射线拾取', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        /* 屏幕 (0.15,0.15) 的射线在 z=0 平面交于 (0.576,0.576,0)：
         * 距原点 0.814，位于 rotate_z 拾取环（半径 0.8 ± 管径 0.08）内，
         * 且不经过任何平移拾取圆柱（距 X/Y 轴 0.576 > 半径 0.05） */
        const rotateRay = rayFromScreen(camera, 0.15, 0.15)
        expect(gizmo.hitTest(rotateRay)).toBe('rotate_z')

        gizmo.setRotateVisible(false)
        expect(gizmo.hitTest(rotateRay)).toBeUndefined()
        gizmo.dispose()
    })

    it('setRotateVisible(false) 后 hitTest 结果不含任何旋转部件', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        gizmo.setRotateVisible(false)
        const camera = testCamera()
        for (let sx = -1; sx <= 1; sx += 0.1) {
            for (let sy = -1; sy <= 1; sy += 0.1) {
                const part = gizmo.hitTest(rayFromScreen(camera, sx, sy))
                if (part !== undefined) {
                    expect(part.startsWith('rotate')).toBe(false)
                }
            }
        }
        gizmo.dispose()
    })

    it('setRotateAxisVisible 仅隐藏指定轴圆弧（角色保留水平面 Y 轴）', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const visibleArcs = (): number => gizmo.group.children.filter(c =>
            c instanceof ThreeMesh
            && c.material instanceof MeshBasicMaterial
            && c.material.visible
            && c.visible
        ).length
        expect(visibleArcs()).toBe(3)

        /* 隐藏 X/Z：仅剩 Y 轴圆弧（水平面旋转） */
        gizmo.setRotateAxisVisible('x', false)
        gizmo.setRotateAxisVisible('z', false)
        expect(visibleArcs()).toBe(1)

        /* 恢复 Z */
        gizmo.setRotateAxisVisible('z', true)
        expect(visibleArcs()).toBe(2)

        /* 整体开关优先级：全部隐藏，恢复后仍按轴可见性显示 */
        gizmo.setRotateVisible(false)
        expect(visibleArcs()).toBe(0)
        gizmo.setRotateVisible(true)
        expect(visibleArcs()).toBe(2)
        gizmo.dispose()
    })

    it('setRotateAxisVisible(false) 后该轴圆弧不参与射线拾取', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        const camera = testCamera()
        /* 屏幕 (0.15,0.15) 的射线只命中 rotate_z 拾取环 */
        const rotateRay = rayFromScreen(camera, 0.15, 0.15)
        expect(gizmo.hitTest(rotateRay)).toBe('rotate_z')

        /* 隐藏 Z 圆弧后不再命中 */
        gizmo.setRotateAxisVisible('z', false)
        expect(gizmo.hitTest(rotateRay)).toBeUndefined()

        /* 隐藏 X/Z 后全屏采样不含 rotate_x / rotate_z */
        gizmo.setRotateAxisVisible('x', false)
        for (let sx = -1; sx <= 1; sx += 0.1) {
            for (let sy = -1; sy <= 1; sy += 0.1) {
                const part = gizmo.hitTest(rayFromScreen(camera, sx, sy))
                if (part !== undefined) {
                    expect(part).not.toBe('rotate_x')
                    expect(part).not.toBe('rotate_z')
                }
            }
        }
        gizmo.dispose()
    })

    it('隐藏轴圆弧时清除该轴 hover/active 状态', () => {
        const gizmo = createTransformGizmo()
        gizmo.setVisible(true)
        gizmo.setHoverPart('rotate_z')
        gizmo.setActivePart('rotate_x')
        /* 隐藏 Z：hover 清除，X 轴 active 仍保留 */
        gizmo.setRotateAxisVisible('z', false)
        const ops = collectOpacities(gizmo)
        expect(ops).not.toContain(GIZMO_ARC_OPACITY_HOVER)
        expect(ops).toContain(GIZMO_ARC_OPACITY_ACTIVE)
        /* 隐藏 X：active 也清除 */
        gizmo.setRotateAxisVisible('x', false)
        const ops2 = collectOpacities(gizmo)
        expect(ops2).not.toContain(GIZMO_ARC_OPACITY_ACTIVE)
        gizmo.dispose()
    })
})
