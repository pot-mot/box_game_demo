import type {InteractionTarget} from '../../../character/interaction/types.ts'
import {translate} from '../../../i18n/index.ts'

/** 屏幕中下方交互提示条（固定 DOM + 脏检查刷新） */
export interface InteractionPrompt {
    update: (target: InteractionTarget | undefined) => void
    dispose: () => void
}

export const createInteractionPrompt = (): InteractionPrompt => {
    const el = document.createElement('div')
    el.className = 'dc-panel'
    el.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:18%',
        'transform:translateX(-50%)',
        'padding:6px 14px',
        'font-size:var(--dc-fs-14)',
        'pointer-events:none',
        'user-select:none',
        'white-space:nowrap',
        'display:none',
        'z-index:40',
    ].join(';')
    document.body.appendChild(el)

    let lastText: string | undefined

    const update = (target: InteractionTarget | undefined): void => {
        if (target === undefined) {
            if (lastText !== undefined) {
                el.style.display = 'none'
                lastText = undefined
            }
            return
        }
        const text = translate({key: 'play.prompt.interact', args: [target.prompt]})
        if (text === lastText) return
        el.textContent = text
        el.style.display = ''
        lastText = text
    }

    const dispose = (): void => {
        el.remove()
    }

    return {update, dispose}
}
