import type {SpawnMode} from '../../types/spawnMode.ts'

/** 角色 / 交互物对齐到 1/2 格点，其它实体对齐到整数格点 */
const HALF_STEP: SpawnMode[] = ['character', 'interactable']
const HALF_GRID = 0.5
const INTEGER_GRID = 1

/** 生成模式对应的对齐步长 */
export const spawnAlignmentStep = (mode: SpawnMode): number =>
    HALF_STEP.includes(mode) ? HALF_GRID : INTEGER_GRID

/** 按步长对齐单轴坐标；先放大为整数再缩回，避免浮点尾差并归一化 -0 */
export const alignSpawnValue = (value: number, step: number): number => {
    const scale = 1 / step
    const aligned = Math.round(value * scale) / scale
    return Object.is(aligned, -0) ? 0 : aligned
}

/** 对齐生成坐标（三轴同一规则） */
export const alignSpawnPosition = (
    mode: SpawnMode,
    x: number,
    y: number,
    z: number,
): [number, number, number] => {
    const step = spawnAlignmentStep(mode)
    return [alignSpawnValue(x, step), alignSpawnValue(y, step), alignSpawnValue(z, step)]
}
