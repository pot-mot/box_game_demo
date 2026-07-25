import {test, expect} from '@playwright/test'

test('page loads and shows Three.js canvas', async ({page}) => {
    await page.goto('/')
    const canvas = page.locator('canvas')
    await expect(canvas).toBeAttached({timeout: 10000})
})

test('page has correct title', async ({page}) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/box/i)
})
