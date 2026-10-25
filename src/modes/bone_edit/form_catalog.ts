import type {SkeletonPreset} from '../../entity/skeleton/appearance.ts'
import {
    BODY_FORMS,
    BODY_FORM_IDS,
    HUMANOID_BODY_FORM,
    HUMANOID_BODY_FORM_ID,
    type BodyForm,
} from '../../entity/character/body_form/index.ts'
import {createBodyFormSkeletonPreset} from '../../entity/character/skeleton/form_preset.ts'
import {getBuiltinClips, type BuiltinClipEntry} from './builtin_clips.ts'

/** 骨骼编辑器的一个体形配置：骨架预设 + 控件能力 */
export interface BoneEditFormProfile {
    readonly formId: string
    readonly form: BodyForm
    readonly preset: SkeletonPreset
    /** 该体形的默认武器（切体形时自动同步） */
    readonly defaultWeaponId: string
    readonly supportsWeaponControl: boolean
    readonly supportsHandedness: boolean
    readonly builtinClips: () => readonly BuiltinClipEntry[]
}


const profileOf = (form: BodyForm): BoneEditFormProfile => ({
    formId: form.id,
    form,
    preset: createBodyFormSkeletonPreset(form),
    defaultWeaponId: Object.values(form.defaultWeaponLoadout)[0] ?? form.weapons[0]?.id ?? '',
    supportsWeaponControl: form.editor.weaponControl,
    supportsHandedness: form.editor.handedness,
    builtinClips: () => getBuiltinClips(form.id),
})

/** 骨骼编辑器全部可选体形（顺序 = 下拉顺序） */
export const BONE_EDIT_FORM_PROFILES: readonly BoneEditFormProfile[] =
    BODY_FORM_IDS.map(formId => profileOf(BODY_FORMS[formId] ?? HUMANOID_BODY_FORM))

export const DEFAULT_BONE_EDIT_FORM_ID = HUMANOID_BODY_FORM_ID

/** 按体形 id 取配置；未知 id 回退人形 */
export const boneEditFormProfileOf = (formId: string): BoneEditFormProfile =>
    BONE_EDIT_FORM_PROFILES.find(profile => profile.formId === formId)
    ?? BONE_EDIT_FORM_PROFILES[0]
    ?? profileOf(HUMANOID_BODY_FORM)
