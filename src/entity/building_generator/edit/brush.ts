import {Raycaster, Vector2, type PerspectiveCamera} from 'three'
import type {SurfaceMaterialId} from '../../../render/materials/index.ts'
import {BRUSH_CLICK_THRESHOLD, VOXEL_SIZE} from '../constants.ts'
import type {BuildingPropKind} from '../props/kinds.ts'
import {DEFAULT_BUILDING_CONFIG, type BuildingConfig} from '../validation.ts'
import type {BlockPick, BuildingGeneratorContext} from '../types/index.ts'

/** 建造笔刷工具 */
export type BuildingBrushTool = 'place' | 'erase' | 'prop' | 'fill' | 'replace' | 'stamp'

export interface BuildingBrush {
    setEnabled: (v: boolean) => void
    isEnabled: () => boolean
    setMaterial: (material: SurfaceMaterialId) => void
    getMaterial: () => SurfaceMaterialId
    setTool: (tool: BuildingBrushTool) => void
    getTool: () => BuildingBrushTool
    setPropKind: (kind: BuildingPropKind) => void
    getPropKind: () => BuildingPropKind
    setStampConfig: (config: BuildingConfig) => void
    getStampConfig: () => BuildingConfig
    dispose: () => void
}

/** 由面法线推导道具偏航（道具本地 +Z 对齐面法线） */
const yawFromNormal = (normal: readonly [number, number, number]): number => {
    if (normal[1] !== 0) return 0
    if (normal[0] === 1) return 1
    if (normal[0] === -1) return 3
    if (normal[2] === -1) return 2
    return 0
}

/**
 * 体素建造笔刷：左键单击（不拖拽，拖拽仍用于旋转视角）对命中体素执行放置 / 擦除 / 道具 /
 * 区域填充 / 区域材质替换 / 预制体编排。区域类工具第一次单击记角点并显示预览，第二次执行。
 * 仅在启用时响应；启用时应由编辑模式关闭实体选中 / 生成交互。
 */
export const createBuildingBrush = (
    building: BuildingGeneratorContext,
    camera: PerspectiveCamera,
    domElement: HTMLElement,
): BuildingBrush => {
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let enabled = false
    let material: SurfaceMaterialId = 'brick'
    let tool: BuildingBrushTool = 'place'
    let propKind: BuildingPropKind = 'door'
    let stampConfig: BuildingConfig = {...DEFAULT_BUILDING_CONFIG}
    /** 区域类工具（填充 / 替换）：已记录的第一个角点与源材质 */
    let regionCorner: {worldId: number; block: [number, number, number]} | undefined
    let regionFrom: SurfaceMaterialId | undefined
    let downX = 0
    let downY = 0
    let downOnCanvas = false

    const isRegionTool = (): boolean => tool === 'fill' || tool === 'replace'

    const clearPreview = (): void => {
        regionCorner = undefined
        regionFrom = undefined
        building.setRegionPreview(undefined)
    }

    const updatePreview = (clientX: number, clientY: number): void => {
        if (regionCorner === undefined) return
        pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1)
        raycaster.setFromCamera(pointer, camera)
        const pick = building.pickBlock(raycaster)
        if (pick === undefined || pick.worldId !== regionCorner.worldId) {
            building.setRegionPreview(undefined)
            return
        }
        building.setRegionPreview(pick.worldId, regionCorner.block, pick.block)
    }

    /** 区域类工具：返回是否已消费本次点击 */
    const applyRegion = (pick: BlockPick, corner: [number, number, number]): void => {
        const [x, y, z] = pick.block
        if (tool === 'fill') {
            building.fillRegion(pick.worldId, corner[0], corner[1], corner[2], x, y, z, material)
        } else if (regionFrom !== undefined) {
            building.replaceMaterialInRegion(pick.worldId, regionFrom, material, corner[0], corner[1], corner[2], x, y, z)
        }
        clearPreview()
    }

    const apply = (clientX: number, clientY: number): void => {
        pointer.set(
            (clientX / window.innerWidth) * 2 - 1,
            -(clientY / window.innerHeight) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)
        const pick = building.pickBlock(raycaster)
        if (pick === undefined) return
        const [x, y, z] = pick.block
        const tx = x + pick.normal[0]
        const ty = y + pick.normal[1]
        const tz = z + pick.normal[2]

        if (isRegionTool()) {
            if (regionCorner === undefined || regionCorner.worldId !== pick.worldId) {
                regionCorner = {worldId: pick.worldId, block: [x, y, z]}
                regionFrom = tool === 'replace' ? building.getBlockMaterial(pick.worldId, x, y, z) : undefined
                building.setRegionPreview(pick.worldId, [x, y, z], [x, y, z])
            } else {
                applyRegion(pick, regionCorner.block)
            }
            return
        }

        switch (tool) {
            case 'place':
                building.setBlock(pick.worldId, tx, ty, tz, material)
                break
            case 'erase':
                building.setBlock(pick.worldId, x, y, z)
                break
            case 'prop':
                building.placeProp(
                    pick.worldId, propKind, material,
                    (tx + 0.5) * VOXEL_SIZE, (ty + 0.5) * VOXEL_SIZE, (tz + 0.5) * VOXEL_SIZE,
                    yawFromNormal(pick.normal),
                )
                break
            case 'stamp':
                building.stampPrefab(pick.worldId, stampConfig, tx, ty, tz)
                break
        }
    }

    const onPointerDown = (e: PointerEvent): void => {
        if (!enabled || e.button !== 0) return
        downOnCanvas = true
        downX = e.clientX
        downY = e.clientY
    }

    const onPointerUp = (e: PointerEvent): void => {
        if (!enabled || e.button !== 0 || !downOnCanvas) return
        downOnCanvas = false
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
        if (moved > BRUSH_CLICK_THRESHOLD) return
        apply(e.clientX, e.clientY)
    }

    const onPointerMove = (e: PointerEvent): void => {
        if (!enabled || !isRegionTool() || regionCorner === undefined) return
        updatePreview(e.clientX, e.clientY)
    }

    domElement.addEventListener('pointerdown', onPointerDown)
    domElement.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return {
        setEnabled: (v: boolean) => {
            enabled = v
            if (!v) {
                downOnCanvas = false
                clearPreview()
            }
        },
        isEnabled: () => enabled,
        setMaterial: (m: SurfaceMaterialId) => { material = m },
        getMaterial: () => material,
        setTool: (t: BuildingBrushTool) => {
            tool = t
            clearPreview()
        },
        getTool: () => tool,
        setPropKind: (k: BuildingPropKind) => { propKind = k },
        getPropKind: () => propKind,
        setStampConfig: (c: BuildingConfig) => { stampConfig = {...c} },
        getStampConfig: () => ({...stampConfig}),
        dispose: () => {
            domElement.removeEventListener('pointerdown', onPointerDown)
            domElement.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
        },
    }
}
