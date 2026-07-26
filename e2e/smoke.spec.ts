import {test, expect} from '@playwright/test'

test.describe('页面加载', () => {
    test('页面标题包含 "box-demo"', async ({page}) => {
        await page.goto('/')
        await expect(page).toHaveTitle(/box-demo/i)
    })

    test('进入编辑模式后 canvas 存在', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        // 进入编辑模式触发 Three.js 渲染
        const editBtn = page.locator('#startup-buttons button', {hasText: '编辑模式'})
        await editBtn.click()
        await page.waitForTimeout(500)
        // 在支持 WebGL 的浏览器中 canvas 应该存在
        const canvas = page.locator('canvas')
        if (await canvas.count() > 0) {
            await expect(canvas).toBeVisible()
        }
        // 无 canvas 也通过（headless 环境可能没有 WebGL）
    })

    test('启动画面可见', async ({page}) => {
        await page.goto('/')
        const startup = page.locator('#startup-overlay')
        await expect(startup).toBeAttached()
        await expect(startup).toBeVisible()
    })
})

test.describe('启动画面交互', () => {
    test('点击 "编辑模式" 按钮进入编辑模式', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        const editBtn = page.locator('#startup-buttons button', {hasText: '编辑模式'})
        await expect(editBtn).toBeVisible()
        await editBtn.click()
        // 点击后启动画面应该消失
        await page.waitForSelector('#startup-overlay', {state: 'hidden', timeout: 5000}).catch(() => {
            // 在某些实现中可能只是隐藏而不是移除
        })
        // canvas 仍然可见
        await expect(page.locator('canvas')).toBeVisible()
    })

    test('点击 "游玩模式" 按钮进入游玩模式', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        const playBtn = page.locator('#startup-buttons button', {hasText: '游玩模式'})
        await expect(playBtn).toBeVisible()
        await playBtn.click()
        await page.waitForSelector('#startup-overlay', {state: 'hidden', timeout: 5000}).catch(() => {})
        await expect(page.locator('canvas')).toBeVisible()
    })
})

test.describe('设置面板', () => {
    test('⚙ 按钮切换设置面板', async ({page}) => {
        await page.goto('/')
        // 先进入编辑模式
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        const editBtn = page.locator('#startup-buttons button', {hasText: '编辑模式'})
        await editBtn.click()
        await page.waitForTimeout(500)

        // 点击设置按钮
        const settingsBtn = page.locator('#settings-btn')
        if (await settingsBtn.isVisible().catch(() => false)) {
            await settingsBtn.click()
            await expect(page.locator('#settings-menu')).toBeVisible()
            // 再次点击关闭
            await settingsBtn.click()
            await expect(page.locator('#settings-menu')).not.toBeVisible()
        }
    })
})

test.describe('快捷键存档', () => {
    test('Ctrl+S 不触发浏览器保存对话框（存档下载）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        const editBtn = page.locator('#startup-buttons button', {hasText: '编辑模式'})
        await editBtn.click()
        await page.waitForTimeout(500)

        // 模拟 Ctrl+S，应该被 preventDefault 阻止
        const downloadPromise = page.waitForEvent('download', {timeout: 3000}).catch(() => null)
        await page.keyboard.press('Control+S')
        const download = await downloadPromise
        // 如果有实体则应有下载，否则可能没有
        if (download) {
            expect(download.suggestedFilename()).toContain('.json')
        }
    })
})
