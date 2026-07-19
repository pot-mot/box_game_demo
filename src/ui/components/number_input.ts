const DEFAULT_STEP = '0.01'

export const createNumberInput = (attrs: Record<string, string>): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'number'
    input.step = attrs.step ?? DEFAULT_STEP
    if (attrs.min !== undefined) input.min = attrs.min
    if (attrs.max !== undefined) input.max = attrs.max
    if (attrs.value !== undefined) input.value = attrs.value
    if (attrs.style) input.style.cssText = attrs.style
    input.addEventListener('change', () => {
        const val = parseFloat(input.value)
        if (isNaN(val)) return
        if (attrs.min !== undefined && val < parseFloat(attrs.min)) input.value = attrs.min
        if (attrs.max !== undefined && val > parseFloat(attrs.max)) input.value = attrs.max
    })
    return input
}

export const createLabeledNumberInput = (parent: HTMLElement, label: string, attrs: Record<string, string> = {}): HTMLInputElement => {
    const input = createNumberInput(attrs)
    const labelEl = document.createElement('label')
    labelEl.textContent = label + ' '
    labelEl.appendChild(input)
    parent.appendChild(labelEl)
    return input
}
