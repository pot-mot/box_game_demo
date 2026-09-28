import {AmbientLight, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer} from 'three'
import {createCharacterModel} from '../../../entity/character/appearance/model.ts'
import type {CharacterModel} from '../../../entity/character/appearance/types.ts'
import {weaponPresetOrDefault} from '../../../character/weapon/catalog.ts'
import {resolveArmorLoadout} from '../../../character/armor/catalog.ts'
import type {ArmorLoadout} from '../../../character/armor/types.ts'
import type {EquipSlot} from '../../../inventory/types.ts'

export interface EquipPreviewData {
    mainWeaponId?: string
    offhandWeaponId?: string
    armor: Partial<Record<EquipSlot, string>>
}

export interface EquipmentPreview {
    readonly canvas: HTMLCanvasElement
    setEquipment: (data: EquipPreviewData) => void
    render: () => void
    dispose: () => void
}

/** 独立小场景静态展示玩家模型（拖拽旋转 / 滚轮缩放，按需渲染，不启动额外 RAF） */
export const createEquipmentPreview = (): EquipmentPreview => {
    const renderer = new WebGLRenderer({alpha: true, antialias: true})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(240, 300)
    const canvas = renderer.domElement
    canvas.style.cssText = 'display:block;border-radius:8px;background:rgba(0,0,0,0.25)'

    const scene = new Scene()
    scene.add(new AmbientLight(0xffffff, 0.7))
    const dirLight = new DirectionalLight(0xffffff, 1.1)
    dirLight.position.set(3, 6, 4)
    scene.add(dirLight)
    const fill = new DirectionalLight(0xffffff, 0.3)
    fill.position.set(-3, 2, -4)
    scene.add(fill)

    const camera = new PerspectiveCamera(35, 240 / 300, 0.1, 50)
    camera.position.set(0, 1.15, 3.1)
    camera.lookAt(new Vector3(0, 0.95, 0))

    const model: CharacterModel = createCharacterModel({speed: 3, jumpHeight: 2, scale: 1}, 0)
    scene.add(model.group)

    let yaw = 0
    let distance = 3.1
    let dragging = false

    const applyCamera = (): void => {
        camera.position.set(Math.sin(yaw) * distance, 1.15, Math.cos(yaw) * distance)
        camera.lookAt(new Vector3(0, 0.95, 0))
    }

    canvas.addEventListener('pointerdown', (e) => {
        dragging = true
        canvas.setPointerCapture(e.pointerId)
    })
    canvas.addEventListener('pointerup', (e) => {
        dragging = false
        canvas.releasePointerCapture(e.pointerId)
    })
    canvas.addEventListener('pointermove', (e) => {
        if (!dragging) return
        yaw += e.movementX * 0.01
        applyCamera()
        render()
    })
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault()
        distance = Math.max(1.6, Math.min(6, distance + Math.sign(e.deltaY) * 0.25))
        applyCamera()
        render()
    }, {passive: false})

    const setEquipment = (data: EquipPreviewData): void => {
        const main = weaponPresetOrDefault(data.mainWeaponId).mesh
        const offhand = data.offhandWeaponId !== undefined ? weaponPresetOrDefault(data.offhandWeaponId).mesh : undefined
        model.equipWeapon({main, ...(offhand !== undefined ? {offhand} : {})})
        const loadout: Partial<Record<'head' | 'chest' | 'arms' | 'legs', string>> = {}
        for (const slot of ['head', 'chest', 'arms', 'legs'] as const) {
            const id = data.armor[slot]
            if (id !== undefined) loadout[slot] = id
        }
        model.equipArmor(resolveArmorLoadout(loadout as ArmorLoadout))
    }

    const render = (): void => renderer.render(scene, camera)

    applyCamera()
    render()

    return {
        canvas,
        setEquipment,
        render,
        dispose: () => {
            renderer.dispose()
            canvas.remove()
        },
    }
}
