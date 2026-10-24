import type {CharacterState, CharacterStateInit} from '../../../../../character/state/types.ts'
import {createCharacterState} from '../../../runtime.ts'

/** 双足飞龙具体 state（飞行参数在 P4 动画迁移时补充） */
export interface WyvernState extends CharacterState {
    readonly bodyForm: 'wyvern'
}

export const createWyvernState = (init: CharacterStateInit): WyvernState => ({
    ...createCharacterState(init),
    bodyForm: 'wyvern',
})
