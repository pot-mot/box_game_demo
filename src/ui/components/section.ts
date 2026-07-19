export const createSection = (title: string): HTMLDivElement => {
    const div = document.createElement('div')
    div.style.cssText = 'border-top:1px solid #555;padding:4px 0'
    div.textContent = title
    return div
}
