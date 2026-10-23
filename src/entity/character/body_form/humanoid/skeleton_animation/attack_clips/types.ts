/** 作者格式：关节局部 XYZ 欧拉角（弧度） */
export type AuthoredEuler = readonly [number, number, number]

export interface AuthoredAttackEvent {
    readonly time: number
    readonly name: 'hitbox_on' | 'hitbox_off'
    /** 命中窗口归属槽位键（`kind:bodyPart`，如 `weapon:main_hand` / `weapon:off_hand`） */
    readonly slotKey?: string
}

/** 攻击段作者数据：clip 级时间栅格 + 每关节欧拉角列 + 可选位置覆盖 + 事件 */
export interface AuthoredAttackClip {
    readonly duration: number
    readonly loop?: boolean
    readonly times: readonly number[]
    readonly joints: Readonly<Record<string, readonly AuthoredEuler[]>>
    readonly positions?: Readonly<Record<string, readonly (readonly [number, number, number])[]>>
    readonly events?: readonly AuthoredAttackEvent[]
}
