import type {LimbPieceConfig} from '../../../../../character/armor/types.ts'
import {WOLF_LIMB_SET, creatureLimbPieceName, creatureLimbPresetId} from '../../../../../character/armor/creature_limbs.ts'

/**
 * 狼肢体：按槽位（爪 / 头 / 躯干 / 腿 / 尾）提供蓝 / 红 / 白三色皮毛替换件。
 * 每件只控制一个槽位的原始肢体模型材质，不改变整身配色。
 */
export const WOLF_LIMB_PIECES: readonly LimbPieceConfig[] = WOLF_LIMB_SET.palettes.flatMap(palette =>
    WOLF_LIMB_SET.slots.map(slot => ({
        id: creatureLimbPresetId(WOLF_LIMB_SET.formId, palette.key, slot.slot),
        name: creatureLimbPieceName(palette, slot),
        nameKey: palette.nameKey,
        slot: slot.slot,
        defense: {physical: 0, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        allowedBodyFormIds: [WOLF_LIMB_SET.formId],
        mesh: {color: palette.color, accentColor: palette.accentColor},
        colliders: [],
        hurtBoxes: [],
    } satisfies LimbPieceConfig)),
)
