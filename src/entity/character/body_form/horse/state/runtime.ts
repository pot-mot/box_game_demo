import type {CharacterState, CharacterStateInit} from '../../../../../character/state/types.ts'
import {createCharacterState} from '../../../runtime.ts'

/** 马具体 state（步态参数在 P4 动画迁移时补充） */
export interface HorseState extends CharacterState {
    readonly bodyForm: 'horse'
}

export const createHorseState = (init: CharacterStateInit): HorseState => ({
    ...createCharacterState(init),
    bodyForm: 'horse',
})
