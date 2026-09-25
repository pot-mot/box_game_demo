import {test, expect} from '@playwright/test'

test.describe('攻击动作展示模式', () => {
    test('进入展示模式并出现信息面板', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 近战 6 + 远程 9 = 15 个展示角色 */
        await expect(page.locator('.sch-panel .sch-row')).toHaveCount(15)
    })

    test('聚焦近战角色：段计时行按先轻后重顺序排列（轻击一段 轻击二段 重击一段 重击二段）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 第一个展示角色为近战（短剑），点击行即聚焦并展开详情卡；行顺序 = 武器模组段展示顺序 */
        await page.locator('.sch-panel .sch-row').first().click()
        const labels = page.locator('.sch-detail .sch-skilllabel')
        await expect(labels).toHaveCount(4)
        await expect(labels).toHaveText(['轻击一段', '轻击二段', '重击一段', '重击二段'])
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
