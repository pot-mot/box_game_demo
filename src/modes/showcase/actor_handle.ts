import type {Group} from 'three'
import type {NameLabel} from './label.ts'
import type {ActorStatus} from './actor.ts'

/**
 * 展示角色驱动器通用接口：武器攻击展示（`actor.ts`）与种族 / 套装展示（`race_actor.ts`）
 * 都实现它，使 index.ts 可用统一的聚焦 / 变暗 / 标签 / 释放逻辑管理全部展示角色。
 */
export interface ShowcaseActorHandle {
    readonly id: number
    readonly anchor: Group
    /** 面板名称行（武器中文名 / 种族名 / 套装名） */
    readonly weaponName: string
    /** 面板副名列（持握模式 / 种族 / 装备类别；无则空字符串） */
    readonly holdModeLabel: string
    /** 阵营数值（面板色点取该阵营调色板主色） */
    readonly factionColor: number
    /** 推进一帧 */
    update: (dt: number) => void
    /** 攻击状态快照（仅武器攻击角色提供；种族 / 套装展示角色为 undefined） */
    readonly status?: () => ActorStatus
    /** 挂载头顶名称标签（label 资源句柄由本驱动器持有，随 dispose 统一回收） */
    attachLabel: (label: NameLabel) => void
    /** 聚焦模式下变暗/恢复（遍历材质透明度，含武器、标签与刀光） */
    setDimmed: (on: boolean) => void
    dispose: () => void
}
