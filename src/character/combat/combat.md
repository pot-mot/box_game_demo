# 战斗运行时（character/combat/）模块约定

## 约定

- 伤害事件 `DamageEvent.damageType` 必填（武器固有：近战/远程直取当前武器、爆炸继承所属武器）；新增伤害路径漏填即编译报错。
- 防御力在 `applyDamage` 内、`damageModifiers` 之后按类别固定减免（`max(MIN_DAMAGE=1, 伤害 − defense[damageType])`，低于 1 点的原始伤害保持原值），**禁止在别处重复减伤**。
- 翻滚中段无敌帧由 `states/rolling.ts` 逐帧写 `combat.invincibleTimer`（`exit` 清零）；免疫判定统一走 `damage.ts` 的 `isDamageImmune(target)`（`applyDamage` 顶部短路，先于 modifier/防御，不触发任何受击回调）。

## 陷阱

- **新增伤害路径不得绕过 `isDamageImmune`**；三条命中路径也用它跳过击退与命中反馈——近战不写 `attackedTargets` / 不 `onHit`（无敌结束后同一命中窗口内仍可命中）、远程弹丸穿过无敌目标不消耗、爆炸跳过该目标。
- 翻滚与死亡的全身体根旋转都由 `world.ts` 合成，基础 clip 不写根关节自转（`rollingPose` 只表达抱团蜷缩），否则根原点在脚底会绕脚底划大圈/沉入地面。
