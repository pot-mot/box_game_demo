import {type Scene} from 'three'
import {Body, BODY_TYPES, Cylinder, Sphere, Vec3} from 'cannon-es'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterConfig, CharacterEntity} from '../../../character/types.ts'
import type {CharacterStateMachine} from '../../../character/state_machine/types.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {createCharacterMesh} from '../render'
import {DEFAULT_CHARACTER_CONFIG, CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'
import {CHARACTER_LINEAR_DAMPING} from './constants.ts'

export interface CharacterContext {
    getCharacter: () => CharacterEntity | undefined
    spawn: (x: number, y: number, z: number, config?: CharacterConfig) => CharacterEntity
    remove: () => void
    update: (dt: number) => void
    syncPositions: () => void
    stateMachine: CharacterStateMachine
}

export const setupCharacter = (scene: Scene, shared: SharedWorld): CharacterContext => {
    const {world} = shared
    const stateMachine = createCharacterStateMachine()
    let character: CharacterEntity | undefined
    let nextId = 1

    const spawn = (x: number, y: number, z: number, config?: CharacterConfig): CharacterEntity => {
        const cfg = config ?? DEFAULT_CHARACTER_CONFIG
        const mesh = createCharacterMesh(cfg)
        mesh.position.set(x, y, z)
        scene.add(mesh)

        const body = new Body({
            mass: 1,
            type: BODY_TYPES.DYNAMIC,
            linearDamping: CHARACTER_LINEAR_DAMPING,
            fixedRotation: true,
            collisionFilterGroup: CHARACTER_COLLISION_GROUP,
            collisionFilterMask: CHARACTER_COLLISION_MASK,
        })

        const r = cfg.radius
        const cylH = cfg.height - r * 2
        body.addShape(new Cylinder(r, r, cylH, 8), new Vec3(0, 0, 0))
        body.addShape(new Sphere(r), new Vec3(0, cylH / 2, 0))
        body.addShape(new Sphere(r), new Vec3(0, -cylH / 2, 0))

        body.position.set(x, y, z)
        world.addBody(body)

        const id = nextId++
        character = {id, config: cfg, mesh, body, isOnGround: true, rowText: `Character #${id}`}
        stateMachine.reset()
        return character
    }

    const remove = (): void => {
        if (!character) return
        scene.remove(character.mesh)
        world.removeBody(character.body)
        character.mesh.geometry.dispose()
        const mat = character.mesh.material
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat.dispose()
        character = undefined
    }

    const syncPositions = (): void => {
        if (!character) return
        character.mesh.position.set(character.body.position.x, character.body.position.y, character.body.position.z)
        character.mesh.quaternion.identity()
    }

    const update = (dt: number): void => {
        if (!character) return

        const {body} = character
        character.isOnGround = false
        for (const c of world.contacts) {
            if (c.bi === body || c.bj === body) {
                character.isOnGround = true
                break
            }
        }

        stateMachine.update(dt, character)
        syncPositions()
    }

    const getCharacter = (): CharacterEntity | undefined => character

    return {getCharacter, spawn, remove, update, syncPositions, stateMachine}
}
