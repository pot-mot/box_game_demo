// 武器模型配方（纯数据，不依赖 render/entity）。
// 生成器在 `entity/character/appearance/weapon_mesh.ts`；领域层只持有配方类型。

/** 武器模型 id 常量 */
export const WEAPON_MESH_IDS = [
    'sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer',
    'shield_small', 'shield_medium', 'shield_large',
    'bow', 'crossbow', 'shotgun',
    'staff', 'magic_wand',
    'throwing_axe', 'grenade', 'molotov', 'throwing_dart',
    /* 空手 / 天然攻击（拳、咬、爪、吐息）：无可视模型，仅保留命中盒与挂点 */
    'none',
] as const satisfies readonly string[]
export type WeaponMeshId = typeof WEAPON_MESH_IDS[number]

interface WeaponMeshCommon {
    /** 双手共持时副握点沿武器本地 +Y 相对主握点的距离（缺省 0） */
    readonly supportGripOffset?: number
}

/** 武器模型配置（每种武器仅携带自身需要的参数） */
export type WeaponMeshConfig = WeaponMeshCommon & (
    | { id: 'sword';        bladeLen: number; color: number; gripColor: number }
    | { id: 'heavy_sword';  bladeLen: number; color: number; gripColor: number }
    | { id: 'spear';        poleLen: number;  headLen: number; color: number; headColor: number }
    | { id: 'dual_axe';     bladeSize: number; color: number; gripColor: number }
    | { id: 'war_hammer';   headSize: number; color: number; gripColor: number }
    | { id: 'shield_small';  width: number; height: number; thickness: number; round: boolean; color: number; gripColor: number; bossColor: number }
    | { id: 'shield_medium'; width: number; height: number; thickness: number; round: boolean; color: number; gripColor: number; bossColor: number }
    | { id: 'shield_large';  width: number; height: number; thickness: number; round: boolean; color: number; gripColor: number; bossColor: number }
    | { id: 'bow';          size: number; color: number; stringColor: number }
    | { id: 'crossbow';     size: number; color: number; metalColor: number }
    | { id: 'shotgun';      size: number; color: number; metalColor: number }
    | { id: 'staff';        poleLen: number; orbRadius: number; color: number; orbColor: number }
    | { id: 'magic_wand';   len: number; color: number; gemColor: number }
    | { id: 'throwing_axe'; bladeSize: number; color: number; gripColor: number }
    | { id: 'grenade';      radius: number; color: number; bandColor: number }
    | { id: 'molotov';      size: number; color: number; fireColor: number }
    | { id: 'throwing_dart';len: number; color: number; tailColor: number }
    /** 空手 / 天然武器：无可视模型（仅命中盒 + 挂点） */
    | { id: 'none' }
)

/** 武器本地命中箱模板（武器网格生成器输出；单一、未绑定骨骼节点） */
export interface WeaponLocalHitBox {
    readonly center: { readonly x: number; readonly y: number; readonly z: number }
    readonly half: { readonly x: number; readonly y: number; readonly z: number }
    /** 命中箱沿武器本地 +Y 轴的最大前伸量（距握把最远距离） */
    readonly reach: number
}

/**
 * 武器攻击箱（数组项）：每个箱显式绑定骨骼节点 + 局部坐标 + 局部旋转。
 * 天然武器 / 多肢体攻击在武器模型中声明；普通可视武器缺省由网格模板生成一项并绑定到槽位主挂点。
 */
export interface WeaponAttackBoxSpec {
    /** 骨骼节点 id（装备时由槽位/模型解析；天然武器显式声明） */
    readonly jointId: string
    readonly center: { readonly x: number; readonly y: number; readonly z: number }
    readonly half: { readonly x: number; readonly y: number; readonly z: number }
    /** 相对绑定关节局部的欧拉角（弧度，XYZ） */
    readonly rotation: { readonly x: number; readonly y: number; readonly z: number }
    /** 命中箱沿绑定关节局部 +Y 轴的最大前伸量 */
    readonly reach: number
}
