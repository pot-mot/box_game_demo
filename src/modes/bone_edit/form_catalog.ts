import type {SkeletonPreset} from '../../entity/skeleton/appearance.ts'
import {
    BODY_FORMS,
    BODY_FORM_IDS,
    HORSE_BODY_FORM_ID,
    HUMANOID_BODY_FORM,
    HUMANOID_BODY_FORM_ID,
    WOLF_BODY_FORM_ID,
    WYVERN_BODY_FORM_ID,
    type BodyForm,
} from '../../entity/character/body_form/index.ts'
import {createBodyFormSkeletonPreset} from '../../entity/character/skeleton/form_preset.ts'
import type {ScriptedMotion} from '../../entity/character/body_form/common/authoring/motion.ts'
import {HUMANOID_SCRIPT_MOTIONS} from '../../entity/character/body_form/humanoid/skeleton_animation/script_motions.ts'
import {WOLF_SCRIPT_MOTIONS} from '../../entity/character/body_form/wolf/skeleton_animation/script_motions.ts'
import {HORSE_SCRIPT_MOTIONS} from '../../entity/character/body_form/horse/skeleton_animation/script_motions.ts'
import {WYVERN_SCRIPT_MOTIONS} from '../../entity/character/body_form/wyvern/skeleton_animation/script_motions.ts'
import {getBuiltinClips, type BuiltinClipEntry} from './builtin_clips.ts'

/** 骨骼编辑器的一个体形配置：骨架预设 + 代码注册脚本 + 控件能力 */
export interface BoneEditFormProfile {
    readonly formId: string
    readonly form: BodyForm
    readonly preset: SkeletonPreset
    readonly motions: readonly ScriptedMotion[]
    /** 该体形的默认武器（切体形时自动同步） */
    readonly defaultWeaponId: string
    readonly supportsWeaponControl: boolean
    readonly supportsHandedness: boolean
    readonly builtinClips: () => readonly BuiltinClipEntry[]
}

const SCRIPT_MOTIONS: Readonly<Record<string, readonly ScriptedMotion[]>> = {
    [HUMANOID_BODY_FORM_ID]: HUMANOID_SCRIPT_MOTIONS,
    [WOLF_BODY_FORM_ID]: WOLF_SCRIPT_MOTIONS,
    [HORSE_BODY_FORM_ID]: HORSE_SCRIPT_MOTIONS,
    [WYVERN_BODY_FORM_ID]: WYVERN_SCRIPT_MOTIONS,
}

const profileOf = (form: BodyForm): BoneEditFormProfile => ({
    formId: form.id,
    form,
    preset: createBodyFormSkeletonPreset(form),
    motions: SCRIPT_MOTIONS[form.id] ?? [],
    defaultWeaponId: form.defaultWeaponId,
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
