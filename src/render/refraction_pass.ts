import {type Scene, type PerspectiveCamera, type WebGLRenderer, type Mesh, ShaderMaterial, WebGLRenderTarget} from 'three'

export const setupRefractionPass = (
    scene: Scene,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
): (waterMeshes: Mesh[]) => void => {
    const backgroundRT = new WebGLRenderTarget(window.innerWidth, window.innerHeight)

    window.addEventListener('resize', () => {
        backgroundRT.setSize(window.innerWidth, window.innerHeight)
    })

    return (waterMeshes: Mesh[]) => {
        for (const m of waterMeshes) m.visible = false
        renderer.setRenderTarget(backgroundRT)
        renderer.render(scene, camera)

        for (const m of waterMeshes) {
            m.visible = true
            const mat = m.material as ShaderMaterial
            if (mat.uniforms.uRefractionTex) {
                mat.uniforms.uRefractionTex.value = backgroundRT.texture
                mat.uniforms.uViewportSize.value.set(window.innerWidth, window.innerHeight)
            }
        }
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
    }
}
