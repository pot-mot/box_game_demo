import type {EntityInfoSource} from '../entity/box/base/types/entity_info.ts'
import type {FragmentData} from '../entity/destroyed/types'
import type {TerrainContext} from '../entity/terrain/base/types'
import type {GameMode} from '../modes/constants'
import type {SaveData, SavableEntity, FragmentDataJSON, QuatJSON, ModeInfoJSON, CameraInfoJSON} from './types.ts'

/** 将 {x, y, z} 转为 [x, y, z] */
const vec3ToTuple = (v: {x: number; y: number; z: number}): [number, number, number] =>
    [v.x, v.y, v.z]

/** 将 {x, y, z, w} 转为 [x, y, z, w] */
const quatToTuple = (q: {x: number; y: number; z: number; w: number}): QuatJSON =>
    [q.x, q.y, q.z, q.w]

/** 将 FragmentData 转为 JSON-safe 格式 */
const fragmentDataToJSON = (fd: FragmentData): FragmentDataJSON => ({
    renderVertices: Array.from(fd.renderVertices),
    renderIndices: fd.renderIndices,
    hullVertices: fd.hullVertices.map(v => vec3ToTuple(v)),
    hullFaces: fd.hullFaces,
    centroid: fd.centroid,
    massRatio: fd.massRatio,
    boxSize: fd.boxSize,
})

/** 收集当前世界所有可序列化实体的状态 */
export const collectWorldState = (
    systems: Map<string, EntityInfoSource>,
    terrainSources: TerrainContext[],
    mode: GameMode,
    cameraPos?: {x: number; y: number; z: number},
    cameraRot?: {x: number; y: number; z: number},
    playerPos?: {x: number; y: number; z: number},
    prevModeInfo?: ModeInfoJSON,
): SaveData => {
    const entities: SavableEntity[] = []

    // 普通箱子
    const common = systems.get('box/common') as any
    if (common?.getAll) {
        for (const e of common.getAll()) {
            entities.push({
                type: 'box/common',
                config: e.config,
                position: vec3ToTuple(e.body.position),
                quaternion: quatToTuple(e.body.quaternion),
            })
        }
    }

    // 可破坏箱子
    const dest = systems.get('box/destruction') as any
    if (dest?.getAll) {
        for (const e of dest.getAll()) {
            entities.push({
                type: 'box/destruction',
                config: e.config,
                position: vec3ToTuple(e.body.position),
                quaternion: quatToTuple(e.body.quaternion),
                health: e.health,
            })
        }
    }

    // 燃烧箱子
    const burn = systems.get('box/burning') as any
    if (burn?.getAll) {
        for (const e of burn.getAll()) {
            entities.push({
                type: 'box/burning',
                config: e.config,
                position: vec3ToTuple(e.body.position),
                quaternion: quatToTuple(e.body.quaternion),
                health: e.health,
                burnProgress: e.burnProgress,
            })
        }
    }

    // 磁铁箱子
    const magnet = systems.get('box/magnet') as any
    if (magnet?.getAll) {
        for (const e of magnet.getAll()) {
            entities.push({
                type: 'box/magnet',
                config: e.config,
                position: vec3ToTuple(e.body.position),
                quaternion: quatToTuple(e.body.quaternion),
            })
        }
    }

    // 弹性箱子
    const elastic = systems.get('box/elasticity') as any
    if (elastic?.getAll) {
        for (const e of elastic.getAll()) {
            entities.push({
                type: 'box/elasticity',
                config: e.config,
                position: vec3ToTuple(e.body.position),
                quaternion: quatToTuple(e.body.quaternion),
                def: e.def,
                vel: e.vel,
            })
        }
    }

    // 水体
    const water = systems.get('area/water') as any
    if (water?.getAll) {
        for (const e of water.getAll()) {
            entities.push({
                type: 'area/water',
                config: e.config,
                position: [e.mesh.position.x, e.mesh.position.y, e.mesh.position.z],
                quaternion: [0, 0, 0, 1],
            })
        }
    }

    // 地形
    for (const ts of terrainSources) {
        const all = (ts as any).getAll?.() ?? []
        for (const e of all) {
            entities.push({
                type: 'terrain',
                config: e.config,
                position: [e.mesh.position.x, e.mesh.position.y, e.mesh.position.z],
                quaternion: [0, 0, 0, 1],
                heights: e.heights,
            })
        }
    }

    // 碎片
    const frag = systems.get('fragment/common') as any
    if (frag?.getAll) {
        for (const e of frag.getAll()) {
            entities.push({
                type: 'fragment/common',
                config: e.config,
                position: vec3ToTuple(e.body.position),
                quaternion: quatToTuple(e.body.quaternion),
                data: fragmentDataToJSON(e.fragmentData ?? {
                    renderVertices: new Float32Array(),
                    renderIndices: [],
                    hullVertices: [],
                    hullFaces: [],
                    centroid: [0, 0, 0],
                    massRatio: 1,
                    boxSize: [0, 0, 0],
                }),
            })
        }
    }

    // ── 构建 modeInfo（保留另一模式的已有数据）──
    const modeInfo: ModeInfoJSON = prevModeInfo ? {...prevModeInfo} : {}
    const cameraInfo: CameraInfoJSON | undefined = cameraPos
        ? {position: vec3ToTuple(cameraPos), rotate: [cameraRot?.x ?? 0, cameraRot?.y ?? 0, cameraRot?.z ?? 0]}
        : undefined

    if (mode === 'edit') {
        if (cameraInfo) modeInfo.edit = {cameraInfo}
        // 不清除 play 数据
    } else if (mode === 'play') {
        const playEntry: NonNullable<typeof modeInfo.play> = {}
        if (cameraInfo) playEntry.cameraInfo = cameraInfo
        if (playerPos) playEntry.playerInfo = {position: vec3ToTuple(playerPos)}
        if (playEntry.cameraInfo || playEntry.playerInfo) modeInfo.play = playEntry
        // 不清除 edit 数据
    }

    return {
        version: 1,
        entities,
        modeInfo: modeInfo.edit || modeInfo.play ? modeInfo : undefined,
    }
}

/** 下载存档为 JSON 文件 */
export const saveWorldToFile = (data: SaveData): void => {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `box-demo-save-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
}
