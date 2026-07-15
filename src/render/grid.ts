import {Scene, PerspectiveCamera, PlaneGeometry, ShaderMaterial, Mesh, Color, DoubleSide} from 'three'
import {
    GRID_CELL_SIZE, GRID_RADIUS, GRID_PLANE_SIZE, GRID_COLOR, GRID_CENTER_COLOR,
} from './constants.ts'

const vertexShader = `
varying vec3 vWorldPos;
varying vec2 vLocalPos;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vLocalPos = position.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

const fragmentShader = `
uniform float uCellSize;
uniform float uLineHalfWidth;
uniform float uRadius;
uniform vec3 uLineColor;
uniform vec3 uCenterColor;

varying vec3 vWorldPos;
varying vec2 vLocalPos;

void main() {
    vec2 pos = vWorldPos.xz;
    vec2 abspos = abs(pos);

    // --- Grid lines (fixed world-space width + screen-space AA) ---
    vec2 gridFrac = fract(pos / uCellSize);
    vec2 distToLine = min(gridFrac, 1.0 - gridFrac) * uCellSize; // world units
    vec2 aa = fwidth(pos) * 0.5; // half-pixel in world units

    float gridX = 1.0 - smoothstep(uLineHalfWidth - aa.x, uLineHalfWidth + aa.x, distToLine.x);
    float gridZ = 1.0 - smoothstep(uLineHalfWidth - aa.y, uLineHalfWidth + aa.y, distToLine.y);
    float grid = max(gridX, gridZ);

    // --- Center axes (world X=0, Z=0, thicker & brighter) ---
    vec2 axisAa = fwidth(pos) * 0.5;
    float axisHalfWidth = uLineHalfWidth * 3.0;
    float centerX = 1.0 - smoothstep(axisHalfWidth - axisAa.x, axisHalfWidth + axisAa.x, abspos.x);
    float centerZ = 1.0 - smoothstep(axisHalfWidth - axisAa.y, axisHalfWidth + axisAa.y, abspos.y);
    float centerLine = max(centerX, centerZ);

    // --- Distance fade (camera-centered radius) ---
    float dist = length(vLocalPos);
    float fade = 1.0 - smoothstep(uRadius * 0.5, uRadius, dist);

    // --- Blend ---
    float alpha = max(grid * 0.5, centerLine) * fade;
    vec3 color = mix(uLineColor, uCenterColor, centerLine);

    gl_FragColor = vec4(color, alpha);
}
`

export const setupInfiniteGrid = (scene: Scene, camera: PerspectiveCamera): () => void => {
    const geo = new PlaneGeometry(GRID_PLANE_SIZE, GRID_PLANE_SIZE)
    geo.rotateX(-Math.PI / 2)

    const mat = new ShaderMaterial({
        uniforms: {
            uCellSize: {value: GRID_CELL_SIZE},
            uLineHalfWidth: {value: 0.02},
            uRadius: {value: GRID_RADIUS},
            uLineColor: {value: new Color(GRID_COLOR)},
            uCenterColor: {value: new Color(GRID_CENTER_COLOR)},
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
    })

    const mesh = new Mesh(geo, mat)
    mesh.position.y = 0
    scene.add(mesh)

    return () => {
        mesh.position.x = camera.position.x
        mesh.position.z = camera.position.z
    }
}
