import {Euler, Vector3, type Group, type Mesh} from 'three'
import {createMeshBuilder, type MeshBuilder} from './mesh_builder.ts'

// ── 武器模型 ID 常量 ──

const WEAPON_MESH_IDS = [
    'sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer',
    'bow', 'crossbow', 'shotgun',
    'staff', 'magic_wand',
    'throwing_axe', 'grenade', 'molotov', 'throwing_dart',
] as const satisfies readonly string[]
export type WeaponMeshId = typeof WEAPON_MESH_IDS[number]

// ── 武器模型配置（每种武器仅携带自身需要的参数） ──

export type WeaponMeshConfig =
    | { id: 'sword';        bladeLen: number; color: number; gripColor: number }
    | { id: 'heavy_sword';  bladeLen: number; color: number; gripColor: number }
    | { id: 'spear';        poleLen: number;  headLen: number; color: number; headColor: number }
    | { id: 'dual_axe';     bladeSize: number; color: number; gripColor: number }
    | { id: 'war_hammer';   headSize: number; color: number; gripColor: number }
    | { id: 'bow';          size: number; color: number; stringColor: number }
    | { id: 'crossbow';     size: number; color: number; metalColor: number }
    | { id: 'shotgun';      size: number; color: number; metalColor: number }
    | { id: 'staff';        poleLen: number; orbRadius: number; color: number; orbColor: number }
    | { id: 'magic_wand';   len: number; color: number; gemColor: number }
    | { id: 'throwing_axe'; bladeSize: number; color: number; gripColor: number }
    | { id: 'grenade';      radius: number; color: number; bandColor: number }
    | { id: 'molotov';      size: number; color: number; fireColor: number }
    | { id: 'throwing_dart';len: number; color: number; tailColor: number }

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
    throwing_axe: {x: 0, y: 0, z: 0, rx: -0.3, ry: 0, rz: 0},
    bow:          {x: 0, y: 0, z: 0, rx: -0.15, ry: 0, rz: 0},
    crossbow:     {x: 0, y: 0, z: 0, rx: -0.6, ry: 0, rz: 0},
    shotgun:      {x: 0, y: 0, z: 0, rx: -0.6, ry: 0, rz: 0},
    magic_wand:   {x: 0, y: 0, z: 0, rx: -0.5, ry: 0, rz: 0},
    grenade:      {...GRIP_NEUTRAL, rx: -0.3},
    molotov:      {...GRIP_NEUTRAL, rx: -0.3},
    throwing_dart: GRIP_NEUTRAL,
}

// ── 攻击判定箱（武器本地命中箱） ──

/** 命中箱相对武器模型的外扩边距（略大于武器模型） */
const WEAPON_HIT_BOX_PAD = 0.08

/** 武器本地命中箱：武器本地坐标系内略包裹武器模型（以打击部位为主）的盒参数，
 * 运行时经武器 group 的 matrixWorld 变换为世界空间 OBB 参与伤害判定 */
export interface WeaponLocalHitBox {
    readonly center: { readonly x: number; readonly y: number; readonly z: number }
    readonly half: { readonly x: number; readonly y: number; readonly z: number }
    /** 命中箱沿武器本地 +Y 轴（自握把延伸方向）的最大前伸量（含外扩边距），
     * 即武器打击部位距握把的最远距离，供攻击检测箱推导实际攻击距离 */
    readonly reach: number
}

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
    /** 攻击判定箱本地盒参数（自动外扩 WEAPON_HIT_BOX_PAD） */
    hitBox: WeaponLocalHitBox
    cleanup: () => void
}

// ── 工具（基于共享 mesh_builder） ──

/** 收尾：收敛命中箱 / 命中采样点 / 刀尖采样点，返回统一结果（cleanup 即 builder.dispose） */
function finish(
    b: MeshBuilder,
    hitX: number, hitY: number, hitZ: number,
    tipX = hitX, tipY = hitY, tipZ = hitZ,
    gripY = 0,
    hbCx = hitX, hbCy = hitY, hbCz = hitZ,
    hbHx = 0.1, hbHy = 0.1, hbHz = 0.1,
    gripX = 0, gripZ = 0,
): WeaponMeshResult {
    /* 命中箱统一外扩边距，保证略大于武器模型 */
    const hitBox: WeaponLocalHitBox = {
        center: {x: hbCx, y: hbCy, z: hbCz},
        half: {x: hbHx + WEAPON_HIT_BOX_PAD, y: hbHy + WEAPON_HIT_BOX_PAD, z: hbHz + WEAPON_HIT_BOX_PAD},
        reach: hbCy + hbHy + WEAPON_HIT_BOX_PAD,
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

// ── 生成器 ──

const genSword = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'sword' }): WeaponMeshResult => {
    const bw = 0.04; const bh = cfg.bladeLen * 0.7; const bd = 0.02
    const gm = b.material(cfg.gripColor, 0.7, 0.05)
    const bm = b.material(cfg.color, 0.35, 0.6)
    const gLen = cfg.bladeLen * 0.35; const gR = 0.03

    /* 刃面立在本地 Y-Z 平面（宽沿本地 Z = 世界上下，薄沿本地 X），护手与刃共面；
     * 握把 — 护手 — 刃自上而下以 `gripTop` 为分界相互重叠连接 */
    const gripTop = -bd * 0.25
    b.add(b.cylinder(gR, gR, gLen), gm, 0, gripTop - gLen / 2, 0)
    b.add(b.box(bw, 0.02, bw * 2.5), bm, 0, gripTop, 0)
    b.add(b.box(bd, bh, bw), bm, 0, gripTop + bh / 2, 0)
    /* 命中箱包裹刃部（y ∈ [gripTop, gripTop+bh]） */
    return finish(b, 0, gripTop + bh * 0.35, 0, 0, gripTop + bh, 0, gripTop - gLen / 2,
        0, gripTop + bh / 2, 0, bd, bh / 2, bw)
}

const genHeavySword = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'heavy_sword' }): WeaponMeshResult => {
    const bw = 0.06; const bh = cfg.bladeLen * 0.7; const bd = 0.04
    const gm = b.material(cfg.gripColor, 0.7, 0.05)
    const bm = b.material(cfg.color, 0.3, 0.7)
    const gLen = cfg.bladeLen * 0.3; const gR = 0.035

    /* 刃面立在本地 Y-Z 平面（宽沿本地 Z = 世界上下，薄沿本地 X），护手与刃共面；
     * 握把 — 护手 — 刃自上而下以 `gripTop` 为分界相互重叠连接 */
    const gripTop = -bd * 0.3
    b.add(b.cylinder(gR, gR, gLen), gm, 0, gripTop - gLen / 2, 0)
    b.add(b.box(bw, 0.03, bw * 3), bm, 0, gripTop, 0)
    b.add(b.box(bd, bh, bw), bm, 0, gripTop + bh / 2, 0)
    return finish(b, 0, gripTop + bh * 0.3, 0, 0, gripTop + bh, 0, gripTop - gLen / 2,
        0, gripTop + bh / 2, 0, bd, bh / 2, bw)
}

const genSpear = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'spear' }): WeaponMeshResult => {
    const pm = b.material(cfg.color, 0.7, 0.05)
    const hm = b.material(cfg.headColor, 0.3, 0.7)
    const pR = 0.025

    b.add(b.cylinder(pR, pR, cfg.poleLen), pm, 0, cfg.poleLen / 2, 0)
    b.add(b.box(0.05, cfg.headLen, 0.04), hm, 0, cfg.poleLen + cfg.headLen / 2, 0)
    /* 命中箱包裹枪头 */
    return finish(b, 0, cfg.poleLen * 0.6, 0, 0, cfg.poleLen + cfg.headLen, 0, cfg.poleLen * 0.08,
        0, cfg.poleLen + cfg.headLen / 2, 0, 0.05, cfg.headLen / 2, 0.04)
}

/* 单刃斧（双持时左右手各一）：斧刃立于本地 Y-Z 平面（宽沿本地 Z、薄沿本地 X），斧刃自柄侧展开。
 * 该几何在本地 X 轴上对称，左手武器即右手武器关于角色矢状面的镜像，无需再额外翻转。 */
const genDualAxe = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'dual_axe' }): WeaponMeshResult => {
    const bm = b.material(cfg.color, 0.3, 0.7)
    const gm = b.material(cfg.gripColor, 0.7, 0.05)
    const sz = cfg.bladeSize
    const gLen = sz * 1.7; const gR = 0.03
    const handleTop = -sz * 0.15
    const bladeW = sz * 0.5
    const bladeH = sz * 0.95
    const bladeD = 0.035
    const bladeZ = sz * 0.32
    const bladeY = handleTop - bladeH * 0.15

    b.add(b.cylinder(gR, gR, gLen), gm, 0, handleTop - gLen / 2, 0)
    b.add(b.box(bladeD, bladeH, bladeW), bm, 0, bladeY, bladeZ, Math.PI / 12, 0, 0)
    /* 命中箱包裹斧刃；刀尖采样点 = 刃外上角 */
    return finish(b, 0, bladeY, bladeZ, 0, bladeY + bladeH / 2, bladeZ + bladeW / 2,
        -(sz * 0.15 + gLen / 2),
        0, bladeY, bladeZ, bladeD / 2, bladeH / 2, bladeW / 2)
}

const genWarHammer = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'war_hammer' }): WeaponMeshResult => {
    const hm = b.material(cfg.color, 0.25, 0.8)
    const gm = b.material(cfg.gripColor, 0.7, 0.05)
    const hsz = cfg.headSize; const gLen = hsz * 1.5; const gR = 0.04
    const headH = hsz * 0.5
    /* 柄顶（= 柄中心 + 半长）= -hsz·0.2；锤头底对齐柄顶，保证柄与锤头连为一体 */
    const handleTop = -hsz * 0.2
    const headY = handleTop + headH / 2

    b.add(b.cylinder(gR, gR, gLen), gm, 0, handleTop - gLen / 2, 0)
    b.add(b.box(hsz * 0.7, headH, hsz * 0.7), hm, 0, headY, 0)
    /* 命中箱包裹锤头；刀尖采样点 = 锤头顶 */
    return finish(b, 0, headY, 0, 0, headY + headH / 2, 0, -(hsz * 0.2 + (hsz * 1.5) / 2),
        0, headY, 0, hsz * 0.35, hsz * 0.25, hsz * 0.35)
}

const genBow = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'bow' }): WeaponMeshResult => {
    const bm = b.material(cfg.color, 0.6, 0.05)
    const sm = b.material(cfg.stringColor, 0.8, 0)
    const gm = b.material(0x553322, 0.7, 0.05)
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
    /* 命中箱包裹弓身（Y-Z 平面）；弓为远程武器，命中箱不参与伤害，仅保持数据完整 */
    /* 右手拉弦点位于弓身握把之后；左手副握点在弓身中央握把。 */
    return finish(b, 0, 0, 0, 0, -depth, -half, -depth,
        0, -depth / 2, 0, r * 2, depth, half)
}

const genCrossbow = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'crossbow' }): WeaponMeshResult => {
    const wm = b.material(cfg.color, 0.6, 0.05)
    const mm = b.material(cfg.metalColor, 0.3, 0.7)
    const sz = cfg.size

    /* 木身/枪托沿射向（本地 +Y）；弩弓为前端水平横臂（本地 X），弓弦在其后；
     * 弩箭置于木身上方（-Z 为上），扳机/握把在下方（+Z） */
    b.add(b.box(sz * 0.08, sz * 1.0, sz * 0.1), wm, 0, sz * 0.05, 0)
    b.add(b.box(sz * 0.85, sz * 0.05, sz * 0.05), mm, 0, sz * 0.45, 0)
    b.add(b.box(sz * 0.8, 0.008, 0.008), mm, 0, sz * 0.37, 0)
    b.add(b.box(sz * 0.03, sz * 0.6, sz * 0.025), mm, 0, sz * 0.15, -sz * 0.075)
    b.add(b.box(sz * 0.05, sz * 0.12, sz * 0.1), mm, 0, -sz * 0.1, sz * 0.09)
    return finish(b, 0, sz * 0.3, 0, 0, sz * 0.45, 0, -sz * 0.1,
        0, sz * 0.05, 0, sz * 0.45, sz * 0.5, sz * 0.1, 0, sz * 0.09)
}

const genShotgun = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'shotgun' }): WeaponMeshResult => {
    const wm = b.material(cfg.color, 0.6, 0.05)
    const mm = b.material(cfg.metalColor, 0.3, 0.7)
    const sz = cfg.size

    /* 枪管沿射向（本地 +Y）在前上方（-Z 为上）；木质后托在后方，
     * 泵动护木在枪管下方（+Z），扳机护圈在机匣下方 */
    b.add(b.cylinder(sz * 0.035, sz * 0.035, sz * 0.75), mm, 0, sz * 0.35, -sz * 0.03)
    b.add(b.box(sz * 0.13, sz * 0.3, sz * 0.16), wm, 0, -sz * 0.05, 0)
    b.add(b.box(sz * 0.1, sz * 0.45, sz * 0.13), wm, 0, -sz * 0.35, sz * 0.03)
    b.add(b.box(sz * 0.11, sz * 0.22, sz * 0.11), wm, 0, sz * 0.28, sz * 0.07)
    b.add(b.box(sz * 0.03, sz * 0.1, sz * 0.02), mm, 0, -sz * 0.1, sz * 0.08)
    return finish(b, 0, sz * 0.3, 0, 0, sz * 0.72, 0, -sz * 0.1,
        0, sz * 0.2, 0, sz * 0.13, sz * 0.65, sz * 0.12, 0, sz * 0.08)
}

const genStaff = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'staff' }): WeaponMeshResult => {
    const pm = b.material(cfg.color, 0.6, 0.05)
    const om = b.material(cfg.orbColor, 0.2, 0.3)
    const pR = 0.025

    b.add(b.cylinder(pR, pR, cfg.poleLen), pm, 0, cfg.poleLen / 2, 0)
    b.add(b.sphere(cfg.orbRadius), om, 0, cfg.poleLen + cfg.orbRadius * 0.5, 0)
    return finish(b, 0, cfg.poleLen * 0.5, 0, 0, cfg.poleLen * 0.5, 0, cfg.poleLen * 0.5)
}

const genMagicWand = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'magic_wand' }): WeaponMeshResult => {
    const wm = b.material(cfg.color, 0.6, 0.05)
    const gm = b.material(cfg.gemColor, 0.15, 0.5)
    const r = 0.015

    b.add(b.cylinder(r, r * 0.8, cfg.len), wm, 0, cfg.len / 2, 0)
    b.add(b.sphere(0.03), gm, 0, cfg.len + 0.015, 0)
    return finish(b, 0, cfg.len * 0.45, 0, 0, cfg.len * 0.45, 0, cfg.len * 0.3)
}

const genThrowingAxe = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'throwing_axe' }): WeaponMeshResult => {
    const bm = b.material(cfg.color, 0.3, 0.7)
    const gm = b.material(cfg.gripColor, 0.7, 0.05)
    const sz = cfg.bladeSize; const gLen = sz * 0.9; const gR = 0.02

    /* 刃面立在本地 Y-Z 平面（宽沿本地 Z = 世界上下、薄沿本地 X）；
     * 斧头压住柄顶，刃与柄相互重叠连接 */
    const handleTop = -sz * 0.05
    const headY = handleTop
    b.add(b.cylinder(gR, gR, gLen), gm, 0, handleTop - gLen / 2, 0)
    b.add(b.box(0.03, sz * 0.4, sz * 0.5), bm, 0, headY, 0)
    return finish(b, 0, gLen * 0.5, 0, 0, headY + sz * 0.2, 0, handleTop - gLen / 2)
}

const genGrenade = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'grenade' }): WeaponMeshResult => {
    const bodyMat = b.material(cfg.color, 0.5, 0.1)
    const bandMat = b.material(cfg.bandColor, 0.6, 0.1)
    const fuseMat = b.material(0x666666, 0.4, 0.6)
    const r = cfg.radius

    b.add(b.sphere(r), bodyMat, 0, 0, 0)
    /* 环带略凸出球面并嵌入球身，形成两道箍 */
    b.add(b.cylinder(r * 1.02, r * 1.02, r * 0.12, 12), bandMat, 0, r * 0.3, 0)
    b.add(b.cylinder(r * 1.02, r * 1.02, r * 0.12, 12), bandMat, 0, -r * 0.3, 0)
    /* 引信底部嵌入球顶，向上伸出 */
    b.add(b.cylinder(0.015, 0.015, r * 0.8, 8), fuseMat, 0, r, 0)
    return finish(b, 0, 0, 0)
}

const genMolotov = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'molotov' }): WeaponMeshResult => {
    const glassMat = b.material(cfg.color, 0.2, 0.2)
    const fireMat = b.material(cfg.fireColor, 0.6, 0)
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
    return finish(b, 0, h * 0.4, 0, 0, h * 0.4, 0, h * 0.2)
}

const genThrowingDart = (b: MeshBuilder, cfg: WeaponMeshConfig & { id: 'throwing_dart' }): WeaponMeshResult => {
    const bodyMat = b.material(cfg.color, 0.3, 0.5)
    const tailMat = b.material(cfg.tailColor, 0.6, 0)

    b.add(b.cylinder(0.015, 0.01, cfg.len * 0.7, 6), bodyMat, 0, cfg.len * 0.3, 0)
    b.add(b.box(0.04, 0.02, 0.01), tailMat, 0, cfg.len * 0.7, 0.02, 0, 0, Math.PI / 5)
    b.add(b.box(0.04, 0.02, 0.01), tailMat, 0, cfg.len * 0.7, -0.02, 0, 0, -Math.PI / 5)
    b.add(b.cone(0.02, 0.04, 6), bodyMat, 0, cfg.len * 0.65, 0)
    return finish(b, 0, cfg.len * 0.4, 0, 0, cfg.len * 0.4, 0, cfg.len * 0.25)
}

const supportGripOffsetOf = (config: WeaponMeshConfig): number => {
    switch (config.id) {
        case 'sword': return config.bladeLen > 0.4 ? config.bladeLen * 0.16 : 0
        case 'heavy_sword': return config.bladeLen * 0.1
        case 'spear': return config.poleLen * 0.14
        case 'war_hammer': return -config.headSize * 0.23
        /* 双刃斧：握把中心在模型原点下方（gripY ≈ -0.55×bladeSize），副握点取握把上方约 0.4×bladeSize */
        case 'dual_axe': return -(config.bladeSize * 0.15 + config.bladeSize * 1.7 / 2) + config.bladeSize * 0.4
        case 'bow': return config.size * 0.12
        case 'crossbow': return config.size * 0.32
        case 'shotgun': return config.size * 0.26
        case 'staff': return config.poleLen * 0.3
        default: return 0
    }
}

// ── 主入口 ──

const meshHandlers = {
    sword: genSword,
    heavy_sword: genHeavySword,
    spear: genSpear,
    dual_axe: genDualAxe,
    war_hammer: genWarHammer,
    bow: genBow,
    crossbow: genCrossbow,
    shotgun: genShotgun,
    staff: genStaff,
    magic_wand: genMagicWand,
    throwing_axe: genThrowingAxe,
    grenade: genGrenade,
    molotov: genMolotov,
    throwing_dart: genThrowingDart,
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
    result.supportGripOffset = supportGripOffsetOf(config)
    return result
}
