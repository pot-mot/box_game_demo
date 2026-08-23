import {useCommandHistory, type CommandDefinition} from '@potmot/command-history'
import type {SkeletonDefinition} from '../../skeleton/anim/serialization.ts'
import type {ClipJSON} from '../../skeleton/anim/serialization.ts'

/** 编辑状态快照：聚焦骨架定义 + 全部动画（JSON-safe）+ 当前动画名 */
export interface EditorSnapshot {
    readonly skeleton: SkeletonDefinition
    readonly clips: readonly ClipJSON[]
    readonly currentClipName: string | undefined
}

/** 撤销/重做命令映射：统一快照命令。
 *  命令数据同时携带 before/after 快照：applyAction 应用 after、revertAction 应用 before，
 *  两者都原样返回自身参数 —— 满足 @potmot/command-history 的
 *  「revertAction 返回值作为下次 applyAction 参数」语义（redo 应用 after、再 undo 仍应用 before）。
 *  附加索引签名以满足 CustomCommandMap 约束 */
type SnapshotCommand = CommandDefinition<
    {before: EditorSnapshot; after: EditorSnapshot},
    {before: EditorSnapshot; after: EditorSnapshot}
>
type BoneEditCommandMap = {
    edit_state: SnapshotCommand
} & Record<string, CommandDefinition<unknown, unknown>>

/**
 * 撤销/重做（完整双栈，Ctrl+Z / Ctrl+Shift+Z）：
 * 基于 @potmot/command-history；编辑操作模式为
 * startEdit（操作前）→ 修改 → endEdit（操作后），状态变化时记录一条命令。
 * 每次撤销/重做整体应用快照（骨架重建 + 动画库恢复），简单可靠。
 */
export interface BoneEditHistory {
    startEdit: () => void
    endEdit: () => void
    undo: () => void
    redo: () => void
    canUndo: () => boolean
    canRedo: () => boolean
    clear: () => void
}

export const setupBoneEditHistory = (
    getState: () => EditorSnapshot,
    applyState: (state: EditorSnapshot) => void,
): BoneEditHistory => {
    const history = useCommandHistory<BoneEditCommandMap>()
    let pendingBefore: EditorSnapshot | undefined

    history.registerCommand('edit_state', {
        applyAction: ({before, after}) => {
            applyState(after)
            return {before, after}
        },
        revertAction: ({before, after}) => {
            applyState(before)
            return {before, after}
        },
    })

    const startEdit = (): void => {
        pendingBefore = getState()
    }

    const endEdit = (): void => {
        if (pendingBefore === undefined) return
        const after = getState()
        if (JSON.stringify(pendingBefore) !== JSON.stringify(after)) {
            history.pushCommand(
                'edit_state',
                {before: pendingBefore, after},
                {before: pendingBefore, after},
            )
        }
        pendingBefore = undefined
    }

    const undo = (): void => {
        if (history.canUndo()) history.undo()
    }

    const redo = (): void => {
        if (history.canRedo()) history.redo()
    }

    return {
        startEdit,
        endEdit,
        undo,
        redo,
        canUndo: () => history.canUndo(),
        canRedo: () => history.canRedo(),
        clear: () => history.clean(),
    }
}