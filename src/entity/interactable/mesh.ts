import {Group, Mesh} from 'three'
import {getSurfaceMaterial} from '../../render/materials/index.ts'
import {createMeshBuilder} from '../character/appearance/mesh_builder.ts'
import type {InteractableConfig} from './types.ts'

export interface InteractableMesh {
    readonly group: Group
    readonly dispose: () => void
}

/** 把构建器产出的网格移入指定子节点（构建器只登记几何 / 材质生命周期，层级由本函数组织） */
const into = (node: Group, mesh: Mesh): Mesh => {
    node.add(mesh)
    return mesh
}

/**
 * 为交互物构建程序化外观：全部可动部件的子节点带名字（`door` / `gate` / `platform` / `lid` 等），
 * 行为层通过 `group.getObjectByName` 取用并只改 local transform。
 */
export const createInteractableMesh = (config: InteractableConfig): InteractableMesh => {
    const builder = createMeshBuilder()
    const root = builder.group
    const mat = getSurfaceMaterial(config.material)
    const accent = getSurfaceMaterial('rusty_iron')
    const [w, h, d] = config.size

    switch (config.kind) {
        case 'save_point': {
            builder.add(builder.cylinder(w * 0.5, w * 0.6, 0.25, 8), accent, 0, 0.12, 0)
            builder.add(builder.cylinder(0.08, 0.08, h * 0.6, 6), mat, 0, h * 0.45, 0)
            const flame = new Group()
            flame.name = 'flame'
            root.add(flame)
            into(flame, builder.add(builder.cone(0.22, 0.5, 6), accent, 0, h * 0.85, 0))
            const glow = new Group()
            glow.name = 'glow'
            root.add(glow)
            into(glow, builder.add(builder.sphere(0.35, 8, 6), accent, 0, h * 0.8, 0))
            break
        }
        case 'teleport': {
            builder.add(builder.cylinder(w * 0.5, w * 0.7, 0.2, 8), accent, 0, 0.1, 0)
            builder.add(builder.cylinder(0.12, 0.12, h, 6), mat, 0, h / 2, 0)
            const ring = new Group()
            ring.name = 'ring'
            root.add(ring)
            into(ring, builder.add(builder.cylinder(0.5, 0.5, 0.08, 12), accent, 0, h * 0.75, 0))
            break
        }
        case 'switch': {
            builder.add(builder.box(w, h * 0.5, d), mat, 0, h * 0.25, 0)
            const lever = new Group()
            lever.name = 'lever'
            lever.position.set(0, h * 0.5, 0)
            root.add(lever)
            into(lever, builder.add(builder.box(0.08, h * 0.5, 0.08), accent, 0, h * 0.25, 0))
            break
        }
        case 'push_door_single': {
            const door = new Group()
            door.name = 'door'
            door.position.set(-w / 2, 0, 0)
            root.add(door)
            into(door, builder.add(builder.box(w, h, d), mat, w / 2, h / 2, 0))
            break
        }
        case 'push_door_double': {
            const left = new Group()
            left.name = 'doorLeft'
            left.position.set(-w / 2, 0, 0)
            root.add(left)
            into(left, builder.add(builder.box(w / 2, h, d), mat, w / 4, h / 2, 0))
            const right = new Group()
            right.name = 'doorRight'
            right.position.set(w / 2, 0, 0)
            root.add(right)
            into(right, builder.add(builder.box(w / 2, h, d), mat, -w / 4, h / 2, 0))
            break
        }
        case 'gate': {
            builder.add(builder.box(0.2, h + config.travel, d), accent, -w / 2 - 0.1, (h + config.travel) / 2, 0)
            builder.add(builder.box(0.2, h + config.travel, d), accent, w / 2 + 0.1, (h + config.travel) / 2, 0)
            const gate = new Group()
            gate.name = 'gate'
            root.add(gate)
            into(gate, builder.add(builder.box(w, h, d), mat, 0, h / 2, 0))
            break
        }
        case 'chest': {
            builder.add(builder.box(w, h * 0.6, d), mat, 0, h * 0.3, 0)
            const lid = new Group()
            lid.name = 'lid'
            lid.position.set(0, h * 0.6, -d / 2)
            root.add(lid)
            into(lid, builder.add(builder.box(w, h * 0.4, d), accent, 0, h * 0.2, d / 2))
            break
        }
        case 'elevator': {
            const platform = new Group()
            platform.name = 'platform'
            root.add(platform)
            into(platform, builder.add(builder.box(w, h, d), mat, 0, h / 2, 0))
            /* 四角立柱（随平台移动） */
            const px = w / 2 - 0.08
            const pz = d / 2 - 0.08
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    into(platform, builder.add(builder.cylinder(0.06, 0.06, 1.2, 6), accent, sx * px, 0.6, sz * pz))
                }
            }
            break
        }
        case 'breakable': {
            into(root, builder.add(builder.box(w, h, d), mat, 0, h / 2, 0))
            break
        }
    }

    return {
        group: root,
        dispose: () => builder.dispose(),
    }
}
