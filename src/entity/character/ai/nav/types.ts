import type {CharacterEntity} from '../../../../character/types.ts'

/* 导航 FSM 状态 */
export const NAV_STATES = ['navigating', 'steering', 'jumping', 'stuck'] as const
export type NavState = typeof NAV_STATES[number]

/* 传感器检测结果 */
export const SENSE_RESULTS = ['clear', 'blocked_low', 'blocked_wall', 'blocked_pit'] as const
export type SenseResult = typeof SENSE_RESULTS[number]

/* 传感器输出 */
export interface NavSenseOutput {
    result: SenseResult
    /** 最近障碍物距离（blocked 时有效） */
    obstacleDistance: number
    /** 最近障碍物顶部高度（blocked_low 时用于判断能否跳过） */
    obstacleHeight: number
    /** 左侧是否有通路（-90° ~ -15° 方向无命中） */
    leftClear: boolean
    /** 右侧是否有通路（+15° ~ +90° 方向无命中） */
    rightClear: boolean
    /** 前方地面是否可站立（坑洞探针命中） */
    groundAhead: boolean
}

/* 导航配置 */
export interface NavConfig {
    /** 半圆柱体检测半径（水平扩散宽度） */
    checkRadius: number
    /** 前方检测距离 */
    checkDistance: number
    /** 卡住判定超时（秒，legacy AI 使用） */
    stuckTimeout: number
}

/* 导航运行时上下文（嵌入 AIContext） */
export interface NavRunContext {
    state: NavState
    stateTime: number
    /** 绕行偏转角（弧度，正=左，负=右） */
    steerAngle: number
    /** steering 状态下的选定偏转方向：1=左，-1=右 */
    steerDirection: number
    /** 卡住累计计时（legacy 模式使用） */
    stuckTimer: number
    /** 上帧记录位置（legacy 模式使用） */
    lastPosX: number
    lastPosZ: number
    /** 当前配置（运行时可动态修改） */
    config: NavConfig
    /** 是否启用导航 FSM */
    enabled: boolean
    /** 预计算传感器结果缓存，由 processNav 在每帧开始时填充（避免 guard/update 重复调用 sense） */
    preSense: NavSenseOutput | null
}

/** 传感器接口 */
export interface NavSensor {
    sense: (
        entity: CharacterEntity,
        forwardX: number,
        forwardZ: number,
        config: NavConfig,
    ) => NavSenseOutput
}

/* 导航 FSM 状态处理器 */
export interface NavStateHandler {
    enter: (ctx: NavRunContext, entity: CharacterEntity) => void
    update: (dt: number, ctx: NavRunContext, entity: CharacterEntity, sensor: NavSensor, intendedDX: number, intendedDZ: number) => {dx: number; dz: number; jump: boolean}
    exit: (ctx: NavRunContext, entity: CharacterEntity) => void
    transitions: readonly NavTransition[]
}

export interface NavTransition {
    to: NavState
    guard: (ctx: NavRunContext, entity: CharacterEntity, sensor: NavSensor, intendedDX: number, intendedDZ: number) => boolean
}
