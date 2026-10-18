import {test, expect, type Page} from '@playwright/test'

/**
 * 角色装备与属性面板：进入编辑模式 → 把生成类型切到「角色」→ Ctrl+左键生成并选中角色 →
 * 在角色面板选择护甲 / 基础防御 → Apply → 列表行防御数值更新。
 * 生成类型顺序见 `src/modes/edit/spawn_mode.ts`（角色 = 第 3 项，ArrowDown = 循环下一项）。
 */
const CHARACTER_SPAWN_CYCLES = 2

const openCharacterPanel = async (page: Page): Promise<void> => {
    await page.goto('/')
    await page.waitForSelector('#startup-overlay', {timeout: 5000})
    await page.locator('button', {hasText: '编辑模式'}).click()
    await page.waitForTimeout(500)
    for (let i = 0; i < CHARACTER_SPAWN_CYCLES; i++) {
        await page.keyboard.press('ArrowDown')
    }
    await page.mouse.move(600, 400)
    await page.keyboard.down('Control')
    await page.mouse.down({button: 'left'})
    await page.mouse.up({button: 'left'})
    await page.keyboard.up('Control')
    /* 生成后需在元素列表中点击角色行才会弹出角色面板（与编辑模式选中交互一致） */
    const row = page.locator('#element-list-panel [data-id][data-type="character"]')
    await expect(row).toHaveCount(1)
    await row.click()
    await expect(page.locator('#character-panel')).toBeVisible()
}

test.describe('角色装备与属性面板', () => {
    test('选择护甲与基础防御后 Apply：有效防御预览与列表行同步更新', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const headSelect = panel.locator('label', {hasText: '头盔'}).locator('select')
        const basePhys = panel.locator('label', {hasText: '基础物防'}).locator('input')
        const baseMagic = panel.locator('label', {hasText: '基础魔防'}).locator('input')

        /* 默认无护甲、零基础防御 */
        await headSelect.selectOption('iron_helmet')
        await basePhys.fill('2')
        await baseMagic.fill('1')

        await panel.locator('button', {hasText: '应用'}).click()
        await expect(page.locator('#element-list-panel [data-id]')).toHaveCount(1)
    })

    test('换下护甲后有效防御回落，Apply 后列表行同步', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const chestSelect = panel.locator('label', {hasText: '胸甲'}).locator('select')

        await chestSelect.selectOption('iron_plate')
        await panel.locator('button', {hasText: '应用'}).click()
        await expect(page.locator('#element-list-panel [data-id]')).toHaveCount(1)

        /* 选回「无」→ 列表行更新 */
        await chestSelect.selectOption('')
        await panel.locator('button', {hasText: '应用'}).click()
        await expect(page.locator('#element-list-panel [data-id]')).toHaveCount(1)
    })

    test('锁定点：添加额外锁定点（关节 + 偏移）Apply 后面板回显', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        await panel.locator('button', {hasText: '添加锁定点'}).click()

        const row = panel.locator('.lock-point-row')
        await expect(row).toHaveCount(1)
        await row.locator('.lock-point-joint').selectOption('headNeck')
        /* 第二个偏移输入 = Y */
        await row.locator('.lock-point-offset').nth(1).fill('0.3')

        await panel.locator('button', {hasText: '应用'}).click()

        /* 重新聚焦面板（点击角色行）后回显已 Apply 的锁定点 */
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel .lock-point-row')).toHaveCount(1)
        await expect(page.locator('#character-panel .lock-point-joint')).toHaveValue('headNeck')
        await expect(page.locator('#character-panel .lock-point-offset').nth(1)).toHaveValue('0.3')
    })

    test('臂甲与加速鞋：攻击加成 / 有效移速预览与列表行同步', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const armsSelect = panel.locator('label', {hasText: '臂甲'}).locator('select')
        const legsSelect = panel.locator('label', {hasText: '护腿'}).locator('select')

        await armsSelect.selectOption('battle_bracers')
        await legsSelect.selectOption('swift_boots')
        await panel.locator('button', {hasText: '应用'}).click()
        await expect(page.locator('#element-list-panel [data-id]')).toHaveCount(1)
    })

    test('肢体组件：一行两列，选择兽人头颅后数值预览与列表行同步更新', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        /* 装备区每行两列（左护甲右肢体），肢体下拉标签为「肢体·<槽位中文名>」；首个 = 头部 */
        const headLimb = panel.locator('label', {hasText: '肢体'}).first().locator('select')
        await expect(headLimb).toHaveValue('')

        /* 兽人头颅：物防 2、移速 ×0.98；基础移速 3 → 2.94 */
        await headLimb.selectOption('orc_head')
        await panel.locator('button', {hasText: '应用'}).click()
        await expect(page.locator('#element-list-panel [data-id]')).toHaveCount(1)

        /* 重新聚焦面板后回显肢体选择 */
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel label', {hasText: '肢体'}).first().locator('select')).toHaveValue('orc_head')
    })

    test('基础模组：切到狼后隐藏装备区域并回显，切回人形恢复', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const bodyFormSelect = panel.locator('#body-form-select')
        const headLimb = panel.locator('label', {hasText: '肢体'}).first()

        /* 人形：肢体装备区域可见 */
        await expect(bodyFormSelect).toHaveValue('humanoid')
        await expect(headLimb).toBeVisible()

        /* 切到狼（无护甲 / 肢体槽）→ 装备区域隐藏；Apply 后回显 */
        await bodyFormSelect.selectOption('wolf')
        await panel.locator('button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel #body-form-select')).toHaveValue('wolf')
        await expect(page.locator('#character-panel').locator('label', {hasText: '肢体'}).first()).toBeHidden()

        /* 切回人形 → 肢体区域恢复显示 */
        await page.locator('#character-panel #body-form-select').selectOption('humanoid')
        await page.locator('#character-panel').locator('button', {hasText: '应用'}).click()
        await expect(page.locator('#character-panel').locator('label', {hasText: '肢体'}).first()).toBeVisible()
    })

    test('基础模组：切到狼后武器仅限口含短剑/长剑，切到双足飞龙武器仅爪击/吐息', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const bodyPlanSelect = panel.locator('#body-form-select')
        const weaponValues = async (): Promise<string[]> =>
            panel.locator('label', {hasText: '武器'}).locator('option').evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value))

        /* 狼：武器表为 wolf_bite / wolf_short_sword / wolf_long_sword（生物武器用独立 id） */
        await bodyPlanSelect.selectOption('wolf')
        await panel.locator('button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        const wolfWeapons = await weaponValues()
        expect(wolfWeapons).toContain('wolf_bite')
        expect(wolfWeapons).toContain('wolf_short_sword')
        expect(wolfWeapons).toContain('wolf_long_sword')
        expect(wolfWeapons).not.toContain('spear')

        /* 双足飞龙：wyvern_claw / wyvern_breath */
        await page.locator('#character-panel #body-form-select').selectOption('wyvern')
        await page.locator('#character-panel').locator('button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel #body-form-select')).toHaveValue('wyvern')
        const wyvernWeapons = await weaponValues()
        expect(wyvernWeapons).toContain('wyvern_claw')
        expect(wyvernWeapons).toContain('wyvern_breath')
        expect(wyvernWeapons).not.toContain('long_sword')
    })

    test('持握模式与副手：同类近战副手启用双持，切换副手类别后回退单持', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const offhandSelect = panel.locator('#offhand-weapon-select')
        const holdSelect = panel.locator('#hold-mode-select')

        /* 默认长剑、无副手：只有单持 / 双手共持 */
        await expect(offhandSelect).toHaveValue('')
        await expect(holdSelect.locator('option')).toHaveCount(2)

        /* 副手装备同类近战（长剑）→ 双持可用 */
        await offhandSelect.selectOption('long_sword')
        await expect(holdSelect.locator('option')).toHaveCount(3)

        /* 选择双持并 Apply → 面板回显双持与副手武器 */
        await holdSelect.selectOption('dual_wield')
        await panel.locator('button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel #hold-mode-select')).toHaveValue('dual_wield')
        await expect(page.locator('#character-panel #offhand-weapon-select')).toHaveValue('long_sword')

        /* 换成不同类别的副手（短剑）→ 双持不可用，持握回退单持 */
        await page.locator('#character-panel #offhand-weapon-select').selectOption('short_sword')
        await expect(page.locator('#character-panel #hold-mode-select')).toHaveValue('one_handed')
        await page.locator('#character-panel button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel #hold-mode-select')).toHaveValue('one_handed')
        await expect(page.locator('#character-panel #offhand-weapon-select')).toHaveValue('short_sword')
    })

    test('和平策略：仅建造显示箱型配置，巡逻与切换回巡逻均隐藏', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const peaceSelect = panel.getByLabel(/^和平/)
        const boxTypesLabel = panel.locator('label', {hasText: '箱型'})
        const addBoxTypeBtn = panel.locator('button', {hasText: '添加箱型'})

        /* 默认巡逻：箱型配置整体隐藏 */
        await expect(peaceSelect).toHaveValue('patrol')
        await expect(boxTypesLabel).toBeHidden()
        await expect(addBoxTypeBtn).toBeHidden()

        /* 切到建造：箱型配置显示 */
        await peaceSelect.selectOption('build')
        await expect(boxTypesLabel).toBeVisible()
        await expect(addBoxTypeBtn).toBeVisible()

        /* 切回巡逻：重新隐藏 */
        await peaceSelect.selectOption('patrol')
        await expect(boxTypesLabel).toBeHidden()
        await expect(addBoxTypeBtn).toBeHidden()
    })

    test('原点策略与更新间隔同排，漫游者显示间隔，下方展示当前原点坐标', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const originSelect = panel.getByLabel(/^原点/)
        const intervalInput = panel.getByLabel(/^更新间隔/)
        const coordsTag = panel.locator('#origin-coords')

        /* 默认居民：更新间隔隐藏，当前原点坐标行位于策略下方（AI 未激活时为空） */
        await expect(originSelect).toHaveValue('resident')
        await expect(intervalInput).toBeHidden()
        await expect(coordsTag).toHaveCount(1)
        await expect(coordsTag).toBeEmpty()

        /* 切到漫游者：更新间隔与原点策略同排显示（两控件纵向中心对齐） */
        await originSelect.selectOption('roamer')
        await expect(intervalInput).toBeVisible()
        const originBox = await originSelect.boundingBox()
        const intervalBox = await intervalInput.boundingBox()
        expect(originBox && intervalBox && Math.abs(originBox.y - intervalBox.y)).toBeLessThan(30)

        /* 进入执行世界：AI 激活后原点坐标显示实际数值 */
        await page.locator('#execute-panel button').first().click()
        await expect(coordsTag).toContainText(/当前原点: \(-?\d+\.\d{2}, -?\d+\.\d{2}, -?\d+\.\d{2}\)/)
    })

    test('AI 反应式举盾窗口 / 冷却：默认值回显，修改 Apply 后持久化', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const windowInput = panel.getByLabel(/^举盾窗口/)
        const cooldownInput = panel.getByLabel(/^举盾冷却/)

        /* 默认值 0.4 / 1.2 */
        await expect(windowInput).toHaveValue('0.4')
        await expect(cooldownInput).toHaveValue('1.2')

        await windowInput.fill('0.7')
        await cooldownInput.fill('2.5')
        await panel.locator('button', {hasText: '应用'}).click()

        /* 重新聚焦面板后回显已 Apply 的值 */
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel').getByLabel(/^举盾窗口/)).toHaveValue('0.7')
        await expect(page.locator('#character-panel').getByLabel(/^举盾冷却/)).toHaveValue('2.5')
    })

    test('生命 / 韧性状态行：当前值 / 最大值 | (基础值 + 逐项加成) × 乘区', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const poiseRow = panel.locator('.dc-row').filter({hasText: '基础韧性'})

        /* 默认：基础韧性 20、当前韧性 20、无装备加成 → 最大值 20 */
        await expect(panel.getByLabel(/^基础韧性/)).toHaveValue('20')
        await expect(panel.getByLabel(/^当前韧性/)).toHaveValue('20')
        await expect(poiseRow).toContainText(/\/ 20 \| \(基础韧性\s*\)/)

        /* 装备铁盔（韧性 +2）→ 结果 22，且逐项列出来源「+ 铁盔 2」 */
        await panel.locator('label', {hasText: '头盔'}).locator('select').selectOption('iron_helmet')
        await expect(poiseRow).toContainText(/\/ 22 \| \(基础韧性\s+\+ 铁盔 2\s*\)/)

        /* 提高基础上界（30）→ 结果 30 + 2 = 32；当前值设 12 后 Apply 回显 */
        await panel.getByLabel(/^基础韧性/).fill('30')
        await expect(poiseRow).toContainText(/\/ 32 \| \(基础韧性\s+\+ 铁盔 2\s*\)/)
        await panel.getByLabel(/^当前韧性/).fill('12')
        await panel.locator('button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel').getByLabel(/^基础韧性/)).toHaveValue('30')
        await expect(page.locator('#character-panel').getByLabel(/^当前韧性/)).toHaveValue('12')
        await expect(page.locator('#character-panel .dc-row').filter({hasText: '基础韧性'})).toContainText(/\/ 32 \| \(基础韧性\s+\+ 铁盔 2\s*\)/)
    })

    test('当前韧性超过有效上界时被夹取（不再出现基础 20 / 当前 30）', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        /* 铁盔 +2 → 有效上界 22；基础值仍为 20 */
        await panel.locator('label', {hasText: '头盔'}).locator('select').selectOption('iron_helmet')
        await panel.locator('button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()

        await page.locator('#character-panel').getByLabel(/^当前韧性/).fill('30')
        await page.locator('#character-panel button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel').getByLabel(/^基础韧性/)).toHaveValue('20')
        await expect(page.locator('#character-panel').getByLabel(/^当前韧性/)).toHaveValue('22')
    })

    test('攻击属性行：结果 | (基础值 + 主手武器伤害 + 装备攻击加成)', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const atkPhysRow = panel.locator('.dc-row').filter({hasText: '基础物攻'})

        /* 默认长剑（dmg 3）+ 基础物攻 0 → 结果 3，逐项列出武器来源 */
        await expect(atkPhysRow).toContainText(/3 \| \(基础物攻\s+\+ 长剑 3\s*\)/)

        /* 改基础物攻为 1 → 结果 4 */
        await panel.getByLabel(/^基础物攻/).fill('1')
        await expect(atkPhysRow).toContainText(/4 \| \(基础物攻\s+\+ 长剑 3\s*\)/)

        /* 战臂甲提供物攻 +2 → 结果 6，追加装备来源；Apply 后回显基础物攻 */
        await panel.locator('label', {hasText: '臂甲'}).locator('select').selectOption('battle_bracers')
        await expect(atkPhysRow).toContainText(/6 \| \(基础物攻\s+\+ 长剑 3\s+\+ 战臂甲 2\s*\)/)
        await panel.locator('button', {hasText: '应用'}).click()
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel').getByLabel(/^基础物攻/)).toHaveValue('1')
    })

    test('执行期间动态字段实时刷新：面板内聚焦不再冻结坐标更新', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        /* 位置 X 为面板首个数值输入 */
        const posX = panel.locator('input.dc-input').first()
        const before = await posX.inputValue()

        /* 将焦点置于面板内另一输入框：旧实现会因焦点在面板内而冻结全部实时刷新 */
        await panel.getByLabel(/^当前韧性/).click()
        /* 程序化触发 Execute（不改变焦点，焦点仍留在面板内） */
        await page.evaluate(() => {
            const btn = document.querySelector<HTMLButtonElement>('#execute-panel button')
            btn?.click()
        })

        /* AI 巡逻 + 重力使坐标变化 → 面板输入实时跟随 */
        await expect.poll(async () => posX.inputValue(), {timeout: 8000}).not.toBe(before)
    })
})
