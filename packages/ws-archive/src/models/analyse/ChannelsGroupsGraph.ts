import * as d3 from "d3";
import RBush from "rbush";
import type { ChannelsGroups } from "./ChannelsGroups.js";

class GroupsRIndex<T = unknown> extends RBush<d3.HierarchyCircularNode<T>> {
  searchInBox([[x0, y0], [x1, y1]]: [[number, number], [number, number]]) {
    const items = super.search({
      minX: x0,
      minY: y0,
      maxX: x1,
      maxY: y1,
    }) as d3.HierarchyCircularNode<T>[];
    return items.sort((a, b) => b.r - a.r);
  }

  indexAll(hierarchy: d3.HierarchyCircularNode<T>) {
    for (const node of hierarchy.descendants()) {
      super.insert(node);
    }
  }
  toBBox({ x, y, r }: d3.HierarchyCircularNode<T>) {
    return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
  }
  compareMinX(a: d3.HierarchyCircularNode<T>, b: d3.HierarchyCircularNode<T>) {
    return a.x - a.r - (b.x - b.r);
  }
  compareMinY(a: d3.HierarchyCircularNode<T>, b: d3.HierarchyCircularNode<T>) {
    return a.y - a.r - (b.y - b.r);
  }
}

export class ChannelsGroupsGraph {
  groups: ChannelsGroups;
  size: [number, number] = [1, 1];
  padding = 0.005;
  root: d3.HierarchyCircularNode<number> = null!;
  protected promise: Promise<d3.HierarchyCircularNode<number>>;
  rindex = new GroupsRIndex<number>();

  static async build(groups: ChannelsGroups): Promise<ChannelsGroupsGraph> {
    const graph = new ChannelsGroupsGraph(groups);
    await graph.promise;
    return graph;
  }

  protected constructor(groups: ChannelsGroups) {
    this.groups = groups;
    this.promise = this.buildGraph();
    this.promise.then((root) => {
      this.root = root;
      this.rindex.indexAll(root);
    });
  }

  searchInBox(bbox: [[number, number], [number, number]]) {
    return this.rindex.searchInBox(bbox);
  }

  searchByPosition(pos: [number, number], radius: number) {
    const result =
      this.rindex.searchInBox([
        [pos[0] - radius, pos[1] - radius],
        [pos[0] + radius, pos[1] + radius],
      ]) ?? [];
    return result.filter(({ x, y, r }) => {
      const dx = x - pos[0];
      const dy = y - pos[1];
      return Math.sqrt(dx * dx + dy * dy) - r <= radius;
    });
  }

  async buildGraph(): Promise<d3.HierarchyCircularNode<number>> {
    const index: Record<number, boolean> = {};
    const tree = this.groups.tree;
    const graphNodesTree = d3
      .hierarchy(tree.rootId, (id) => {
        if (index[id]) {
          return;
        }
        index[id] = true;
        return tree.getChildrenIds(id);
      })
      .sum((d) => 1)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const pack = d3.pack<number>().size(this.size).padding(this.padding);
    const root = pack(graphNodesTree);
    return root;
  }

  getScales(width: number, height: number) {
    return getRescaleFunctions({ hierarchy: this.root, width, height });
  }
}

function getExtent<T>(datum: Iterable<T>, accessor: (d: T) => number) {
  return d3.extent(datum, accessor) as [number, number];
}
function getRescaleFunctions<T>({
  hierarchy,
  width,
  height,
}: {
  hierarchy: d3.HierarchyCircularNode<T>;
  width: number;
  height: number;
}) {
  const box = {
    left: 0,
    right: width,
    top: 0,
    bottom: height,
  };
  const R = Math.min(width, height) / 2;
  const xExtent = getExtent(hierarchy, (d) => d.x);
  const yExtent = getExtent(hierarchy, (d) => d.y);
  const rExtent = getExtent(hierarchy, (d) => d.r);
  const rMax = rExtent[1];
  const center = [(xExtent[0] + xExtent[1]) / 2, (yExtent[0] + yExtent[1]) / 2];
  const getX = d3.scaleLinear(
    [center[0] - rMax, center[0] + rMax],
    [(box.left + box.right) / 2 - R, (box.left + box.right) / 2 + R],
  );
  const getY = d3.scaleLinear(
    [center[1] - rMax, center[1] + rMax],
    [(box.top + box.bottom) / 2 - R, (box.top + box.bottom) / 2 + R],
  );
  const rescale = d3.scaleLinear([0, rMax], [0, R]).clamp(false);
  return [getX, getY, rescale];
}
