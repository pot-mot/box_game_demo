# 角色战斗特效（entity/character/combat_vfx/）模块约定

## 约定

- `hitbox_debug.ts` 是角色调试线框的底层几何 / 材质与矩阵同步原语；模式侧统一经 [`../render/debug_view.ts`](../render/debug_view.ts) 的 `createCharacterDebugView` 使用，禁止复制线框创建与同步逻辑。

- 角色材质表面效果（受击闪红 / 翻滚无敌半透明白）统一走 `material_effects.ts`：惰性快照 → 按优先级覆写 → 全部结束统一还原；闪红优先于闪白，`transparent` 仅在真正变化时置 `needsUpdate`。

## 陷阱

- 禁止在别处直接改角色模型材质颜色 / 透明度，或另建快照还原逻辑。
