import {test, expect} from '@playwright/test'

test.describe('攻击动作展示模式', () => {
    test('进入展示模式并出现信息面板（近战三模式分排 + 远程）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 近战 6 武器 × 3 持握模式 = 18 + 远程 9 = 27 个展示角色 */
        await expect(page.locator('.sch-panel .sch-row')).toHaveCount(27)
        /* 每行带持握模式列；前 18 行为近战（按单持 → 双手共持 → 双持分排） */
        await expect(page.locator('.sch-panel .sch-hold')).toHaveCount(27)
        await expect(page.locator('.sch-panel .sch-hold').first()).toHaveText('单持')
        await expect(page.locator('.sch-panel .sch-hold').nth(6)).toHaveText('双手共持')
        await expect(page.locator('.sch-panel .sch-hold').nth(12)).toHaveText('双持')
        /* 远程行也显示其默认持握模式（长弓双手 / 飞镖单持） */
        await expect(page.locator('.sch-panel .sch-hold').nth(18)).toHaveText('双手共持')
        await expect(page.locator('.sch-panel .sch-hold').nth(26)).toHaveText('单持')
    })

    test('聚焦近战角色：段计时行按先轻后重顺序排列（轻击一段 轻击二段 重击一段 重击二段）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 第一个展示角色为近战（短剑 · 单持），点击行即聚焦并展开详情卡；行顺序 = 武器模组段展示顺序 */
        await page.locator('.sch-panel .sch-row').first().click()
        const labels = page.locator('.sch-detail .sch-skilllabel')
        await expect(labels).toHaveCount(4)
        await expect(labels).toHaveText(['轻击一段', '轻击二段', '重击一段', '重击二段'])
        /* 详情卡标题带持握模式 */
        await expect(page.locator('.sch-detail .sch-title')).toHaveText('短剑 · 单持')
    })

    test('聚焦双持模组：详情卡按双持链段顺序播放', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 第 13 行 = 短剑 · 双持（近战双持排首位） */
        await page.locator('.sch-panel .sch-row').nth(12).click()
        await expect(page.locator('.sch-detail .sch-title')).toHaveText('短剑 · 双持')
        await expect(page.locator('.sch-detail .sch-skilllabel')).toHaveCount(4)
    })

    test('经设置菜单返回主页面（启动屏重现）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        await page.locator('#settings-btn').click()
        await page.locator('#settings-menu div', {hasText: '返回主页面'}).click()
        await expect(page.locator('#startup-overlay')).toBeVisible()
    })
})
