import {describe, it, expect, beforeEach} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {Mesh, BoxGeometry, MeshBasicMaterial, Object3D} from 'three'
import {createNavSensor} from './sensor.ts'
import {createNavRunContext, processNav} from './machine.ts'
import type {NavSensor, NavRunContext, NavConfig} from './types.ts'
import type {CharacterEntity} from '../../../../character/types.ts'
import {CHARACTER_BASE_SIZE} from '../../constants.ts'

const FIXED_DT = 1 / 60

/* ── 测试工具 ── */

/** mock body 形状：nav 测试仅用到 position 与 translation */
interface MockBody {
    position: {x: number; y: number; z: number}
    translation: () => {x: number; y: number; z: number}
}

/** 测试专用窄化：实体 body 实际为 mock 对象（仅本测试文件内集中转换） */
const mockBodyOf = (entity: CharacterEntity): MockBody =>
    entity.body as unknown as MockBody

const createBoxMesh = (x: number, y: number, z: number, w: number, h: number, d: number): Mesh => {
    const geo = new BoxGeometry(w, h, d)
    const mat = new MeshBasicMaterial()
    const mesh = new Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.updateMatrixWorld()
    return mesh
}

/**
 * 构造最小 CharacterEntity mock。
 * body 仅提供 position / translation，nav sensor 与 machine 只读这些字段，无需真实物理。
 */
const createCharEntity = (
    id: number,
    x: number, z: number,
    scaleVal: number = 1,
    speedVal: number = 3,
    jumpHeightVal: number = 2,
): CharacterEntity => {
    const scale = scaleVal
    const bw = CHARACTER_BASE_SIZE.width * scale
    const bh = CHARACTER_BASE_SIZE.height * scale
    const bd = CHARACTER_BASE_SIZE.depth * scale

    const mesh = new Mesh(
        new BoxGeometry(bw, bh, bd),
        new MeshBasicMaterial({visible: false}),
    )
    mesh.position.set(x, bh / 2, z)

    /* 可变位置对象：测试中通过 mockBodyOf 移动 position 模拟位移 */
    const pos = {x, y: bh / 2, z}
    const body = {
        position: pos,
        translation: (): {x: number; y: number; z: number} => pos,
    } as unknown as CharacterEntity['body']

    return {
        id,
        config: {speed: speedVal, jumpHeight: jumpHeightVal, scale},
        mesh,
        wireframe: undefined,
        appearanceGroup: new Object3D() as unknown as CharacterEntity['appearanceGroup'],
        body,
        mainCollider: undefined as unknown as RAPIER.Collider,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0,
        groundedTime: 0,
        rowText: `Test #${id}`,
        isPlayer: false,
        navEnabled: true,
        peaceStrategy: 'patrol' as const,
        combatStrategy: 'tactical' as const,
        isDying: false,
        dyingTimer: 0,
        dashCooldownTimer: 0,
        combat: {
            faction: 0,
            isDead: false,
            attackActive: false,
            attackTendency: () => false,
            tendencyConfig: {tendencyId: 'hostileExceptSelf' as const},
            skills: [],
            currentSkillIndex: 0,
            attackedTargets: new Set(),
            attackDirX: 0,
            attackDirZ: 0,
            swingTilt: 0,
            phaseIndex: 0, phaseTimer: 0, comboIndex: 0, comboTimer: 0, pendingFlinch: false,
        },
        stateMachine: {
            currentState: 'idle',
            previousState: null,
            stateTime: 0,
            onStateChange: null,
            setInput: () => {},
            update: () => {},
            reset: () => {},
        },
    } as unknown as CharacterEntity
}

/* ── A 组：传感器输出测试 ── */

describe('NavSensor 传感器检测', () => {
    let obstacles: Mesh[]
    let grounds: Mesh[]
    let sensor: NavSensor
    let entity: CharacterEntity
    let navConfig: NavConfig

    beforeEach(() => {
        obstacles = []
        grounds = []

        /* 默认地面 mesh */
        const groundMesh = new Mesh(
            new BoxGeometry(20, 0.1, 20),
            new MeshBasicMaterial(),
        )
        groundMesh.position.set(0, -0.05, 0)
        groundMesh.updateMatrixWorld()
        grounds.push(groundMesh)

        sensor = createNavSensor(() => obstacles, () => grounds, () => [])

        /* 构造最小 entity */
        entity = createCharEntity(0, 0, 0)

        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
    })

    it('1. 前方无障碍时返回 clear', () => {
        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
        expect(result.groundAhead).toBe(true)
    })

    it('2. 前方有高墙时返回 blocked_wall', () => {
        /* 放置一个高于跳跃高度的障碍物在前面 */
        const wall = createBoxMesh(1.0, 1.5, 0, 0.3, 4, 1)
        obstacles.push(wall)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
        expect(result.obstacleDistance).toBeLessThan(navConfig.checkDistance)
    })

    it('3. 前方有矮障碍时返回 blocked_low', () => {
        /* 低矮箱子，高度 1 < jumpHeight 2 */
        const lowBox = createBoxMesh(1.0, 0.5, 0, 1, 1, 1)
        obstacles.push(lowBox)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_low')
        expect(result.obstacleHeight).toBeLessThanOrEqual(entity.config.jumpHeight)
    })

    it('4. 前方地形断裂 → 探针超出跳跃高度未命中 → blocked_pit', () => {
        /* 小片地形，角色站在边缘，探头位置前方无地面 */
        const smallGround = new Mesh(
            new BoxGeometry(1, 0.1, 1),
            new MeshBasicMaterial(),
        )
        smallGround.position.set(-0.5, -0.05, 0)
        smallGround.updateMatrixWorld()
        grounds.length = 0
        grounds.push(smallGround)

        /* checkDistance = 1.5，探头在 x=1.5，超出 1×1 地形范围 */
        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_pit')
        expect(result.groundAhead).toBe(false)
    })

    it('4b. 无任何 mesh → 假定平坦世界 → groundAhead=true', () => {
        grounds.length = 0
        obstacles.length = 0

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.groundAhead).toBe(true)
        expect(result.result).toBe('clear')
    })

    it('4c. 无地形 + 有障碍(不在探头下方) → 隐式平面 y=0 → footY≤jumpHeight → groundAhead=true', () => {
        /* 模拟无限平面世界：无 terrain mesh，但场景有箱子（探头下方碰不到） */
        grounds.length = 0
        /* 箱子在侧面，探头正下方没有物体 */
        obstacles.push(createBoxMesh(1.0, 0.5, 2.0, 1, 1, 1))
        obstacles.push(createBoxMesh(1.0, 0.5, -2.0, 1, 1, 1))

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.groundAhead).toBe(true)
        expect(result.result).toBe('clear')
    })

    it('5. 前方有墙 + 左侧通畅', () => {
        /* 墙在正前方，但左侧无阻挡 */
        const wall = createBoxMesh(1.0, 2.0, 0, 0.3, 4, 0.3)
        obstacles.push(wall)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')

        /* 左侧应当通畅（左侧没有障碍物） */
        expect(result.leftClear).toBe(true)
    })

    it('6. 前方有墙 + 右侧通畅', () => {
        const wall = createBoxMesh(1.0, 2.0, 0, 0.3, 4, 0.3)
        obstacles.push(wall)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
        expect(result.rightClear).toBe(true)
    })

    it('7. 前方有墙 + 左右均堵', () => {
        /* 三面围墙：前方 + 左右，间距足够窄使射线检测不到侧向通路 */
        const walls = [
            createBoxMesh(1.2, 1.5, 0, 0.3, 4, 1.2),    // 前：窄墙在正前方
            createBoxMesh(0.1, 1.5, -0.8, 1.0, 4, 0.3),  // 左：挡住左侧
            createBoxMesh(0.1, 1.5, 0.8, 1.0, 4, 0.3),   // 右：挡住右侧
        ]
        obstacles.push(...walls)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
        expect(result.leftClear).toBe(false)
        expect(result.rightClear).toBe(false)
    })
})

/* ── B 组：NavFSM + 步进测试 ── */

describe('NavFSM 导航状态机', () => {
    let obstacles: Mesh[]
    let grounds: Mesh[]
    let sensor: NavSensor
    let entity: CharacterEntity
    let navCtx: NavRunContext
    let navConfig: NavConfig

    beforeEach(() => {
        /* 地面 */
        obstacles = []
        grounds = [
            new Mesh(new BoxGeometry(30, 0.1, 30), new MeshBasicMaterial()),
        ]
        grounds[0].position.set(0, -0.05, 0)
        grounds[0].updateMatrixWorld()

        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        entity = createCharEntity(0, 0, 0)
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
        navCtx = createNavRunContext(true)
        navCtx.config = navConfig
    })

    it('8. 矮障碍 + nav 开启 → 触发跳跃', () => {
        const lowBox = createBoxMesh(1.3, 0.5, 0, 1, 1, 1)
        obstacles.push(lowBox)

        /* 初始状态为 navigating，意图方向向右 */
        const result = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)

        /* 应检测到 blocked_low 并返回 jump=true */
        expect(result.jump).toBe(true)
        expect(navCtx.state).toBe('jumping')
        /* 方向应保持 */
        expect(Math.abs(result.dx)).toBeGreaterThan(0)
    })

    it('9. 高墙 + 左侧通 + nav 开启 → 转向绕行', () => {
        const wall = createBoxMesh(1.3, 2.0, 0, 0.3, 4, 0.3)
        obstacles.push(wall)

        /* 第一帧：检测到 blocked_wall，左侧通畅 → 进入 steering */
        const r1 = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(navCtx.state).toBe('steering')
        expect(r1.dx).not.toBe(0)

        /* 运行 60 步模拟绕行过程 */
        for (let i = 0; i < 60; i++) {
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            /* 绕行中不应返回零向量 */
            if (navCtx.state !== 'stuck') {
                expect(Math.abs(r.dx) + Math.abs(r.dz)).toBeGreaterThan(0)
            }
            /* 模拟角色沿偏转方向移动 */
            mockBodyOf(entity).position.x += r.dx * entity.config.speed * FIXED_DT
            mockBodyOf(entity).position.z += r.dz * entity.config.speed * FIXED_DT
        }

        /* 60 步后不应卡在 stuck */
        expect(navCtx.state).not.toBe('stuck')
    })

    it('10. 高墙 + 左右均堵 + nav 开启 → stuck → 输出 idle', () => {
        /* 三面围墙 */
        obstacles.push(
            createBoxMesh(1.3, 2.0, 0, 0.3, 4, 2.5),
            createBoxMesh(0, 2.0, -1.5, 0.3, 4, 3),
            createBoxMesh(0, 2.0, 1.5, 0.3, 4, 3),
        )

        /* 第一帧进入 stuck */
        const r1 = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(navCtx.state).toBe('stuck')
        expect(r1.dx).toBe(0)
        expect(r1.dz).toBe(0)

        /* 运行 60 步：始终 stuck */
        for (let i = 0; i < 60; i++) {
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            expect(r.dx).toBe(0)
            expect(r.dz).toBe(0)
            expect(navCtx.state).toBe('stuck')
        }
    })

    it('11. 坑洞 + 侧面通畅 + nav 开启 → 绕行', () => {
        /* 小片地形，角色站在边缘，前方悬空 */
        grounds.length = 0
        const smallGround = new Mesh(new BoxGeometry(1, 0.1, 1), new MeshBasicMaterial())
        smallGround.position.set(-0.5, -0.05, 0)
        smallGround.updateMatrixWorld()
        grounds.push(smallGround)

        processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        /* blocked_pit，但左右均无墙，应进入 steering */
        expect(navCtx.state).toBe('steering')

        /* 60 步不应 stuck */
        for (let i = 0; i < 60; i++) {
            processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        }
        expect(navCtx.state).not.toBe('stuck')
    })

    it('12. 坑洞 + 四周堵死 + nav 开启 → stuck → idle', () => {
        grounds.length = 0
        const smallGround = new Mesh(new BoxGeometry(1, 0.1, 1), new MeshBasicMaterial())
        smallGround.position.set(-0.5, -0.05, 0)
        smallGround.updateMatrixWorld()
        grounds.push(smallGround)
        /* 四周墙 */
        obstacles.push(
            createBoxMesh(1.3, 2.0, 0, 0.3, 4, 2.5),
            createBoxMesh(0, 2.0, -1.5, 0.3, 4, 3),
            createBoxMesh(0, 2.0, 1.5, 0.3, 4, 3),
        )

        processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(navCtx.state).toBe('stuck')

        for (let i = 0; i < 60; i++) {  /* test 12 */
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            expect(r.dx).toBe(0)
            expect(r.dz).toBe(0)
        }
    })

    it('13. 四面围墙 + nav 开启 → stuck → idle', () => {
        /* 四面包围 */
        obstacles.push(
            createBoxMesh(1.5, 2.0, 0, 3, 4, 3),   // 大包围
        )

        /* 角色在包围内，意图任意方向 */
        processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(navCtx.state).toBe('stuck')

        for (let i = 0; i < 60; i++) {
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            expect(r.dx).toBe(0)
            expect(r.dz).toBe(0)
            expect(navCtx.state).toBe('stuck')
        }
    })

    it('14. 畅通路径 + nav 开启 → 持续 navigating', () => {
        /* 无障碍 */
        const result = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(result.dx).toBe(1)
        expect(result.dz).toBe(0)
        expect(result.jump).toBe(false)
        expect(navCtx.state).toBe('navigating')

        /* 60 步保持 navigating */
        for (let i = 0; i < 60; i++) {
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            expect(r.dx).toBeGreaterThan(0)
            expect(navCtx.state).toBe('navigating')
            /* 模拟移动 */
            mockBodyOf(entity).position.x += r.dx * entity.config.speed * FIXED_DT
        }

        /* 位置应有前进 */
        expect(mockBodyOf(entity).position.x).toBeGreaterThan(0.5)
    })

    it('15. Legacy（nav 关闭）+ 前方墙 → 卡住超时后 idle', () => {
        navCtx.enabled = false
        navCtx.lastPosX = mockBodyOf(entity).position.x
        navCtx.lastPosZ = mockBodyOf(entity).position.z

        const wall = createBoxMesh(1.3, 2.0, 0, 0.3, 4, 0.3)
        obstacles.push(wall)

        /* 运行 150 步（2.5 秒 @ 60fps），超过 stuckTimeout=2s */
        let zeroed = false
        for (let i = 0; i < 150; i++) {
            /* 角色被墙挡住无法移动 */
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            if (r.dx === 0 && r.dz === 0) {
                zeroed = true
            }
            /* stuckTimer 应在累计 */
        }

        /* 2s 后 stuckTimer 触发，dx/dz 应归零 */
        expect(zeroed).toBe(true)
        expect(navCtx.stuckTimer).toBeGreaterThanOrEqual(navConfig.stuckTimeout - 0.5)
    })

    it('16. Legacy（nav 关闭）+ 畅通路径 → 持续前进不被干扰', () => {
        navCtx.enabled = false
        navCtx.lastPosX = mockBodyOf(entity).position.x
        navCtx.lastPosZ = mockBodyOf(entity).position.z

        let blocked = false
        for (let i = 0; i < 120; i++) {
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            /* 畅通时不该归零 */
            expect(r.dx).toBeGreaterThan(0)

            /* 模拟移动 */
            mockBodyOf(entity).position.x += r.dx * entity.config.speed * FIXED_DT

            if (r.dx === 0 && r.dz === 0) blocked = true
        }

        /* 不该被卡住 */
        expect(blocked).toBe(false)
        /* 位置应明显前进 */
        expect(mockBodyOf(entity).position.x).toBeGreaterThan(2)
    })
})

/* ── C 组：坡面检测 ── */

const createCharOnBox = (boxTopY: number): CharacterEntity => {
    const scale = 1
    const bh = CHARACTER_BASE_SIZE.height * scale
    const bw = CHARACTER_BASE_SIZE.width * scale
    const bd = CHARACTER_BASE_SIZE.depth * scale
    const bodyY = boxTopY + bh / 2

    const mesh = new Mesh(new BoxGeometry(bw, bh, bd), new MeshBasicMaterial({visible: false}))
    mesh.position.set(0, bodyY, 0)
    mesh.updateMatrixWorld()

    const pos = {x: 0, y: bodyY, z: 0}
    const body = {
        position: pos,
        translation: (): {x: number; y: number; z: number} => pos,
    } as unknown as CharacterEntity['body']

    return {
        id: 99, config: {speed: 3, jumpHeight: 2, scale},
        mesh, wireframe: undefined,
        appearanceGroup: new Object3D() as unknown as CharacterEntity['appearanceGroup'],
        body,
        mainCollider: undefined as unknown as RAPIER.Collider,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0, rowText: 'OnBox',
        isPlayer: false, navEnabled: true,
        peaceStrategy: 'patrol' as const, combatStrategy: 'tactical' as const,
        isDying: false, dyingTimer: 0, dashCooldownTimer: 0,
        combat: {
            faction: 0, isDead: false, attackActive: false,
            attackTendency: () => false,
            tendencyConfig: {tendencyId: 'hostileExceptSelf' as const},
            skills: [], currentSkillIndex: 0,
            attackedTargets: new Set(), attackDirX: 0, attackDirZ: 0, swingTilt: 0,
        },
        stateMachine: {
            currentState: 'idle', previousState: null, stateTime: 0,
            onStateChange: null, setInput: () => {}, update: () => {}, reset: () => {},
        },
    } as unknown as CharacterEntity
}

const createSlopeMesh = (x: number, y: number, z: number, angleDeg: number): Mesh => {
    /* 创建一块平面板并绕 Z 轴旋转模拟坡度 */
    const geo = new BoxGeometry(2, 0.05, 2)
    const mat = new MeshBasicMaterial()
    const mesh = new Mesh(geo, mat)
    mesh.position.set(x, y, z)
    /* 绕 Z 轴旋转：正角 = 上坡（面前抬高），负角 = 下坡 */
    mesh.rotation.z = -angleDeg * Math.PI / 180
    mesh.updateMatrixWorld()
    return mesh
}

describe('NavSensor 坡面检测', () => {
    let sensor: NavSensor
    let entity: CharacterEntity
    let navConfig: NavConfig
    let obstacles: Mesh[]
    let grounds: Mesh[]

    beforeEach(() => {
        obstacles = []
        grounds = []
        const groundMesh = new Mesh(
            new BoxGeometry(20, 0.1, 20),
            new MeshBasicMaterial(),
        )
        groundMesh.position.set(0, -0.05, 0)
        groundMesh.updateMatrixWorld()
        grounds.push(groundMesh)
        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        entity = createCharEntity(0, 0, 0)
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
    })

    it('17. 10° 上坡 → 视为可行走表面，返回 clear', () => {
        const slope = createSlopeMesh(1.0, -0.3, 0, 10)
        obstacles.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
    })

    it('18. 30° 上坡 → 视为可行走表面，返回 clear', () => {
        const slope = createSlopeMesh(1.0, -0.5, 0, 30)
        obstacles.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
    })

    it('19. 45° 上坡 → 视为可行走表面，返回 clear', () => {
        const slope = createSlopeMesh(1.0, -0.7, 0, 45)
        obstacles.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
    })

    it('20. 60° 上坡 → 视为可行走表面，返回 clear', () => {
        const slope = createSlopeMesh(1.0, -0.9, 0, 60)
        obstacles.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
    })

    it('21. 80° 上坡 → 面法线 Y≈0.174 > 0.06，视为可行走，返回 clear', () => {
        const slope = createSlopeMesh(1.0, -1.0, 0, 80)
        obstacles.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        /* 80° 时 normal.y = cos(80°) ≈ 0.174 > 0.06，应视为可行走 */
        expect(result.result).toBe('clear')
    })

    it('22. 90° 垂直墙 → 返回 blocked_wall', () => {
        /* 使用较厚的箱子作为垂直墙，确保世界空间高度超过跳跃高度 */
        const wall = createBoxMesh(1.0, 2.5, 0, 0.3, 5, 1.5)
        obstacles.push(wall)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
    })

    it('23. 100° 倒悬板 → 脚部高度命中面为世界空间 ~80° 坡（ny≈0.174 ≥ 0.06）→ 按可行走处理返回 clear', () => {
        /* 倒悬面：宽 5 薄板旋转 −100°。脚部高度射线命中的是板的背面，
         * 其世界法线 ny = −cos(−100°) ≈ +0.174，按 SLOPE_WALK_THRESHOLD 语义（80° 可走）放行。
         * 法线已转世界空间判定，几何空间法线 (0,−1,0) 不再直接使用 */
        const overhangGeo = new BoxGeometry(5, 0.05, 2)
        const overhangMat = new MeshBasicMaterial()
        const overhang = new Mesh(overhangGeo, overhangMat)
        overhang.position.set(1.0, 1.0, 0)
        overhang.rotation.z = (-100) * Math.PI / 180
        overhang.updateMatrixWorld()
        obstacles.push(overhang)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
    })

    it('23b. 旋转 −80° 高板（世界空间法线 ny < 0）→ blocked_wall', () => {
        /* 5m 长板旋转 −80°：命中面世界法线 ny = −cos(−80°) ≈ −0.174 < 0.06 → 障碍；
         * 板世界高度 5·sin80° ≈ 4.9 > jumpHeight → 高墙 */
        const slab = new Mesh(new BoxGeometry(5, 0.05, 2), new MeshBasicMaterial())
        slab.position.set(1.0, 2.0, 0)
        slab.rotation.z = (-80) * Math.PI / 180
        slab.updateMatrixWorld()
        obstacles.push(slab)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
    })
})

describe('NavFSM 坡面行为', () => {
    let obstacles: Mesh[]
    let grounds: Mesh[]
    let sensor: NavSensor
    let entity: CharacterEntity
    let navCtx: NavRunContext
    let navConfig: NavConfig

    beforeEach(() => {
        obstacles = []
        grounds = [
            new Mesh(new BoxGeometry(20, 0.1, 20), new MeshBasicMaterial()),
        ]
        grounds[0].position.set(0, -0.05, 0)
        grounds[0].updateMatrixWorld()
        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        entity = createCharEntity(0, 0, 0)
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
        navCtx = createNavRunContext(true)
        navCtx.config = navConfig
    })

    it('24. 45° 上坡 + nav → walking 而不触发跳跃', () => {
        const slope = createSlopeMesh(1.0, -0.7, 0, 45)
        obstacles.push(slope)

        const result = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(result.jump).toBe(false)
        expect(navCtx.state).toBe('navigating')
        expect(result.dx).toBeGreaterThan(0)
    })
})

/* ── C2 组：斜坡坑洞探针（上坡不误判） ── */

describe('NavSensor 斜坡坑洞探针', () => {
    let sensor: NavSensor
    let entity: CharacterEntity
    let navConfig: NavConfig
    let obstacles: Mesh[]
    let grounds: Mesh[]

    beforeEach(() => {
        obstacles = []
        grounds = []
        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        entity = createCharEntity(0, 0, 0)
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
    })

    /** 大块斜坡地面（30×30 薄板绕 Z 轴旋转），模拟生产环境中地形 mesh 同时出现在障碍物与地面列表 */
    const makeSlopeGround = (deg: number): Mesh => {
        const m = new Mesh(new BoxGeometry(30, 0.1, 30), new MeshBasicMaterial())
        /* 正角 = +X 方向上坡，负角 = +X 方向下坡 */
        m.rotation.z = deg * Math.PI / 180
        m.updateMatrixWorld()
        return m
    }

    it('25. 20° 上坡 → 探针起点在坡面内部（必 miss），由正前方可行走命中兜底 → clear 而非 blocked_pit', () => {
        const slope = makeSlopeGround(20)
        obstacles.push(slope)
        grounds.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
        expect(result.groundAhead).toBe(true)
    })

    it('26. 45° 上坡 → clear（陡上坡同样不应误判坑洞）', () => {
        const slope = makeSlopeGround(45)
        obstacles.push(slope)
        grounds.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
        expect(result.groundAhead).toBe(true)
    })

    it('27. 30° 下坡 → 落差 1.5·tan30° ≈ 0.87 ≤ jumpHeight → clear', () => {
        const slope = makeSlopeGround(-30)
        obstacles.push(slope)
        grounds.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
        expect(result.groundAhead).toBe(true)
    })

    it('28. 60° 下坡 → 落差 1.5·tan60° ≈ 2.6 > jumpHeight → blocked_pit（不允许主动走下陡崖）', () => {
        const slope = makeSlopeGround(-60)
        obstacles.push(slope)
        grounds.push(slope)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_pit')
        expect(result.groundAhead).toBe(false)
    })
})

/* ── D 组：各类实体障碍检测 ── */

/**
 * 创建碎片类（`fragment/common` 自定义几何）mesh
 * 碎片使用 Voronoi 断裂生成的凸多面体，不是 BoxGeometry。
 * 这里用四面体近似模拟。
 */
const createFragmentMesh = (x: number, y: number, z: number, size: number): Mesh => {
    const geo = new BoxGeometry(size, size, size)
    const mat = new MeshBasicMaterial()
    const mesh = new Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.updateMatrixWorld()
    return mesh
}

describe('NavSensor 各类实体障碍检测', () => {
    let sensor: NavSensor
    let entity: CharacterEntity
    let navConfig: NavConfig
    let obstacles: Mesh[]
    let grounds: Mesh[]

    beforeEach(() => {
        obstacles = []
        grounds = []
        const groundMesh = new Mesh(
            new BoxGeometry(20, 0.1, 20),
            new MeshBasicMaterial(),
        )
        groundMesh.position.set(0, -0.05, 0)
        groundMesh.updateMatrixWorld()
        grounds.push(groundMesh)
        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        entity = createCharEntity(0, 0, 0)
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
    })

    it('25. box/common（1x3x1）在前方 → blocked_wall', () => {
        /* 普通箱子：默认尺寸 1x1x1 低于跳跃高度，用高箱测试 */
        const box = createBoxMesh(1.2, 1.5, 0, 1, 3, 1)
        obstacles.push(box)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
    })

    it('26. box/destruction（1x1x1 可破坏箱）在前方 → blocked_low（矮于跳跃高度）', () => {
        const box = createBoxMesh(1.2, 0.5, 0, 1, 1, 1)
        obstacles.push(box)

        const result = sensor.sense(entity, 1, 0, navConfig)
        /* 高 1 ≤ jumpHeight 2 → 可跳过 */
        expect(result.result).toBe('blocked_low')
    })

    it('27. box/burning（1x3x1 燃烧箱）在前方 → blocked_wall', () => {
        const box = createBoxMesh(1.2, 1.5, 0, 1, 3, 1)
        obstacles.push(box)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
    })

    it('28. box/magnet（1x3x1 磁力箱）在前方 → blocked_wall', () => {
        const box = createBoxMesh(1.2, 1.5, 0, 1, 3, 1)
        obstacles.push(box)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
    })

    it('29. box/elasticity（1x3x1 弹性箱）在前方 → blocked_wall', () => {
        const box = createBoxMesh(1.2, 1.5, 0, 1, 3, 1)
        obstacles.push(box)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
    })

    it('30. area/water — 生产环境中被 world.ts 过滤，传感器不接收其 mesh → clear', () => {
        /* 水域 mesh 不应出现在障碍物列表中（world.ts 的 setupAI 排除 area/ 类型）。
         * 此测试验证：障碍物列表中不含水 mesh 时，前方返回 clear */
        /* 不向 obstacles 添加任何东西，模拟过滤后的列表 */
        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('clear')
    })

    it('31. fragment/common（碎片 0.5x0.5x0.5）在前方矮障碍 → blocked_low', () => {
        const frag = createFragmentMesh(1.2, 0.25, 0, 0.5)
        obstacles.push(frag)

        const result = sensor.sense(entity, 1, 0, navConfig)
        /* 小碎片可跳过 */
        expect(result.result).toBe('blocked_low')
    })

    it('32. 前方同时有 box/common 和 box/burning → 均命中返回 blocked_wall', () => {
        const common = createBoxMesh(1.2, 1.5, 0, 1, 3, 1)
        const burning = createBoxMesh(1.3, 1.5, 0.2, 1, 3, 1)
        obstacles.push(common, burning)

        const result = sensor.sense(entity, 1, 0, navConfig)
        /* 前方多个障碍物，均被命中 */
        expect(result.result).toBe('blocked_wall')
    })
})

describe('NavFSM 各类实体障碍行为', () => {
    let obstacles: Mesh[]
    let grounds: Mesh[]
    let sensor: NavSensor
    let entity: CharacterEntity
    let navCtx: NavRunContext
    let navConfig: NavConfig

    beforeEach(() => {
        obstacles = []
        grounds = [
            new Mesh(new BoxGeometry(30, 0.1, 30), new MeshBasicMaterial()),
        ]
        grounds[0].position.set(0, -0.05, 0)
        grounds[0].updateMatrixWorld()
        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        entity = createCharEntity(0, 0, 0)
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
        navCtx = createNavRunContext(true)
        navCtx.config = navConfig
    })

    it('34. box/common 高墙 + 左侧通 → steering 绕行', () => {
        const wall = createBoxMesh(1.3, 2.0, 0, 0.3, 5, 0.3)
        obstacles.push(wall)

        const r1 = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(navCtx.state).toBe('steering')
        expect(r1.dx).not.toBe(0)

        for (let i = 0; i < 60; i++) {
            processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        }
        expect(navCtx.state).not.toBe('stuck')
    })

    it('35. box/destruction 矮箱 + nav → 触发跳跃', () => {
        const box = createBoxMesh(1.2, 0.5, 0, 1, 1, 1)
        obstacles.push(box)

        const result = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(result.jump).toBe(true)
        expect(navCtx.state).toBe('jumping')
    })

    it('36. box/elasticity 高箱 + 左右堵 → stuck → idle', () => {
        /* 弹性箱前方 + 左右均堵 */
        obstacles.push(
            createBoxMesh(1.3, 2.0, 0, 1, 4, 2.5),
            createBoxMesh(0, 2.0, -1.5, 0.3, 5, 3),
            createBoxMesh(0, 2.0, 1.5, 0.3, 5, 3),
        )

        processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(navCtx.state).toBe('stuck')

        for (let i = 0; i < 60; i++) {
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            expect(r.dx).toBe(0)
        }
    })

    it('37. fragment/common 碎片 + nav → 触发跳跃越过', () => {
        const frag = createFragmentMesh(1.2, 0.25, 0, 0.5)
        obstacles.push(frag)

        const result = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(result.jump).toBe(true)
        expect(navCtx.state).toBe('jumping')
    })
})

/* ── E 组：角色作为障碍物 ── */

describe('NavSensor 角色障碍检测', () => {
    let sensor: NavSensor
    let entity: CharacterEntity
    let navConfig: NavConfig
    let obstacles: Mesh[]
    let grounds: Mesh[]
    let chars: Mesh[]

    beforeEach(() => {
        obstacles = []
        grounds = []
        chars = []
        const groundMesh = new Mesh(
            new BoxGeometry(20, 0.1, 20),
            new MeshBasicMaterial(),
        )
        groundMesh.position.set(0, -0.05, 0)
        groundMesh.updateMatrixWorld()
        grounds.push(groundMesh)
        sensor = createNavSensor(() => obstacles, () => grounds, () => chars)
        entity = createCharEntity(0, 0, 0)
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
    })

    it('38. 前方有角色（矮于跳高）→ 强制归为 blocked_wall 而非 blocked_low', () => {
        /* 另一个角色 mesh，高度 ~1.0 ≤ jumpHeight 2，但不应被分类为可跳过 */
        const otherChar = createBoxMesh(1.2, 0.5, 0, 0.25, 1.0, 0.16)
        obstacles.push(otherChar)
        chars.push(otherChar)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
    })

    it('39. 前方有角色 + 左侧通畅 → 可绕行', () => {
        const otherChar = createBoxMesh(1.2, 0.5, 0, 0.25, 1.0, 0.16)
        obstacles.push(otherChar)
        chars.push(otherChar)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_wall')
        expect(result.leftClear).toBe(true)
    })
})

describe('NavFSM 角色障碍行为', () => {
    let obstacles: Mesh[]
    let grounds: Mesh[]
    let chars: Mesh[]
    let sensor: NavSensor
    let entity: CharacterEntity
    let navCtx: NavRunContext
    let navConfig: NavConfig

    beforeEach(() => {
        obstacles = []
        grounds = [
            new Mesh(new BoxGeometry(30, 0.1, 30), new MeshBasicMaterial()),
        ]
        grounds[0].position.set(0, -0.05, 0)
        grounds[0].updateMatrixWorld()
        chars = []
        sensor = createNavSensor(() => obstacles, () => grounds, () => chars)
        entity = createCharEntity(0, 0, 0)
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
        navCtx = createNavRunContext(true)
        navCtx.config = navConfig
    })

    it('40. 前方角色 + nav → steering 绕行而非跳跃', () => {
        const otherChar = createBoxMesh(1.2, 0.5, 0, 0.25, 1.0, 0.16)
        obstacles.push(otherChar)
        chars.push(otherChar)

        const result = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        /* 不应跳跃 */
        expect(result.jump).toBe(false)
        /* 应进入 steering 绕行（左侧通畅） */
        expect(navCtx.state).toBe('steering')
        expect(result.dx).not.toBe(0)

        /* 60 步绕行验证 */
        for (let i = 0; i < 60; i++) {
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            expect(r.jump).toBe(false)
        }
        expect(navCtx.state).not.toBe('stuck')
    })
})

/* ── F 组：角色站在箱子/碎片上 ── */

describe('NavSensor 站在实体上的坑洞检测', () => {
    let sensor: NavSensor
    let navConfig: NavConfig
    let obstacles: Mesh[]
    let grounds: Mesh[]

    beforeEach(() => {
        obstacles = []
        grounds = []
        const groundMesh = new Mesh(
            new BoxGeometry(20, 0.1, 20),
            new MeshBasicMaterial(),
        )
        groundMesh.position.set(0, -0.05, 0)
        groundMesh.updateMatrixWorld()
        grounds.push(groundMesh)
        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
    })

    /**
     * 创建一个站在箱子上方的角色 entity（使用模块级 createCharOnBox）。
     */
    const makeEntity = (boxTopY: number) => createCharOnBox(boxTopY)

    it('41. 站在 boxes 上 → 前方仍在箱顶 → groundAhead=true（不误判为坑洞）', () => {
        const platform = createBoxMesh(1.0, 0.5, 0, 3, 1, 3)
        obstacles.push(platform)
        const entity = makeEntity(1.0)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.groundAhead).toBe(true)
        expect(result.result).toBe('clear')
    })

    it('42. 站在高箱边缘 → 前方悬空落差 > jumpHeight → groundAhead=false', () => {
        /* 角色站在很高的箱子上（boxTopY=3，footY=3.1），落差超过 jumpHeight=2 */
        const platform = createBoxMesh(0.5, 1.5, 0, 1, 3, 1)
        obstacles.push(platform)
        grounds.length = 0
        const entity = makeEntity(3.0)

        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.groundAhead).toBe(false)
        expect(result.result).toBe('blocked_pit')
    })

    it('43. 站在 fragment 上 → 前方仍在碎片顶 → groundAhead=true（不误判坑洞）', () => {
        const frag = createFragmentMesh(1.0, 0.5, 0, 1.5)
        obstacles.push(frag)
        const entity = makeEntity(1.0)

        const result = sensor.sense(entity, 1, 0, navConfig)
        /* 坑洞探针命中碎片 mesh → 不会误判为悬空 */
        expect(result.groundAhead).toBe(true)
        /* 前方射线命中碎片前面 → 低障碍（高度 ≤ jumpHeight），这是正确行为 */
        expect(result.result).toBe('blocked_low')
    })
})

/* ── G 组：倾斜箱子 / 箱顶行走 ── */

describe('NavSensor 倾斜箱子和箱顶导航', () => {
    let sensor: NavSensor
    let navConfig: NavConfig
    let obstacles: Mesh[]
    let grounds: Mesh[]

    beforeEach(() => {
        obstacles = []
        grounds = []
        const groundMesh = new Mesh(new BoxGeometry(20, 0.1, 20), new MeshBasicMaterial())
        groundMesh.position.set(0, -0.05, 0)
        groundMesh.updateMatrixWorld()
        grounds.push(groundMesh)
        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
    })

    it('44. 前方 30° 倾斜箱子 → 前面命中 → blocked_low（低斜坡可走上去）', () => {
        /* 箱子绕 Z 轴倾斜 30°，角色从低处朝上坡走 */
        const tilted = createSlopeMesh(0.8, -0.2, 0, 30)
        obstacles.push(tilted)

        const entity = createCharEntity(0, 0, 0)
        const result = sensor.sense(entity, 1, 0, navConfig)
        /* 前面法线 Y = sin(-30°) = -0.5 < 0.06 → 不过滤 → 低障碍（AABB 高度 ≤ jumpHeight） */
        expect(result.result).toBe('blocked_low')
    })

    it('45. 25° 倾斜箱子 → 角色低处走近 → blocked_low（低障碍可越）', () => {
        const platformGeo = new BoxGeometry(4, 0.1, 3)
        const platform = new Mesh(platformGeo, new MeshBasicMaterial())
        platform.position.set(1.0, 0.3, 0)
        platform.rotation.z = (-25) * Math.PI / 180
        platform.updateMatrixWorld()
        obstacles.push(platform)

        const entity = createCharEntity(0, 0, 0)
        const result = sensor.sense(entity, 1, 0, navConfig)
        expect(result.result).toBe('blocked_low')
    })

    it('46. 80° 近垂直倾斜箱子 → blocked_low（高度仍 ≤ jumpHeight）', () => {
        const steep = createSlopeMesh(0.8, -0.6, 0, 80)
        obstacles.push(steep)

        const entity = createCharEntity(0, 0, 0)
        const r = sensor.sense(entity, 1, 0, navConfig)
        expect(r.result).toBe('blocked_low')
    })
})

describe('NavFSM 箱顶行走', () => {
    let obstacles: Mesh[]
    let grounds: Mesh[]
    let sensor: NavSensor
    let navCtx: NavRunContext
    let navConfig: NavConfig

    beforeEach(() => {
        obstacles = []
        grounds = [new Mesh(new BoxGeometry(30, 0.1, 30), new MeshBasicMaterial())]
        grounds[0].position.set(0, -0.05, 0)
        grounds[0].updateMatrixWorld()
        sensor = createNavSensor(() => obstacles, () => grounds, () => [])
        navConfig = {checkRadius: 0.5, checkDistance: 1.5, stuckTimeout: 2}
        navCtx = createNavRunContext(true)
        navCtx.config = navConfig
    })

    it('47. 在箱顶上行走 → 持续 navigating，不触发跳跃或卡住', () => {
        /* 长平台：角色在中间可以向前走 */
        const platform = createBoxMesh(2.0, 0.5, 0, 8, 1, 3)
        obstacles.push(platform)

        const entity = createCharOnBox(1.0)

        /* 第一帧：应为 navigating + 正常方向 */
        const r1 = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
        expect(navCtx.state).toBe('navigating')
        expect(r1.jump).toBe(false)
        expect(r1.dx).toBeGreaterThan(0)

        /* 60 步内不应卡住或误跳 */
        for (let i = 0; i < 60; i++) {
            const r = processNav(FIXED_DT, navCtx, entity, sensor, 1, 0)
            expect(r.jump).toBe(false)
            expect(navCtx.state).toBe('navigating')
        }
    })
})
