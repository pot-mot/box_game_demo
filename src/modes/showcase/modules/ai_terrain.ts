import type {ShowcaseModule} from '../module.ts'
import {setupShowcaseScene} from '../scene.ts'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupTerrain} from '../../../entity/terrain/common/physics/world.ts'
import {setupCommonBoxes} from '../../../entity/box/common/physics/world.ts'
import {setupCharacterEntities} from '../../../entity/character/physics/world.ts'
import type {EntityInfoSource} from '../../../entity/box/base/types/entity_info.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {CombatSubStrategy} from '../../../character/ai_strategy/types.ts'
import {createFixedStepStepper} from '../../../physics/fixed_step.ts'
import {localizeText} from '../../../i18n/dom.ts'
import {
    AI_CAMERA_DISTANCE,
    AI_CAMERA_TARGET_Y,
    AI_CHARACTER_JUMP_HEIGHT,
    AI_CHARACTER_MAX_HEALTH,
    AI_CHARACTER_SPEED,
    AI_HUD_REFRESH_INTERVAL,
    AI_OBSTACLE_WALL_DEPTH,
    AI_OBSTACLE_WALL_HEIGHT,
    AI_OBSTACLE_WALL_THICKNESS,
    AI_TERRAIN_CELL_SIZE,
    AI_TERRAIN_FRICTION,
    AI_TERRAIN_GENERATOR,
    AI_TERRAIN_GRID_SIZE,
    AI_TERRAIN_MAX_HEIGHT,
    AI_TERRAIN_MIN_HEIGHT,
    AI_TEAM_SPAWN_X,
    AI_TEAM_SPAWN_Z_SPAN,
} from '../constants.ts'

/** 带可选 preSync 的实体系统（`EntityInfoSource` 声明 syncPositions，preSync 为物理子步后钩子） */
type SteppableSystem = EntityInfoSource & {readonly preSync?: (dt: number, time: number) => void}

interface UnitSpec {
    readonly attack: AttackConfig
    readonly strategy: CombatSubStrategy
}

/**
 * 单阵营单位配置：近战 / 远程混合，覆盖三档战斗策略（aggressive / tactical / cowardly），
 * 用于展示不同 AI 在同一复杂地形中的寻路、跳跃与面向敌对阵营的攻击行为。
 */
const AI_UNITS: readonly UnitSpec[] = [
    {attack: {weaponId: 'short_sword', damage: 4}, strategy: 'aggressive'},
    {attack: {weaponId: 'war_hammer', damage: 6}, strategy: 'aggressive'},
    {attack: {weaponId: 'spear', damage: 5}, strategy: 'tactical'},
    {attack: {weaponId: 'longbow', damage: 3, ranged: {range: 12, bulletSpeed: 22, bulletKnockback: 3, bulletLifetime: 3}}, strategy: 'tactical'},
    {attack: {weaponId: 'staff', damage: 4, ranged: {range: 10, bulletSpeed: 16, bulletKnockback: 2, bulletLifetime: 2.5}}, strategy: 'cowardly'},
]

const makeConfig = (faction: number, unit: UnitSpec): CharacterSaveConfig => ({
    speed: AI_CHARACTER_SPEED,
    jumpHeight: AI_CHARACTER_JUMP_HEIGHT,
    scale: 1,
    attack: unit.attack,
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction,
    maxHealth: AI_CHARACTER_MAX_HEALTH,
    combatStrategy: unit.strategy,
    peaceStrategy: 'patrol',
    isPlayer: false,
    navEnabled: true,
})

/** AI 状态 HUD（左侧：逐角色列出面板行文本，用于人工观察 FSM 状态迁移） */
interface AiHud {
    readonly dispose: () => void
    readonly refresh: (rows: readonly {color: string; text: string}[]) => void
}

const createAiHud = (onReset: () => void): AiHud => {
    const style = document.createElement('style')
    style.textContent = `
.sch-ai-hud {
    position: fixed; top: 16px; left: 16px; width: 460px;
    background: rgba(0, 0, 0, .72); color: #e8e4da;
    font: 12px/1.5 Consolas, 'Microsoft YaHei', monospace;
    border-radius: 10px; padding: 12px 14px; backdrop-filter: blur(4px); user-select: none;
}
.sch-ai-title { font-size: 15px; font-weight: 700; color: #ffd070; letter-spacing: 1px; }
.sch-ai-sub { color: #9aa3b2; font-size: 11px; margin: 2px 0 8px; }
.sch-ai-reset {
    background: #2a2f3a; color: #e8e4da; border: 1px solid #3a4150;
    border-radius: 6px; padding: 3px 10px; cursor: pointer; font: inherit; margin-bottom: 8px;
}
.sch-ai-reset:hover { background: #353c4a; }
.sch-ai-list { max-height: 60vh; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.sch-ai-row { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.sch-ai-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
`
    document.head.appendChild(style)

    const root = document.createElement('div')
    root.className = 'sch-ai-hud'
    const title = document.createElement('div')
    title.className = 'sch-ai-title'
    localizeText(title, 'showcase.ai.title')
    const sub = document.createElement('div')
    sub.className = 'sch-ai-sub'
    localizeText(sub, 'showcase.ai.subtitle')
    const resetBtn = document.createElement('button')
    resetBtn.type = 'button'
    resetBtn.className = 'sch-ai-reset'
    localizeText(resetBtn, 'showcase.ai.reset')
    resetBtn.addEventListener('click', () => { onReset(); resetBtn.blur() })
    const list = document.createElement('div')
    list.className = 'sch-ai-list'
    root.appendChild(title)
    root.appendChild(sub)
    root.appendChild(resetBtn)
    root.appendChild(list)
    document.body.appendChild(root)

    return {
        refresh: (rows) => {
            list.replaceChildren()
            for (const row of rows) {
                const el = document.createElement('div')
                el.className = 'sch-ai-row'
                const dot = document.createElement('span')
                dot.className = 'sch-ai-dot'
                dot.style.background = row.color
                const text = document.createElement('span')
                text.textContent = row.text
                el.appendChild(dot)
                el.appendChild(text)
                list.appendChild(el)
            }
        },
        dispose: () => {
            root.remove()
            style.remove()
        },
    }
}

/**
 * AI 行为 × 复杂地形子模块。
 *
 * 内容：FBM 起伏地形 + 中央低墙（可跳跃障碍）+ 双阵营（红 / 蓝）各 5 个单位（近战 / 远程混合、
 * 三档战斗策略），阵营互相敌对（`hostileExceptSelf`）——展示不同 AI 在同一地形中的寻路、
 * 障碍跳跃与面向敌对阵营的索敌 / 追击 / 攻击行为。
 *
 * 物理：本模块自建 `SharedWorld`（地形 + 障碍 + 角色），每帧按 `main.ts` 的固定子步策略步进
 * （`world.step` → `eventBus.drain` → 各系统 `preSync` / `syncPositions` → `characterSystem.update`），
 * 因此展示的是与 play 模式同一套 AI / 物理 / 状态机运行时（人员测试镜像）。
 *
 * 相机：复用展示场景的轨道相机，默认俯视战场全貌，可自由旋转 / 平移 / 缩放。
 */
export const aiTerrainModule: ShowcaseModule = {
    id: 'ai_terrain',
    title: 'showcase.module.ai_terrain.title',
    description: 'showcase.module.ai_terrain.desc',
    setup: host => {
        const sceneCtx = setupShowcaseScene(host.renderer)
        const shared = createSharedWorld()

        const terrain = setupTerrain(sceneCtx.scene, shared, () => [])
        terrain.add(
            {
                gridSize: AI_TERRAIN_GRID_SIZE,
                cellSize: AI_TERRAIN_CELL_SIZE,
                minHeight: AI_TERRAIN_MIN_HEIGHT,
                maxHeight: AI_TERRAIN_MAX_HEIGHT,
                friction: AI_TERRAIN_FRICTION,
                generatorId: AI_TERRAIN_GENERATOR,
            },
            0, 0, 0,
        )

        /* 中央低墙：高度低于跳跃高度，用于触发导航跳跃（blocked_low） */
        const common = setupCommonBoxes(sceneCtx.scene, shared)
        const wallBaseY = terrain.getHeightAt(0, 0, 20) ?? 0
        common.add(
            {
                width: AI_OBSTACLE_WALL_THICKNESS,
                height: AI_OBSTACLE_WALL_HEIGHT,
                depth: AI_OBSTACLE_WALL_DEPTH,
                mass: 0,
                friction: 0.5,
            },
            0, wallBaseY + AI_OBSTACLE_WALL_HEIGHT / 2, 0,
        )

        const characterSystem = setupCharacterEntities(sceneCtx.scene, shared)
        const systems: SteppableSystem[] = [common, terrain, characterSystem]

        const spawned: number[] = []
        const spawnAll = (): void => {
            for (let team = 0; team < 2; team++) {
                const baseX = team === 0 ? -AI_TEAM_SPAWN_X : AI_TEAM_SPAWN_X
                for (let i = 0; i < AI_UNITS.length; i++) {
                    const unit = AI_UNITS[i]
                    if (unit === undefined) continue
                    const z = (i - (AI_UNITS.length - 1) / 2) * AI_TEAM_SPAWN_Z_SPAN
                    const h = terrain.getHeightAt(baseX, z, 20) ?? 0
                    const {id} = characterSystem.add(makeConfig(team, unit), baseX, h + 0.8, z)
                    spawned.push(id)
                }
            }
        }
        spawnAll()
        characterSystem.setupAI(systems)
        characterSystem.setAIEnabled(true)
        characterSystem.activateAI()
        /* 隐藏碰撞胶囊（与 play 模式一致；胶囊默认半透明可见） */
        characterSystem.setCollisionVisible(false)

        /* 相机取景：俯视战场全貌 */
        sceneCtx.orbit.target.set(0, AI_CAMERA_TARGET_Y, 0)
        sceneCtx.orbit.setDistance(AI_CAMERA_DISTANCE)

        const resetBattle = (): void => {
            characterSystem.clearBullets()
            for (const id of spawned) characterSystem.remove(id)
            spawned.length = 0
            spawnAll()
            /* 新角色需要重建 AI 上下文：activateAI 挂既有 navSensor，setupAI 再补齐 losChecker / navSensor */
            characterSystem.activateAI()
            characterSystem.setupAI(systems)
            characterSystem.setCollisionVisible(false)
        }

        const hud = createAiHud(resetBattle)
        let hudTimer = AI_HUD_REFRESH_INTERVAL

        const refreshHud = (): void => {
            hud.refresh(characterSystem.panelInfo.map(pi => ({
                color: pi.badgeColor,
                text: pi.rowTextOf?.() ?? pi.rowText,
            })))
        }
        refreshHud()

        /* 物理固定子步（镜像 main.ts play 模式）：世界步进 → 各系统 preSync / syncPositions。
         * 运行器内聚「每子步清力」，避免漏注册反重力力残留导致角色升空。 */
        const step = createFixedStepStepper(shared, systems)

        const updater = (dt: number): void => {
            step(dt, performance.now())
            characterSystem.update(dt)
            sceneCtx.orbit.update(dt)
            sceneCtx.followGrid()
            host.renderer.render(sceneCtx.scene, sceneCtx.camera)
            hudTimer += dt
            if (hudTimer >= AI_HUD_REFRESH_INTERVAL) {
                hudTimer = 0
                refreshHud()
            }
        }

        return {
            updater,
            dispose: () => {
                characterSystem.clearBullets()
                hud.dispose()
                sceneCtx.dispose()
            },
        }
    },
}
