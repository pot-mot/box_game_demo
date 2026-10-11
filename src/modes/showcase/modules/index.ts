import type {ShowcaseModule} from '../module.ts'
import {actionsModule} from './actions.ts'
import {appearanceModule} from './appearance.ts'
import {aiTerrainModule} from './ai_terrain.ts'
import {terrainModule} from './terrain.ts'
import {interactablesModule} from './interactables.ts'
import {catalogModule} from './catalog.ts'
import {inventoryModule} from './inventory.ts'

/** 展示模式二级菜单条目（顺序即菜单展示顺序）；新增子模块在此登记并补齐 i18n 文案与测试 */
export const SHOWCASE_MODULES: readonly ShowcaseModule[] = [
    actionsModule,
    appearanceModule,
    aiTerrainModule,
    terrainModule,
    interactablesModule,
    catalogModule,
    inventoryModule,
]
