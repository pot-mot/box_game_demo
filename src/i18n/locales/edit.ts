/**
 * 编辑模式文案域（执行面板）。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `editZh`、英文表 `editEn` 必须结构一致。
 */
export type EditLocale = {
    'edit.execute': string
    'edit.stop': string
    'edit.step': string
    'edit.run': string
    'edit.reset': string
    'edit.run_n': (n: string) => string
    'edit.title.execute_start': string
    'edit.title.execute_stop': string
    'edit.title.execute_pending': string
    'edit.title.step': string
    'edit.title.input': string
    'edit.title.run': string
    'edit.title.reset': string
    'edit.debug.title': string
    'edit.debug.collision': string
    'edit.debug.attack': string
    'edit.debug.hurt': string
    'edit.debug.detect': string
    'edit.debug.vision': string
}

export const editZh: EditLocale = {
    'edit.execute': '执行',
    'edit.stop': '停止',
    'edit.step': '单步',
    'edit.run': '运行',
    'edit.reset': '重置',
    'edit.run_n': (n) => `运行 (${n})`,
    'edit.title.execute_start': '开始步进世界（世界未步进时以当前编辑内容为还原点）',
    'edit.title.execute_stop': '停止世界步进（保留当前状态，再次执行从当前状态继续）',
    'edit.title.execute_pending': '步进排队中，暂不可切换执行',
    'edit.title.step': '单击推进一步 (1/60s)',
    'edit.title.input': '输入步数后点击右侧按钮执行',
    'edit.title.run': '按输入步数逐帧执行',
    'edit.title.reset': '停止步进并还原到初始状态（最近一次执行开始前）',
    'edit.debug.title': '显示控制',
    'edit.debug.collision': '碰撞箱',
    'edit.debug.attack': '攻击箱',
    'edit.debug.hurt': '受击箱',
    'edit.debug.detect': '攻击检测区',
    'edit.debug.vision': '视线扇形',
}

export const editEn: EditLocale = {
    'edit.execute': 'Execute',
    'edit.stop': 'Stop',
    'edit.step': 'Step',
    'edit.run': 'Run',
    'edit.reset': 'Reset',
    'edit.run_n': (n) => `Run (${n})`,
    'edit.title.execute_start': 'Start stepping the world (uses current edit state as restore point if not stepped)',
    'edit.title.execute_stop': 'Stop stepping (keeps current state; Execute resumes from here)',
    'edit.title.execute_pending': 'Steps queued; cannot toggle execution yet',
    'edit.title.step': 'Step forward one tick (1/60s)',
    'edit.title.input': 'Enter step count then click the button on the right',
    'edit.title.run': 'Run the entered number of steps frame by frame',
    'edit.title.reset': 'Stop and restore to the initial state (before the last Execute)',
    'edit.debug.title': 'Display',
    'edit.debug.collision': 'Collision',
    'edit.debug.attack': 'Attack',
    'edit.debug.hurt': 'Hurt',
    'edit.debug.detect': 'Attack Detect',
    'edit.debug.vision': 'Vision Fan',
}
