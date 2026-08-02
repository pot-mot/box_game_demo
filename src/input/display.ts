import {CODE_LABELS} from './constants.ts'
import type {KeyCombo} from './types.ts'

/** 将 KeyCombo 转为可读显示字符串 */
export const keyComboToDisplay = (combo: KeyCombo): string => {
    return combo.map(c => CODE_LABELS[c] ?? c).join(' + ')
}
