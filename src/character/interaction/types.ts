/**
 * 交互领域模型（纯类型，不依赖 entity 层）：
 * 交互物 / 掉落物等实体系统构造 `InteractionTarget` 描述自身，play 侧汇总后择优激活。
 */

/** 交互目标：由交互物实体构造的只读描述，角色领域只读取位置 / 提示 / 评分 */
export interface InteractionTarget {
    /** 全局唯一键（如 `interactable:12:0`），play 侧据它维护激活回调 */
    readonly key: string
    /** 交互物类型（用于文案 / 图标，取值见 entity/interactable/kinds.ts） */
    readonly kind: string
    /** 交互提示文案，如「点燃篝火」「开启」「拾取」 */
    readonly prompt: string
    /** 目标世界坐标（评分与转身朝向） */
    readonly x: number
    readonly y: number
    readonly z: number
    /** 距离评分（越小越优先），由提供方计算 */
    readonly score: number
}

/** 交互物提供者：交互物 / 掉落物系统实现，play 侧汇总候选 */
export interface InteractionProvider {
    /** 收集候选交互目标；out 复用数组，返回收集个数 */
    collectInteractionTargets: (actorX: number, actorY: number, actorZ: number, out: InteractionTarget[]) => number
    /** 激活目标（键由本提供者产出）；返回是否消费（命中后 play 侧停止询问后续提供者） */
    activateInteraction?: (key: string) => boolean
}

/** 交互动作总时长（秒），与 interacting 姿态 clip 时长一致 */
export const INTERACTION_DURATION = 0.9
/** 交互生效时刻（秒，动作进度 50%），在此触发实际效果 */
export const INTERACTION_ACTIVATE_TIME = 0.45
/** 候选交互最大距离（米），超出不显示提示 */
export const INTERACTION_MAX_DISTANCE = 2.4
/** 候选交互的最大镜头偏角余弦阈值（约 70°） */
export const INTERACTION_MAX_ANGLE_COS = 0.34
