import {type Body} from 'cannon-es'

export interface PhysicsEnv {
    readonly bodyProviders: Array<() => Body[]>
    getAllBodies(): Body[]
}

export const createPhysicsEnv = (): PhysicsEnv => {
    const bodyProviders: Array<() => Body[]> = []
    return {
        bodyProviders,
        getAllBodies: () => bodyProviders.flatMap(fn => fn()),
    }
}
