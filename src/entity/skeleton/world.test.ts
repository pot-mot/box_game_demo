import {beforeEach, describe, it, expect} from 'vitest'
import {Scene, type Mesh, type Object3D} from 'three'
import {createInputRegistry} from '../../input/registry.ts'
import type {SkeletonDefinition} from '../../skeleton/anim/serialization.ts'
import type {SkeletonPreset} from './appearance.ts'
import {setupSkeletonEntities} from './world.ts'

const definition = (): SkeletonDefinition => ({
    joints: [
        {id: 'root', name: '根', position: [0, 0, 0], rotation: [0, 0, 0, 1]},
        {id: 'child', name: '子', parentId: 'root', position: [0, 1, 0], rotation: [0, 0, 0, 1]},
    ],
    bones: [],
})

const preset = (): SkeletonPreset => ({
    createDefinition: definition,
    mountAppearance: () => ({boneParts: new Map(), partMeshes: [], cleanup: () => {}}),
})

const setup = () => setupSkeletonEntities(new Scene(), {
    defaultPresetId: 'a',
    presetIds: ['a', 'b'],
    presetOf: preset,
})

const belongsTo = (mesh: Mesh, root: Object3D): boolean => {
    let node: Object3D | null = mesh
    while (node !== null) {
        if (node === root) return true
        node = node.parent
    }
    return false
}

describe('骨架实体聚焦隔离', () => {
    beforeEach(() => {
        createInputRegistry()
    })

    it('切换聚焦骨架时只显示当前实体，且拾取列表不包含隐藏骨架', () => {
        const world = setup()
        const a = world.addPreset('a')
        const b = world.addPreset('b')
        expect(a.visuals.rootGroup.visible).toBe(false)
        expect(b.visuals.rootGroup.visible).toBe(true)

        world.focus(a.id)
        expect(a.visuals.rootGroup.visible).toBe(true)
        expect(b.visuals.rootGroup.visible).toBe(false)
        expect(world.getMeshes().length).toBeGreaterThan(0)
        expect(world.getMeshes().every(mesh => belongsTo(mesh, a.visuals.rootGroup))).toBe(true)
    })

    it('视图设置独立控制节点/骨骼/模型，并在新建骨架时沿用', () => {
        const world = setup()
        const first = world.addPreset('a')
        world.setViewSettings({showJoints: false, showBones: false, showModel: false})
        expect([...first.visuals.gizmos.values()].every(mesh => !mesh.visible)).toBe(true)
        expect([...first.visuals.boneVisuals.values()].every(mesh => !mesh.visible)).toBe(true)

        const second = world.addPreset('b')
        expect([...second.visuals.gizmos.values()].every(mesh => !mesh.visible)).toBe(true)

        world.setViewSettings({showJoints: true, showBones: true, showModel: true})
        expect([...second.visuals.gizmos.values()].every(mesh => mesh.visible)).toBe(true)
        expect(world.getViewSettings()).toEqual({
            editEnabled: true,
            showJoints: true,
            showBones: true,
            showModel: true,
        })
    })

    it('隐藏当前选中层时清除选中', () => {
        const world = setup()
        const entity = world.addPreset('a')
        const jointId = [...entity.skeleton.joints.keys()][0]!
        world.select({kind: 'joint', id: jointId})
        expect(world.getSelection()).toEqual({kind: 'joint', id: jointId})
        world.setViewSettings({showJoints: false})
        expect(world.getSelection()).toBeUndefined()
    })

    it('父关节下拉排除自身与后代，并在应用后同步领域骨架与场景层级', () => {
        const world = setup()
        const entity = world.addPreset('a')
        world.select({kind: 'joint', id: 'root'})
        const rootSelect = document.querySelector<HTMLSelectElement>('#skeleton-parent')
        expect(rootSelect).not.toBeNull()
        expect([...rootSelect!.options].map(option => option.value)).toEqual([''])

        world.select({kind: 'joint', id: 'child'})
        const parentSelect = document.querySelector<HTMLSelectElement>('#skeleton-parent')
        expect(parentSelect).not.toBeNull()
        expect([...parentSelect!.options].map(option => option.value)).toEqual(['', 'root'])
        expect(parentSelect!.value).toBe('root')

        parentSelect!.value = ''
        document.querySelector<HTMLButtonElement>('#skeleton-panel .dc-btn--primary')!.click()
        const child = entity.skeleton.findJoint('child')!
        expect(child.parent).toBeUndefined()
        expect(entity.visuals.groups.get('child')!.parent).toBe(entity.visuals.rootGroup)

        world.select({kind: 'joint', id: 'child'})
        const reconnect = document.querySelector<HTMLSelectElement>('#skeleton-parent')!
        reconnect.value = 'root'
        document.querySelector<HTMLButtonElement>('#skeleton-panel .dc-btn--primary')!.click()
        expect(entity.skeleton.findJoint('child')!.parent?.id).toBe('root')
        expect(entity.visuals.groups.get('child')!.parent).toBe(entity.visuals.groups.get('root'))
    })
})
