import type {ArmorPieceConfig} from '../../../../../character/armor/types.ts'

/**
 * 护甲预设目录（初版数值待试玩调参）：
 * - 防御数值护栏 —— 四件满配逐类别固定减伤 ≤ 9（最小 1 点保底下轻武器仍有削血）；
 * - 攻击加成为稀有属性 —— 单件 ≤ 2，物理系由臂甲提供、法系由兜帽 / 护腕提供；
 * - 移速修正 —— 重甲（铁盔 / 铁胸甲 / 铁胫甲 / 战臂甲 / 鳞甲）减速，疾行靴 / 疾风靴加速，多件相乘。
 * - 顶替部位 —— 仅靴以 `hideBodyParts` 隐藏小腿（其余护甲保留身体部件、纯叠加覆盖，视觉效果更自然）。
 */
const ARMOR_PIECES: Record<string, ArmorPieceConfig> = {
    /* ── 头盔 ── */
    cloth_cap: {
        id: 'cloth_cap', name: '布帽', slot: 'head',
        defense: {physical: 0, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'cap', color: 0x8b7d5a, accentColor: 0x5f553c},
        colliders: [],
        hurtBoxes: [],
    },
    iron_helmet: {
        id: 'iron_helmet', name: '铁盔', slot: 'head',
        defense: {physical: 2, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.98, poise: 2,
        mesh: {id: 'helmet', color: 0x8a8f98, accentColor: 0x5a5f68},
        colliders: [],
        hurtBoxes: [],
    },
    /* 法师系头盔：除魔法防御外提供法术攻击力 */
    mage_hood: {
        id: 'mage_hood', name: '法师兜帽', slot: 'head',
        defense: {physical: 0, magic: 2},
        attack: {physical: 0, magic: 1},
        moveSpeedMultiplier: 1,
        mesh: {id: 'hood', color: 0x4455aa, accentColor: 0x2a3370},
        colliders: [],
        hurtBoxes: [],
    },

    /* ── 胸甲 ── */
    cloth_vest: {
        id: 'cloth_vest', name: '布衣', slot: 'chest',
        defense: {physical: 1, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'vest', color: 0x8b7d5a, accentColor: 0x5f553c},
        colliders: [],
        hurtBoxes: [],
    },
    leather_armor: {
        id: 'leather_armor', name: '皮甲', slot: 'chest',
        defense: {physical: 2, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'vest', color: 0x7a5230, accentColor: 0x4a3018, material: 'leather'},
        colliders: [],
        hurtBoxes: [],
    },
    iron_plate: {
        id: 'iron_plate', name: '铁胸甲', slot: 'chest',
        defense: {physical: 3, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.9, poise: 4,
        stamina: {drain: {sprinting: 1.15, flying: 1.1, blocking: 1.1}, regen: 0.9},
        mesh: {id: 'plate', color: 0x8a8f98, accentColor: 0x5a5f68},
        colliders: [],
        hurtBoxes: [],
    },
    mage_robe: {
        id: 'mage_robe', name: '法袍', slot: 'chest',
        defense: {physical: 0, magic: 3},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'robe', color: 0x4455aa, accentColor: 0x2a3370},
        colliders: [],
        hurtBoxes: [],
    },
    scale_mail: {
        id: 'scale_mail', name: '鳞甲', slot: 'chest',
        defense: {physical: 3, magic: 2},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.92, poise: 5,
        mesh: {id: 'plate', color: 0x6b7a5a, accentColor: 0x3f4a34, material: 'scale'},
        colliders: [],
        hurtBoxes: [],
    },

    /* ── 臂甲 ── */
    cloth_bracers: {
        id: 'cloth_bracers', name: '布护腕', slot: 'arms',
        defense: {physical: 0, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'bracer', color: 0x8b7d5a, accentColor: 0x5f553c, material: 'cloth'},
        colliders: [],
        hurtBoxes: [],
    },
    iron_bracers: {
        id: 'iron_bracers', name: '铁臂甲', slot: 'arms',
        defense: {physical: 2, magic: 0},
        attack: {physical: 1, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'bracer', color: 0x8a8f98, accentColor: 0x5a5f68},
        colliders: [],
        hurtBoxes: [],
    },
    battle_bracers: {
        id: 'battle_bracers', name: '战臂甲', slot: 'arms',
        defense: {physical: 1, magic: 1},
        attack: {physical: 2, magic: 0},
        moveSpeedMultiplier: 0.97, poise: 1,
        mesh: {id: 'bracer', color: 0x6a6f78, accentColor: 0xaa8833},
        colliders: [],
        hurtBoxes: [],
    },
    mage_wraps: {
        id: 'mage_wraps', name: '法印护腕', slot: 'arms',
        defense: {physical: 0, magic: 2},
        attack: {physical: 0, magic: 1},
        moveSpeedMultiplier: 1,
        mesh: {id: 'bracer', color: 0x4455aa, accentColor: 0x2a3370, material: 'cloth'},
        colliders: [],
        hurtBoxes: [],
    },

    /* ── 护腿 ── */
    cloth_pants: {
        id: 'cloth_pants', name: '布裤', slot: 'legs',
        defense: {physical: 1, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'legwrap', color: 0x8b7d5a, accentColor: 0x5f553c},
        colliders: [],
        hurtBoxes: [],
    },
    iron_greaves: {
        id: 'iron_greaves', name: '铁胫甲', slot: 'legs',
        defense: {physical: 2, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.95, poise: 2,
        mesh: {id: 'greaves', color: 0x8a8f98, accentColor: 0x5a5f68},
        colliders: [],
        hurtBoxes: [],
    },
    mage_leggings: {
        id: 'mage_leggings', name: '法师护腿', slot: 'legs',
        defense: {physical: 0, magic: 2},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'legwrap', color: 0x4455aa, accentColor: 0x2a3370},
        colliders: [],
        hurtBoxes: [],
    },
    /* 加速鞋类：占护腿槽位换取移速（无防御收益） */
    swift_boots: {
        id: 'swift_boots', name: '疾行靴', slot: 'legs',
        defense: {physical: 0, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1.15,
        stamina: {drain: {sprinting: 0.75}, regen: 1.1},
        mesh: {id: 'boots', color: 0x9a7b4f, accentColor: 0xd9c08a, hideBodyParts: ['rightShin', 'leftShin']},
        colliders: [],
        hurtBoxes: [],
    },
    wind_boots: {
        id: 'wind_boots', name: '疾风靴', slot: 'legs',
        defense: {physical: 0, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1.25,
        stamina: {drain: {sprinting: 0.85, flying: 0.6}, regen: 1.15},
        mesh: {id: 'boots', color: 0x3f8f8f, accentColor: 0xcfe8e8, hideBodyParts: ['rightShin', 'leftShin']},
        colliders: [],
        hurtBoxes: [],
    },

    /* ── 皮甲套（补全头 / 臂 / 腿；胸甲为 leather_armor） ── */
    leather_cap: {
        id: 'leather_cap', name: '皮帽', slot: 'head',
        defense: {physical: 1, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'cap', color: 0x7a5230, accentColor: 0x4a3018, material: 'leather'},
        colliders: [],
        hurtBoxes: [],
    },
    leather_bracers: {
        id: 'leather_bracers', name: '皮护腕', slot: 'arms',
        defense: {physical: 1, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'bracer', color: 0x7a5230, accentColor: 0x4a3018, material: 'leather'},
        colliders: [],
        hurtBoxes: [],
    },
    leather_legs: {
        id: 'leather_legs', name: '皮护腿', slot: 'legs',
        defense: {physical: 1, magic: 0},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 1,
        mesh: {id: 'legwrap', color: 0x7a5230, accentColor: 0x4a3018, material: 'leather'},
        colliders: [],
        hurtBoxes: [],
    },

    /* ── 鳞甲套（补全头 / 臂 / 腿；胸甲为 scale_mail） ── */
    scale_helm: {
        id: 'scale_helm', name: '鳞盔', slot: 'head',
        defense: {physical: 2, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.98, poise: 1,
        mesh: {id: 'helmet', color: 0x6b7a5a, accentColor: 0x3f4a34, material: 'scale'},
        colliders: [],
        hurtBoxes: [],
    },
    scale_bracers: {
        id: 'scale_bracers', name: '鳞护腕', slot: 'arms',
        defense: {physical: 1, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.97,
        mesh: {id: 'bracer', color: 0x6b7a5a, accentColor: 0x3f4a34, material: 'scale'},
        colliders: [],
        hurtBoxes: [],
    },
    scale_legs: {
        id: 'scale_legs', name: '鳞护腿', slot: 'legs',
        defense: {physical: 2, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.96, poise: 2,
        mesh: {id: 'greaves', color: 0x6b7a5a, accentColor: 0x3f4a34, material: 'scale'},
        colliders: [],
        hurtBoxes: [],
    },

    /* ── 石甲套（全新四件套，最厚最重） ── */
    stone_helm: {
        id: 'stone_helm', name: '石盔', slot: 'head',
        defense: {physical: 2, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.95, poise: 2,
        mesh: {id: 'helmet', color: 0x8a8a86, accentColor: 0x5f5f5c, material: 'stone'},
        colliders: [],
        hurtBoxes: [],
    },
    stone_plate: {
        id: 'stone_plate', name: '石胸甲', slot: 'chest',
        defense: {physical: 3, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.9, poise: 4,
        stamina: {drain: {sprinting: 1.25, flying: 1.2, blocking: 1.2}, regen: 0.8},
        mesh: {id: 'plate', color: 0x8a8a86, accentColor: 0x5f5f5c, material: 'stone'},
        colliders: [],
        hurtBoxes: [],
    },
    stone_bracers: {
        id: 'stone_bracers', name: '石护腕', slot: 'arms',
        defense: {physical: 1, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.95, poise: 1,
        mesh: {id: 'bracer', color: 0x8a8a86, accentColor: 0x5f5f5c, material: 'stone'},
        colliders: [],
        hurtBoxes: [],
    },
    stone_legs: {
        id: 'stone_legs', name: '石护腿', slot: 'legs',
        defense: {physical: 2, magic: 1},
        attack: {physical: 0, magic: 0},
        moveSpeedMultiplier: 0.94, poise: 2,
        mesh: {id: 'greaves', color: 0x8a8a86, accentColor: 0x5f5f5c, material: 'stone'},
        colliders: [],
        hurtBoxes: [],
    },
}

/** 人形护甲预设（护甲数据随体形分包拥有；`character/armor/` 只保留跨体形目录与汇总） */
export const HUMANOID_ARMOR_PIECES: readonly ArmorPieceConfig[] = Object.values(ARMOR_PIECES)
    .map(piece => ({...piece, allowedBodyFormIds: ['humanoid']}))
