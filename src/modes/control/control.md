# 操作方案（玩家主控 / 纯摄像机）

> 全部具备操作能力的模式统一收敛为**两套共享方案**，实现集中在 `src/modes/control/`。
> 新增模式时按其是否主控一个角色选择其一，不得再另写相机 / 移动逻辑。

## 约定

- 所有具备操作能力的模式只归入两套共享方案：**玩家主控** `createPlayerControl`（`player_control.ts`：play、showcase 含玩家子模块；`WASD` 相对相机移动 + `roll` 翻滚 + 空格跳跃 + 第三人称环绕，可选攻击/锁定/聚焦，**不提供右键平移**）与**纯摄像机** `createCameraControl`（`camera_control.ts`：edit / bone_edit / showcase 相机类模块 / play 无玩家兜底；`WASD`+`Z/X` 自由飞行 + `boost` 加速 + 左键旋转 + 右键 `mouse_pan` 平移 + 滚轮缩放 + 可选聚焦/跟随）。
- **玩家主控的跟随点不做 EMA 平滑**：`getTarget` 返回角色渲染插值位置（滞后一拍），相机直接跟随；仅聚焦进出过渡、滚轮距离、锁定转向保留平滑。纯摄像机方案不变。
- 新增模式按其是否主控角色选用其一，**不得另写相机/移动逻辑**；`free_flight.ts` 为自由飞行。
- `roll` 与 `boost` 默认均绑定 `Shift`，分属两套方案，运行时不会同时消费。

## 陷阱

- 编辑模式**默认**滚轮 = 相机缩放、右键 = 相机平移；地形雕刻启用后**仅**关闭相机缩放、保留旋转 / 平移（见 `src/entity/terrain/terrain.md`）。
- 玩家主控**不提供右键平移**（play 右键 = 重击）。

## 方案总览

| 方案 | 模块 | 适用模式 |
|------|------|----------|
| **玩家主控** | `control/player_control.ts` `createPlayerControl` | play、showcase/交互物、showcase/背包 |
| **纯摄像机** | `control/camera_control.ts` `createCameraControl` | edit、bone_edit、showcase/动作·外观·AI 地形·地形·图鉴、play 无玩家兜底 |

### 行为矩阵

| 操作 | 玩家主控 | 纯摄像机 |
|------|----------|----------|
| 移动 | WASD（相对相机水平） | WASD + Z/X 自由飞行 |
| `roll`（默认 Shift） | 边沿触发**翻滚** | — |
| `boost`（默认 Shift） | — | 按住**加速**自由飞行 |
| 跳跃 | 空格 | — |
| 左键拖拽 | 旋转视角 | 旋转视角 |
| 右键拖拽 | 无平移（play 右键 = 重击） | `mouse_pan` 平移 |
| 滚轮 | 缩放 | 缩放（可 `setZoomEnabled(false)` 让位） |
| 可选 | 攻击 / 锁定 / 点击聚焦 / 交互 | `focusTo` / `setFollow` / 点击聚焦 |

## 输入动作

- `roll`：玩家主控翻滚（`CHARACTER_INPUT` 的 `roll` 由 `createPlayerControl().move()` 边沿读取）。
- `boost`：纯摄像机自由飞行加速（`applyKeyboardFreeFlight` / `applyFreeFlightMovement` 每帧读取）。
- 二者默认均绑定 `Shift`，但分属不同方案，运行时不会同时消费。
- `mouse_pan`：所有纯摄像机模式（含 edit / bone_edit）共用，默认右键。

## 盾牌：短按盾击 / 长按格挡

- 复用既有攻击键（主手盾 = 轻 / 重击键皆可长按格挡；副手盾 = 仅重击键），不新增输入动作。**短按**（< `block.holdThreshold` ≈ 0.25s）松开 = 盾击；**长按** = 进入 `blocking` 格挡。主手盾双键并存时仅认先按下的盾键，另一盾键的按下 / 松开均被忽略（避免互相覆盖致松手误出招）。
- 路由在 `world.ts`（非本模块相机逻辑）：`beginPlayerAttackHold` / `endPlayerAttackHold(key, held)` / `cancelPlayerAttackHold(key)`；`modes/play/index.ts` 的两个 cancel 回调已扩参传 key。`move()` 每帧仍经 `characterSystem.setPlayerMove()` 注入移动；格挡意图 `blockHeld` 由 `world.ts` 计算并注入 `stateMachine.setInput(..., block)`。启发与判定见 [`physics.md`](../../entity/character/physics/physics.md)、状态见 [`state_machine.md`](../../character/state_machine/state_machine.md)。

## 玩家主控 API

```ts
const control = createPlayerControl(camera, domElement, {
    getTarget,            // () => Vector3 | undefined；无目标时退化为自由飞行
    move,                 // (dx, dz, jump, forwardX, forwardZ, roll) => void（写角色）
    cycleAttackModule?,       // 攻击模组切换回调
    combat?,              // 攻击 / 蓄力回调（play）
    lock?,                // 镜头锁定回调（play）
    pointerActions,       // MOUSE_ACTIONS_BY_MODE.<mode>
    initialYaw / initialPitch / initialDistance,
    signal?,              // 释放监听
})
control.move()            // 每帧、角色状态机更新前：读移动输入
control.update(dt)        // 每帧、角色同步后：更新相机
control.focusTo(pos, d?) / control.isFocused()   // 可选聚焦
```

## 纯摄像机 API

```ts
const camera = createCameraControl(camera, domElement, {
    pointerActions,
    keyboardFreeFlight?,  // 缺省 true
    panEnabled?,          // 缺省 true
    zoomEnabled?,         // 缺省 true（edit 地形雕刻勾选时置 false）
    signal?,
})
camera.update(dt)         // 每帧
camera.setOrientation(yaw, pitch)   // 未聚焦时保持相机位置（第一人称）
camera.setEnabled(v) / camera.setZoomEnabled(v)
camera.focusTo / setFollow / setDistance / getYaw
```

## 编辑模式地形雕刻

- 未勾选：滚轮 = 相机缩放、右键 = 相机平移（与其它纯摄像机模式一致）。
- 选中地形后出现「地形雕刻」面板；勾选「启用（滚轮雕刻）」后滚轮升降地形，**仅**关闭相机滚轮缩放，保留旋转 / 平移。
- 实现：`entity/terrain/base/edit/sculpt.ts`（滚轮雕刻）+ `entity/terrain/base/ui/sculpt_panel.ts`（勾选面板），选中变化即自动关闭。

## 文件索引

| 文件 | 职责 |
|------|------|
| `modes/control/constants.ts` | 纯摄像机 / 玩家相机常量（灵敏度、距离范围、加速倍率等） |
| `modes/control/free_flight.ts` | 第一人称自由飞行移动（含 `boost` 加速） |
| `modes/control/camera_control.ts` | 纯摄像机控制器（自由飞行 + 旋转 / 平移 / 缩放 + 聚焦 / 跟随） |
| `modes/control/player_control.ts` | 玩家主控控制器（移动 + 翻滚 + 跳跃 + 第三人称相机 + 可选战斗 / 锁定 / 聚焦） |
