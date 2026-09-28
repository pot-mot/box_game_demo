import type {InteractionTarget} from '../../../character/interaction/types.ts'

/** 屏幕中下方交互提示条（固定 DOM + 脏检查刷新） */
export interface InteractionPrompt {
    update: (target: InteractionTarget | undefined) => void
    dispose: () => void
}

export const createInteractionPrompt = (): InteractionPrompt => {
    const el = document.createElement('div')
    el.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:18%',
        'transform:translateX(-50%)',
        'padding:6px 14px',
        'background:rgba(0,0,0,0.55)',
        'color:#f5f0e6',
        'font:14px/1.6 system-ui, sans-serif',
        'border:1px solid rgba(255,255,255,0.25)',
        'border-radius:6px',
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
        const text = `[F] ${target.prompt}`
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
