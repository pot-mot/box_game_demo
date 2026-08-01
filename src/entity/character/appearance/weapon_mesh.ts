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

// ── 生成器返回值 ──

export interface WeaponMeshResult {
    group: Group
    hitCenter: Mesh
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

function finish(hitX: number, hitY: number, hitZ: number): WeaponMeshResult {
    const group = new Group()
    for (const m of _meshes) group.add(m)

    const hGeo = new BoxGeometry(0.01, 0.01, 0.01)
    const hMat = new MeshStandardMaterial({color: 0xff0000, roughness: 1, metalness: 0})
    const hitCenter = new Mesh(hGeo, hMat)
    hitCenter.visible = false
    hitCenter.position.set(hitX, hitY, hitZ)
    group.add(hitCenter)

    const geos = _geos.slice()
    const mats = _mats.slice()

    return {
        group,
        hitCenter,
        cleanup: () => {
            for (const g of geos) g.dispose()
            for (const m of mats) m.dispose()
            hGeo.dispose(); hMat.dispose()
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
    return finish(0, bh * 0.35, 0)
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
    return finish(0, bh * 0.3, 0)
}

const genSpear = (cfg: WeaponMeshConfig & { id: 'spear' }): WeaponMeshResult => {
    begin()
    const pm = mat(cfg.color, 0.7, 0.05)
    const hm = mat(cfg.headColor, 0.3, 0.7)
    const pR = 0.025

    mesh(cyl(pR, pR, cfg.poleLen), pm, 0, cfg.poleLen / 2, 0)
    mesh(box(0.05, cfg.headLen, 0.04), hm, 0, cfg.poleLen + cfg.headLen / 2, 0)
    return finish(0, cfg.poleLen * 0.6, 0)
}

const genDualAxe = (cfg: WeaponMeshConfig & { id: 'dual_axe' }): WeaponMeshResult => {
    begin()
    const bm = mat(cfg.color, 0.3, 0.7)
    const gm = mat(cfg.gripColor, 0.7, 0.05)
    const gLen = cfg.bladeSize * 1.2; const gR = 0.03
    const sz = cfg.bladeSize

    mesh(cyl(gR, gR, gLen), gm, 0, -sz * 0.1 - gLen / 2, 0)
    mesh(box(sz * 0.4, sz * 0.6, 0.03), bm, sz * 0.3, gLen * 0.1, 0, 0, Math.PI / 6)
    mesh(box(sz * 0.4, sz * 0.6, 0.03), bm, -sz * 0.3, gLen * 0.1, 0, 0, -Math.PI / 6)
    return finish(0, gLen * 0.5, 0)
}

const genWarHammer = (cfg: WeaponMeshConfig & { id: 'war_hammer' }): WeaponMeshResult => {
    begin()
    const hm = mat(cfg.color, 0.25, 0.8)
    const gm = mat(cfg.gripColor, 0.7, 0.05)
    const hsz = cfg.headSize; const gLen = hsz * 1.5; const gR = 0.04

    mesh(cyl(gR, gR, gLen), gm, 0, -hsz * 0.2 - gLen / 2, 0)
    mesh(box(hsz * 0.7, hsz * 0.5, hsz * 0.7), hm, 0, gLen * 0.7, 0)
    return finish(0, gLen * 0.4, 0)
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
    return finish(0, gLen * 0.5, 0)
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

export const createWeaponMesh = (config: WeaponMeshConfig): WeaponMeshResult =>
    meshHandlers[config.id](config)
