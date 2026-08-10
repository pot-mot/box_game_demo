import type RAPIER from '@dimforge/rapier3d-compat'

export interface PhysicsEnv {
    readonly bodyProviders: Array<() => RAPIER.RigidBody[]>
    getAllBodies(): RAPIER.RigidBody[]
    registerProvider(provider: () => RAPIER.RigidBody[]): void
}

export const createPhysicsEnv = (): PhysicsEnv => {
    const bodyProviders: Array<() => RAPIER.RigidBody[]> = []
    return {
        bodyProviders,
        getAllBodies: () => bodyProviders.flatMap(fn => fn()),
        registerProvider: (provider) => {
            bodyProviders.push(provider)
        },
    }
}
