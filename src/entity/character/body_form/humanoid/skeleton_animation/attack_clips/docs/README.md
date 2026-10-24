# 人形动作设计文档

> 共用规范见 [`动作设计规范.md`](../../../../../../../../docs/bone_animation/动作设计规范.md)。
> 作者数据源：`src/entity/character/body_form/humanoid/skeleton_animation/attack_clips/`。

## 基础状态

- [`待机.md`](待机.md)
- [`受击硬直.md`](受击硬直.md)

## 武器动作

- [`持握模式动作.md`](持握模式动作.md) —— 六种长近战武器的三模式总表
- [`短剑.md`](短剑.md)
- [`长剑.md`](长剑.md)
- [`巨剑.md`](巨剑.md)
- [`长枪.md`](长枪.md)
- [`战斧.md`](战斧.md)
- [`战锤.md`](战锤.md)
- [`远程攻击.md`](远程攻击.md)

## 维护约定

- 段 id、段数量、持握模式以 `weaponAttacksOf` / `orderedSegments` 的运行时数据为准；文档不重复维护完整清单。
- 关键帧数值以 `attack_clips/*.ts` 为唯一真相源；文档只描述动作意图、关节约束与验收方式。
- 生产动画不使用运行时 IK；双手支撑手由 `pnpm bake:support-hands` 离线烘焙。
- 作者数据数组格式由 `pnpm format:attack-clips` 统一压缩（`times` / 每关节 `joints` / `positions` 各一行）。
