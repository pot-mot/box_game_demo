import {describe, it, expect} from 'vitest'
import {Body, BODY_TYPES, Box, Vec3, Heightfield, Quaternion, Plane} from 'cannon-es'
import {createSharedWorld} from '../../../physics/world.ts'
import {FIXED_TIME_STEP, TERRAIN_COLLISION_GROUP, TERRAIN_COLLISION_MASK} from '../../../physics/constants.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {resolveGroundState, type GroundState} from './ground_state.ts'
import {createSkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import {CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'
import {createAppearanceSystem} from '../appearance/system.ts'
import {WALK_ANIM_MAX_SPEED, HORIZONTAL_SPEED_SMOOTHING} from '../appearance/constants.ts'
import {CAMERA_SMOOTH_FACTOR} from '../../../modes/play/constants.ts'
import type {CharacterModel} from '../appearance/types.ts'

const DT = FIXED_TIME_STEP
const FRAMES_3600 = 3600

/** 沿 X 上升的斜坡 Heightfield（data[xIdx][zIdx]），局部 X → 世界 X，局部 Y → 世界 -Z */
const makeSlope = (shared: ReturnType<typeof createSharedWorld>, slope: number): Body => {
    /* 840m 长：覆盖 walking 下坡 3600 帧（≈360m）移动范围 */
    const grid = 140
    const cell = 6
    const heights = Array.from({length: grid}, (_, xi) =>
        Array.from({length: grid}, (_, _zi) => slope * xi * cell))
    const body = new Body({
        mass: 0,
        type: BODY_TYPES.STATIC,
        material: shared.boxMat,
        collisionFilterGroup: TERRAIN_COLLISION_GROUP,
        collisionFilterMask: TERRAIN_COLLISION_MASK,
    })
    body.addShape(new Heightfield(heights, {elementSize: cell}))
    body.quaternion.copy(new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2))
    shared.world.addBody(body)
    return body
}

/** 移除 createSharedWorld 自带的默认地面 Plane（y=0），供垂直墙用例使用 */
const removeDefaultGround = (shared: ReturnType<typeof createSharedWorld>): void => {
    for (const b of [...shared.world.bodies]) {
        if (b.type === BODY_TYPES.STATIC && b.shapes.some(s => s instanceof Plane)) {
            shared.world.removeBody(b)
        }
    }
}

/** 倾斜 Plane 坡面（90° = 垂直墙，100° = 倒悬墙） */
const makeWall = (shared: ReturnType<typeof createSharedWorld>, thetaDeg: number): Body => {
    const body = new Body({
        mass: 0,
        type: BODY_TYPES.STATIC,
        material: shared.boxMat,
        collisionFilterGroup: TERRAIN_COLLISION_GROUP,
        collisionFilterMask: TERRAIN_COLLISION_MASK,
    })
    body.addShape(new Plane())
    body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2 + thetaDeg * Math.PI / 180)
    shared.world.addBody(body)
    return body
}

/** 构造角色（Box 碰撞体 + charMat 摩擦 0 + 真实状态机） */
const makeChar = (shared: ReturnType<typeof createSharedWorld>, x: number, y: number, z: number): CharacterEntity => {
    const body = new Body({
        mass: 1,
        type: BODY_TYPES.DYNAMIC,
        linearDamping: 0.2,
        fixedRotation: true,
        material: shared.charMat,
        collisionFilterGroup: CHARACTER_COLLISION_GROUP,
        collisionFilterMask: CHARACTER_COLLISION_MASK,
    })
    body.addShape(new Box(new Vec3(0.125, 0.5, 0.125)))
    body.position.set(x, y, z)
    shared.world.addBody(body)

    const slot = createSkillSlot(MELEE_SKILL_PRESETS.long_sword_slash)
    const entity: CharacterEntity = {
        id: 1,
        config: {speed: 6, jumpHeight: 2, radius: 0.125, height: 1},
        mesh: null!, wireframe: undefined,
        appearanceGroup: {rotation: {y: 0}} as unknown as CharacterEntity['appearanceGroup'],
        body,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0,
        rowText: '', isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical',
        isDying: false, dyingTimer: 0, dashCooldownTimer: 0,
        combat: {
            faction: 0, health: 100, maxHealth: 100, isDead: false,
            damageModifiers: [],
            attackTendency: () => true,
            tendencyConfig: {tendencyId: 'hostileExceptSelf'},
            onDamageTaken: null, onDeath: null, onDamageDealt: null,
            skills: [slot], currentSkillIndex: 0,
            attackActive: false, attackTimer: 0,
            attackedTargets: new Set(), attackDirX: 0, attackDirZ: 0, swingTilt: 0,
        } as unknown as CharacterEntity['combat'],
        stateMachine: createCharacterStateMachine(),
    }
    return entity
}

/** 单帧模拟（与游戏循环同序：step → 地面检测 → 状态机） */
const tick = (
    shared: ReturnType<typeof createSharedWorld>,
    entity: CharacterEntity,
    gs: GroundState,
    dx: number,
    dz: number,
): GroundState => {
    shared.world.step(DT, DT, 1)
    const next = resolveGroundState(shared.world.contacts, entity.body, gs, DT)
    entity.isOnGround = next.isOnGround
    entity.groundNormal = next.groundNormal
    entity.groundKeepTimer = next.groundKeepTimer
    entity.stateMachine.setInput(dx, dz, false, false)
    entity.stateMachine.update(DT, entity)
    return next
}

/** 统计 3600 帧的状态分布与 falling 帧数 */
const runAndStats = (
    shared: ReturnType<typeof createSharedWorld>,
    entity: CharacterEntity,
    dx: number,
    frames: number,
): {fallingFrames: number; finalState: string; states: Set<string>} => {
    let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
    let fallingFrames = 0
    const states = new Set<string>()
    for (let i = 0; i < frames; i++) {
        gs = tick(shared, entity, gs, dx, 0)
        states.add(entity.stateMachine.currentState)
        if (entity.stateMachine.currentState === 'falling') fallingFrames++
    }
    return {fallingFrames, finalState: entity.stateMachine.currentState, states}
}

const SLOPES_WALKABLE = [10, 20, 30, 40, 50, 60, 70, 80, 85] as const
const SLOPES_FALLING = [90, 100] as const

describe('walking 下坡坡度矩阵（3600 帧物理更新）', () => {
    for (const deg of SLOPES_WALKABLE) {
        it(`${deg}° 全程处于 walking（falling 帧数 = 0）`, () => {
            const shared = createSharedWorld()
            makeSlope(shared, Math.tan(deg * Math.PI / 180))
            const x = 820
            /* 贴地 spawn：底棱紧贴坡面，排除初始下落 */
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(shared, x, y, -50)
            const r = runAndStats(shared, entity, -1, FRAMES_3600)
            expect(r.fallingFrames).toBe(0)
            expect(r.finalState).toBe('walking')
        })
    }
    for (const deg of SLOPES_FALLING) {
        it(`${deg}° 必须全程处于 falling`, () => {
            const shared = createSharedWorld()
            removeDefaultGround(shared)
            makeWall(shared, deg)
            /* 贴墙 spawn：90° 墙在 z=0（角色 z=0.1 贴墙），100° 墙法线朝下偏（正侧 z=0.5） */
            const entity = makeChar(shared, 0, deg === 90 ? 3 : 1, deg === 90 ? 0.1 : 0.5)
            const r = runAndStats(shared, entity, -1, FRAMES_3600)
            expect(r.fallingFrames).toBeGreaterThan(FRAMES_3600 * 0.9)
            expect(r.finalState).toBe('falling')
        })
    }
})

describe('idle 下坡坡度矩阵（3600 帧物理更新）', () => {
    for (const deg of SLOPES_WALKABLE) {
        it(`${deg}° 全程处于 idle（falling 帧数 = 0）`, () => {
            const shared = createSharedWorld()
            makeSlope(shared, Math.tan(deg * Math.PI / 180))
            const x = 820
            /* 贴地 spawn：底棱紧贴坡面，排除初始下落 */
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(shared, x, y, -50)
            const r = runAndStats(shared, entity, 0, FRAMES_3600)
            expect(r.fallingFrames).toBe(0)
            expect(r.finalState).toBe('idle')
        })
    }
    for (const deg of SLOPES_FALLING) {
        it(`${deg}° 必须全程处于 falling`, () => {
            const shared = createSharedWorld()
            removeDefaultGround(shared)
            makeWall(shared, deg)
            /* 贴墙 spawn：90° 墙在 z=0（角色 z=0.1 贴墙），100° 墙法线朝下偏（正侧 z=0.5） */
            const entity = makeChar(shared, 0, deg === 90 ? 3 : 1, deg === 90 ? 0.1 : 0.5)
            const r = runAndStats(shared, entity, 0, FRAMES_3600)
            expect(r.fallingFrames).toBeGreaterThan(FRAMES_3600 * 0.9)
            expect(r.finalState).toBe('falling')
        })
    }
})

/** 构造关节 mock（rotation 带 x/y/z 与 set，覆盖 idle/walking 动画写入） */
const makeRotation = (): {x: number; y: number; z: number; set: (x: number, y: number, z: number) => void} => ({
    x: 0, y: 0, z: 0,
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z },
})

/** 构造最低限度 CharacterModel mock（9 个动画关节） */
const makeModelMock = (): CharacterModel => ({
    group: null!,
    headNeck: {rotation: makeRotation()} as never,
    head: null!,
    body: null!,
    rightArmShoulder: {rotation: makeRotation()} as never,
    rightUpperArm: null!,
    rightArmElbow: {rotation: makeRotation()} as never,
    rightForearm: null!,
    rightHandPivot: null!,
    leftArmShoulder: {rotation: makeRotation()} as never,
    leftUpperArm: null!,
    leftArmElbow: {rotation: makeRotation()} as never,
    leftForearm: null!,
    leftHandPivot: null!,
    rightLegHip: {rotation: makeRotation()} as never,
    rightThigh: null!,
    rightLegKnee: {rotation: makeRotation()} as never,
    rightShin: null!,
    leftLegHip: {rotation: makeRotation()} as never,
    leftThigh: null!,
    leftLegKnee: {rotation: makeRotation()} as never,
    leftShin: null!,
    equipWeapon: () => {}, removeWeapon: () => {}, weaponMesh: null, recolor: () => {}, dispose: () => {},
} as unknown as CharacterModel)

describe('郊狼过程动画与摄像机平滑', () => {
    /* 预热 1s：排除初始 idle→walking 过渡（速度 0→6 导致的合法频率爬升） */
    const WARMUP_FRAMES = 60

    for (const deg of SLOPES_WALKABLE) {
        it(`walking 下坡 ${deg}° 动画相位单调不减且速率平滑`, () => {
            const shared = createSharedWorld()
            makeSlope(shared, Math.tan(deg * Math.PI / 180))
            const x = 820
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(shared, x, y, -50)
            const sys = createAppearanceSystem()
            const model = makeModelMock()

            let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
            let prevT: number | undefined
            let prevPhaseVel: number | undefined
            let phaseRegress = 0
            let maxPhaseVelJump = 0
            /* 与 appearance/system.ts 一致的 EMA 平滑与位移积分（状态切换时重置） */
            let smoothedSpeed = 0
            let travel = 0
            let prevState: string | undefined
            for (let i = 0; i < FRAMES_3600; i++) {
                gs = tick(shared, entity, gs, -1, 0)
                const state = entity.stateMachine.currentState
                const hSpeed = Math.hypot(entity.body.velocity.x, entity.body.velocity.z)
                sys.update(DT, model, state, {
                    stateTime: entity.stateMachine.stateTime,
                    horizontalSpeed: hSpeed,
                    horizontalTravel: 0,
                    swingTilt: 0,
                })
                if (state !== prevState) {
                    smoothedSpeed = hSpeed
                    travel = 0
                    prevState = state
                } else {
                    smoothedSpeed += (hSpeed - smoothedSpeed) * HORIZONTAL_SPEED_SMOOTHING
                }
                travel += smoothedSpeed * DT
                if (i < WARMUP_FRAMES) continue
                if (state !== 'walking') {
                    prevT = undefined
                    prevPhaseVel = undefined
                    continue
                }
                /* 与 walkingAnim 一致：t = 1.2×stateTime + 1.3×travel，相位速度 = 1.2 + 1.3×speed */
                const phaseVel = 1.2 + 1.3 * Math.min(smoothedSpeed, WALK_ANIM_MAX_SPEED)
                const t = 1.2 * entity.stateMachine.stateTime + 1.3 * travel
                if (prevT !== undefined) {
                    if (t < prevT - 1e-6) phaseRegress++
                    if (prevPhaseVel !== undefined) maxPhaseVelJump = Math.max(maxPhaseVelJump, Math.abs(phaseVel - prevPhaseVel))
                }
                prevT = t
                prevPhaseVel = phaseVel
            }
            expect(phaseRegress).toBe(0)
            expect(maxPhaseVelJump).toBeLessThan(1.0)
        })

        it(`walking 下坡 ${deg}° 摄像机帧间位移平滑`, () => {
            const shared = createSharedWorld()
            makeSlope(shared, Math.tan(deg * Math.PI / 180))
            const x = 820
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(shared, x, y, -50)

            /* 与 setupPlayCamera 默认参数一致（yaw=π, pitch=π/6, distance=6），含 EMA 平滑跟随 */
            const CAM_YAW = Math.PI
            const CAM_PITCH = Math.PI / 6
            const CAM_DIST = 6
            const SMOOTH_K = 1 - Math.exp(-CAMERA_SMOOTH_FACTOR * DT)
            let gs: GroundState = {isOnGround: true, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0}
            let prevCam: {x: number; y: number; z: number} | undefined
            let maxFrameDelta = 0
            let yFlips = 0
            let prevSign: number | undefined
            let smoothed: {x: number; y: number; z: number} | undefined
            for (let i = 0; i < FRAMES_3600; i++) {
                gs = tick(shared, entity, gs, -1, 0)
                if (i < WARMUP_FRAMES) continue
                const p = entity.body.position
                const rawCamX = p.x + CAM_DIST * Math.sin(CAM_YAW) * Math.cos(CAM_PITCH)
                const rawCamY = p.y + CAM_DIST * Math.sin(CAM_PITCH)
                const rawCamZ = p.z + CAM_DIST * Math.cos(CAM_YAW) * Math.cos(CAM_PITCH)
                if (!smoothed) {
                    smoothed = {x: rawCamX, y: rawCamY, z: rawCamZ}
                } else {
                    smoothed.x += (rawCamX - smoothed.x) * SMOOTH_K
                    smoothed.y += (rawCamY - smoothed.y) * SMOOTH_K
                    smoothed.z += (rawCamZ - smoothed.z) * SMOOTH_K
                }
                if (prevCam) {
                    maxFrameDelta = Math.max(maxFrameDelta, Math.hypot(smoothed.x - prevCam.x, smoothed.y - prevCam.y, smoothed.z - prevCam.z))
                    const dy = smoothed.y - prevCam.y
                    const sign = Math.sign(dy)
                    if (prevSign !== undefined && sign !== 0 && prevSign !== 0 && sign !== prevSign) yFlips++
                    if (sign !== 0) prevSign = sign
                }
                prevCam = {...smoothed}
            }
            expect(maxFrameDelta).toBeLessThan(0.15)
            expect(yFlips).toBeLessThan(2)
        })
    }
})
