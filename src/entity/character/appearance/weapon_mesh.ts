import {
    Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry,
    MeshStandardMaterial, type BufferGeometry,
} from 'three'

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
    | { id: 'dual_axe';     bladeSize: number; color: number; gripColor: number; /** 副手镜像（斧刃开向 -X） */ mirror?: boolean }
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
    grenade:      {...GRIP_NEUTRAL, y: -0.02, rx: -0.3},
    molotov:      {...GRIP_NEUTRAL, y: -0.03, rx: -0.3},
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
    /** 攻击判定箱本地盒参数（自动外扩 WEAPON_HIT_BOX_PAD） */
    hitBox: WeaponLocalHitBox
    cleanup: () => void
}

// ── 工具 ──

let _meshes: Mesh[] = []
let _geos: BufferGeometry[] = []
let _mats: MeshStandardMaterial[] = []

function begin(): void {
    _meshes = []; _geos = []; _mats = []
}

const mat = (color: number, roughness = 0.5, metalness = 0.2): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({color, roughness, metalness})
    _mats.push(m)
    return m
}

const box = (w: number, h: number, d: number): BoxGeometry => {
    const g = new BoxGeometry(w, h, d); _geos.push(g); return g
}
const cyl = (rTop: number, rBot: number, h: number, seg = 8): CylinderGeometry => {
    const g = new CylinderGeometry(rTop, rBot, h, seg); _geos.push(g); return g
}
const sphere = (r: number, segW = 8, segH = 6): SphereGeometry => {
    const g = new SphereGeometry(r, segW, segH); _geos.push(g); return g
}
const cone = (r: number, h: number, seg = 8): ConeGeometry => {
    const g = new ConeGeometry(r, h, seg); _geos.push(g); return g
}

const mesh = (geometry: BufferGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number, rx = 0, rz = 0): Mesh => {
    const m = new Mesh(geometry, mat)
    m.position.set(x, y, z)
    m.rotation.set(rx, 0, rz)
    m.castShadow = true
    _meshes.push(m)
    return m
}

function finish(
    hitX: number, hitY: number, hitZ: number,
    tipX = hitX, tipY = hitY, tipZ = hitZ,
    gripY = 0,
    hbCx = hitX, hbCy = hitY, hbCz = hitZ,
    hbHx = 0.1, hbHy = 0.1, hbHz = 0.1,
): WeaponMeshResult {
    const group = new Group()
    for (const m of _meshes) group.add(m)

    /* 命中箱统一外扩边距，保证略大于武器模型 */
    const hitBox: WeaponLocalHitBox = {
        center: {x: hbCx, y: hbCy, z: hbCz},
        half: {x: hbHx + WEAPON_HIT_BOX_PAD, y: hbHy + WEAPON_HIT_BOX_PAD, z: hbHz + WEAPON_HIT_BOX_PAD},
        reach: hbCy + hbHy + WEAPON_HIT_BOX_PAD,
    }

    const hGeo = new BoxGeometry(0.01, 0.01, 0.01)
    const hMat = new MeshStandardMaterial({color: 0xff0000, roughness: 1, metalness: 0})
    const hitCenter = new Mesh(hGeo, hMat)
    hitCenter.visible = false
    hitCenter.position.set(hitX, hitY, hitZ)
    group.add(hitCenter)

    /* 刀尖采样点（刀光轨迹）：与 hitCenter 同规格的隐藏标记 */
    const tGeo = new BoxGeometry(0.01, 0.01, 0.01)
    const tMat = new MeshStandardMaterial({color: 0xff0000, roughness: 1, metalness: 0})
    const tip = new Mesh(tGeo, tMat)
    tip.visible = false
    tip.position.set(tipX, tipY, tipZ)
    group.add(tip)

    const geos = _geos.slice()
    const mats = _mats.slice()

    return {
        group,
        hitCenter,
        tip,
        gripY,
        hitBox,
        cleanup: () => {
            for (const g of geos) g.dispose()
            for (const m of mats) m.dispose()
            hGeo.dispose(); hMat.dispose()
            tGeo.dispose(); tMat.dispose()
        },
    }
}

// ── 生成器 ──

const genSword = (cfg: WeaponMeshConfig & { id: 'sword' }): WeaponMeshResult => {
    begin()
    const bw = 0.04; const bh = cfg.bladeLen * 0.7; const bd = 0.02
    const gm = mat(cfg.gripColor, 0.7, 0.05)
    const bm = mat(cfg.color, 0.35, 0.6)
    const gLen = cfg.bladeLen * 0.35; const gR = 0.03

    mesh(cyl(gR, gR, gLen), gm, 0, -bd * 0.25 - gLen / 2, 0)
    mesh(box(bw * 2.5, 0.02, bw), bm, 0, -bd * 0.25 - 0.015, 0)
    mesh(box(bw, bh, bd), bm, 0, bh / 2 + 0.03, 0)
    /* 命中箱包裹刃部（y ∈ [0.03, bh+0.03]） */
    return finish(0, bh * 0.35, 0, 0, bh + 0.03, 0, -(0.005 + (cfg.bladeLen * 0.35) / 2),
        0, bh / 2 + 0.03, 0, bw, bh / 2, bd)
}

const genHeavySword = (cfg: WeaponMeshConfig & { id: 'heavy_sword' }): WeaponMeshResult => {
    begin()
    const bw = 0.06; const bh = cfg.bladeLen * 0.7; const bd = 0.04
    const gm = mat(cfg.gripColor, 0.7, 0.05)
    const bm = mat(cfg.color, 0.3, 0.7)
    const gLen = cfg.bladeLen * 0.3; const gR = 0.035

    mesh(cyl(gR, gR, gLen), gm, 0, -bd * 0.3 - gLen / 2, 0)
    mesh(box(bw * 3, 0.03, bw), bm, 0, -bd * 0.3 - 0.02, 0)
    mesh(box(bw, bh, bd), bm, 0, bh / 2 + 0.05, 0)
    return finish(0, bh * 0.3, 0, 0, bh + 0.05, 0, -(0.012 + (cfg.bladeLen * 0.3) / 2),
        0, bh / 2 + 0.05, 0, bw, bh / 2, bd)
}

const genSpear = (cfg: WeaponMeshConfig & { id: 'spear' }): WeaponMeshResult => {
    begin()
    const pm = mat(cfg.color, 0.7, 0.05)
    const hm = mat(cfg.headColor, 0.3, 0.7)
    const pR = 0.025

    mesh(cyl(pR, pR, cfg.poleLen), pm, 0, cfg.poleLen / 2, 0)
    mesh(box(0.05, cfg.headLen, 0.04), hm, 0, cfg.poleLen + cfg.headLen / 2, 0)
    /* 命中箱包裹枪头 */
    return finish(0, cfg.poleLen * 0.6, 0, 0, cfg.poleLen + cfg.headLen, 0, cfg.poleLen * 0.08,
        0, cfg.poleLen + cfg.headLen / 2, 0, 0.05, cfg.headLen / 2, 0.04)
}

/* 单刃斧（双持时左右手各一；`mirror` = 副手镜像，使两把斧的刃口朝外） */
const genDualAxe = (cfg: WeaponMeshConfig & { id: 'dual_axe' }): WeaponMeshResult => {
    begin()
    const bm = mat(cfg.color, 0.3, 0.7)
    const gm = mat(cfg.gripColor, 0.7, 0.05)
    const sz = cfg.bladeSize
    const gLen = sz * 1.7; const gR = 0.03
    const handleTop = -sz * 0.15
    const side = cfg.mirror === true ? -1 : 1
    const bladeW = sz * 0.5
    const bladeH = sz * 0.95
    const bladeD = 0.035
    const bladeX = side * sz * 0.32
    const bladeY = handleTop - bladeH * 0.15

    mesh(cyl(gR, gR, gLen), gm, 0, handleTop - gLen / 2, 0)
    mesh(box(bladeW, bladeH, bladeD), bm, bladeX, bladeY, 0, 0, -side * Math.PI / 12)
    /* 命中箱包裹斧刃；刀尖采样点 = 刃外上角 */
    return finish(bladeX, bladeY, 0, bladeX + side * bladeW / 2, bladeY + bladeH / 2, 0,
        -(sz * 0.15 + gLen / 2),
        bladeX, bladeY, 0, bladeW / 2, bladeH / 2, bladeD / 2)
}

const genWarHammer = (cfg: WeaponMeshConfig & { id: 'war_hammer' }): WeaponMeshResult => {
    begin()
    const hm = mat(cfg.color, 0.25, 0.8)
    const gm = mat(cfg.gripColor, 0.7, 0.05)
    const hsz = cfg.headSize; const gLen = hsz * 1.5; const gR = 0.04
    const headH = hsz * 0.5
    /* 柄顶（= 柄中心 + 半长）= -hsz·0.2；锤头底对齐柄顶，保证柄与锤头连为一体 */
    const handleTop = -hsz * 0.2
    const headY = handleTop + headH / 2

    mesh(cyl(gR, gR, gLen), gm, 0, handleTop - gLen / 2, 0)
    mesh(box(hsz * 0.7, headH, hsz * 0.7), hm, 0, headY, 0)
    /* 命中箱包裹锤头；刀尖采样点 = 锤头顶 */
    return finish(0, headY, 0, 0, headY + headH / 2, 0, -(hsz * 0.2 + (hsz * 1.5) / 2),
        0, headY, 0, hsz * 0.35, hsz * 0.25, hsz * 0.35)
}

const genBow = (cfg: WeaponMeshConfig & { id: 'bow' }): WeaponMeshResult => {
    begin()
    const bm = mat(cfg.color, 0.6, 0.05)
    const sm = mat(cfg.stringColor, 0.8, 0)
    const sz = cfg.size; const r = 0.015

    mesh(cyl(r, r, sz * 0.7, 6), bm, 0, sz * 0.15, 0, Math.PI / 12)
    mesh(cyl(r, r, sz * 0.7, 6), bm, 0, sz * 0.15, 0, -Math.PI / 12)
    mesh(cyl(0.005, 0.005, sz * 0.3, 4), sm, 0, sz * 0.65, 0)
    return finish(0, sz * 0.4, 0)
}

const genCrossbow = (cfg: WeaponMeshConfig & { id: 'crossbow' }): WeaponMeshResult => {
    begin()
    const wm = mat(cfg.color, 0.6, 0.05)
    const mm = mat(cfg.metalColor, 0.3, 0.7)
    const sz = cfg.size

    mesh(box(sz * 0.4, sz * 0.12, sz * 0.2), wm, 0, 0, 0)
    mesh(box(sz * 0.55, 0.03, 0.03), mm, 0, sz * 0.08, 0)
    mesh(cyl(0.02, 0.02, sz * 0.35), mm, 0, -sz * 0.1, 0)
    return finish(0, sz * 0.05, sz * 0.1)
}

const genShotgun = (cfg: WeaponMeshConfig & { id: 'shotgun' }): WeaponMeshResult => {
    begin()
    const wm = mat(cfg.color, 0.6, 0.05)
    const mm = mat(cfg.metalColor, 0.3, 0.7)
    const sz = cfg.size

    mesh(box(sz * 0.25, sz * 0.2, sz * 0.18), wm, 0, 0, 0)
    mesh(box(0.03, 0.03, sz * 0.3), mm, 0, -sz * 0.1, 0)
    mesh(cyl(0.025, 0.025, sz * 0.4), mm, 0, sz * 0.2, 0)
    return finish(0, sz * 0.2, 0.1)
}

const genStaff = (cfg: WeaponMeshConfig & { id: 'staff' }): WeaponMeshResult => {
    begin()
    const pm = mat(cfg.color, 0.6, 0.05)
    const om = mat(cfg.orbColor, 0.2, 0.3)
    const pR = 0.025

    mesh(cyl(pR, pR, cfg.poleLen), pm, 0, cfg.poleLen / 2, 0)
    mesh(sphere(cfg.orbRadius), om, 0, cfg.poleLen + cfg.orbRadius * 0.5, 0)
    return finish(0, cfg.poleLen * 0.5, 0)
}

const genMagicWand = (cfg: WeaponMeshConfig & { id: 'magic_wand' }): WeaponMeshResult => {
    begin()
    const wm = mat(cfg.color, 0.6, 0.05)
    const gm = mat(cfg.gemColor, 0.15, 0.5)
    const r = 0.015

    mesh(cyl(r, r * 0.8, cfg.len), wm, 0, cfg.len / 2, 0)
    mesh(sphere(0.03), gm, 0, cfg.len + 0.015, 0)
    return finish(0, cfg.len * 0.45, 0)
}

const genThrowingAxe = (cfg: WeaponMeshConfig & { id: 'throwing_axe' }): WeaponMeshResult => {
    begin()
    const bm = mat(cfg.color, 0.3, 0.7)
    const gm = mat(cfg.gripColor, 0.7, 0.05)
    const sz = cfg.bladeSize; const gLen = sz * 0.9; const gR = 0.02

    mesh(cyl(gR, gR, gLen), gm, 0, -sz * 0.05 - gLen / 2, 0)
    mesh(box(sz * 0.5, sz * 0.4, 0.03), bm, 0, gLen * 0.4, 0)
    return finish(0, gLen * 0.5, 0, 0, gLen * 0.4 + sz * 0.2, 0)
}

const genGrenade = (cfg: WeaponMeshConfig & { id: 'grenade' }): WeaponMeshResult => {
    begin()
    const bodyMat = mat(cfg.color, 0.5, 0.1)
    const bandMat = mat(cfg.bandColor, 0.6, 0.1)

    mesh(sphere(cfg.radius), bodyMat, 0, 0, 0)
    mesh(cyl(cfg.radius * 0.4, cfg.radius * 0.4, 0.02, 6), bandMat, 0, cfg.radius * 0.3, 0)
    mesh(cyl(cfg.radius * 0.4, cfg.radius * 0.4, 0.02, 6), bandMat, 0, -cfg.radius * 0.3, 0)
    mesh(cyl(0.015, 0.015, cfg.radius * 0.5), mat(0x666666, 0.4, 0.6), 0, cfg.radius + 0.05, 0)
    return finish(0, 0, 0)
}

const genMolotov = (cfg: WeaponMeshConfig & { id: 'molotov' }): WeaponMeshResult => {
    begin()
    const glassMat = mat(cfg.color, 0.2, 0.2)
    const fireMat = mat(cfg.fireColor, 0.6, 0)
    const sz = cfg.size

    mesh(cyl(sz * 0.3, sz * 0.4, sz, 8), glassMat, 0, sz / 2, 0)
    mesh(cyl(sz * 0.1, sz * 0.1, sz * 0.3, 8), glassMat, 0, sz + 0.1, 0)
    mesh(cone(sz * 0.15, sz * 0.2), fireMat, 0, sz + 0.2, 0)
    return finish(0, sz * 0.4, 0)
}

const genThrowingDart = (cfg: WeaponMeshConfig & { id: 'throwing_dart' }): WeaponMeshResult => {
    begin()
    const bodyMat = mat(cfg.color, 0.3, 0.5)
    const tailMat = mat(cfg.tailColor, 0.6, 0)

    mesh(cyl(0.015, 0.01, cfg.len * 0.7, 6), bodyMat, 0, cfg.len * 0.3, 0)
    mesh(box(0.04, 0.02, 0.01), tailMat, 0, cfg.len * 0.7, 0.02, 0, Math.PI / 5)
    mesh(box(0.04, 0.02, 0.01), tailMat, 0, cfg.len * 0.7, -0.02, 0, -Math.PI / 5)
    mesh(cone(0.02, 0.04, 6), bodyMat, 0, cfg.len * 0.65, 0)
    return finish(0, cfg.len * 0.4, 0)
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
} as Record<WeaponMeshId, (cfg: WeaponMeshConfig) => WeaponMeshResult>

export const createWeaponMesh = (config: WeaponMeshConfig): WeaponMeshResult => {
    const result = meshHandlers[config.id](config)
    /* 烘焙固有握持：把握把中心移到武器 Group 原点、按握持角倾斜，使武器可直接挂在武器骨骼下，
     * 运行时不再需要任何外部偏移/倾斜节点（朝向完全由武器骨骼动画控制） */
    const grip = WEAPON_MESH_GRIPS[config.id]
    const cosR = Math.cos(grip.rx)
    const sinR = Math.sin(grip.rx)
    result.group.position.set(grip.x, grip.y - result.gripY * cosR, grip.z - result.gripY * sinR)
    result.group.rotation.set(grip.rx, grip.ry, grip.rz)
    return result
}
