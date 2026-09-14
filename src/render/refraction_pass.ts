import {
    type Scene, type PerspectiveCamera, type WebGLRenderer, type Mesh, type Object3D,
    ShaderMaterial, WebGLRenderTarget,
} from 'three'

export const setupRefractionPass = (
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
): {
    /** 双 Pass 渲染（水方块折射） */
    renderFrame: (waterMeshes: Mesh[]) => void
    /** 注册不渲染进折射背景纹理的对象（如变换 Gizmo，避免水面上残影镜像） */
    excludeFromBackground: (obj: Object3D) => void
} => {
    const backgroundRT = new WebGLRenderTarget(window.innerWidth, window.innerHeight)
    /** 折射背景渲染时需临时隐藏的对象 */
    const excludedObjects: Object3D[] = []

    window.addEventListener('resize', () => {
        backgroundRT.setSize(window.innerWidth, window.innerHeight)
    })

    const renderFrame = (waterMeshes: Mesh[]): void => {
        for (const m of waterMeshes) m.visible = false
        /** 仅记录当前可见的排除对象（隐藏态对象无需恢复） */
        const shown = excludedObjects.filter(o => o.visible)
        for (const obj of shown) obj.visible = false
        renderer.setRenderTarget(backgroundRT)
        renderer.render(scene, camera)

        for (const m of waterMeshes) {
            m.visible = true
            if (!(m.material instanceof ShaderMaterial)) continue
            const mat = m.material
            if (mat.uniforms.uRefractionTex) {
                mat.uniforms.uRefractionTex.value = backgroundRT.texture
                mat.uniforms.uViewportSize.value.set(window.innerWidth, window.innerHeight)
            }
        }
        for (const obj of shown) obj.visible = true
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
    }

    const excludeFromBackground = (obj: Object3D): void => {
        excludedObjects.push(obj)
    }

    return {renderFrame, excludeFromBackground}
}
