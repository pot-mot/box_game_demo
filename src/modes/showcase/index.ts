import type {WebGLRenderer} from 'three'
import {createShowcaseMenu} from './menu.ts'
import type {ShowcaseMenu} from './menu.ts'
import {SHOWCASE_MODULES} from './modules/index.ts'
import type {ShowcaseModuleId, ShowcaseModuleRuntime} from './module.ts'
import {localizeText} from '../../i18n/dom.ts'
import {createIcon} from '../../ui/icons/icon.ts'

/** 展示模式控制器：遵循 modes 分包约定，updater 由主页单 RAF 循环统一调度 */
export interface ShowcaseModeController {
    /** 每帧调用：委托给当前激活子模块（无激活模块时为空操作，菜单覆盖画布） */
    readonly updater: (dt: number) => void
    /** 返回启动屏：释放当前子模块与菜单后回调宿主 onExit */
    readonly exit: () => void
}

/** 展示模式装配所需的宿主上下文 */
export interface ShowcaseModeHost {
    /** 主页共享渲染器（子模块复用同一 WebGL 上下文，不自建渲染器/渲染循环） */
    readonly renderer: WebGLRenderer
    /** 资源释放完成后由 exit 调用（宿主负责停循环、销毁渲染器、重现启动屏） */
    readonly onExit: () => void
}

/**
 * 展示模式装配：二级菜单 + 子模块宿主。
 *
 * 进入展示模式先显示二级菜单，选择条目后装配对应子模块（动作 / 外观 / AI 行为 / 图鉴 / 背包），
 * 模块期间顶部提供「返回展示菜单」按钮；右上角设置菜单「返回主页面」走 `exit` 优雅退出。
 * 复用主页共享渲染器与单 RAF 循环；全部 DOM/模块资源在本控制器内统一释放。
 */
export const setupShowcaseMode = (host: ShowcaseModeHost): ShowcaseModeController => {
    const {renderer, onExit} = host

    let current: ShowcaseModuleRuntime | undefined

    /** 返回菜单按钮（模块激活时显示） */
    const backBtn = document.createElement('button')
    backBtn.type = 'button'
    backBtn.className = 'dc-btn'
    backBtn.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:150;display:none'
    backBtn.appendChild(createIcon('chevron-left', {size: 'sm'}))
    const backLabel = document.createElement('span')
    localizeText(backLabel, 'showcase.back_menu')
    backBtn.appendChild(backLabel)
    document.body.appendChild(backBtn)

    const disposeCurrent = (): void => {
        current?.dispose()
        current = undefined
    }

    const backToMenu = (): void => {
        disposeCurrent()
        backBtn.style.display = 'none'
        menu.show()
    }

    const selectModule = (id: ShowcaseModuleId): void => {
        const module = SHOWCASE_MODULES.find(m => m.id === id)
        if (module === undefined) return
        disposeCurrent()
        current = module.setup({renderer})
        menu.hide()
        backBtn.style.display = ''
    }

    const menu: ShowcaseMenu = createShowcaseMenu(SHOWCASE_MODULES, id => selectModule(id))
    backBtn.addEventListener('click', () => backToMenu())

    const updater = (dt: number): void => {
        current?.updater(dt)
    }

    const exit = (): void => {
        disposeCurrent()
        menu.dispose()
        backBtn.remove()
        onExit()
    }

    return {updater, exit}
}
