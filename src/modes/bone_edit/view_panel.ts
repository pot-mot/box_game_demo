import type {SkeletonEntitiesContext, SkeletonViewSettings} from '../../entity/skeleton/world.ts'
import {localizeText} from '../../i18n/dom.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'
import {BONE_EDIT_LOCK_ID, BONE_SHOW_BONES_ID, BONE_SHOW_JOINTS_ID, BONE_SHOW_MODEL_ID} from './constants.ts'

/** 骨骼编辑器右侧常驻面板：节点编辑开关 + 三层显示控制 */
export interface BoneViewPanel {
    readonly element: HTMLElement
    readonly destroy: () => void
}

/** 创建一行「复选框 + 文案」 */
const createCheckRow = (
    id: string,
    labelKey: StringLocaleKey,
    checked: boolean,
    onChange: (checked: boolean) => void,
): HTMLLabelElement => {
    const row = document.createElement('label')
    row.className = 'dc-label'
    row.style.cssText = 'display:flex;align-items:center;gap:var(--dc-space-2);cursor:pointer'
    const input = document.createElement('input')
    input.id = id
    input.type = 'checkbox'
    input.className = 'dc-check'
    input.checked = checked
    const text = document.createElement('span')
    localizeText(text, labelKey)
    row.appendChild(input)
    row.appendChild(text)
    input.addEventListener('change', () => onChange(input.checked))
    return row
}

export const setupBoneViewPanel = (
    world: SkeletonEntitiesContext,
    timelineContainer: HTMLElement,
): BoneViewPanel => {
    const element = document.createElement('div')
    element.id = 'bone-view-panel'
    element.className = 'dc-panel dc-scroll'
    element.style.cssText = [
        'position:fixed',
        'top:calc(var(--dc-space-4) + 40px + var(--dc-space-2))',
        'right:var(--dc-space-4)',
        'z-index:150',
        'width:230px',
        'padding:var(--dc-space-3) var(--dc-space-4)',
        'max-height:calc(100vh - 96px)',
    ].join(';')
    document.body.appendChild(element)

    const title = document.createElement('div')
    title.className = 'dc-panel__title'
    localizeText(title, 'bone_edit.view.title')
    element.appendChild(title)

    const settings = world.getViewSettings()

    const syncDataset = (next: Readonly<SkeletonViewSettings>): void => {
        element.dataset.editEnabled = String(next.editEnabled)
        element.dataset.showJoints = String(next.showJoints)
        element.dataset.showBones = String(next.showBones)
        element.dataset.showModel = String(next.showModel)
    }

    element.appendChild(createCheckRow(
        BONE_EDIT_LOCK_ID,
        'bone_edit.view.edit_enabled',
        settings.editEnabled,
        checked => {
            world.setViewSettings({editEnabled: checked})
            syncDataset(world.getViewSettings())
        },
    ))
    element.appendChild(createCheckRow(
        BONE_SHOW_JOINTS_ID,
        'bone_edit.view.show_joints',
        settings.showJoints,
        checked => {
            world.setViewSettings({showJoints: checked})
            syncDataset(world.getViewSettings())
        },
    ))
    element.appendChild(createCheckRow(
        BONE_SHOW_BONES_ID,
        'bone_edit.view.show_bones',
        settings.showBones,
        checked => {
            world.setViewSettings({showBones: checked})
            syncDataset(world.getViewSettings())
        },
    ))
    element.appendChild(createCheckRow(
        BONE_SHOW_MODEL_ID,
        'bone_edit.view.show_model',
        settings.showModel,
        checked => {
            world.setViewSettings({showModel: checked})
            syncDataset(world.getViewSettings())
        },
    ))
    syncDataset(settings)

    /* 时间轴高度可拖拽：面板底边始终贴在其上方，避免被遮挡 */
    const syncBottom = (): void => {
        element.style.bottom = `${timelineContainer.getBoundingClientRect().height + 16}px`
    }
    const observer = new ResizeObserver(syncBottom)
    observer.observe(timelineContainer)
    syncBottom()

    return {
        element,
        destroy: () => {
            observer.disconnect()
            element.remove()
        },
    }
}
