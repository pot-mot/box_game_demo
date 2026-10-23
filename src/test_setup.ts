/**
 * Vitest 全局装配（`vitest.config.ts` 的 `setupFiles`）：
 * 导入体形注册表以触发武器目录装配（`registerFormWeapons`），使领域层 `createWeaponRuntime(id)`
 * 在测试中可解析武器 id —— 与生产 `main.ts` 经 `world.ts` 导入 `body_form/index.ts` 的行为一致。
 */
import './entity/character/body_form/index.ts'

/** 支撑手测试的视觉容忍上限（实测最大约 0.144m；不是烘焙求解精度） */
export const SUPPORT_HAND_VISUAL_TOLERANCE = 0.15

/** happy-dom 缺失的 2D 上下文表面（只覆盖项目绘制脸部纹理用到的 API） */
type Canvas2dStub = Pick<
    CanvasRenderingContext2D,
    | 'fillStyle'
    | 'strokeStyle'
    | 'lineWidth'
    | 'lineCap'
    | 'font'
    | 'textAlign'
    | 'textBaseline'
    | 'globalAlpha'
    | 'globalCompositeOperation'
    | 'save'
    | 'restore'
    | 'translate'
    | 'rotate'
    | 'scale'
    | 'setTransform'
    | 'clearRect'
    | 'fillRect'
    | 'strokeRect'
    | 'beginPath'
    | 'ellipse'
    | 'fill'
    | 'stroke'
    | 'arc'
    | 'moveTo'
    | 'lineTo'
    | 'closePath'
    | 'quadraticCurveTo'
    | 'fillText'
    | 'strokeText'
>

const createCanvas2dStub = (): Canvas2dStub => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save: (): void => {},
    restore: (): void => {},
    translate: (): void => {},
    rotate: (): void => {},
    scale: (): void => {},
    setTransform: (): void => {},
    clearRect: (): void => {},
    fillRect: (): void => {},
    strokeRect: (): void => {},
    beginPath: (): void => {},
    ellipse: (): void => {},
    fill: (): void => {},
    stroke: (): void => {},
    arc: (): void => {},
    moveTo: (): void => {},
    lineTo: (): void => {},
    closePath: (): void => {},
    quadraticCurveTo: (): void => {},
    fillText: (): void => {},
    strokeText: (): void => {},
})

/* 全局注入：所有测试统一使用同一桩，禁止各测试文件重复定义 / 不安全断言 */
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: (contextId: string): Canvas2dStub | null => contextId === '2d' ? createCanvas2dStub() : null,
    configurable: true,
    writable: true,
})
