import { describe, expect, it } from "vitest";

import {
  defaultNodeGraphCamera,
  layoutNodeGraph3D,
  panNodeGraphCamera,
  projectNodeGraph3D,
  rotateNodeGraphCamera,
  zoomNodeGraphCamera,
} from "../../src/core/node-graph-3d";
import { buildNodeGraphModel } from "../../src/core/node-graph-model";

const model = buildNodeGraphModel({
  id: "",
  children: [
    { id: "A", children: [{ id: "A/C", children: [] }] },
    { id: "B", children: [] },
  ],
});

describe("Node Graph 3D layout", () => {
  it("uses deterministic X/Y placement with Z reserved for structural depth", () => {
    const first = layoutNodeGraph3D(model);
    const second = layoutNodeGraph3D(model);
    expect(second).toEqual(first);
    const points = new Map(first.map((point) => [point.id, point]));
    expect(points.get("")?.z).toBe(0);
    expect(points.get("A")?.z).toBe(points.get("B")?.z);
    expect(points.get("A")?.z).toBeGreaterThan(0);
    expect(points.get("A/C")?.z).toBeGreaterThan(points.get("A")?.z ?? 0);
    expect(points.get("A")?.x).not.toBe(points.get("B")?.x);
  });

  it("projects stably and supports bounded rotate, pan, and zoom camera changes", () => {
    const points = layoutNodeGraph3D(model);
    const camera = defaultNodeGraphCamera();
    expect(projectNodeGraph3D(points, camera, 800, 600)).toEqual(projectNodeGraph3D(points, camera, 800, 600));
    const rotated = rotateNodeGraphCamera(camera, 20, 10);
    expect(rotated.yaw).not.toBe(camera.yaw);
    expect(rotated.pitch).not.toBe(camera.pitch);
    expect(panNodeGraphCamera(camera, 12, -8)).toMatchObject({ panX: 12, panY: -8 });
    expect(zoomNodeGraphCamera(camera, -500).zoom).toBeGreaterThan(camera.zoom);
    expect(zoomNodeGraphCamera(camera, 100000).zoom).toBe(0.2);
  });
});
