# 角色状态（state）权威规范

> 状态：**权威规范（强制执行）**。
> 本文件定义 `character/state` 的职责边界、所有权与命名；`AGENTS.md`、模块文档与实现不得与之冲突。

## 1. 定义

- **state 是角色唯一的数据存储，也是唯一权威数据来源。**
- state 存**游戏数据与 ID**：属性、装备、计时器、状态机信息、物理量、AI 状态、动画参数与动画当前信息等。
- **引擎句柄不进入 state**：Rapier `RigidBody` / `Collider`、Three `Group` / `Mesh` / 材质、渲染缓存等放在 `CharacterRuntime`。
- state 与 `state_machine` 是两个概念：
  - state = 数据状态管理；
  - state_machine = 状态机逻辑；
  - 状态机信息只是 state 的一个子域。

## 2. 目录与类型

```text
src/character/state/              # 基础接口（领域层，不依赖 entity）
src/entity/character/body_form/<form>/state/runtime.ts  # 具体体形 state 实现
```

- `src/character/state/` 声明 `CharacterState` 基础接口与子域类型。
- 每个 `body_form/<form>/state/` 实现自己的具体 state（通用攻击模组；人形惯用手；狼/马步态；飞龙飞行等）。
- `CharacterEntity` 只保留 `state` 与运行时句柄：
  - `state`；
  - Rapier body / colliders；
  - Three model / groups / meshes；
  - 状态机逻辑对象；
  - 其他非数据句柄。
- 生产代码一律通过 `entity.state.*` 读写游戏数据；`CharacterEntity` 不再暴露 `config` / `combat` / `physics` / `ai` / `timers` / `interaction` 等同名访问器。

## 3. 子域

`CharacterState` 至少包含以下子域：

- `identity`：id、isPlayer、config、bodyFormId
- `attributes`：生命、韧性、格挡槽、体力、最终数值（战斗数值当前聚合在 `combat`；体力单独在 `stamina` 子域）
- `equipment`：全部武器槽装备、护甲/肢体、`bodyState`（当前武器运行时在 `combat`、装备状态在 `config` / `combat`，后续可细分）
- `timers`：全部计时器（受击、无敌、冷却、状态计时等）
- `stateMachine`：当前/上一状态名、阶段、攻击段/阶段/计时/蓄力/保持
- `physics`：位置、朝向、线速度、角速度、垂直速度、着地、地面法线、环境场
- `ai`：策略、目标、导航、反应窗口
- `input`：移动/视角/格挡等意图
- `interaction`：交互目标与计时
- `environment`：流体比例、区域场
- `animation`：
  - `params`：水平/垂直速度、转向/角速度、瞄准方向、蓄力、人形持握语义/盾/武器类/惯用手等；
  - `current`：当前组合 id、根 progress、各层有效权重、additive 权重、事件游标。

## 4. 写入所有权

每个子域只能由对应系统写入；其他系统只读。

| 子域 | 写入者 |
|---|---|
| `identity` | 生成/切换体形 |
| `attributes` / `equipment` | 装备/属性系统 |
| `stamina` | 状态机（扣除/恢复）、装备变更（重算修正）、面板（当前值） |
| `timers` | 拥有该计时器的系统（combat / state_machine / ai） |
| `stateMachine` | 状态机 |
| `physics` | 物理步 |
| `ai` | AI |
| `input` | 输入层 |
| `interaction` | 交互系统 |
| `environment` | 区域/环境系统 |
| `animation.params` | 物理 / 状态机 / 战斗 / AI / 输入 |
| `animation.current` | 动画系统（只写当前信息，不回写参数） |

**禁止双存储**：同一字段不得同时存在于 `CharacterEntity` 与 `state`；实体不得再以访问器或副本暴露游戏数据。

## 5. 派生数据

- pose、骨骼世界矩阵、渲染插值快照是**派生数据**，不作为权威写入 state。
- 可放在 `CharacterRuntime` 或渲染缓存；不得被其他系统当作输入真源。
- `state.animation.current` 是动画系统的输出快照，允许被 UI/调试/AI 读取，但不得反向覆盖 `animation.params`。

## 6. 命名

- `CharacterState`：角色运行时数据仓库。
- `CharacterStateName`：状态机的状态名联合（由原 `CharacterState` 重命名）。
- `BodyForm.base`：体形静态基础定义（原 `BodyForm.state`）。
- `BodyFormBase`：原 `BodyFormStateDefinition`。
- `BodyFormResolved`：原 `BodyFormFinalState`（基础 + 装备/武器修正后的最终数值）。
- `resolveBodyFormBase`：原 `resolveBodyFormState`。
- `HUMANOID_BASE` / `WOLF_BASE` / `HORSE_BASE` / `WYVERN_BASE`：原 `*_STATE` 常量。
- `ZERO_BASE`：原 `ZERO_BASE_STATE`。
- `BodyClipStateMeta` **保留**：它指动画状态名元数据，不是运行时数据仓库。

## 7. 迁移规则

- **一次性全迁**：所有 `CharacterEntity` 游戏数据字段一次性迁入 `CharacterState`；不保留双存储、访问器或兼容双写。
- 引擎句柄与状态机逻辑对象留在 `CharacterRuntime`。
- 迁移前必须完成 golden baseline 与 feature freeze；迁移后立即跑全量测试。
- 所有系统改为「从 state 读、向自己的子域写」；禁止再从 `entity` 上的散落字段读写。

## 8. 禁止项

- 在 `CharacterEntity` 上新增游戏数据字段。
- 在动画/骨骼/AI/战斗模块里另建同类数据副本。
- 把 Rapier/Three 句柄塞进 `character/state`。
- 用 `state` 命名体形静态定义（统一用 `base`）。
- 让动画系统回写 `animation.params`。
- 依赖 `state.animation.current` 反向驱动权威游戏逻辑。
