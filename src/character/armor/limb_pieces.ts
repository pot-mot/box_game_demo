import type {LimbPieceConfig} from './types.ts'

/**
 * 肢体组件预设目录（骷髅 / 兽人 / 精灵 × 四槽位）：
 * - 复用护甲数值机制：逐类别防御、逐类别攻击加成、移速乘数，与护甲同一汇总口径；
 * - **默认 replace**：装备肢体即顶替对应槽位的人类肢体（空 / undefined / null 保留人类肢体）；
 * - 颜色随阵营：种族主色由配方声明，披挂 / 束带 / 发色取自角色阵营调色板（换阵营重着色）。
 * - 数值护栏：单件逐类别防御 ≤ 2、攻击加成 ≤ 1，避免与护甲叠加后过度膨胀。
 * - 种族倾向：骷髅法抗敏捷、兽人物防物攻厚重、精灵均衡魔攻灵动。
 */
export const LIMB_PRESETS: Record<string, LimbPieceConfig> = {
    /* ── 骷髅（骨白主色 / 法抗 · 敏捷） ── */
    skeleton_head: {
        id: 'skeleton_head', name: '骷髅头颅', slot: 'head',
        defense: {physical: 0, magic: 1},
        attack: {physical: 0, magic: 1},
        moveSpeedMultiplier: 1,
        mesh: {race: 'skeleton', color: 0xe6e2d3, accentColor: 0x8a8578},
    },
    skeleton_arms: {
        id: 'skeleton_arms', name: '骷髅臂骨', slot: 'arms',
        defense: {physical: 0, magic: 1},
        attack: {physical: 0, magic: 1},
        moveSpeedMultiplier: 1.02,
        mesh: {race: 'skeleton', color: 0xe6e2d3, accentColor: 0x8a8578},
    },
    skeleton_body: {
        id: 'skeleton_body', name: '骷髅躯干', slot: 'body',
        defense: {physical: 1, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {race: 'skeleton', color: 0xe6e2d3, accentColor: 0x8a8578},
    },
    skeleton_legs: {
        id: 'skeleton_legs', name: '骷髅腿骨', slot: 'legs',
        defense: {physical: 0, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1.05,
        mesh: {race: 'skeleton', color: 0xe6e2d3, accentColor: 0x8a8578},
    },

    /* ── 兽人（绿皮主色 / 物防 · 物攻厚重） ── */
    orc_head: {
        id: 'orc_head', name: '兽人头颅', slot: 'head',
        defense: {physical: 2, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.98,
        mesh: {race: 'orc', color: 0x6f9a4a, accentColor: 0x35502a},
    },
    orc_arms: {
        id: 'orc_arms', name: '兽人臂膀', slot: 'arms',
        defense: {physical: 1, magic: 0},
        attack: {physical: 1, magic: 0},
        moveSpeedMultiplier: 0.97,
        mesh: {race: 'orc', color: 0x6f9a4a, accentColor: 0x35502a},
    },
    orc_body: {
        id: 'orc_body', name: '兽人躯干', slot: 'body',
        defense: {physical: 2, magic: 0},
        attack: {physical: 1, magic: 0},
        moveSpeedMultiplier: 0.95,
        mesh: {race: 'orc', color: 0x6f9a4a, accentColor: 0x35502a},
    },
    orc_legs: {
        id: 'orc_legs', name: '兽人腿脚', slot: 'legs',
        defense: {physical: 1, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.96,
        mesh: {race: 'orc', color: 0x6f9a4a, accentColor: 0x35502a},
    },

    /* ── 精灵（苍白皮主色 / 均衡魔攻 · 灵动） ── */
    elf_head: {
        id: 'elf_head', name: '精灵头颅', slot: 'head',
        defense: {physical: 0, magic: 1},
        attack: {physical: 0, magic: 1},
        moveSpeedMultiplier: 1.02,
        mesh: {race: 'elf', color: 0xe8d3b0, accentColor: 0x8fbf6f},
    },
    elf_arms: {
        id: 'elf_arms', name: '精灵手臂', slot: 'arms',
        defense: {physical: 1, magic: 0},
        attack: {physical: 0, magic: 1},
        moveSpeedMultiplier: 1,
        mesh: {race: 'elf', color: 0xe8d3b0, accentColor: 0x8fbf6f},
    },
    elf_body: {
        id: 'elf_body', name: '精灵身躯', slot: 'body',
        defense: {physical: 1, magic: 2},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {race: 'elf', color: 0xe8d3b0, accentColor: 0x8fbf6f},
    },
    elf_legs: {
        id: 'elf_legs', name: '精灵腿脚', slot: 'legs',
        defense: {physical: 0, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1.08,
        mesh: {race: 'elf', color: 0xe8d3b0, accentColor: 0x8fbf6f},
    },
}
