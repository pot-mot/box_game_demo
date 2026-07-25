import {createTerrainPanel} from '../../fbm/ui/index.ts'
export {createTerrainPanel}

export const formatRowText = (t: any): string =>
    `#${t.id}  (${t.mesh.position.x.toFixed(1)}, ${t.mesh.position.z.toFixed(1)})  ${t.config.gridSize}×${t.config.gridSize}  h:${t.config.maxHeight}`
