/**
 * SpatialGrid — uniform grid spatial hash for fast radius-bounded proximity queries.
 * See docs/Game-Plan.md §29. Rebuilt fresh once per tick, not maintained incrementally.
 */
class SpatialGrid {
  static CELL_SIZE = 50;

  constructor(cellSize = SpatialGrid.CELL_SIZE) {
    this.cellSize = cellSize;
    this.cells = new Map(); // "cx,cy" -> array of inserted items
  }

  clear() {
    this.cells.clear();
  }

  cellKey(cx, cy) {
    return cx + ',' + cy;
  }

  insert(item, x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const key = this.cellKey(cx, cy);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(item);
  }

  // Every item in cells overlapping the square bounding box of the given circle.
  // Callers still need to check exact circular distance themselves — this only
  // narrows the candidate set, it doesn't filter by distance.
  queryRadius(x, y, radius) {
    const results = [];
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(this.cellKey(cx, cy));
        if (bucket) results.push(...bucket);
      }
    }

    return results;
  }
}
