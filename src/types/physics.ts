import type { Mesh, Line } from 'three'
import type { Body } from 'cannon-es'

export interface BoxConfig {
  width: number
  height: number
  depth: number
  mass: number
  friction: number
}

export interface PhysicsBox {
  id: number
  mesh: Mesh
  body: Body
  config: BoxConfig
  wireframe: Line | null
}

export interface PhysicsContext {
  addBox: (config: BoxConfig, x: number, y: number, z: number) => PhysicsBox
  removeBox: (id: number) => void
  updateBox: (id: number, config: Partial<BoxConfig>) => void
  setBoxTransform: (id: number, pos: { x: number; y: number; z: number }, rotDeg: { x: number; y: number; z: number }) => void
  getBoxes: () => PhysicsBox[]
  getBoxMeshes: () => Mesh[]
  selectBox: (id: number | null) => PhysicsBox | null
  getSelected: () => PhysicsBox | null
  selectedId: number | null
}
