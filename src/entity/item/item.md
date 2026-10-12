# 掉落物（entity/item/）模块约定

## 约定

- sensor body 漂浮小立方体，实现 `InteractionProvider`，拾取经交互（非碰撞）。

## 陷阱

- 掉落物碰撞体必须 `categoryCollisionGroups(group, mask, 'item')`（`item = 1<<13`），是 `setSensor(true)` + 掩码 0（不参与物理）。
- 未知 defId 的掉落物拾取时丢弃。

## 文档

- `src/inventory/inventory.md` — 物品目录与形状、掉落 / 拾取、背包与容器 UI、存档
