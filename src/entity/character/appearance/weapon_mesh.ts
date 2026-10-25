import {Euler, Vector3, type Group, type Mesh} from 'three'
import {createMeshBuilder, type MeshBuilder} from './mesh_builder.ts'

import {WEAPON_MESH_IDS, type WeaponAttackBoxSpec, type WeaponMeshConfig, type WeaponMeshId, type WeaponLocalHitBox} from '../../../character/weapon/mesh_config.ts'

export {WEAPON_MESH_IDS}
export type {WeaponMeshConfig, WeaponMeshId, WeaponLocalHitBox}

/**
 * 武器固有握持姿态（**武器模型自身属性**，在 `createWeaponMesh` 内直接烘焙进武器 Group）：
 * 位置偏移 + 欧拉角，武器本体以 +Y 为轴自握把延伸。它描述「这把武器怎么被握住」这一模型固有事实，
 * 不是动作参数——运行时武器的动态朝向（握持屈角、刃面偏转、逐动作微调）全部由**武器骨骼**
 * （`rightWeaponMount` / `leftWeaponMount`）的动画轨道控制。
 */
export interface WeaponGripPose {
    readonly x: number
    readonly y: number
    readonly z: number
    readonly rx: number
    readonly ry: number
    readonly rz: number
}

/** 无偏移的单位握持（投掷物等贴掌武器用） */
const GRIP_NEUTRAL: WeaponGripPose = {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0}

/** 各武器固有握持姿态（烘焙进模型；仅 rx<0 = 刃尖/枪口前倾、ry = 绕武器轴刃面朝向） */
export const WEAPON_MESH_GRIPS: Record<WeaponMeshId, WeaponGripPose> = {
    sword:        {x: 0, y: 0, z: 0, rx: -0.1, ry: 0, rz: 0},
    heavy_sword:  {x: 0, y: 0, z: 0, rx: -0.12, ry: 0, rz: 0},
    spear:        {x: 0, y: 0, z: 0, rx: 0.05, ry: 0, rz: -0.12},
    staff:        {x: 0, y: 0, z: 0, rx: 0.05, ry: 0, rz: 0.1},
    dual_axe:     {x: 0, y: 0, z: 0, rx: -0.2, ry: 0, rz: 0},
    war_hammer:   {x: 0, y: 0, z: 0, rx: -0.3, ry: Math.PI / 4, rz: 0},
    /* 盾面立于武器本地 X-Z 平面（法线沿 +Y，握把在原点、盾面在 +Y 前方）：握持角保持中性，
     * 盾的朝向由武器骨骼动画（格挡 / 盾击姿态）控制 */
    shield_small:  GRIP_NEUTRAL,
    shield_medium: GRIP_NEUTRAL,
    shield_large:  GRIP_NEUTRAL,
    throwing_axe: {x: 0, y: 0, z: 0, rx: -0.3, ry: 0, rz: 0},
    bow:          {x: 0, y: 0, z: 0, rx: -0.15, ry: 0, rz: 0},
    crossbow:     {x: 0, y: 0, z: 0, rx: -0.6, ry: 0, rz: 0},
    shotgun:      {x: 0, y: 0, z: 0, rx: -0.6, ry: 0, rz: 0},
    magic_wand:   {x: 0, y: 0, z: 0, rx: -0.5, ry: 0, rz: 0},
    grenade:      {...GRIP_NEUTRAL, rx: -0.3},
    molotov:      {...GRIP_NEUTRAL, rx: -0.3},
    throwing_dart: GRIP_NEUTRAL,
    none:         GRIP_NEUTRAL,
}

/** 盾牌网格 id 集合（挂背时需额外旋转使盾面竖直贴背；盾面法线为武器本地 +Y） */
const SHIELD_MESH_IDS: readonly WeaponMeshId[] = ['shield_small', 'shield_medium', 'shield_large']

/** 网格 id 是否为盾牌（盾面朝向校正 / 挂背旋转判定） */
export const isShieldMeshId = (id: WeaponMeshId): boolean => SHIELD_MESH_IDS.includes(id)

// ── 攻击判定箱（武器本地命中箱） ──

// ── 生成器返回值 ──

export interface WeaponMeshResult {
    group: Group
    /** 命中检测采样点（隐藏） */
    hitCenter: Mesh
    /** 刀尖采样点（隐藏，刀光轨迹用；未指定时与 hitCenter 重合） */
    tip: Mesh
    /** 握把中心在武器本地坐标的 y（负=在原点下方，0=无握把语义）；装备时叠加偏移使握把对齐手腕 */
    gripY: number
    /** 握把中心在武器本地坐标的 x/z（枪械握把不一定落在模型轴线上） */
    gripX: number
    gripZ: number
    /** 双手共持时左手相对主握把沿本地 +Y（握把→武器前端）的距离 */
    supportGripOffset: number
    /** 攻击判定箱本地盒参数（近战 / 天然武器声明；远程武器为 null） */
    hitBox: WeaponLocalHitBox | null
    cleanup: () => void
}

// ── 工具（基于共享 mesh_builder） ──

/**
 * 收尾：收敛命中箱 / 命中采样点 / 刀尖采样点，返回统一结果（cleanup 即 builder.dispose）。
 * 命中箱由各 `gen` 通过 `hbC*` / `hbH*` 显式给出（模型原点坐标系），`finish` 不再统一外扩。
 * `reach` = 命中箱前缘（hbCy + hbHy）相对**握把**的前伸量：减去握把中心相对模型原点的 Y 偏移
 * gripY（握把已由 createWeaponMesh 烘焙到武器挂点原点；gripY 为 0 的贴掌武器不受影响）。
 */
function finish(
    b: MeshBuilder,
    hitX: number, hitY: number, hitZ: number,
    tipX = hitX, tipY = hitY, tipZ = hitZ,
    gripY = 0,
    hbCx = hitX, hbCy = hitY, hbCz = hitZ,
    hbHx = 0.1, hbHy = 0.1, hbHz = 0.1,
    gripX = 0, gripZ = 0,
): WeaponMeshResult {
    const hitBox: WeaponLocalHitBox = {
        center: {x: hbCx, y: hbCy, z: hbCz},
        half: {x: hbHx, y: hbHy, z: hbHz},
        reach: hbCy + hbHy - gripY,
    }

    const hitCenter = b.add(b.box(0.01, 0.01, 0.01), b.material(0xff0000, 1, 0), hitX, hitY, hitZ)
    hitCenter.visible = false
    /* 刀尖采样点（刀光轨迹）：与 hitCenter 同规格的隐藏标记 */
    const tip = b.add(b.box(0.01, 0.01, 0.01), b.material(0xff0000, 1, 0), tipX, tipY, tipZ)
    tip.visible = false

    return {
        group: b.group,
        hitCenter,
        tip,
        gripY,
        gripX,
        gripZ,
        supportGripOffset: 0,
        hitBox,
        cleanup: b.dispose,
    }
}

/** 远程武器收尾：只创建命中/刀尖采样点，不生成近战攻击箱 */
function finishVisual(
    b: MeshBuilder,
    hitX: number, hitY: number, hitZ: number,
    tipX = hitX, tipY = hitY, tipZ = hitZ,
    gripY = 0,
    gripX = 0, gripZ = 0,
): WeaponMeshResult {
    const hitCenter = b.add(b.box(0.01, 0.01, 0.01), b.material(0xff0000, 1, 0), hitX, hitY, hitZ)
    hitCenter.visible = false
    const tip = b.add(b.box(0.01, 0.01, 0.01), b.material(0xff0000, 1, 0), tipX, tipY, tipZ)
    tip.visible = false
    return {
        group: b.group,
        hitCenter,
        tip,
        gripY,
        gripX,
        gripZ,
        supportGripOffset: 0,
        hitBox: null,
        cleanup: b.dispose,
    }
}

// ── 生成器 ──

const genSword = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'sword' }): WeaponMeshResult => {
    const bw = 0.04; const bh = cfg.bladeLen * 0.7; const bd = 0.02
    const gm = b.materialById('leather', cfg.gripColor)
    const bm = b.materialById('metal', cfg.color)
    const gLen = cfg.bladeLen * 0.35; const gR = 0.03

    /* 刃面立在本地 Y-Z 平面（宽沿本地 Z = 世界上下，薄沿本地 X），护手与刃共面；
     * 半写实：柱状握把 + 圆球剑首 + 横档护手 + 带中脊的收尖刃 */
    const gripTop = -bd * 0.25
    b.add(b.cylinder(gR, gR, gLen, 8), gm, 0, gripTop - gLen / 2, 0)
    b.add(b.sphere(gR * 1.25, 8, 6), bm, 0, gripTop - gLen, 0)
    b.add(b.box(bd * 1.5, 0.025, bw * 2.4), bm, 0, gripTop, 0)
    b.add(b.frustum(bd * 0.2, bd, bh, bw / bd), bm, 0, gripTop + bh / 2, 0)
    b.add(b.box(bd * 0.5, bh * 0.94, bw * 0.2), bm, 0, gripTop + bh / 2, 0)
    /* 命中箱：单盒包裹整把武器（柄 — 护手 — 刃），柄相交同样造成伤害；横向按最宽部件取整 + 局部外扩 */
    const hitMargin = 0.05
    const hitLowY = gripTop - gLen
    const hitHighY = gripTop + bh
    const hitHalfX = Math.max(gR, bw / 2, bd / 2) + hitMargin
    const hitHalfZ = Math.max(gR, bw * 1.25, bw / 2) + hitMargin
    return finish(b, 0, gripTop + bh * 0.35, 0, 0, gripTop + bh, 0, gripTop - gLen / 2,
        0, (hitLowY + hitHighY) / 2, 0,
        hitHalfX, (hitHighY - hitLowY) / 2 + hitMargin, hitHalfZ)
}

const genHeavySword = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'heavy_sword' }): WeaponMeshResult => {
    const bw = 0.06; const bh = cfg.bladeLen * 0.7; const bd = 0.04
    const gm = b.materialById('leather', cfg.gripColor)
    const bm = b.materialById('dark_metal', cfg.color)
    const gLen = cfg.bladeLen * 0.3; const gR = 0.035

    /* 刃面立在本地 Y-Z 平面（宽沿本地 Z = 世界上下，薄沿本地 X），护手与刃共面；
     * 半写实：柱状握把 + 圆球剑首 + 宽横档护手 + 带中脊的收尖刃 */
    const gripTop = -bd * 0.3
    b.add(b.cylinder(gR, gR, gLen, 8), gm, 0, gripTop - gLen / 2, 0)
    b.add(b.sphere(gR * 1.25, 8, 6), bm, 0, gripTop - gLen, 0)
    b.add(b.box(bd * 1.5, 0.03, bw * 2.2), bm, 0, gripTop, 0)
    b.add(b.frustum(bd * 0.2, bd, bh, bw / bd), bm, 0, gripTop + bh / 2, 0)
    b.add(b.box(bd * 0.5, bh * 0.94, bw * 0.18), bm, 0, gripTop + bh / 2, 0)
    /* 命中箱：单盒包裹整把武器（柄 — 护手 — 刃），柄相交同样造成伤害 */
    const hitMargin = 0.05
    const hitLowY = gripTop - gLen
    const hitHighY = gripTop + bh
    const hitHalfX = Math.max(gR, bw / 2, bd / 2) + hitMargin
    const hitHalfZ = Math.max(gR, bw * 1.5, bw / 2) + hitMargin
    return finish(b, 0, gripTop + bh * 0.3, 0, 0, gripTop + bh, 0, gripTop - gLen / 2,
        0, (hitLowY + hitHighY) / 2, 0,
        hitHalfX, (hitHighY - hitLowY) / 2 + hitMargin, hitHalfZ)
}

const genSpear = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'spear' }): WeaponMeshResult => {
    const pm = b.materialById('wood', cfg.color)
    const hm = b.materialById('metal', cfg.headColor)
    const pR = 0.025

    b.add(b.cylinder(pR, pR, cfg.poleLen, 8), pm, 0, cfg.poleLen / 2, 0)
    /* 半写实：枪箍 + 叶形枪头 */
    b.add(b.cylinder(pR * 1.5, pR * 1.5, cfg.headLen * 0.28, 8), hm, 0, cfg.poleLen + cfg.headLen * 0.12, 0)
    b.add(b.frustum(0.012, 0.055, cfg.headLen, 0.7), hm, 0, cfg.poleLen + cfg.headLen / 2, 0)
    /* 命中箱：单盒沿杆贯穿整把武器（杆 — 枪头），杆相交同样造成伤害 */
    const hitMargin = 0.05
    const hitLowY = 0
    const hitHighY = cfg.poleLen + cfg.headLen
    const hitHalfX = Math.max(pR, 0.05 / 2) + hitMargin
    const hitHalfZ = Math.max(pR, 0.04 / 2) + hitMargin
    return finish(b, 0, cfg.poleLen * 0.6, 0, 0, cfg.poleLen + cfg.headLen, 0, cfg.poleLen * 0.5,
        0, (hitLowY + hitHighY) / 2, 0,
        hitHalfX, (hitHighY - hitLowY) / 2 + hitMargin, hitHalfZ)
}

/* 单刃斧（双持时左右手各一）：斧刃立于本地 Y-Z 平面（宽沿本地 Z、薄沿本地 X），斧刃自柄侧展开。
 * 该几何在本地 X 轴上对称，左手武器即右手武器关于角色矢状面的镜像，无需再额外翻转。 */
const genDualAxe = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'dual_axe' }): WeaponMeshResult => {
    const bm = b.materialById('metal', cfg.color)
    const gm = b.materialById('leather', cfg.gripColor)
    const sz = cfg.bladeSize
    const gLen = sz * 1.7; const gR = 0.03
    const handleTop = -sz * 0.15
    const bladeW = sz * 0.5
    const bladeH = sz * 0.95
    const bladeD = 0.035
    const bladeZ = sz * 0.32
    const bladeY = handleTop - bladeH * 0.15

    b.add(b.cylinder(gR, gR, gLen, 6), gm, 0, handleTop - gLen / 2, 0)
    /* 低多面体楔形斧刃（收窄棱台） */
    b.add(b.frustum(bladeD, bladeD, bladeH, bladeW / bladeD), bm, 0, bladeY, bladeZ, Math.PI / 12, 0, 0)
    /* 命中箱：只包斧刃（不把整根柄算进攻击范围），避免挥空时柄部大盒误伤 / 调试箱过大。
     * 绕 X 旋转 rx 后刃在 Y/Z 上的半长按旋转分量展开 */
    const hitMargin = 0.02
    const rx = Math.PI / 12
    const bladeHy = bladeH / 2 * Math.cos(rx) + bladeW / 2 * Math.sin(rx)
    const bladeHz = bladeH / 2 * Math.sin(rx) + bladeW / 2 * Math.cos(rx)
    const hitHalfX = bladeD / 2 + hitMargin
    /* 刀尖采样点 = 刃外上角 */
    return finish(b, 0, bladeY, bladeZ, 0, bladeY + bladeH / 2, bladeZ + bladeW / 2,
        -(sz * 0.15 + gLen / 2),
        0, bladeY, bladeZ,
        hitHalfX, bladeHy + hitMargin, bladeHz + hitMargin)
}

const genWarHammer = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'war_hammer' }): WeaponMeshResult => {
    const hm = b.materialById('dark_metal', cfg.color)
    const gm = b.materialById('leather', cfg.gripColor)
    const hsz = cfg.headSize; const gLen = hsz * 1.5; const gR = 0.04
    const headH = hsz * 0.5
    /* 柄顶（= 柄中心 + 半长）= -hsz·0.2；锤头底对齐柄顶，保证柄与锤头连为一体 */
    const handleTop = -hsz * 0.2
    const headY = handleTop + headH / 2

    b.add(b.cylinder(gR, gR, gLen, 8), gm, 0, handleTop - gLen / 2, 0)
    /* 半写实：棱台锤头 + 前端尖刺 */
    b.add(b.frustum(hsz * 0.55, hsz * 0.7, headH, 1), hm, 0, headY, 0)
    b.add(b.cone(hsz * 0.16, hsz * 0.28, 6), hm, 0, headY, hsz * 0.36, Math.PI / 2, 0, 0)
    /* 命中箱：单盒包裹整把武器（柄 + 锤头），柄相交同样造成伤害；刀尖采样点 = 锤头顶 */
    const hitMargin = 0.05
    const hitLowY = Math.min(handleTop - gLen, headY - headH / 2)
    const hitHighY = Math.max(handleTop, headY + headH / 2)
    const hitHalf = Math.max(gR, hsz * 0.35) + hitMargin
    return finish(b, 0, headY, 0, 0, headY + headH / 2, 0, -(hsz * 0.2 + (hsz * 1.5) / 2),
        0, (hitLowY + hitHighY) / 2, 0,
        hitHalf, (hitHighY - hitLowY) / 2 + hitMargin, hitHalf)
}

/* 盾牌：盾面立于本地 X-Z 平面（法线 +Y = 朝向、X = 左右宽、Z = 上下高），
 * 握把在模型原点（gripY = 0）、盾面沿 +Y 前伸；`round` 决定圆盾（圆柱碟）或方盾（薄板）。 */
const genShield = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'shield_small' | 'shield_medium' | 'shield_large' }): WeaponMeshResult => {
    const plateMat = b.materialById('wood', cfg.color)
    const gripMat = b.materialById('leather', cfg.gripColor)
    const bossMat = b.materialById('metal', cfg.bossColor)
    const w = cfg.width; const h = cfg.height; const t = cfg.thickness
    const plateY = 0.10 + t / 2

    if (cfg.round) {
        /* 半写实：盾面 + 金属包边（背板外露一圈）+ 圆顶盾凸 */
        b.add(b.cylinder(w / 2 * 1.06, w / 2 * 1.06, t * 0.7, 12), bossMat, 0, plateY - t * 0.15, 0)
        b.add(b.cylinder(w / 2, w / 2, t, 10), plateMat, 0, plateY, 0)
    } else {
        b.add(b.box(w * 1.06, t * 0.7, h * 1.04), bossMat, 0, plateY - t * 0.15, 0)
        b.add(b.box(w, t, h), plateMat, 0, plateY, 0)
    }
    /* 正面中心圆顶盾凸 */
    b.add(b.ellipsoid(Math.min(w, h) * 0.18, t * 1.2, Math.min(w, h) * 0.18, 10, 8), bossMat, 0, plateY + t * 0.5, 0)
    /* 背面横握把 */
    b.add(b.box(w * 0.5, 0.05, 0.05), gripMat, 0, plateY - t / 2 - 0.03, 0)

    const hitMargin = 0.04
    const hitHalfX = w / 2 + hitMargin
    const hitHalfY = t / 2 + hitMargin
    const hitHalfZ = h / 2 + hitMargin
    return finish(b, 0, plateY, 0, 0, plateY + t / 2, 0, 0,
        0, plateY, 0,
        hitHalfX, hitHalfY, hitHalfZ)
}

const genBow = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'bow' }): WeaponMeshResult => {
    const bm = b.materialById('wood', cfg.color)
    const sm = b.materialById('cloth', cfg.stringColor)
    const gm = b.materialById('leather', 0x553322)
    const sz = cfg.size; const r = 0.014

    /* 弓身立于武器本地 Y-Z 平面（+Y = 射向/目标方向，±Z = 世界上下）：
     * 两条弓臂自握把（原点）向上下展开，并朝 -Y（射手侧）后掠形成弧背，
     * 弓弦连接两梢、位于射手侧。握把沿弓臂方向（本地 Z）包裹原点。 */
    const half = sz / 2
    const depth = sz * 0.12
    const limbLen = Math.hypot(half, depth)
    const rxUp = Math.atan2(-half, -depth)
    const rxDown = Math.atan2(half, -depth)
    const limbCy = -depth / 2
    const limbCz = half / 2

    b.add(b.cylinder(r, r, limbLen, 6), bm, 0, limbCy, -limbCz, rxUp, 0, 0)
    b.add(b.cylinder(r, r, limbLen, 6), bm, 0, limbCy, limbCz, rxDown, 0, 0)
    b.add(b.cylinder(r * 1.7, r * 1.7, depth * 1.4, 8), gm, 0, 0, 0, Math.PI / 2, 0, 0)
    b.add(b.cylinder(0.006, 0.006, half * 2, 4), sm, 0, -depth, 0, Math.PI / 2, 0, 0)
    /* 右手拉弦点位于弓身握把之后；左手副握点在弓身中央握把。远程武器不生成近战攻击箱。 */
    return finishVisual(b, 0, 0, 0, 0, -depth, -half, -depth)
}

const genCrossbow = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'crossbow' }): WeaponMeshResult => {
    const wm = b.materialById('wood', cfg.color)
    const mm = b.materialById('metal', cfg.metalColor)
    const sz = cfg.size

    /* 木身/枪托沿射向（本地 +Y）；弩弓为前端水平横臂（本地 X），弓弦在其后；
     * 弩箭置于木身上方（-Z 为上），扳机/握把在下方（+Z） */
    b.add(b.box(sz * 0.08, sz * 1.0, sz * 0.1), wm, 0, sz * 0.05, 0)
    b.add(b.box(sz * 0.85, sz * 0.05, sz * 0.05), mm, 0, sz * 0.45, 0)
    b.add(b.box(sz * 0.8, 0.008, 0.008), mm, 0, sz * 0.37, 0)
    b.add(b.box(sz * 0.03, sz * 0.6, sz * 0.025), mm, 0, sz * 0.15, -sz * 0.075)
    b.add(b.box(sz * 0.05, sz * 0.12, sz * 0.1), mm, 0, -sz * 0.1, sz * 0.09)
    return finishVisual(b, 0, sz * 0.3, 0, 0, sz * 0.45, 0, -sz * 0.1, 0, sz * 0.09)
}

const genShotgun = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'shotgun' }): WeaponMeshResult => {
    const wm = b.materialById('wood', cfg.color)
    const mm = b.materialById('dark_metal', cfg.metalColor)
    const sz = cfg.size

    /* 枪管沿射向（本地 +Y）在前上方（-Z 为上）；木质后托在后方，
     * 泵动护木在枪管下方（+Z），扳机护圈在机匣下方 */
    b.add(b.cylinder(sz * 0.035, sz * 0.035, sz * 0.75), mm, 0, sz * 0.35, -sz * 0.03)
    b.add(b.box(sz * 0.13, sz * 0.3, sz * 0.16), wm, 0, -sz * 0.05, 0)
    b.add(b.box(sz * 0.1, sz * 0.45, sz * 0.13), wm, 0, -sz * 0.35, sz * 0.03)
    b.add(b.box(sz * 0.11, sz * 0.22, sz * 0.11), wm, 0, sz * 0.28, sz * 0.07)
    b.add(b.box(sz * 0.03, sz * 0.1, sz * 0.02), mm, 0, -sz * 0.1, sz * 0.08)
    return finishVisual(b, 0, sz * 0.3, 0, 0, sz * 0.72, 0, -sz * 0.1, 0, sz * 0.08)
}

const genStaff = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'staff' }): WeaponMeshResult => {
    const pm = b.materialById('wood', cfg.color)
    const om = b.materialById('gem', cfg.orbColor)
    const pR = 0.025

    b.add(b.cylinder(pR, pR, cfg.poleLen), pm, 0, cfg.poleLen / 2, 0)
    b.add(b.sphere(cfg.orbRadius), om, 0, cfg.poleLen + cfg.orbRadius * 0.5, 0)
    return finishVisual(b, 0, cfg.poleLen * 0.5, 0, 0, cfg.poleLen * 0.5, 0, cfg.poleLen * 0.5)
}

const genMagicWand = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'magic_wand' }): WeaponMeshResult => {
    const wm = b.materialById('wood', cfg.color)
    const gm = b.materialById('gem', cfg.gemColor)
    const r = 0.015

    b.add(b.cylinder(r, r * 0.8, cfg.len), wm, 0, cfg.len / 2, 0)
    b.add(b.sphere(0.03), gm, 0, cfg.len + 0.015, 0)
    return finishVisual(b, 0, cfg.len * 0.45, 0, 0, cfg.len * 0.45, 0, cfg.len * 0.3)
}

const genThrowingAxe = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'throwing_axe' }): WeaponMeshResult => {
    const bm = b.materialById('metal', cfg.color)
    const gm = b.materialById('leather', cfg.gripColor)
    const sz = cfg.bladeSize; const gLen = sz * 0.9; const gR = 0.02

    /* 刃面立在本地 Y-Z 平面（宽沿本地 Z = 世界上下、薄沿本地 X）；
     * 斧头压住柄顶，刃与柄相互重叠连接 */
    const handleTop = -sz * 0.05
    const headY = handleTop
    b.add(b.cylinder(gR, gR, gLen), gm, 0, handleTop - gLen / 2, 0)
    b.add(b.box(0.03, sz * 0.4, sz * 0.5), bm, 0, headY, 0)
    return finishVisual(b, 0, gLen * 0.5, 0, 0, headY + sz * 0.2, 0, handleTop - gLen / 2)
}

const genGrenade = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'grenade' }): WeaponMeshResult => {
    const bodyMat = b.materialById('dark_metal', cfg.color)
    const bandMat = b.materialById('metal', cfg.bandColor)
    const fuseMat = b.materialById('dark_metal', 0x666666)
    const r = cfg.radius

    b.add(b.sphere(r), bodyMat, 0, 0, 0)
    /* 环带略凸出球面并嵌入球身，形成两道箍 */
    b.add(b.cylinder(r * 1.02, r * 1.02, r * 0.12, 12), bandMat, 0, r * 0.3, 0)
    b.add(b.cylinder(r * 1.02, r * 1.02, r * 0.12, 12), bandMat, 0, -r * 0.3, 0)
    /* 引信底部嵌入球顶，向上伸出 */
    b.add(b.cylinder(0.015, 0.015, r * 0.8, 8), fuseMat, 0, r, 0)
    return finishVisual(b, 0, 0, 0)
}

const genMolotov = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'molotov' }): WeaponMeshResult => {
    const glassMat = b.materialById('glass', cfg.color)
    const fireMat = b.materialById('gem', cfg.fireColor)
    /* 按啤酒瓶比例造型：整体细高——瓶身 / 瓶肩（锥台）/ 瓶颈依次相接，火芯接于瓶口 */
    const h = cfg.size
    const bodyH = h * 0.55
    const shoulderH = h * 0.16
    const neckH = h * 0.29
    const bodyR = h * 0.15
    const neckR = h * 0.055
    const overlap = h * 0.04
    const shoulderBottom = bodyH - overlap
    const shoulderTop = shoulderBottom + shoulderH
    const neckBottom = shoulderTop - overlap
    const neckTop = neckBottom + neckH

    b.add(b.cylinder(bodyR, bodyR, bodyH, 12), glassMat, 0, bodyH / 2, 0)
    b.add(b.cylinder(neckR, bodyR, shoulderH, 12), glassMat, 0, (shoulderBottom + shoulderTop) / 2, 0)
    b.add(b.cylinder(neckR, neckR, neckH, 12), glassMat, 0, (neckBottom + neckTop) / 2, 0)
    b.add(b.cone(h * 0.13, h * 0.18, 12), fireMat, 0, neckTop - overlap + h * 0.09, 0)
    return finishVisual(b, 0, h * 0.4, 0, 0, h * 0.4, 0, h * 0.2)
}

const genThrowingDart = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'throwing_dart' }): WeaponMeshResult => {
    const bodyMat = b.materialById('metal', cfg.color)
    const tailMat = b.materialById('cloth', cfg.tailColor)

    b.add(b.cylinder(0.015, 0.01, cfg.len * 0.7, 6), bodyMat, 0, cfg.len * 0.3, 0)
    b.add(b.box(0.04, 0.02, 0.01), tailMat, 0, cfg.len * 0.7, 0.02, 0, 0, Math.PI / 5)
    b.add(b.box(0.04, 0.02, 0.01), tailMat, 0, cfg.len * 0.7, -0.02, 0, 0, -Math.PI / 5)
    b.add(b.cone(0.02, 0.04, 6), bodyMat, 0, cfg.len * 0.65, 0)
    return finishVisual(b, 0, cfg.len * 0.4, 0, 0, cfg.len * 0.4, 0, cfg.len * 0.25)
}

/** 空手 / 天然武器：无可视几何，仅一个覆盖打击区（口 / 爪 / 蹄）的命中盒（拳 / 咬 / 爪由身体部件表达） */
const genNone = (b: MeshBuilder, _cfg: WeaponMeshConfig & { id: 'none' }): WeaponMeshResult =>
    finish(b, 0, 0.2, 0, 0, 0.2, 0, 0, 0, 0.15, 0.15, 0.2, 0.2, 0.25)

// ── 主入口 ──

const meshHandlers = {
    sword: genSword,
    heavy_sword: genHeavySword,
    spear: genSpear,
    dual_axe: genDualAxe,
    war_hammer: genWarHammer,
    shield_small: genShield,
    shield_medium: genShield,
    shield_large: genShield,
    bow: genBow,
    crossbow: genCrossbow,
    shotgun: genShotgun,
    staff: genStaff,
    magic_wand: genMagicWand,
    throwing_axe: genThrowingAxe,
    grenade: genGrenade,
    molotov: genMolotov,
    throwing_dart: genThrowingDart,
    none: genNone,
} as Record<WeaponMeshId, (b: MeshBuilder, config: WeaponMeshConfig) => WeaponMeshResult>

export const createWeaponMesh = (config: WeaponMeshConfig): WeaponMeshResult => {
    const b = createMeshBuilder()
    const result = meshHandlers[config.id](b, config)
    /* 烘焙固有握持：把握把中心移到武器 Group 原点、按握持角倾斜，使武器可直接挂在武器骨骼下，
     * 运行时不再需要任何外部偏移/倾斜节点（朝向完全由武器骨骼动画控制） */
    const grip = WEAPON_MESH_GRIPS[config.id]
    const gripPoint = new Vector3(result.gripX, result.gripY, result.gripZ)
        .applyEuler(new Euler(grip.rx, grip.ry, grip.rz))
    result.group.position.set(grip.x, grip.y, grip.z).sub(gripPoint)
    result.group.rotation.set(grip.rx, grip.ry, grip.rz)
    result.supportGripOffset = config.supportGripOffset ?? 0
    return result
}

/**
 * 解析武器攻击箱：显式声明优先；否则由网格命中箱模板 + 武器握持变换生成一项，
 * 绑定到实际武器挂点关节（关节局部坐标 + 旋转）。
 */
export const resolveAttackBoxes = (
    result: WeaponMeshResult,
    jointId: string,
    explicit: readonly WeaponAttackBoxSpec[] | undefined,
): readonly WeaponAttackBoxSpec[] => {
    if (explicit !== undefined && explicit.length > 0) {
        return explicit.map(box => box.jointId === 'weaponMount' ? {...box, jointId} : box)
    }
    const template = result.hitBox
    if (template === null) return []
    const center = new Vector3(template.center.x, template.center.y, template.center.z)
        .applyEuler(result.group.rotation)
        .add(result.group.position)
    const euler = new Euler().setFromQuaternion(result.group.quaternion, 'XYZ')
    return [{
        jointId,
        center: {x: center.x, y: center.y, z: center.z},
        half: {x: template.half.x, y: template.half.y, z: template.half.z},
        rotation: {x: euler.x, y: euler.y, z: euler.z},
        reach: template.reach,
    }]
}
