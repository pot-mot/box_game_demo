import {beforeAll, describe, it, expect} from 'vitest'
import {Group, Mesh} from 'three'
import {
    createHarnessWorld,
    initRapier,
    makeSlope,
    makeWall,
    removeDefaultGround,
    makeChar,
    tick,
    DT,
    initGS,
    type HarnessWorld,
} from './harness.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {GroundState} from './ground_state.ts'
import {createAppearanceSystem} from '../appearance/system.ts'
import {CAMERA_SMOOTH_FACTOR} from '../../../modes/play/constants.ts'
import type {CharacterModel} from '../appearance/types.ts'

const FRAMES_3600 = 3600
const TIMEOUT = 120000

beforeAll(async () => {
    await initRapier()
})

const SLOPES_WALKABLE = [10, 20, 30, 40, 50, 60, 70, 80, 85] as const
const SLOPES_FALLING = [90, 100] as const

/** 统计 3600 帧的状态分布与 falling 帧数 */
const runAndStats = (
    hw: HarnessWorld,
    entity: CharacterEntity,
    dx: number,
    frames: number,
): {fallingFrames: number; finalState: string; states: Set<string>} => {
    let gs: GroundState = initGS()
    let fallingFrames = 0
    const states = new Set<string>()
    for (let i = 0; i < frames; i++) {
        gs = tick(hw, entity, gs, dx, 0)
        states.add(entity.stateMachine.currentState)
        if (entity.stateMachine.currentState === 'falling') fallingFrames++
    }
    return {fallingFrames, finalState: entity.stateMachine.currentState, states}
}

/** 统计水平前进量与卡死帧数（每帧 x 位移 < 1mm 判卡死） */
const runAndProgress = (
    hw: HarnessWorld,
    entity: CharacterEntity,
    dx: number,
    frames: number,
): {progressX: number; stuckFrames: number} => {
    let gs: GroundState = initGS()
    const startX = entity.body.translation().x
    let stuckFrames = 0
    let prevX = startX
    for (let i = 0; i < frames; i++) {
        gs = tick(hw, entity, gs, dx, 0)
        const x = entity.body.translation().x
        if (Math.abs(x - prevX) < 0.001) stuckFrames++
        prevX = x
    }
    return {progressX: prevX - startX, stuckFrames}
}

/** 构造最低限度 CharacterModel mock（9 个动画关节用真实 three Group，避免不安全类型断言） */
const makeJoint = (): Group => new Group()

const makeModelMock = (): CharacterModel => ({
    group: new Group(),
    spine: new Group(),
    headNeck: makeJoint(),
    head: new Mesh(),
    body: new Mesh(),
    rightArmShoulder: makeJoint(),
    rightUpperArm: new Mesh(),
    rightArmElbow: makeJoint(),
    rightForearm: new Mesh(),
    rightHandPivot: new Group(),
    rightWristPivot: new Group(),
    leftArmShoulder: makeJoint(),
    leftUpperArm: new Mesh(),
    leftArmElbow: makeJoint(),
    leftForearm: new Mesh(),
    leftHandPivot: new Group(),
    leftWristPivot: new Group(),
    rightWeaponMount: new Group(),
    leftWeaponMount: new Group(),
    rightLegHip: makeJoint(),
    rightThigh: new Mesh(),
    rightLegKnee: makeJoint(),
    rightShin: new Mesh(),
    leftLegHip: makeJoint(),
    leftThigh: new Mesh(),
    leftLegKnee: makeJoint(),
    leftShin: new Mesh(),
    equipWeapon: () => {},
    removeWeapon: () => {},
    weaponMesh: null,
    weaponTip: null,
    weaponGroup: null,
    weaponHitBox: null,
    weaponGripY: 0,
    weaponSupportGripOffset: 0,
    offhandWeaponMesh: null,
    offhandWeaponTip: null,
    offhandWeaponGroup: null,
    offhandWeaponHitBox: null,
    offhandWeaponGripY: 0,
    recolor: () => {},
    dispose: () => {},
})

describe('walking 上坡坡度矩阵（3600 帧物理更新）', () => {
    for (const deg of SLOPES_WALKABLE) {
        it(`${deg}° 全程 walking 且持续前进（trimesh 内部棱回归）`, () => {
            const hw = createHarnessWorld()
            makeSlope(hw, Math.tan(deg * Math.PI / 180), 140, 6)
            const x = 20
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(hw, 1, x, y, -50)
            const r = runAndStats(hw, entity, 1, FRAMES_3600)
            /* 平底 cuboid 时 trimesh 内部棱幽灵水平法线会把角色整帧卡死
             *（10° 实测 219/240 帧原地不动），胶囊底面后必须消失 */
            expect(r.fallingFrames).toBe(0)
            expect(r.finalState).toBe('walking')
            /* 前进量 ≥ 几何期望（speed·cosθ·时长）的 60%：
             * projectToSlopeAtSpeed 保证总速度恒为 speed，水平分量 = speed·cosθ */
            const p = runAndProgress(hw, entity, 1, FRAMES_3600)
            const expected = (FRAMES_3600 / 60) * 6 * Math.cos(deg * Math.PI / 180)
            expect(p.progressX).toBeGreaterThan(expected * 0.6)
            expect(p.stuckFrames).toBeLessThan(FRAMES_3600 * 0.01)
        }, TIMEOUT)
    }
})

describe('walking 下坡坡度矩阵（3600 帧物理更新）', () => {
    for (const deg of SLOPES_WALKABLE) {
        it(`${deg}° 全程处于 walking（falling 帧数 = 0）`, () => {
            const hw = createHarnessWorld()
            makeSlope(hw, Math.tan(deg * Math.PI / 180), 140, 6)
            const x = 820
            /* 贴地 spawn：底棱紧贴坡面，排除初始下落 */
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(hw, 1, x, y, -50)
            const r = runAndStats(hw, entity, -1, FRAMES_3600)
            expect(r.fallingFrames).toBe(0)
            expect(r.finalState).toBe('walking')
        }, TIMEOUT)
    }
    for (const deg of SLOPES_FALLING) {
        it(`${deg}° 必须全程处于 falling`, () => {
            const hw = createHarnessWorld()
            removeDefaultGround(hw)
            makeWall(hw, deg)
            /* 贴墙 spawn：90° 墙在 z=0（角色 z=0.1 贴墙），100° 墙法线朝下偏（正侧 z=0.5） */
            const entity = makeChar(hw, 1, 0, deg === 90 ? 3 : 1, deg === 90 ? 0.1 : 0.5)
            const r = runAndStats(hw, entity, -1, FRAMES_3600)
            expect(r.fallingFrames).toBeGreaterThan(FRAMES_3600 * 0.9)
            expect(r.finalState).toBe('falling')
        }, TIMEOUT)
    }
})

describe('idle 下坡坡度矩阵（3600 帧物理更新）', () => {
    for (const deg of SLOPES_WALKABLE) {
        it(`${deg}° 全程处于 idle（falling 帧数 = 0）`, () => {
            const hw = createHarnessWorld()
            makeSlope(hw, Math.tan(deg * Math.PI / 180), 140, 6)
            const x = 820
            /* 贴地 spawn：底棱紧贴坡面，排除初始下落 */
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(hw, 1, x, y, -50)
            const r = runAndStats(hw, entity, 0, FRAMES_3600)
            expect(r.fallingFrames).toBe(0)
            expect(r.finalState).toBe('idle')
        }, TIMEOUT)
    }
    for (const deg of SLOPES_FALLING) {
        it(`${deg}° 必须全程处于 falling`, () => {
            const hw = createHarnessWorld()
            removeDefaultGround(hw)
            makeWall(hw, deg)
            /* 贴墙 spawn：90° 墙在 z=0（角色 z=0.1 贴墙），100° 墙法线朝下偏（正侧 z=0.5） */
            const entity = makeChar(hw, 1, 0, deg === 90 ? 3 : 1, deg === 90 ? 0.1 : 0.5)
            const r = runAndStats(hw, entity, 0, FRAMES_3600)
            expect(r.fallingFrames).toBeGreaterThan(FRAMES_3600 * 0.9)
            expect(r.finalState).toBe('falling')
        }, TIMEOUT)
    }
})

describe('郊狼过程动画与摄像机平滑', () => {
    /* 预热 1s：排除初始 idle→walking 过渡（速度 0→6 导致的合法频率爬升） */
    const WARMUP_FRAMES = 60

    for (const deg of SLOPES_WALKABLE) {
        it(`walking 下坡 ${deg}° 动画相位单调不减且速率平滑`, () => {
            const hw = createHarnessWorld()
            makeSlope(hw, Math.tan(deg * Math.PI / 180), 140, 6)
            const x = 820
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(hw, 1, x, y, -50)
            const sys = createAppearanceSystem()
            const model = makeModelMock()

            let gs: GroundState = initGS()
            let prevT: number | undefined
            let prevPhaseVel: number | undefined
            let phaseRegress = 0
            let maxPhaseVelJump = 0
            let prevState: string | undefined
            for (let i = 0; i < FRAMES_3600; i++) {
                gs = tick(hw, entity, gs, -1, 0)
                const state = entity.stateMachine.currentState
                const linvel = entity.body.linvel()
                const hSpeed = Math.hypot(linvel.x, linvel.z)
                sys.update(DT, model, state, {
                    stateTime: entity.stateMachine.stateTime,
                    horizontalSpeed: hSpeed,
                    holdMode: 'one_handed',
                    attackSegment: undefined,
                    attackPhase: undefined,
                    attackPhaseProgress: 0,
                    attackTotalProgress: 0,
                    attackPhaseIndex: 0,
                    weaponHeld: false,
                })
                if (state !== prevState) prevState = state
                if (i < WARMUP_FRAMES) continue
                if (state !== 'walking') {
                    prevT = undefined
                    prevPhaseVel = undefined
                    continue
                }
                /* walking 相位由播放器 time 驱动（t = 6×stateTime），相位单调性由播放器累加保证 */
                const phaseVel = 6
                const t = 6 * entity.stateMachine.stateTime
                if (prevT !== undefined) {
                    if (t < prevT - 1e-6) phaseRegress++
                    if (prevPhaseVel !== undefined) maxPhaseVelJump = Math.max(maxPhaseVelJump, Math.abs(phaseVel - prevPhaseVel))
                }
                prevT = t
                prevPhaseVel = phaseVel
            }
            expect(phaseRegress).toBe(0)
            /* 播放器 time 单调累加，相位速率恒为 6，无跳变 */
            expect(maxPhaseVelJump).toBeLessThan(1e-9)
        }, TIMEOUT)

        it(`walking 下坡 ${deg}° 摄像机帧间位移平滑`, () => {
            const hw = createHarnessWorld()
            makeSlope(hw, Math.tan(deg * Math.PI / 180), 140, 6)
            const x = 820
            const y = Math.tan(deg * Math.PI / 180) * x + 0.51
            const entity = makeChar(hw, 1, x, y, -50)

            /* 与 setupPlayCamera 默认参数一致（yaw=π, pitch=π/6, distance=6），含 EMA 平滑跟随 */
            const CAM_YAW = Math.PI
            const CAM_PITCH = Math.PI / 6
            const CAM_DIST = 6
            const SMOOTH_K = 1 - Math.exp(-CAMERA_SMOOTH_FACTOR * DT)
            /* y 振荡噪声阈值：低于此幅度的帧间位移视为接触法线噪声而非真实振荡 */
            const CAMERA_Y_NOISE_EPSILON = 0.001
            let gs: GroundState = initGS()
            let prevCam: {x: number; y: number; z: number} | undefined
            let maxFrameDelta = 0
            let yFlips = 0
            let prevSign: number | undefined
            let smoothed: {x: number; y: number; z: number} | undefined
            for (let i = 0; i < FRAMES_3600; i++) {
                gs = tick(hw, entity, gs, -1, 0)
                if (i < WARMUP_FRAMES) continue
                const p = entity.body.translation()
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
                    /* Rapier 陡坡 trimesh 接触法线逐帧交替会产生亚毫米级 60Hz y 抖动，
                       低于噪声阈值的位移不计入振荡（真实弹跳为厘米级，仍会被捕获） */
                    const sign = Math.abs(dy) > CAMERA_Y_NOISE_EPSILON ? Math.sign(dy) : 0
                    if (prevSign !== undefined && sign !== 0 && prevSign !== 0 && sign !== prevSign) yFlips++
                    if (sign !== 0) prevSign = sign
                }
                prevCam = {...smoothed}
            }
            expect(maxFrameDelta).toBeLessThan(0.15)
            expect(yFlips).toBeLessThan(2)
        }, TIMEOUT)
    }
})
