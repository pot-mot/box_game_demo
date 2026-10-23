import type {StringLocaleKey} from '../../../../../i18n/index.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import type {PoseFunction} from '../creature_runtime/pose.ts'

/** 代码注册的语义动作脚本：启动/首次进入函数编排模式时由 JIT 缓存烘焙为 clip */
export interface ScriptedMotion {
    /** form 内唯一稳定 id（缓存键 / DOM data 属性） */
    readonly id: string
    /** 动作显示名（骨骼页按当前语言本地化） */
    readonly nameKey: StringLocaleKey
    readonly duration: number
    readonly loop: boolean
    readonly pose: PoseFunction
}

/** 单个动作烘焙失败信息（不阻断同 form 其他动作） */
export interface ScriptBakeError {
    readonly motionId: string
    readonly message: string
}

/** 一个 form 的全部脚本动作烘焙结果 */
export interface ScriptBakeResult {
    readonly clips: ReadonlyMap<string, BoneAnimationClip>
    readonly errors: readonly ScriptBakeError[]
}
