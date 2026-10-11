import type {WebGLRenderer} from 'three'
import type {StringLocaleKey} from '../../i18n/index.ts'

/**
 * 展示子模块标识：进入展示模式后先展示二级菜单，每个条目对应一个子模块。
 * 新增子模块须在 `SHOWCASE_MODULES`（`modules/index.ts`）登记并补齐 `locales/showcase.ts` 文案。
 */
export const SHOWCASE_MODULE_IDS = ['actions', 'appearance', 'ai_terrain', 'catalog', 'inventory'] as const
export type ShowcaseModuleId = typeof SHOWCASE_MODULE_IDS[number]

/** 子模块装配所需的宿主上下文：复用主页共享渲染器（不自建 WebGL 上下文 / 单 RAF 循环） */
export interface ShowcaseModuleHost {
    readonly renderer: WebGLRenderer
}

/** 运行中的子模块句柄：由展示模式控制器每帧调度、退出时释放 */
export interface ShowcaseModuleRuntime {
    /** 每帧调用：推进本模块时间线并完成渲染 */
    readonly updater: (dt: number) => void
    /** 释放本模块自建的全部场景 / 面板 / 监听资源 */
    readonly dispose: () => void
}

/** 展示子模块：二级菜单条目 + 装配函数 */
export interface ShowcaseModule {
    readonly id: ShowcaseModuleId
    /** 菜单显示名文案键（经 `translate` 解析） */
    readonly title: StringLocaleKey
    /** 菜单说明文案键 */
    readonly description: StringLocaleKey
    /**
     * 创建模块运行时。模块自建独立 `Scene` / 相机 / 灯光（经 `setupShowcaseScene`），
     * 复用宿主渲染器完成绘制；返回 updater / dispose 交由控制器统一调度与释放。
     */
    readonly setup: (host: ShowcaseModuleHost) => ShowcaseModuleRuntime
}
