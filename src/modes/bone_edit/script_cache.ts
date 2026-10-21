import type {SkeletonDefinition} from '../../skeleton/anim/serialization.ts'
import type {ScriptedMotion} from '../../entity/character/forms/authoring/motion.ts'
import type {ScriptBakeResult} from '../../entity/character/forms/authoring/motion.ts'
import {bakeScriptedMotions} from '../../entity/character/forms/authoring/bake.ts'

/** 单个体形的脚本烘焙缓存（fingerprint = 骨架定义签名，骨架变化后自动重烘焙） */
export interface FormScriptCacheEntry {
    readonly fingerprint: string
    readonly result: ScriptBakeResult
}

const cache = new Map<string, FormScriptCacheEntry>()

/** 缓存指纹 = 骨架定义 + 动作元数据（id / 时长 / 循环 / 名称）；代码内姿势函数变更需点「重新烘焙」 */
const fingerprintOf = (skeleton: SkeletonDefinition, motions: readonly ScriptedMotion[]): string =>
    `${JSON.stringify(skeleton)}|${motions.map(motion => `${motion.id}:${motion.duration}:${motion.loop ? 1 : 0}:${motion.nameKey}`).join('|')}`

/**
 * 懒烘焙当前体形的全部脚本动作：首次进入函数编排模式或切换体形时调用。
 * 同一骨架 + 同一体形直接复用缓存；骨架被编辑后指纹变化会重新烘焙。
 */
export const ensureScriptCache = (
    formId: string,
    skeleton: SkeletonDefinition,
    motions: readonly ScriptedMotion[],
): FormScriptCacheEntry => {
    const fingerprint = fingerprintOf(skeleton, motions)
    const cached = cache.get(formId)
    if (cached !== undefined && cached.fingerprint === fingerprint) return cached
    const entry = {fingerprint, result: bakeScriptedMotions(formId, skeleton, motions)}
    cache.set(formId, entry)
    return entry
}

/** 取已烘焙缓存（未烘焙时 undefined） */
export const getScriptCache = (formId: string): FormScriptCacheEntry | undefined =>
    cache.get(formId)

/** 清除指定体形缓存（「重新烘焙」按钮） */
export const invalidateScriptCache = (formId: string): void => {
    cache.delete(formId)
}
