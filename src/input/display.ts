import {CODE_LABELS, MOUSE_CODE_LABELS} from './constants.ts'
import {translate} from '../i18n/index.ts'
import type {KeyCombo} from './types.ts'

/** 将 KeyCombo 转为可读显示字符串（鼠标按键名随语言本地化） */
export const keyComboToDisplay = (combo: KeyCombo): string => {
    return combo.map(c => {
        const mouseKey = MOUSE_CODE_LABELS[c]
        if (mouseKey !== undefined) return translate(mouseKey)
        return CODE_LABELS[c] ?? c
    }).join(' + ')
}
