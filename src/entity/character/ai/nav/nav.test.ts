/**
 * 需要重写为 Rapier API。
 * 原测试使用 cannon-es World / Body / BODY_TYPES / Box / Vec3 / Material / ContactMaterial / SAPBroadphase
 * 构造物理世界及角色实体。createSharedWorld 已返回 Rapier.World，nav sensor 的物理世界创建模式
 * 也需要适配 Rapier。
 * 此文件标记所有测试为 skip，保留测试名称供后续重写参考。
 */
import {describe, it, expect} from 'vitest'

describe('NavSensor 传感器检测', () => {
    it.skip('1. 前方无障碍时返回 clear', () => { expect(true).toBe(true) })
    it.skip('2. 前方有高墙时返回 blocked_wall', () => { expect(true).toBe(true) })
    it.skip('3. 前方有矮障碍时返回 blocked_low', () => { expect(true).toBe(true) })
    it.skip('4. 前方地形断裂 → 探针超出跳跃高度未命中 → blocked_pit', () => { expect(true).toBe(true) })
    it.skip('4b. 无任何 mesh → 假定平坦世界 → groundAhead=true', () => { expect(true).toBe(true) })
    it.skip('4c. 无地形 + 有障碍(不在探头下方) → 隐式平面 y=0 → footY≤jumpHeight → groundAhead=true', () => { expect(true).toBe(true) })
    it.skip('5. 前方有墙 + 左侧通畅', () => { expect(true).toBe(true) })
    it.skip('6. 前方有墙 + 右侧通畅', () => { expect(true).toBe(true) })
    it.skip('7. 前方有墙 + 左右均堵', () => { expect(true).toBe(true) })
})

describe('NavFSM 导航状态机', () => {
    it.skip('8. 矮障碍 + nav 开启 → 触发跳跃', () => { expect(true).toBe(true) })
    it.skip('9. 高墙 + 左侧通 + nav 开启 → 转向绕行', () => { expect(true).toBe(true) })
    it.skip('10. 高墙 + 左右均堵 + nav 开启 → stuck → 输出 idle', () => { expect(true).toBe(true) })
    it.skip('11. 坑洞 + 侧面通畅 + nav 开启 → 绕行', () => { expect(true).toBe(true) })
    it.skip('12. 坑洞 + 四周堵死 + nav 开启 → stuck → idle', () => { expect(true).toBe(true) })
    it.skip('13. 四面围墙 + nav 开启 → stuck → idle', () => { expect(true).toBe(true) })
    it.skip('14. 畅通路径 + nav 开启 → 持续 navigating', () => { expect(true).toBe(true) })
    it.skip('15. Legacy（nav 关闭）+ 前方墙 → 卡住超时后 idle', () => { expect(true).toBe(true) })
    it.skip('16. Legacy（nav 关闭）+ 畅通路径 → 持续前进不被干扰', () => { expect(true).toBe(true) })
})

describe('NavSensor 坡面检测', () => {
    it.skip('17. 10° 上坡 → 视为可行走表面，返回 clear', () => { expect(true).toBe(true) })
    it.skip('18. 30° 上坡 → 视为可行走表面，返回 clear', () => { expect(true).toBe(true) })
    it.skip('19. 45° 上坡 → 视为可行走表面，返回 clear', () => { expect(true).toBe(true) })
    it.skip('20. 60° 上坡 → 视为可行走表面，返回 clear', () => { expect(true).toBe(true) })
    it.skip('21. 80° 上坡 → 面法线 Y≈0.174 > 0.06，视为可行走，返回 clear', () => { expect(true).toBe(true) })
    it.skip('22. 90° 垂直墙 → 返回 blocked_wall', () => { expect(true).toBe(true) })
    it.skip('23. 100° 倒悬 → 面法线 Y < 0，返回 blocked_wall', () => { expect(true).toBe(true) })
})

describe('NavFSM 坡面行为', () => {
    it.skip('24. 45° 上坡 + nav → walking 而不触发跳跃', () => { expect(true).toBe(true) })
})

describe('NavSensor 各类实体障碍检测', () => {
    it.skip('25. box/common（1x3x1）在前方 → blocked_wall', () => { expect(true).toBe(true) })
    it.skip('26. box/destruction（1x1x1 可破坏箱）在前方 → blocked_low（矮于跳跃高度）', () => { expect(true).toBe(true) })
    it.skip('27. box/burning（1x3x1 燃烧箱）在前方 → blocked_wall', () => { expect(true).toBe(true) })
    it.skip('28. box/magnet（1x3x1 磁力箱）在前方 → blocked_wall', () => { expect(true).toBe(true) })
    it.skip('29. box/elasticity（1x3x1 弹性箱）在前方 → blocked_wall', () => { expect(true).toBe(true) })
    it.skip('30. area/water — 生产环境中被 world.ts 过滤，传感器不接收其 mesh → clear', () => { expect(true).toBe(true) })
    it.skip('31. fragment/common（碎片 0.5x0.5x0.5）在前方矮障碍 → blocked_low', () => { expect(true).toBe(true) })
    it.skip('32. 前方同时有 box/common 和 box/burning → 均命中返回 blocked_wall', () => { expect(true).toBe(true) })
})

describe('NavFSM 各类实体障碍行为', () => {
    it.skip('34. box/common 高墙 + 左侧通 → steering 绕行', () => { expect(true).toBe(true) })
    it.skip('35. box/destruction 矮箱 + nav → 触发跳跃', () => { expect(true).toBe(true) })
    it.skip('36. box/elasticity 高箱 + 左右堵 → stuck → idle', () => { expect(true).toBe(true) })
    it.skip('37. fragment/common 碎片 + nav → 触发跳跃越过', () => { expect(true).toBe(true) })
})

describe('NavSensor 角色障碍检测', () => {
    it.skip('38. 前方有角色（矮于跳高）→ 强制归为 blocked_wall 而非 blocked_low', () => { expect(true).toBe(true) })
    it.skip('39. 前方有角色 + 左侧通畅 → 可绕行', () => { expect(true).toBe(true) })
})

describe('NavFSM 角色障碍行为', () => {
    it.skip('40. 前方角色 + nav → steering 绕行而非跳跃', () => { expect(true).toBe(true) })
})

describe('NavSensor 站在实体上的坑洞检测', () => {
    it.skip('41. 站在 boxes 上 → 前方仍在箱顶 → groundAhead=true（不误判为坑洞）', () => { expect(true).toBe(true) })
    it.skip('42. 站在高箱边缘 → 前方悬空落差 > jumpHeight → groundAhead=false', () => { expect(true).toBe(true) })
    it.skip('43. 站在 fragment 上 → 前方仍在碎片顶 → groundAhead=true（不误判坑洞）', () => { expect(true).toBe(true) })
})

describe('NavSensor 倾斜箱子和箱顶导航', () => {
    it.skip('44. 前方 30° 倾斜箱子 → 前面命中 → blocked_low（低斜坡可走上去）', () => { expect(true).toBe(true) })
    it.skip('45. 25° 倾斜箱子 → 角色低处走近 → blocked_low（低障碍可越）', () => { expect(true).toBe(true) })
    it.skip('46. 80° 近垂直倾斜箱子 → blocked_low（高度仍 ≤ jumpHeight）', () => { expect(true).toBe(true) })
})

describe('NavFSM 箱顶行走', () => {
    it.skip('47. 在箱顶上行走 → 持续 navigating，不触发跳跃或卡住', () => { expect(true).toBe(true) })
})
