/**
 * 主题令牌读取工具
 * 供 Canvas / 非 CSS 场景（如世界空间血条、Sprite 贴图）复用 theme.css 的 --dc-* 颜色，
 * 避免在绘制代码里硬编码颜色。CSS 令牌定义见 src/assets/theme.css。
 */

/** 读取 :root 上的主题令牌值（读取失败时回退 fallback） */
export const themeColor = (name: `--dc-${string}`, fallback: string): string => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value.length > 0 ? value : fallback
}
