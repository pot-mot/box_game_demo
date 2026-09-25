import {test, expect, type Page} from '@playwright/test'

/**
 * 编辑模式执行面板的端到端契约：
 * - Execute 开始步进并记录基线快照；
 * - Stop 只停止步进，世界保持当前状态（**不还原**）；
 * - Reset 才把世界还原到基线。
 *
 * 世界状态的可观测通道：左侧元素列表行文本由 `formatRowText` 逐帧刷新，
 * 内含实体世界坐标（1 位小数），因此「箱子是否被还原」可在 DOM 上直接读出。
 */

/** 元素列表中的实体行 */
const elementRows = (page: Page) => page.locator('#element-list-panel [data-id]')
/** 执行面板按钮顺序：[Execute/Stop, Step, Run, Reset] */
const executeBtn = (page: Page) => page.locator('#execute-panel button').first()
const resetBtn = (page: Page) => page.locator('#execute-panel button').nth(3)

/** 读取首个实体行显示的世界坐标 */
const readFirstRowPosition = async (page: Page): Promise<[number, number, number]> => {
    const text = await elementRows(page).first().innerText()
    const matched = /\((-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\)/.exec(text)
    if (!matched) throw new Error(`无法从列表行解析坐标: ${text}`)
    return [Number(matched[1]), Number(matched[2]), Number(matched[3])]
}

const readFirstRowY = async (page: Page): Promise<number> => (await readFirstRowPosition(page))[1]

/** 进入编辑模式并等待执行面板就绪 */
const enterEditMode = async (page: Page): Promise<void> => {
    await page.goto('/')
    await page.waitForSelector('#startup-overlay', {timeout: 5000})
    await page.locator('button', {hasText: '编辑模式'}).click()
    await expect(executeBtn(page)).toHaveText('Execute')
}

test.describe('编辑模式执行面板', () => {
    test('Stop 只停止世界步进，Reset 才还原世界', async ({page}) => {
        await enterEditMode(page)

        /* 空世界：右键在指针处生成一个箱子，暂停态下它悬停在生成点 */
        await page.mouse.move(600, 400)
        await page.mouse.down({button: 'right'})
        await page.mouse.up({button: 'right'})
        await expect(elementRows(page)).toHaveCount(1)
        const spawnY = await readFirstRowY(page)

        /* Execute：世界开始步进，箱子在重力下离开生成点 */
        await executeBtn(page).click()
        await expect(executeBtn(page)).toHaveText('Stop')
        await page.waitForTimeout(900)

        /* Stop：只停止步进，世界保持当前状态并冻结（旧逻辑会立刻还原到生成点） */
        await executeBtn(page).click()
        await expect(executeBtn(page)).toHaveText('Execute')
        const stopY = await readFirstRowY(page)
        expect(Math.abs(stopY - spawnY)).toBeGreaterThan(0.2)
        await page.waitForTimeout(300)
        expect(await readFirstRowY(page)).toBeCloseTo(stopY, 2)

        /* 停止后可再次 Execute 从当前状态继续 */
        await executeBtn(page).click()
        await expect(executeBtn(page)).toHaveText('Stop')
        await executeBtn(page).click()
        await expect(executeBtn(page)).toHaveText('Execute')

        /* Reset：停止步进并把世界还原到初始状态 */
        await resetBtn(page).click()
        await expect.poll(async () => readFirstRowY(page)).toBeCloseTo(spawnY, 1)
        await expect(executeBtn(page)).toHaveText('Execute')
    })

    test('执行面板控件齐备且 Reset 可从执行态直接还原', async ({page}) => {
        await enterEditMode(page)

        const buttons = page.locator('#execute-panel button')
        await expect(buttons).toHaveCount(4)
        await expect(buttons.nth(1)).toHaveText('Step')

        await page.mouse.move(600, 400)
        await page.mouse.down({button: 'right'})
        await page.mouse.up({button: 'right'})
        await expect(elementRows(page)).toHaveCount(1)
        const spawnY = await readFirstRowY(page)

        /* 执行中直接 Reset：停止步进并还原 */
        await executeBtn(page).click()
        await expect(executeBtn(page)).toHaveText('Stop')
        await page.waitForTimeout(500)
        await resetBtn(page).click()

        await expect(executeBtn(page)).toHaveText('Execute')
        await expect.poll(async () => readFirstRowY(page)).toBeCloseTo(spawnY, 1)

        /* 还原后世界保持冻结：坐标不再自行变化 */
        const resetY = await readFirstRowY(page)
        await page.waitForTimeout(400)
        expect(await readFirstRowY(page)).toBeCloseTo(resetY, 2)
    })
})
