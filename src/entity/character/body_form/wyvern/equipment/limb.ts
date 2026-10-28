import type {LimbPieceConfig} from '../../../../../character/armor/types.ts'
import {WYVERN_LIMB_SET, creatureLimbPieceName, creatureLimbPresetId} from '../../../../../character/armor/creature_limbs.ts'

/**
 * 双足飞龙肢体：按槽位（翼爪 / 翼 / 头 / 躯干 / 腿 / 尾）提供
 * 白 / 黑 / 红 / 黄 / 紫 / 蓝六色鳞片替换件。
 * 每件只控制一个槽位的原始肢体模型材质，不改变整身配色。
 */
export const WYVERN_LIMB_PIECES: readonly LimbPieceConfig[] = WYVERN_LIMB_SET.palettes.flatMap(palette =>
    WYVERN_LIMB_SET.slots.map(slot => ({
        id: creatureLimbPresetId(WYVERN_LIMB_SET.formId, palette.key, slot.slot),
        name: creatureLimbPieceName(palette, slot),
        nameKey: palette.nameKey,
        slot: slot.slot,
        defense: {physical: 0, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        allowedBodyFormIds: [WYVERN_LIMB_SET.formId],
        mesh: {color: palette.color, accentColor: palette.accentColor},
        colliders: [],
        hurtBoxes: [],
    } satisfies LimbPieceConfig)),
)
