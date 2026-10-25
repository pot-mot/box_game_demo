# 角色状态（character/state/）模块约定

> 状态：**权威规范（强制执行）**。全局条款见 [`docs/design/character_state.md`](../../../docs/design/character_state.md)。

## 目录

- `types.ts`：`CharacterState` 基础接口、子域类型、`CharacterConfig` / `BodyState`、`CharacterStateMachineData`。
- `test_state.ts`：**测试专用**最小 state 工厂；生产代码禁止使用。
- `state.md`：本文件。

## 唯一真源

- `CharacterState` 是角色唯一权威数据存储。
- 生产运行时由 `entity/character/runtime.ts` 的 `CharacterRuntime` 持有 state 与引擎句柄。
- `CharacterEntity` 只保留 `state`、引擎句柄与状态机逻辑对象，不再暴露游戏数据访问器。
- 所有游戏数据读写统一使用 `entity.state.*`；禁止在 `CharacterEntity` 或任何子系统另存副本。

## 子域

- `identity`：id / isPlayer / rowText
- `config`：速度、跳跃、缩放、体形 id、bodyState 等配置
- `bodyState`：体形不透明状态（通用 `attackModule`；人形 `handedness`）
- `combat`：战斗组件（当前聚合属性 / 装备 / 计时；后续可细分，但不得另存）
- `stateMachine`：当前/上一状态名、`stateTime`（**只存数据**；状态机逻辑对象在运行时句柄）
- `physics`：着地、地面法线、郊狼计时、悬空/支撑计时
- `ai`：策略、原点、追击半径、反应式举盾参数
- `timers`：死亡 / 倒地计时与方向
- `interaction`：交互悬停目标
- `environment`：环境场累加器
- `lockPoints` / `hurtProfile` / `hurtBlocks`
- `animation`：`params`（由 state 所有者写）+ `current`（动画系统写）

## 写入所有权

| 子域 | 写入者 |
|---|---|
| `identity` | 生成 / 体形切换 |
| `config` | 生成 / 面板 / 存档 |
| `bodyState` | 体形 / 装备 |
| `combat` | 战斗 / 状态机 / 装备 |
| `stateMachine` | 状态机 |
| `physics` | 物理步 |
| `ai` | AI / 面板 |
| `timers` | 拥有该计时器的状态 / 战斗 |
| `interaction` | 交互系统 |
| `environment` | 区域 / 环境系统 |
| `animation.params` | 物理 / 状态机 / 战斗 / AI / 输入 |
| `animation.current` | 动画系统（只写当前信息） |

## 禁止项

- 在 `CharacterEntity` 或动画 / 骨骼 / 战斗 / AI 中另存同类数据。
- 把 Rapier / Three 句柄放进 state。
- 动画系统回写 `animation.params`。
- 生产代码使用 `test_state.ts`。
