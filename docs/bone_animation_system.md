# 骨骼动画系统设计与实施方案

> 状态：方案设计 v2（尚未实现；已按评审决议更新）
> 分支：`feature/bone-system`
> 参照：Godot `Skeleton3D` 骨骼层级、`SkeletonIK3D`（CCD 求解）、AnimationPlayer 轨道/关键帧/插值/事件模型
> 相关文档：[attack_system.md](attack_system.md)、[showcase.md](showcase.md)、[ai_system.md](ai_system.md)

## 1. 目标

实现一套完整的骨骼动画系统：

1. **骨骼系统**：骨骼关节点（joint）与骨骼段（bone）类型、层级级联、CCD IK、移动/旋转过渡（线性 + 二阶贝塞尔缓动，ease-in / ease-out / strike_peak 预设）
2. **骨骼动画系统**：关键帧类型（节点记录 / 段记录 / 事件记录）、关键帧间插值过渡、动画剪辑（clip）整体播放与整体变速
3. **骨骼动画编辑模式**：上方渲染视窗（与 edit 模式一致），下方动画关键帧轨道面板（完整编辑功能：缩放/拖移/多选/复制粘贴/洋葱皮/贝塞尔曲线编辑/undo-redo）
4. **攻击系统迁移**：全部程序化动画**全量轨道化**（含 overshoot/微颤等附加驱动），命中判定迁移至**动画事件轨道**，武器绑定保持腕关节挂点

## 2. 现状分析：现有攻击动作与武器绑定方式

### 2.1 现状

- **角色建模**：程序化「方块人」——11 个 BoxGeometry 部件 + 嵌套 `Group` 关节 pivot（`entity/character/appearance/model.ts`）。层级：`spine`（髋部 pivot）下挂躯干/双臂/头，左右腿独立挂 `group`；关节暴露在 `CharacterModel` 接口供动画器直接读写 rotation/position。
- **动画驱动**：纯程序化。8 个 animator（`entity/character/appearance/animators/`）每帧以公式/正弦/阶段进度 × 缓动函数直接写各 Group 欧拉角；无关键帧、无轨道、无骨骼概念。
- **攻击动画**：`animators/attacking.ts` 的「阶段末姿态 + 相邻阶段链式 lerp + `applyEasing` + `strikeCurve` 末端加速峰值」；状态机 `states/attacking.ts` 三计时驱动，`AnimationContext` 注入阶段信息。
- **武器绑定**：武器为纯视觉 Group，经静态握持 mount 挂 `rightWristPivot`（右腕动态关节）；命中判定由状态机阶段计时窗口 + `weaponGroup.matrixWorld` 世界 OBB 与被击箱 SAT 判定；双手武器左手固定 `TWO_HAND_GRIP` 假握。
- **状态过渡混合**：`appearance/system.ts` 轮询动画键（`state` / `state:skillId`）→ 关节快照 + 0.15s 三次 ease-out 收敛混合。

### 2.2 评价

**合理之处**：分层清晰（状态机管逻辑时间轴、animator 管表现）；武器经场景图父子跟随零同步成本，天然贴合骨骼挂点模型；阶段数据驱动（`AttackPhase.animConfig`）已具备「参数化动画」雏形。

**局限**：动画不可视化编辑、不可复用；无 IK（双手假握）；关键帧语义散落在程序公式中；命中窗口与视觉动画不同步（计时驱动，动画编辑后需人工对齐窗口参数）。

### 2.3 结论

现有绑定方式**整体合理**，**可以完全迁移**：Group 关节层级与 Godot 骨骼层级同构，武器挂点即腕关节。迁移后命中判定改由动画事件轨道控制（§8.4），与视觉动画天然同步。
## 3. 总体架构

沿用项目分层：**纯 TS 领域层 → 实体实现层 → 模式层**，依赖方向单向，禁止循环依赖。

```
src/
├── skeleton/                        # 领域层（仅依赖 three 数学类型与 zod，可单测）
│   ├── constants.ts                 # magic number（IK 迭代/容差等）
│   ├── joint.ts                     # 骨骼关节点类型 + 行为
│   ├── bone.ts                      # 骨骼段类型 + 行为
│   ├── skeleton.ts                  # 骨架：层级管理 + FK 级联 + pose 读写
│   ├── ik.ts                        # CCD IK 求解器（IK 根级别回溯）
│   ├── transition.ts                # 过渡系统（线性/二阶贝塞尔/预设缓动）
│   └── anim/
│       ├── types.ts                 # 动画/关键帧/轨道/事件类型
│       ├── sampling.ts              # 轨道采样与关键帧间插值、事件查询
│       ├── player.ts                # clip 播放器（变速/事件回调）
│       └── serialization.ts         # 骨架定义 + 动画库 JSON 序列化/zod 校验
├── entity/
│   ├── skeleton/                    # 骨骼实体（Three 渲染映射 + 外观装载 + 面板）
│   │   ├── constants.ts
│   │   ├── world.ts                 # setupSkeletonEntities：多骨架 CRUD + 聚焦 + 面板装配
│   │   ├── render/                  # 关节 gizmo / 外观部件装载 / 同步（以场景为真源）
│   │   ├── appearance/              # 方块人外观部件装载（部件 ↔ 骨骼段装配）
│   │   └── ui/panel.ts              # 属性面板（PanelContext）
│   └── character/                   # 迁移：外观系统改骨架驱动（见 §8）
└── modes/
    └── bone_edit/                   # 骨骼动画编辑模式（启动屏第 4 按钮）
        ├── index.ts                 # setupBoneEditMode
        ├── camera.ts                # 复用 edit 模式轨道相机/键盘相机
        ├── pointer.ts               # 关节/骨骼拾取、拖拽、IK 牵引（全鼠标）
        ├── timeline.ts              # 底部时间轴轨道面板（canvas 时间轴 + DOM 轨道列表）
        ├── keyframe_ops.ts          # 关键帧增删改/动画库管理
        └── constants.ts
```

依赖方向：`skeleton/` 不依赖渲染/物理，仅允许依赖 three 纯数学类型（`Vector3`/`Quaternion`）与 zod；`entity/skeleton/` 依赖 `skeleton/` + three；`modes/bone_edit/` 依赖前两者；`entity/character/` 迁移后依赖 `skeleton/`（单向）。`character/` 领域层同步引入 zod 校验约定（与 `save_load/validation.ts` 一致）。

必须遵守的既有规则：单 RAF（所有 updater 由 `main.ts` tick 统一调度）；常量集中各分包 `constants.ts`；禁 class/enum/any；`verbatimModuleSyntax`；命名导出；4 空格缩进；中文注释；两阶段初始化；raycaster 一律 `intersectObjects(meshes, false)`。

## 4. 骨骼系统设计（领域层）

### 4.1 设计基调（Godot 参照）

- **关节（joint）≈ Godot bone**：持有相对父关节的局部变换（position + rotation），通过父引用组织为树；
- **骨骼段（bone）≈ 关节对之间的段**：方向与长度由两端关节位置**派生**，不自存方向/长度，避免双份状态冗余；骨骼段唯一自有自由度是 `roll`（绕段轴扭转角，腕部刃面偏转等需求）；`length` 是**运行时动态值**（面板/IK 调整），不参与动画关键帧记录；
- **全局姿态 = 局部变换沿树级联（FK）**：`world = parentWorld × local`（先旋后移）；
- **旋转/长度操作落在 tail 子树**：旋转骨骼 = 绕 head 关节刚体旋转 tail 子树；调整长度 = 沿段方向平移 tail 子树；两者通过级联影响全部下游关节与骨骼段。

### 4.2 骨骼关节点（`skeleton/joint.ts`）

```ts
export interface SkeletonJoint {
    readonly id: string
    readonly name: string
    /** 单向连接：父关节引用（根关节为 undefined） */
    parent: SkeletonJoint | undefined
    /** 局部位置（相对父关节） */
    position: Vector3
    /** 局部旋转（相对父关节） */
    rotation: Quaternion
    readonly children: readonly SkeletonJoint[]
    /** IK 根级别（undefined = 普通关节，不参与 IK 链回溯） */
    ikRootLevel: number | undefined
}

export const createSkeletonJoint = (name: string): SkeletonJoint
/** 建立单向连接：child.parent = parent，维护 children 数组 */
export const connectJoint = (parent: SkeletonJoint, child: SkeletonJoint): void
export const disconnectJoint = (joint: SkeletonJoint): void
```

不变量（测试断言）：`parent.children` 包含 child 当且仅当 `child.parent === parent`；禁止自环；断开时从父的 children 移除、自身 parent 置 undefined。

### 4.3 骨骼段（`skeleton/bone.ts`）

```ts
export interface SkeletonBone {
    readonly id: string
    readonly name: string
    readonly head: SkeletonJoint
    readonly tail: SkeletonJoint
    /** 段长（运行时动态值：默认 = 创建时两端关节世界距离，面板/IK 可调） */
    length: number
    /** 绕段轴（head→tail 方向）的扭转角（rad），唯一被动画记录的自由度 */
    roll: number
}

/** 世界空间段方向单位向量（派生值） */
export const boneDirection = (skeleton: Skeleton, bone: SkeletonBone): Vector3
/** 绕 head 关节旋转 tail 子树（axis 为世界轴）——级联 */
export const rotateBone = (skeleton: Skeleton, bone: SkeletonBone, axis: Vector3, angle: number): void
/** 沿当前段方向平移 tail 子树，使段长变为 length——级联 */
export const setBoneLength = (skeleton: Skeleton, bone: SkeletonBone, length: number): void
export const setBoneRoll = (bone: SkeletonBone, roll: number): void
```

级联语义：`rotateBone` / `setBoneLength` 对 tail 子树施加同一刚体变换；修改后调用 `skeleton.updateWorldTransforms()` 重算全树世界变换。

### 4.4 骨架（`skeleton/skeleton.ts`）

```ts
export interface SkeletonPose {
    readonly jointPoses: ReadonlyMap<string, {position: Vector3; rotation: Quaternion}>
    readonly boneRolls: ReadonlyMap<string, number>   // 仅 roll（length 不记录）
}

export interface Skeleton {
    readonly joints: ReadonlyMap<string, SkeletonJoint>
    readonly bones: ReadonlyMap<string, SkeletonBone>
    addJoint: (joint: SkeletonJoint) => void
    addBone: (bone: SkeletonBone) => void
    /** 移除关节：仅断开——子树独立成根（不连带删除下游）；
     *  以该关节为 head 或 tail 的骨骼段一并移除（段方向/长度随关节消失而无意义）；
     *  编辑器中「关节 + 关联段」作为一条撤销命令记录（§7.3） */
    removeJoint: (id: string) => void
    removeBone: (id: string) => void
    findJoint: (id: string) => SkeletonJoint | undefined
    findBone: (id: string) => SkeletonBone | undefined
    /** FK 级联（纯领域计算场景用；桥接 three 时世界变换以场景为准，见 §6.1） */
    updateWorldTransforms: () => void
    getWorldPosition: (jointId: string) => Vector3 | undefined
    getWorldRotation: (jointId: string) => Quaternion | undefined
    applyPose: (pose: SkeletonPose) => void
    readPose: () => SkeletonPose
}

export const createSkeleton = (): Skeleton
```

`applyPose` 只写关节局部 pose 与骨骼 roll，不存在与 length 的冲突（length 非记录值）。
### 4.5 IK 运动牵引（`skeleton/ik.ts`，仅 CCD）

```ts
export interface IkSolverOptions {
    readonly maxIterations: number
    readonly tolerance: number
}

/** 链回溯：给定末端关节，沿其自身树的祖先链向上找第一个 ikRootLevel !== undefined 的关节作为链根；
 *  「自身树」= 从 endJoint 沿 parent 走到 undefined 为止的路径（多根骨架中仅限本树，不跨树）；
 *  路径上无 IK 根时，链根 = 该树的根关节。返回 根 → 末端 的关节数组。
 *  退化情形：链长 1（endJoint 即树根）无旋转自由度，返回 [endJoint] 且 solveCcd 直接返回 {iterations: 0, error} 不修改姿态。 */
export const resolveIkChain = (endJoint: SkeletonJoint): readonly SkeletonJoint[]

/** CCD：从末端向根迭代，每次将「末端→当前关节」向量旋转至「目标→当前关节」方向；
 *  收敛条件 error < tolerance 或达 maxIterations。直接写入链上关节的局部 rotation。 */
export const solveCcd = (
    skeleton: Skeleton, chain: readonly SkeletonJoint[], target: Vector3,
    options: IkSolverOptions,
): {iterations: number; error: number}
```

- 常量（`skeleton/constants.ts`）：`DEFAULT_IK_MAX_ITERATIONS = 10`、`DEFAULT_IK_TOLERANCE = 0.001`；
- `ikRootLevel` 语义：数字仅作等级标记（0 为最高级根），求解链 = 「回溯遇到的第一个 IK 根」→ 末端，等级不参与求解，仅便于编辑器显示与多根冲突时的优先级调试；
- 编辑器「运动牵引」两种模式（可切换）：**平移模式**（默认，拖动末端 = 直接平移子树）与 **IK 模式**（链根固定，末端每帧 `solveCcd` 追拖拽目标点）。

### 4.6 过渡系统（`skeleton/transition.ts`）

```ts
export const TRANSITION_TYPES = ['linear', 'bezier_quad'] as const
export type TransitionType = typeof TRANSITION_TYPES[number]
export const EASING_STRATEGIES = ['none', 'ease_in', 'ease_out', 'strike_peak'] as const
export type EasingStrategy = typeof EASING_STRATEGIES[number]

export interface TransitionSpec {
    readonly type: TransitionType
    /** linear 恒速（strategy 忽略）；bezier_quad 按策略取预设控制点 */
    readonly strategy: EasingStrategy
    /** bezier_quad 自定义控制点 cy ∈ [0,1]（Pc = (0.5, customCy)：cx 固定 0.5，
     *  越接近 0 越偏 ease_in，越接近 1 越偏 ease_out，0.5 退化为线性） */
    readonly customCy?: number
    /** strike_peak 的峰值位置 0-1（默认 0.7，同现有 strikePeakRatio） */
    readonly peakRatio?: number
}

/** 将线性进度 p ∈ [0,1] 映射为缓动后进度 */
export const applyTransition = (p: number, spec: TransitionSpec): number

export const lerpVec3: (a: Vector3, b: Vector3, k: number) => Vector3
export const lerpQuat: (a: Quaternion, b: Quaternion, k: number) => Quaternion   // slerp
export const lerpNumber: (a: number, b: number, k: number) => number
```

数学定义（二阶贝塞尔）：B(t) = (1−t)²·P0 + 2(1−t)t·Pc + t²·P1，P0=(0,0)、P1=(1,1)，取 y 分量：

- `linear`：y = t（一次函数恒速）；
- `bezier_quad` + `none`：Pc=(0.5,0.5) → y = t（退化为线性）；
- `bezier_quad` + `ease_in`：Pc=(1,0) → y = t²（先慢后快，末端加速）；
- `bezier_quad` + `ease_out`：Pc=(0,1) → y = 2t−t²（先快后慢，末端减速）；
- `strike_peak`：**两段二阶贝塞尔拼接**——峰值前 y = k·(t/k)²（加速段），峰值后 y = k + (1−k)·(1−(1−u)²)（减速段），u = (t−k)/(1−k)；与现有 `strikeCurve` 数学完全一致（`attack_phases.ts:53`），保证打击手感无回归；
- `customCy`：Pc = (0.5, customCy)，按通用二次贝塞尔解 y，编辑器曲线编辑器可拖拽控制点（仅纵轴分量）。

运行时无状态 tween API：过渡需求全部由「关键帧间插值」（§5.2）覆盖，不提供额外 Tween 对象。
## 5. 骨骼动画系统设计（`skeleton/anim/`）

### 5.1 类型（`anim/types.ts`，轨道模型为数据真相）

```ts
/** 骨骼节点关键帧记录（关节局部 pose） */
export interface BoneJointKeyframeRecord {
    readonly time: number
    readonly position: Vector3
    readonly rotation: Quaternion
}

/** 骨骼段关键帧记录：仅 roll。方向/长度是派生值（§4.1），
 *  length 是运行时动态值（面板/IK 调整），不参与动画记录 */
export interface BoneSegmentKeyframeRecord {
    readonly time: number
    readonly roll: number
}

/** 动画事件记录（Godot call method track 思路）：时间点触发命名事件 */
export interface BoneEventRecord {
    readonly time: number
    readonly eventName: string          // 如 hitbox_on / hitbox_off / 自定义
    readonly params?: Readonly<Record<string, string | number>>
}

/** 轨道（数据真相，Godot 模型）：每目标一条，记录按 time 升序 */
export interface BoneJointTrack {
    readonly targetId: string
    readonly interpolation: TransitionSpec
    readonly records: readonly BoneJointKeyframeRecord[]
}
export interface BoneSegmentTrack {
    readonly targetId: string
    readonly interpolation: TransitionSpec
    readonly records: readonly BoneSegmentKeyframeRecord[]
}
/** 事件轨（不绑定单一目标，按时间排列） */
export interface BoneEventTrack {
    readonly records: readonly BoneEventRecord[]
}

/** 骨骼动画（clip） */
export interface BoneAnimationClip {
    readonly name: string
    readonly duration: number
    readonly loop: boolean
    readonly jointTracks: readonly BoneJointTrack[]
    readonly boneTracks: readonly BoneSegmentTrack[]
    readonly eventTracks: readonly BoneEventTrack[]
}

/** 编辑器视图：关键帧聚合（时间点 → 全部目标记录 + 事件），与轨道互转 */
export interface BoneAnimationKeyframe {
    readonly time: number
    readonly jointRecords: readonly {jointId: string; record: BoneJointKeyframeRecord}[]
    readonly boneRecords: readonly {boneId: string; record: BoneSegmentKeyframeRecord}[]
    readonly events: readonly BoneEventRecord[]
}
export const keyframesToTracks: (kfs: readonly BoneAnimationKeyframe[]) => {jointTracks; boneTracks; eventTracks}
export const tracksToKeyframes: (clip: BoneAnimationClip) => readonly BoneAnimationKeyframe[]
```

轨道是数据真相，关键帧聚合仅编辑器 UI 视图；两者无损互转。

### 5.2 轨道采样与关键帧间过渡（`anim/sampling.ts`）

```ts
export const sampleJointTrack: (track: BoneJointTrack, time: number) => {position: Vector3; rotation: Quaternion} | undefined
export const sampleSegmentTrack: (track: BoneSegmentTrack, time: number) => {roll: number} | undefined
export const sampleClip: (clip: BoneAnimationClip, time: number) => SkeletonPose
/** 查询 (fromTime, toTime] 区间内的事件记录（播放器每帧增量触发用） */
export const sampleEvents: (clip: BoneAnimationClip, fromTime: number, toTime: number) => readonly BoneEventRecord[]
```

采样规则：

- 定位 time 前后相邻记录，进度 p 经 `track.interpolation` 的 `applyTransition` 缓动后插值；rotation 用 slerp；
- 同一节点/同一段的关键帧之间即「过渡」（§4.6 预设在此生效）；
- 越界语义（Godot 概念，本项目采用）：**wrap**——循环动画（`loop=true`）末帧→首帧之间同样插值，循环无缝；**clamp**——非循环动画播完停在末帧值；**不实现** back-and-forth（乒乓往返播放）；
- 缺前/后邻时返回最近记录值（nearest 语义）；轨道无记录返回 undefined。

### 5.3 播放器（`anim/player.ts`）

```ts
export interface BoneAnimationPlayer {
    readonly clip: BoneAnimationClip
    readonly updater: (dt: number) => void   // 由 main.ts 单 RAF 统一调用
    play: () => void
    pause: () => void
    stop: () => void
    seek: (time: number) => void
    /** 整体均匀变速（playbackRate）：攻击 clip 按 phaseTimer 对齐可变时长用（§8.3） */
    setSpeed: (speed: number) => void
    readonly isPlaying: boolean
    readonly time: number
    /** 事件回调：每帧增量触发区间内事件（事件轨道消费点，如 hitbox 启停） */
    onEvent: ((record: BoneEventRecord) => void) | undefined
    /** 非循环播完时触发 */
    onFinished: ((player: BoneAnimationPlayer) => void) | undefined
}

export const createBoneAnimationPlayer = (skeleton: Skeleton, clip: BoneAnimationClip): BoneAnimationPlayer
```

每帧：`time += dt × speed` → `sampleClip` → `skeleton.applyPose` → FK；增量 `sampleEvents` 触发 `onEvent`；非循环到末尾停止并回调 `onFinished`。

### 5.4 序列化与校验（`anim/serialization.ts`，独立 JSON，不接 save_load 实体）

```ts
export interface SkeletonDefinition {
    readonly joints: readonly {id: string; name: string; parentId?: string; position: Vector3; rotation: Quaternion; ikRootLevel?: number}[]
    readonly bones: readonly {id: string; name: string; headJointId: string; tailJointId: string; length: number; roll: number}[]
}

export interface SkeletonAnimationAsset {
    readonly formatVersion: number          // 当前 1
    readonly skeleton: SkeletonDefinition
    readonly animations: readonly BoneAnimationClip[]
}

export const serializeAsset: (asset: SkeletonAnimationAsset) => string
export const parseAsset: (raw: string) => SkeletonAnimationAsset   // zod 校验，非法抛错
```

- zod 校验（项目既有依赖；`skeleton/` 与 `character/` 领域层均允许使用，与 `save_load/validation.ts` 约定一致）；
- 骨架定义（含 ikRootLevel）+ 动画库打包为单一资产文件，编辑器内导入/导出（Blob 下载 + 文件选择，复用 `save_load/actions.ts` 的 `promptLoadFile` 交互模式）。
## 6. 骨骼实体与外观装载（`entity/skeleton/`）

### 6.1 渲染映射（`entity/skeleton/render/`，以场景为真源）

- **权威姿态源 = three 场景图**（评审决议）：桥接模式下关节直接读写对应 `Group` 的 position/quaternion，世界变换一律从 three 读取（`Group.getWorldPosition/getWorldQuaternion`）；领域层 `updateWorldTransforms`/FK 仅服务于纯领域计算与单元测试，桥接场景不双算，避免漂移；
- 桥接适配器：`createSkeletonFromGroups(entries: {jointId, group}[])` 生成绑定 `Skeleton`（领域 API 写局部 pose 时同步 Group，读世界变换时取自 Group）；
- `createJointVisual`：关节 gizmo（小立方体，选中高亮/线框）；
- `syncVisuals`（updater）：每帧从 three 场景图同步 gizmo 位置（场景图自身已逐帧 `updateMatrixWorld`，无需额外 FK）；
- 预设：`buildCharacterSkeletonDefinition()` 输出与方块人同构的骨架定义（joint = spine/headNeck/双臂肩肘腕/双腿髋膝 + ikRootLevel 标注），外观部件装配见 6.2。

### 6.2 外观部件装载（`entity/skeleton/appearance/`）

**本期不实现雕刻**（评审决议：雕刻相关内容已从方案移除）：

- 复用 `entity/character/appearance/model.ts` 的部件构造逻辑，重构出可复用的部件工厂（四肢/躯干/头部件 = BoxGeometry + 六面材质），按骨骼段装配到关节上（部件随 head 关节变换、长度随 `bone.length` 缩放）；
- 人形预设 = `buildCharacterSkeletonDefinition()` 骨架 + 外观部件装配，编辑模式下即可直接编辑方块人外观骨骼；
- 渲染层与骨架解耦（visual 装载器可插拔），为未来外部 obj/blender 模型导入预留设计空间（本期不实现）。

### 6.3 属性面板（`entity/skeleton/ui/panel.ts`）

实现 `PanelContext`，复用全局 `focusPanel` 容器与 `ui/components/*`：

- 选中**关节**：name、position（xyz）、rotation（欧拉）、父关节下拉（重连单向连接）、**ikRootLevel 设置**（undefined/0/1/2）、添加子关节、删除（仅断开，子树独立成根）；
- 选中**骨骼**：name、**length（仅面板输入控制，不用滚轮）**、roll、添加子段、删除；
- `world.ts` 的 `setupSkeletonEntities(scene)`：**多骨架并存** CRUD、聚焦（activeSkeleton，轨道面板/拖拽仅作用于聚焦骨架）、选中管理、面板装配（两阶段初始化）；不创建物理 body（该模式物理冻结）。
## 7. 骨骼动画编辑模式（`modes/bone_edit/`）

### 7.1 入口与装配

- `modes/constants.ts` 的 `GAME_MODE_VALUES` 增加 `'bone_edit'`；启动屏新增第 4 个按钮「骨骼动画」；`main.ts` 模式分支接入 `setupBoneEditMode`；
- **相机写入存档**：`save_load/types.ts` 的 `ModeInfoJSON` 增加 `boneEditCameraPos/Rot`，serialize/deserialize 按既有模式合并逻辑扩展（§11 决议）；
- 物理世界冻结（类比 showcase）；装配返回 `{updater, exit}`，updater 由单 RAF 调度；返回主页面走 `window.location.reload()`；
- **快捷键最小化**（评审决议）：仅新增 `edit_undo`（Ctrl+Z）/ `edit_redo`（Ctrl+Shift+Z）两个**全局输入动作**（用户指定，经 input 注册表）；时间轴内的 Ctrl+滚轮缩放、Ctrl+C/V 复制粘贴、Shift 多选为标准编辑交互，**不注册为全局动作**，仅在时间轴面板获得焦点时响应；相机键盘移动复用 edit 模式既有绑定。

### 7.2 上方视窗交互（全鼠标，与 edit 模式基本一致）

相机复用（评审修正：**不跨模式 import**，避免 modes 之间相互依赖——showcase 已按此约定自行镜像）：M3 将 `setupMouseOrbit`/`setupKeyboardCamera` 从 `modes/edit/` 提取为共享模块 `modes/camera_common.ts`，edit 与 bone_edit 共同引用（`applyFreeFlightMovement` 已同等待遇）；无限网格 `setupInfiniteGrid` 与相机 HUD 直接复用 `render/`、`ui/` 既有导出。

指针交互（`modes/bone_edit/pointer.ts`，click-threshold + `intersectObjects(meshes, false)` 模式）：

- **聚焦骨架**：左键点击骨架关节/gizmo 或侧栏骨架条目切换 activeSkeleton；非聚焦骨架灰显、不可编辑；
- **左键选中**关节/骨骼 → `focusPanel` 打开属性面板；
- **拖动关节**：沿相机平行平面平移（世界转局部写 `joint.position` → 场景图自动级联）；
- **拖动骨骼**：绕 head 旋转 tail 子树（`rotateBone`）；
- **IK 牵引**：选中关节且 IK 模式开 → 拖拽时 `resolveIkChain` 回溯 IK 根 → 每帧 `solveCcd` 追目标点；
- `length` 调整仅在属性面板输入（评审决议，滚轮不控制长度）。

### 7.3 下方动画关键帧轨道面板（`modes/bone_edit/timeline.ts`）

**完整编辑功能（评审决议）**，实现为 **canvas 时间轴 + DOM 轨道列表/控制条** 混合面板（时间轴区域密集图形用 canvas 绘制；轨道名称/按钮用 DOM），面板**可折叠 + 拖拽顶边调高度**，renderer 尺寸同步 resize。

- **左侧轨道列表**（DOM）：聚焦骨架的每个关节/骨骼一行（名称 + 插值模式下拉）；事件轨一行；
- **时间轴画布**（canvas）：时间标尺（0..duration）、关键帧菱形、播放头（scrub）、**时间轴缩放**（Ctrl+滚轮）、**拖移关键帧**、**多选**（框选 + Shift 点选）、**复制粘贴**（Ctrl+C/V 跨时间点/跨轨道）、**onion skin**（洋葱皮：视窗中显示前后帧半透明骨骼副本，canvas 上标记洋葱皮范围）、**关键帧缓动曲线编辑**（选中关键帧后在小曲线视图中拖拽二阶贝塞尔控制点，即 §4.6 `customCy`/`peakRatio`）；
- **底部控制条**（DOM）：播放/暂停/停止/循环、动画下拉（新建/重命名/删除）、时长、播放速度、`添加关键帧`（当前 pose 记录到当前时间，作用域 = 选中目标或全部）、`添加事件`（当前时间插入事件记录，选事件名/参数）、逐关键帧缓动策略选择；
- **撤销/重做**（评审决议：完整双栈 Ctrl+Z / Ctrl+Shift+Z）：使用 `@potmot/command-history` 库（v0.0.1，MIT）——`useCommandHistory<CommandMap>()` 工厂 + `registerCommand(key, {applyAction, revertAction})` + `executeCommand/undo/redo/canUndo/canRedo` + `executeBatch` 批量合并；所有编辑操作建模为命令（add_keyframe / remove_keyframe / move_keyframe / change_easing / add_event / remove_event / 关节与骨骼的增删改/重连/IK 根设置等），拖拽类操作按「按下 → 松开」记一条命令，多选删除/粘贴用 `executeBatch` 合并为单步撤销；命令 Map 类型严格化（本侧类型声明不允许 `any`，库内部的宽松泛型不影响使用侧）；
- 关键帧读写走 `tracksToKeyframes`/`keyframesToTracks` 互转；播放用 `BoneAnimationPlayer`（updater 接入模式 updater）；
- 布局：时间轴面板 `fixed; left:0; right:0; bottom:0; z-index:120`，初始高度 240px，可折叠成条/拖拽 120~600px；视窗高度 `calc(100% − 面板高)`；
- **DOM 可测试面**（评审修正：canvas 内容不可被 DOM 断言）：轨道行暴露 `data-keyframe-count`（该轨道关键帧数）与 `data-track-target`（目标 id）；播放头容器暴露 `data-playhead-time`（当前播放时间，随播放刷新）；事件触发器在底部控制条暴露 `data-last-event`（最近触发事件名）；e2e 一律断言这些属性而非 canvas 像素。

### 7.4 动画库导入导出

- 导出：`serializeAsset` → Blob + `<a download>`（复用 `saveWorldToFile` 模式）；
- 导入：文件选择 + `parseAsset` 校验（非法弹提示）；导入的骨架定义重建为新骨架实体（多骨架并存，不覆盖现有），动画库合并进面板下拉；
- 每个骨架实体也可单独导出（仅 `SkeletonDefinition`）。
## 8. 攻击系统迁移方案（全量轨道化，一次性迁移）

### 8.1 骨架桥接（以场景为真源）

- 适配器先行：`createSkeletonFromGroups`（§6.1）把现有 Group 关节（spine/headNeck/双臂肩肘腕/双腿髋膝）绑定为领域 `Skeleton`；**three 场景图为权威姿态源**，领域层只做 API 封装，不双算 FK；
- 此阶段旧 animator 与新 clip 播放器并存，可逐状态切换；
- 收敛后 `createCharacterModel` 改为「骨架定义 → 建 Group 层级」驱动（预设 = `buildCharacterSkeletonDefinition()`），删除旧 animator 目录。

### 8.2 状态动画全量轨道化（无程序化 modifier）

- 8 个状态 animator 重制为关键帧 clip：**所有效果全量轨道化**——呼吸摆动、走路摆臂、overshoot、微颤、弓步链式插值、腕部刃面偏转、头部摆动全部烘焙进关键帧，不保留程序化 modifier（评审决议）；
- 周期效果（呼吸/摆臂）录为循环区间关键帧（wrap 无缝）；
- **行走不再注入 horizontalSpeed**（评审决议：先固定频率循环，若滑步明显再按需用 `setSpeed` 按速度比例对齐并设变速上下限）：行走动画为固定频率循环 clip；`AnimationContext` 的 `horizontalSpeed/horizontalTravel` 字段在迁移后移除；
- `appearance/system.ts` 改为 clip 调度器：动画键（`state` / `state:skillId`）→ 选择 clip → 播放器 seek/play；状态切换混合（评审决议：**加权混合**）：新 clip 采样姿态 × w + 旧姿态快照 × (1−w)，w 在 0.15s（`STATE_BLEND_DURATION`）内按三次 ease-out 从 0 → 1，与现状手感一致。

### 8.3 攻击动画迁移

- 每个技能生成攻击 clip（单段或整链），由 attacking 状态机三计时驱动：`phaseTimer/phaseDuration` → clip 时间 seek 映射；
- **变速语义**（评审修正）：现有生产配置各阶段时长均为技能静态配置（`phaseDurationOf` = `duration × ratio` / `config.recovery`），无运行时时长源——预烘焙 clip 按静态配置时长录制，生产环境 `speed = 1`，满足无回归；`setSpeed` 保留用于「行走滑步对齐」及未来引入运行时可变段长（如随属性变化的 recovery）时按比例整体缩放，且需重新评估 §8.6 命中窗口一致性约束；
- 打击手感曲线：`strike_peak` 预设（两段二阶贝塞尔拼接，数学与现有 `strikeCurve` 完全一致，§4.6）保证无回归；
- overshoot 惯性过冲、aim/spin 微颤、弓步腿角链式插值、腕部偏转、头部侧偏**全部烘焙为关键帧**（评审决议：全量轨道化）；
- `swingTilt` 段参数（评审决议：**预烘焙多套 clip**）：每技能 × 每 tilt 值烘焙一套独立 clip，`attackType`（slash/thrust/spin）同样体现在 clip 中，纯数据无程序化旋转。

### 8.4 命中判定迁移（动画事件轨道）

- 攻击 clip 的**事件轨道**记录 `hitbox_on` / `hitbox_off` 事件（参数含武器挂点名），替代状态机阶段计时窗口；
- `melee_executor` 改为读取播放器 `onEvent` 状态：事件开启命中窗口、窗口内每帧维持现有「`weaponGroup.matrixWorld` OBB × 受击箱 SAT」判定、事件关闭窗口；
- **时序要求**（评审修正）：a) 播放器 updater 必须在同一 tick 内先于 `executor.update` 执行（顺序纳入 M4b 验收），窗口开关不滞后一帧；b) 当 hitbox_on 与 hitbox_off 落在同一 `(fromTime, toTime]` 采样区间（短窗口或大 dt），窗口仍至少覆盖一个执行帧——播放器对区间内 on/off 成对出现的事件强制保留一帧窗口（在事件时间点补发一次判定），保证判定不因帧量化漏空；
- 收益：命中窗口与视觉动画天然同步，动画编辑后无需人工对齐窗口参数；伤害结算逻辑不变。

### 8.5 补全项（新系统带来的增量能力）

- **双手武器 IK**：左手腕 IK 链（左肩→左肘→左腕，`ikRootLevel` 标记肩）`solveCcd` 追武器 `TWO_HAND_GRIP` 世界点，替换固定假握；
- **IK 与 clip 的写入分层**（评审修正）：每帧先 `sampleClip` → `applyPose` 写全骨架 → 再对 IK 链关节执行 `solveCcd` 覆盖局部 rotation（IK 后写、最后生效），顺序固定，避免两套写入互相覆盖；
- **动画复用**：AI/玩家/showcase 同源 clip（消除三处镜像逻辑）；
- **可视编辑**：所有攻击 clip 可在编辑模式直接编辑调优（含事件轨道、缓动曲线）。

### 8.6 迁移验收标准

- 全部状态动画由 clip 驱动（`animators/` 目录移除）；
- 攻击阶段姿态与迁移前采样一致（回归测试）；`strike_peak` 曲线与 `strikeCurve` 输出逐点一致；
- 命中窗口由事件轨道驱动，伤害判定行为不变；播放器 updater 先于 `executor.update` 执行，成对事件同帧时窗口仍至少覆盖一个执行帧（§8.4 时序要求）；
- 双手武器左手实时贴合握柄（IK）；clip applyPose 与 IK 写入分层顺序生效；
- showcase 与 play 共用同一动画资产来源。

## 9. 测试计划

### 9.1 单元测试（vitest，与被测代码同目录 `.test.ts`，中文测试名）

| 文件 | 覆盖 |
|------|------|
| `skeleton/joint.test.ts` | 创建/连接/断开、单向连接不变量（父子互指）、禁止自环、ikRootLevel 读写 |
| `skeleton/bone.test.ts` | 方向派生、`rotateBone` 级联（tail 子树整体旋转）、`setBoneLength`（长度变化 + 级联平移）、roll |
| `skeleton/skeleton.test.ts` | FK 级联正确性、applyPose/readPose 往返（含 roll、不含 length）、`removeJoint` 仅断开（子树独立成根、下游世界变换不变、关联骨骼段一并移除） |
| `skeleton/ik.test.ts` | `resolveIkChain` 回溯规则（首个 IK 根 / 无根回退**本树根** / 多根骨架不跨树）、退化单关节链不修改姿态、CCD 收敛（可达目标 error < tolerance）、不可达目标误差不增、迭代上限 |
| `skeleton/transition.test.ts` | linear；ease_in/ease_out 与解析式（t²、2t−t²）一致且单调；`strike_peak` 与现有 `strikeCurve` 逐点一致、峰值处连续；customCy；端点 |
| `skeleton/anim/types.test.ts` | 关键帧 ↔ 轨道互转无损、记录按 time 排序、事件轨归并 |
| `skeleton/anim/sampling.test.ts` | 关键帧精确命中、帧间各策略插值、slerp、wrap 末帧→首帧无缝、clamp、缺邻 nearest、空轨 undefined、`sampleEvents` 区间边界（左开右闭） |
| `skeleton/anim/player.test.ts` | 播放推进、loop 回绕、非循环停止 + onFinished、seek、setSpeed 变速、onEvent 增量触发不重不漏、applyPose 写入骨架 |
| `skeleton/anim/serialization.test.ts` | 资产 JSON 往返、非法数据拒绝、缺省字段兜底（zod default）、formatVersion、ikRootLevel 持久化 |
| `entity/skeleton/render/bridge.test.ts` | 场景真源桥接：Group 局部读入骨架、领域修改写回 Group（场景图级联）、applyPose/rotateBone 经桥接生效、syncFromScene 外部修改读回、与普通骨架 FK 一致 |
| `modes/bone_edit/history.test.ts` | 撤销重做集成：命令注册与执行、undo/redo 往返恢复一致、批量命令（executeBatch）单步撤销、嵌套禁止语义、canUndo/canRedo 状态、remove_joint 命令（关节 + 关联段一体撤销/恢复）（`@potmot/command-history`） |
| `entity/character` 迁移测试 | 骨架桥接同步（关节 ↔ Group 读写一致）、clip 化 animator 关键时间点姿态快照一致性（迁移回归）、事件轨道命中窗口与旧计时窗口时间区间一致 |

### 9.2 e2e 测试（playwright，`e2e/bone_edit.spec.ts`）

遵循 `smoke.spec.ts` 的防御式 WebGL 断言模式（canvas 不存在时跳过渲染断言）：

1. 启动屏出现第 4 按钮「骨骼动画」→ 进入 → canvas 存在 + 时间轴面板可见；
2. 新建骨架（人形预设 + 外观部件）→ 轨道列表出现关节/骨骼行；
3. 点击关节/骨骼 → 属性面板出现（focusPanel 容器）；修改 length 生效；
4. 点击「添加关键帧」→ 对应轨道行 `data-keyframe-count` 增加；拖动播放头 → `data-playhead-time` 变化；
5. 播放动画 → `data-playhead-time` 推进；事件轨插入 hitbox_on → 播放经过该时间点后底部 `data-last-event` 变为 hitbox_on；
6. 导出 JSON → download 事件触发；导入后出现新骨架 + 动画库恢复；
7. 时间轴面板折叠/拖拽调高度 → renderer canvas 尺寸变化；
8. 添加关键帧后 Ctrl+Z / Ctrl+Shift+Z → `data-keyframe-count` 减少/恢复（DOM 可测试面，§7.3）；
9. 返回主页面 → 启动屏重现。

## 10. 实施阶段

| 阶段 | 内容 | 验收 |
|------|------|------|
| **M1 领域层** | `skeleton/`（joint/bone/skeleton/ik/transition/anim 全模块）+ 全部领域单元测试 | 领域测试全绿，`pnpm type-check` 通过 |
| **M2 实体层** | `entity/skeleton/`（渲染映射以场景为真源、外观部件装载、面板、预设骨架）+ 桥接测试 | 桥接测试全绿 |
| **M3 编辑模式** | `modes/bone_edit/`（视窗交互 + 全功能时间轴 + undo/redo + 导入导出）+ 相机模块提取 `modes/camera_common.ts` + 启动屏第 4 按钮 + 相机存档扩展 + e2e | e2e 全绿 |
| **M4a 桥接与基础动画** | 骨架桥接（Group ↔ Skeleton）、idle/walking/jumping/falling/dying/dashing/flinching clip 化、外观系统改 clip 调度器 | 基础状态动画 clip 驱动，快照回归通过 |
| **M4b 攻击与命中** | 攻击 clip（strike_peak、全量烘焙）、事件轨道命中窗口迁移、executor 改造（播放器先于 executor.update） | 命中窗口时间区间与旧实现一致、无帧量化漏空，伤害行为不变 |
| **M4c 接入与补全** | play/showcase 全量接入、行走/攻击变速对齐、双手 IK、`AnimationContext` 字段清理 | §8.6 验收标准全部满足 |
| **M5 文档收尾** | 更新本文档为最终实现文档；同步 `attack_system.md`、`showcase.md`、`AGENTS.md` | 文档与实现一致 |

## 11. 决策记录

| 议题 | 决策 |
|------|------|
| 骨骼段模型 | Godot 派生模型（方向/长度由关节派生）；roll 保留；length 为运行时值、不记录关键帧 |
| 动画存储 | 轨道模型为数据真相（Godot 式）；关键帧聚合仅为编辑器视图 |
| 范围 | 一次性完成全部迁移；程序化附加驱动**全量轨道化**，不保留 modifier |
| IK | 仅 CCD；关节支持 `ikRootLevel`，链根 = 回溯遇到的第一个 IK 根 |
| 桥接真源 | three 场景图为权威姿态源，领域 FK 仅纯领域/单测用 |
| 命中判定 | 迁移至动画事件轨道（hitbox_on/off 为通用命名事件的实例），窗口内判定逻辑不变 |
| 事件轨道 | 通用命名事件 + 参数（可扩展脚步声/特效等） |
| 攻击变速 | clip 支持整体均匀变速（playbackRate），对齐可变阶段时长 |
| swingTilt | 每技能 × 每 tilt 预烘焙独立 clip，纯数据无程序化旋转 |
| 状态混合 | 加权混合：新 clip 输出 × w + 快照 × (1−w)，0.15s 三次 ease-out |
| 雕刻 | 本期不实现（已从方案移除）；外观部件装载保留，渲染层可插拔预留外部模型扩展 |
| 过渡系统 | 无状态 API（无 Tween）；strike_peak 预设 = 两段二阶贝塞尔拼接 |
| 编辑器交互 | 鼠标为主，仅新增 edit_undo/edit_redo 快捷键；length 仅面板输入 |
| 时间轴 | canvas + DOM 混合；全功能（缩放/拖移/多选/复制粘贴/洋葱皮/贝塞尔曲线编辑）；可折叠可拖高 |
| 撤销重做 | 完整双栈 Ctrl+Z / Ctrl+Shift+Z，使用 `@potmot/command-history` |
| 多骨架 | 并存 + 聚焦（activeSkeleton 隔离编辑） |
| 行走动画 | 固定循环 clip 不注入 horizontalSpeed；滑步明显时按需 setSpeed 对齐 |
| 工程约定 | 领域层允许依赖 three 数学类型与 zod；character 引入 zod 校验约定 |
| 存档 | bone_edit 相机写入 ModeInfoJSON |
| 循环语义 | wrap（循环无缝）/ clamp（非循环停止）；不实现 back-and-forth |
| 阶段拆分 | M4 拆 M4a/M4b/M4c 降低风险 |

## 12. 风险与注意事项

- **raycaster 陷阱**：所有拾取必须 `intersectObjects(meshes, false)`；
- **旋转体世界↔局部转换**：拖拽命中点转局部坐标必须用逆四元数（`quatVmult`），不能用 `wx − position.x`；
- **`@potmot/command-history` 为年轻三方库**（v0.0.1）：M3 起步时用 `modes/bone_edit/history.test.ts` 快速验证双栈/批量行为，若与需求不符可替换为自研等价实现（本项目自研 command history 成本不高）；
- **全量烘焙的动画维护成本**：微颤/overshoot 等细节烘焙进关键帧后修改不便，依赖编辑器全功能（多选/复制粘贴/洋葱皮）缓解；
- **滑步风险**：行走固定循环 clip 与移动速度脱钩，必要时用 `setSpeed` 对齐；
- **事件轨道与判定同步**：事件按帧增量触发，物理子步与渲染帧的时序差需在 executor 集成时验证——updater 先于 `executor.update`、成对事件同帧强制保底一帧窗口（§8.4 时序要求已入验收标准）；
- **旧动画回归**：快照一致性测试兜底；`strike_peak` 逐点一致测试保证手感；
- **单 RAF**：clip 播放器、IK 求解、visual 同步全部走 updater，禁止自行 RAF；
- **类型规范**：`verbatimModuleSyntax`、禁 enum/class/any、命名导出、常量集中——新代码严格对齐 AGENTS.md。
