import type {CharacterState, CharacterStateInit} from '../../../../../character/state/types.ts'
import {createCharacterState} from '../../../runtime.ts'

/** 狼具体 state（步态参数在 P4 动画迁移时补充） */
export interface WolfState extends CharacterState {
    readonly bodyForm: 'wolf'
}

export const createWolfState = (init: CharacterStateInit): WolfState => ({
    ...createCharacterState(init),
    bodyForm: 'wolf',
})
