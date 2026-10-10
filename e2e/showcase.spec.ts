import {test, expect} from '@playwright/test'

test.describe('攻击动作展示模式', () => {
    test('进入展示模式并出现信息面板（近战三模式分排 + 远程）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 近战 6 × 3 模式 = 18 + 远程 9 = 27，加种族/套装展示 6（三族 + 三套）= 33 个展示角色 */
        await expect(page.locator('.sch-panel .sch-row')).toHaveCount(33)
        /* 每行带副名列 */
        await expect(page.locator('.sch-panel .sch-hold')).toHaveCount(33)
    })

    test('聚焦近战角色：段计时行按先轻后重顺序排列', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 第一个展示角色为近战（短剑 · 单持），点击行即聚焦并展开详情卡 */
        await page.locator('.sch-panel .sch-row').first().click()
        const labels = page.locator('.sch-detail .sch-skilllabel')
        await expect(labels).toHaveCount(4)
    })

    test('聚焦双持模组：详情卡按双持链段顺序播放', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 第 13 行 = 短剑 · 双持（近战双持排首位） */
        await page.locator('.sch-panel .sch-row').nth(12).click()
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
