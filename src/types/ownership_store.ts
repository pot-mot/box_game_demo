import type {EntityType} from '../entity/constants.ts'

/** 箱庭归属：蓝图内的稳定箱庭 id + 生成节点 id */
export interface DioramaOwner {
    readonly dioramaId: string
    readonly nodeId: string
}

/**
 * 归属引用。
 * `building_generator` 的系统实体 id 就是建筑世界 id（一个存档条目可在内部包含多个世界），
 * 因此建筑世界与其它实体共用同一套引用结构，不会把同一存档条目下的多个世界混在一起。
 */
export interface OwnedRef {
    readonly type: EntityType
    readonly runtimeId: number
}

export interface OwnershipEntry {
    readonly ref: OwnedRef
    readonly owner: DioramaOwner
}

const refKey = (ref: OwnedRef): string => `${ref.type}:${ref.runtimeId}`

/** 运行时归属索引：箱庭 id → 子实体 / 建筑世界 */
export interface OwnershipStore {
    set: (ref: OwnedRef, owner: DioramaOwner) => void
    get: (ref: OwnedRef) => DioramaOwner | undefined
    /** 列出某箱庭的全部归属；自动裁剪已被手动删除的失效运行时 id */
    entriesOf: (dioramaId: string, isValid: (ref: OwnedRef) => boolean) => OwnershipEntry[]
    remove: (ref: OwnedRef) => void
    clear: () => void
}

export const createOwnershipStore = (): OwnershipStore => {
    const entries = new Map<string, OwnershipEntry>()

    const set = (ref: OwnedRef, owner: DioramaOwner): void => {
        entries.set(refKey(ref), {ref, owner})
    }

    const get = (ref: OwnedRef): DioramaOwner | undefined =>
        entries.get(refKey(ref))?.owner

    const remove = (ref: OwnedRef): void => {
        entries.delete(refKey(ref))
    }

    const entriesOf = (dioramaId: string, isValid: (ref: OwnedRef) => boolean): OwnershipEntry[] => {
        const result: OwnershipEntry[] = []
        for (const [key, entry] of entries) {
            if (entry.owner.dioramaId !== dioramaId) continue
            if (!isValid(entry.ref)) {
                entries.delete(key)
                continue
            }
            result.push(entry)
        }
        return result
    }

    const clear = (): void => {
        entries.clear()
    }

    return {set, get, entriesOf, remove, clear}
}
