import type {CharacterState, CharacterStateInit} from '../../../../../character/state/types.ts'
import {createCharacterState} from '../../../runtime.ts'
import {humanoidBodyStateOf} from './body_state.ts'

/** 人形具体 state：持握/惯用手在 bodyState 中按人形规则归一化 */
export interface HumanoidState extends CharacterState {
    readonly bodyForm: 'humanoid'
}

export const createHumanoidState = (init: CharacterStateInit): HumanoidState => ({
    ...createCharacterState({...init, bodyState: humanoidBodyStateOf(init.bodyState)}),
    bodyForm: 'humanoid',
})
