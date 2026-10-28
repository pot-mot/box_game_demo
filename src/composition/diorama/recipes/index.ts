import type {DioramaBlueprint} from '../types.ts'
import {createFortressBlueprint} from './fortress.ts'
import {createDungeonBlueprint} from './dungeon.ts'

export interface DioramaRecipe {
    readonly id: string
    readonly build: (seed: number) => DioramaBlueprint
}

const RECIPES: readonly DioramaRecipe[] = [
    {id: 'fortress', build: createFortressBlueprint},
    {id: 'dungeon', build: createDungeonBlueprint},
]

export const DIORAMA_RECIPE_IDS: readonly string[] = RECIPES.map(recipe => recipe.id)

export const findDioramaRecipe = (id: string): DioramaRecipe | undefined =>
    RECIPES.find(recipe => recipe.id === id)

export const createDioramaBlueprint = (recipeId: string, seed: number): DioramaBlueprint | undefined =>
    findDioramaRecipe(recipeId)?.build(seed)
