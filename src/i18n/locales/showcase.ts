/**
 * 展示模式文案域。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `showcaseZh`、英文表 `showcaseEn` 必须结构一致。
 */
export type ShowcaseLocale = {
    /* ── 主面板 ── */
    'showcase.title': string
    'showcase.subtitle': string
    'showcase.pause': string
    'showcase.resume': string
    'showcase.step': string
    'showcase.focus_none': string
    'showcase.unfocus': string
    'showcase.total_progress': string
    'showcase.timer.action': string
    'showcase.timer.recovery': string
    'showcase.timer.cooldown': string

    /* ── 角色状态（列表行） ── */
    'showcase.status.idle': string
    'showcase.status.charging': string
    'showcase.status.shooting': string
    'showcase.status.stand_walk': string
    'showcase.status.hit': (current: number, total: number) => string

    /* ── 聚焦详情卡 ── */
    'showcase.detail.status_idle': string
    'showcase.detail.status_charging': string
    'showcase.detail.combo': (current: number, total: number) => string
    'showcase.detail.ranged': string
    'showcase.detail.phase_none': string
    'showcase.detail.phase_charging': string
    'showcase.detail.phase_done': (percent: string) => string
    'showcase.detail.phase_running': (name: string, percent: string) => string
    'showcase.detail.link_none': string
    'showcase.detail.link_charging': string
    'showcase.detail.link': (link: string) => string

    /* ── 连段衔接方式（`LINK_LABELS`） ── */
    'showcase.link.first': string
    'showcase.link.advance': string
    'showcase.link.restart': string
    'showcase.link.none': string

    /* ── 头顶标签副名 ── */
    'showcase.weapon.melee_subtitle': (hold: string) => string
    'showcase.weapon.ranged': string
    'showcase.extra.race_limb': string
    'showcase.extra.armor_set': string

    /* ── 种族 / 套装展示名（`constants.ts` 的本地常量） ── */
    'showcase.race.skeleton': string
    'showcase.race.orc': string
    'showcase.race.elf': string
    'showcase.armor_set.iron': string
    'showcase.armor_set.mage': string
    'showcase.armor_set.wind': string
}

export const showcaseZh: ShowcaseLocale = {
    /* ── 主面板 ── */
    'showcase.title': '攻击动作展示台',
    'showcase.subtitle': '全武器攻击阶段动画 · 连段衔接时序复现',
    'showcase.pause': '⏸ 暂停',
    'showcase.resume': '▶ 继续',
    'showcase.step': '⏭ 单步',
    'showcase.focus_none': '聚焦：无',
    'showcase.unfocus': '取消聚焦',
    'showcase.total_progress': '攻击总进度',
    'showcase.timer.action': '动作',
    'showcase.timer.recovery': '恢复',
    'showcase.timer.cooldown': '冷却',

    /* ── 角色状态（列表行） ── */
    'showcase.status.idle': '待机',
    'showcase.status.charging': '蓄力',
    'showcase.status.shooting': '射击',
    'showcase.status.stand_walk': '站立/行走',
    'showcase.status.hit': (current, total) => `击${current}/${total}`,

    /* ── 聚焦详情卡 ── */
    'showcase.detail.status_idle': '状态：待机',
    'showcase.detail.status_charging': '状态：满蓄力前置',
    'showcase.detail.combo': (current, total) => `连段第 ${current}/${total} 击`,
    'showcase.detail.ranged': '远程射击序列',
    'showcase.detail.phase_none': '阶段：—',
    'showcase.detail.phase_charging': '阶段：满蓄力姿势定格',
    'showcase.detail.phase_done': (percent) => `阶段：收势(全部阶段完成) · ${percent}%`,
    'showcase.detail.phase_running': (name, percent) => `阶段：${name} · ${percent}%`,
    'showcase.detail.link_none': '衔接：—',
    'showcase.detail.link_charging': '衔接：蓄力 → 出招',
    'showcase.detail.link': (link) => `衔接：${link}`,

    /* ── 连段衔接方式（`LINK_LABELS`） ── */
    'showcase.link.first': '首次起手',
    'showcase.link.advance': '段内推进',
    'showcase.link.restart': '重新起手',
    'showcase.link.none': '—',

    /* ── 头顶标签副名 ── */
    'showcase.weapon.melee_subtitle': (hold) => `近战 · ${hold}`,
    'showcase.weapon.ranged': '远程武器',
    'showcase.extra.race_limb': '种族肢体',
    'showcase.extra.armor_set': '护甲套装',

    /* ── 种族 / 套装展示名（`constants.ts` 的本地常量） ── */
    'showcase.race.skeleton': '骷髅',
    'showcase.race.orc': '兽人',
    'showcase.race.elf': '精灵',
    'showcase.armor_set.iron': '铁甲套装',
    'showcase.armor_set.mage': '法袍套装',
    'showcase.armor_set.wind': '疾风皮甲',
}

export const showcaseEn: ShowcaseLocale = {
    /* ── Main panel ── */
    'showcase.title': 'Attack Showcase',
    'showcase.subtitle': 'All-weapon attack phase animation · combo timing reproduction',
    'showcase.pause': '⏸ Pause',
    'showcase.resume': '▶ Resume',
    'showcase.step': '⏭ Step',
    'showcase.focus_none': 'Focus: None',
    'showcase.unfocus': 'Unfocus',
    'showcase.total_progress': 'Total Attack Progress',
    'showcase.timer.action': 'Action',
    'showcase.timer.recovery': 'Recovery',
    'showcase.timer.cooldown': 'Cooldown',

    /* ── Actor status (list rows) ── */
    'showcase.status.idle': 'Idle',
    'showcase.status.charging': 'Charging',
    'showcase.status.shooting': 'Shooting',
    'showcase.status.stand_walk': 'Stand/Walk',
    'showcase.status.hit': (current, total) => `Hit ${current}/${total}`,

    /* ── Focus detail card ── */
    'showcase.detail.status_idle': 'Status: Idle',
    'showcase.detail.status_charging': 'Status: Full-charge stance',
    'showcase.detail.combo': (current, total) => `Combo hit ${current}/${total}`,
    'showcase.detail.ranged': 'Ranged fire sequence',
    'showcase.detail.phase_none': 'Phase: —',
    'showcase.detail.phase_charging': 'Phase: full-charge pose held',
    'showcase.detail.phase_done': (percent) => `Phase: settle (all phases done) · ${percent}%`,
    'showcase.detail.phase_running': (name, percent) => `Phase: ${name} · ${percent}%`,
    'showcase.detail.link_none': 'Link: —',
    'showcase.detail.link_charging': 'Link: charge → strike',
    'showcase.detail.link': (link) => `Link: ${link}`,

    /* ── Combo link modes (`LINK_LABELS`) ── */
    'showcase.link.first': 'First opener',
    'showcase.link.advance': 'Segment advance',
    'showcase.link.restart': 'Restart opener',
    'showcase.link.none': '—',

    /* ── Name label subtitle ── */
    'showcase.weapon.melee_subtitle': (hold) => `Melee · ${hold}`,
    'showcase.weapon.ranged': 'Ranged Weapon',
    'showcase.extra.race_limb': 'Race Limbs',
    'showcase.extra.armor_set': 'Armor Set',

    /* ── Race / armor-set display names (local constants in `constants.ts`) ── */
    'showcase.race.skeleton': 'Skeleton',
    'showcase.race.orc': 'Orc',
    'showcase.race.elf': 'Elf',
    'showcase.armor_set.iron': 'Iron Set',
    'showcase.armor_set.mage': 'Mage Robe Set',
    'showcase.armor_set.wind': 'Wind Leather',
}
