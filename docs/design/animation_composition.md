# 动画组合权威规范

> 状态：**权威规范（强制执行）**。
> 本文件是骨骼动画数据流、权重与求值的最高规范；`AGENTS.md`、模块文档与实现不得与之冲突。
> 迁移期仍存在的旧路径（整身变体、播放倍速步态、单 clip provider）一律视为**待删除债务**，不得作为新实现的依据。

## 1. 核心定义

- **组合（Composition）**：由若干层组成的动画节点，可再嵌套组合。
- **层 / 引用边（Layer）**：引用一个子组合或叶子，并声明进度范围、权重、每关节权重与 normal / additive 模式。
- **叶子（Leaf）**：实际产出关节贡献的节点；可以是烘焙 clip，也可以是程序化采样器。
- **进度（Progress）**：组合唯一的运行期时间语义，归一化到 `[0, 1]`。组合不持有秒、时长或倍速。
- **覆盖（Coverage）**：叶子声明它要控制的关节集合；未覆盖关节不产生贡献。
- **rest**：骨架静止姿态，是所有未覆盖关节与 additive 增量的基准。

## 2. 强制条款

1. **统一组合树** — 所有 `body_form` 的所有骨骼动画（基础态、攻击、持握、盾、双手、支撑手、受击、呼吸、瞄准、死亡、倒地/起身、游泳、飞行等）统一为动画组合树。**禁止**任何体形或动作绕过组合直接播放整身 clip。
2. **单动画也是组合** — 单个动画必须表达为「单叶子组合」或组合中的叶子，不得保留独立的整身播放旁路。
3. **组合无时间** — `AnimationComposition` / `AnimationGraph` **禁止**出现 `time`、`duration`、`speed`、`timeScale` 等绝对时间或倍速字段。绝对时间与倍速只存在于根进度驱动器。
4. **进度驱动** — 组合只接受根 `progress`，通过层 `from/to` 映射到子进度。支持任意 seek：相同 `progress + params` 必须得到相同姿态，禁止依赖帧序累加。
5. **权重在引用边** — 子组合的单独权重放在引用它的层上；每条层可同时声明整体 `weight` 与 `jointWeights`。
6. **有效权重** — 某关节的有效权重 = 从根到该叶子路径上所有层权重的乘积（含每关节权重）。`weight` 与 `jointWeights` 均按 0–1 语义使用，实际归一化见第 7 条。
7. **normal 归一化** — 所有 normal 叶子的关节贡献按有效权重累加，再按该关节的有效权重总和做**归一化加权平均**。总和为 0 或无人覆盖时回退 rest。
8. **additive 层** — additive 层不参与 normal 归一化；其增量为「相对 rest 的差值」，在 normal 归一化结果之后按**确定顺序**（根到叶、层声明顺序）叠加。additive 同样受路径权重与 `jointWeights` 缩放。
9. **动作自包含** — 动作模组必须对它**声明要控制的全部 joints** 提供完整贡献，节点内权重为 1；不得依赖 rest 回填或「未声明即继承」。与行走、跳跃等共存时，由父组合在引用边上按关节分配权重，**禁止**在动作内部写死「下半身权重 0」一类结构。
10. **持握常驻** — 持握是跨状态常驻组合；跳跃、下落、受击、翻滚等瞬态仍参与权重，除非显式配置为 0。
11. **叶子可烘焙** — 叶子允许是烘焙 clip。clip 自身的 `duration` 只用于 `progress → 采样时间` 的内部换算；对外只暴露 progress。clip 事件必须转换为 progress 阈值。
12. **参数只读** — 水平/垂直速度、转向/角速度、瞄准方向、蓄力、持握模式、盾臂、武器类、惯用手等参数由 `character/state` 提供；动画与骨骼只读消费。运行时参数变化只重算进度/权重/采样，**禁止**重烘整身。
13. **所有体形一致** — humanoid、wolf、horse、wyvern 使用同一组合模型；不存在「兽形只能用单 clip」的例外。
14. **运行时无 IK** — 组合求值不得做 IK 求解。支撑手、贴地、看向目标等必须在离线阶段烘焙为叶子数据。
15. **零分配热路径** — 运行期求值必须预展开组合计划、复用数组/向量，禁止每帧创建 Map/对象字面量。
16. **确定性** — 相同 `progress + params + 组合版本` 必须产出逐位一致的姿态与事件序列。

## 3. 实现位置

- P2 核心：`src/entity/character/body_form/common/skeleton_animation/progress_composition.ts`
  - `evaluateProgressComposition`：normal 归一化 + additive + coverage/rest + 层级路径权重 + `from/to`/`repeat` progress 映射。
  - `leafEventsInRange`：叶子 progress 事件区间查询。
- clip 叶子适配：`progress_clip_leaf.ts` 的 `createProgressClipLeaf`（clip 内部时间 → progress，事件转 progress）。
- humanoid 已迁移：基础态与攻击统一由 `humanoid/skeleton_animation/progress_system.ts` 求值单一组合树；下半身行走、持握 / 盾臂、支撑手、falling、转向/瞄准都是组合层。规范基础 clip 不再烘焙持握/盾臂整身变体。
- wolf / horse / wyvern 已迁移：`common/skeleton_animation/progress_creature.ts` 统一基础 / 攻击组合树，含步态速度、转向/瞄准、falling 垂直收腿层。
- 边权重与每关节权重支持 `(params) => number` 绑定；falling 腿部已改为 `horizontalSpeed` / `verticalSpeed` 参数化。
- 旧时间轴 `composition.ts` / `factory.ts` 已在 P5 删除；新代码禁止恢复该路径。

## 4. 数据模型

```ts
type Progress = number // 归一化 [0, 1]

interface AnimationGraph {
    readonly id: string
    readonly layers: readonly AnimationLayer[]
}

interface AnimationLayer {
    readonly source: AnimationSource
    /** 父进度区间；子进度 = (parent - from) / (to - from) */
    readonly from: Progress
    readonly to: Progress
    readonly weight: number
    readonly jointWeights?: Readonly<Record<string, number>>
    readonly mode: 'normal' | 'additive'
    /** 进度空间内的相对快慢；不是时间/倍速 */
    readonly progressScale?: number
    readonly repeat?: number
}

type AnimationSource = AnimationGraph | AnimationLeaf

interface AnimationLeaf {
    readonly id: string
    /** 该叶子声明控制的关节；节点内权重 1 */
    readonly joints: readonly string[]
    sample(progress: Progress, params: AnimationParams): JointPoseMap
    /** 事件阈值使用 progress，不使用秒 */
    readonly events?: readonly {progress: Progress; eventName: string}[]
}
```

> 组合节点自身不持有权重；子组合权重只存在于引用边。每关节权重同样在引用边上。

## 4. 求值顺序

1. 从根组合按 `progress` 展开为当前活跃叶子贡献列表（可预扁平化缓存）。
2. 对每个关节收集 normal 贡献：`有效权重 = 路径权重乘积 × jointWeight`。
3. 按关节归一化：`pose = Σ(contribution × effectiveWeight) / Σ(effectiveWeight)`。
4. 无贡献关节回退 rest。
5. 按确定顺序叠加 additive：`pose = pose ∘ delta × effectiveWeight`（旋转用四元数复合，位置相加）。
6. 输出 `SkeletonPose`；不得在求值后做 IK。

## 5. 进度模型

- 根 `progress` 由动作/运行时驱动，示例：
  - 行走/游泳：按速度累加根进度。
  - 攻击：取 `attackTotalProgress`。
  - 状态：取 `stateTime / stateDuration`。
  - 蓄力：取 `attackCharge × windupFraction`。
- 子进度：
  - 基础：`child = clamp((parent - from) / (to - from))`。
  - 需要层内相对快慢时用 `progressScale` / `repeat` 表达，仍属进度空间，不是绝对时间。
- 循环：根/叶子循环由运行时 wrap；非循环 clamp。跨 wrap 时必须处理事件阈值。
- 任意 seek：直接设置根 `progress`；禁止依赖内部累加状态。

## 6. 参数契约

`AnimationParams` 由 `character/state` 提供，至少包括：

- `horizontalSpeed`、`verticalSpeed`
- `turnRate` / 角速度
- `aimDirection`
- `attackCharge`、`attackPhaseProgress`、`attackTotalProgress`
- `stateProgress` / `stateTime`
- `holdMode`、`shieldHands`、`weaponClassId`、`handedness`
- 装备、属性、AI 等动画可能读取的只读快照

参数只能由 state 的对应所有者写入；动画系统不得回写参数。动画当前信息写入 `state.animation.current`。

## 7. 缓存与扁平化

- 作者期保留组合树；运行期按「组合版本 + 骨架签名 + 结构参数」预展开为叶子计划。
- 叶子 clip、镜像 clip、支撑手烘焙数据可缓存；缓存键必须包含版本/惯用手/武器类等结构参数。
- 每帧只更新随 progress/params 变化的权重与采样，不重建组合对象。

## 8. 禁止项

- 在组合中出现时间、时长、倍速字段。
- 整身离散变体烘焙（falling 档、盾臂变体、武器类整身、持握整身、支撑手合并进整身）。
- 用播放倍速（`setSpeed` / `walkSpeedScale`）代替步态参数。
- 在动作内部硬编码上下半身权重。
- 用 rest 回填稀疏 clip 作为常规组合手段。
- 运行时 IK 或 IK 目标聚合。
- 新增第二条动画数据通路、旁路播放器或按体形 id 分支。

## 9. 验证

- 单元测试：层级权重、归一化、additive、覆盖/rest、进度映射、循环/seek、事件、确定性。
- Golden：每体形 × 状态/段 × progress 采样 × 参数网格，比较关节四元数与事件 progress。
- 契约：所有 `BODY_FORMS` 暴露组合图；每个状态/攻击段有图；动作覆盖其声明关节；无孤儿/未知关节。
- 架构：禁止运行时代码 import 作者/烘焙旁路；类型测试禁止组合出现时间字段。
