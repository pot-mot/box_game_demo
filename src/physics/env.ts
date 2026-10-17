import type RAPIER from '@dimforge/rapier3d-compat'
import type {BodyEnvironment} from './environment.ts'

export interface PhysicsEnv {
    readonly bodyProviders: Array<() => RAPIER.RigidBody[]>
    getAllBodies(): RAPIER.RigidBody[]
    registerProvider(provider: () => RAPIER.RigidBody[]): void
    /**
     * 取该刚体的环境场累加器（仅角色有；其余刚体返回 undefined）。
     * area 场对角色写 env（绕开状态机速度覆写），对普通刚体直接 addForce。
     */
    getEnvironment(body: RAPIER.RigidBody): BodyEnvironment | undefined
    registerEnvironmentProvider(provider: (body: RAPIER.RigidBody) => BodyEnvironment | undefined): void
}

export const createPhysicsEnv = (): PhysicsEnv => {
    const bodyProviders: Array<() => RAPIER.RigidBody[]> = []
    const environmentProviders: Array<(body: RAPIER.RigidBody) => BodyEnvironment | undefined> = []
    return {
        bodyProviders,
        getAllBodies: () => bodyProviders.flatMap(fn => fn()),
        registerProvider: (provider) => {
            bodyProviders.push(provider)
        },
        getEnvironment: (body) => {
            for (const provider of environmentProviders) {
                const env = provider(body)
                if (env !== undefined) return env
            }
            return undefined
        },
        registerEnvironmentProvider: (provider) => {
            environmentProviders.push(provider)
        },
    }
}
