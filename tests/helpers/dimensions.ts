/** Dimension matrix retained for geometry regressions; not preview UI. */
export const dimensionValues = {
  lineWidth: [1, 2, 4],
  laneWidth: [12, 16, 22, 24],
  rowHeight: [24, 28, 32, 36, 40],
  nodeRadius: [2, 4, 6, 8],
  cornerRadius: [0, 2, 4, 6, 8, 12, 24],
} as const;
export const regressionPadding = 16;
export function fitsDimensions(node: number, stroke: number, lane: number, row: number): boolean {
  return node + stroke + 3 <= regressionPadding && (node + stroke + 3) * 2 <= row && node * 2 + stroke <= lane;
}
export function regressionDimensions() {
  const result = [];
  for (const lineWidth of dimensionValues.lineWidth)
    for (const laneWidth of dimensionValues.laneWidth)
      for (const rowHeight of dimensionValues.rowHeight)
        for (const nodeRadius of dimensionValues.nodeRadius)
          for (const cornerRadius of dimensionValues.cornerRadius)
            if (fitsDimensions(nodeRadius, lineWidth, laneWidth, rowHeight))
              result.push({ lineWidth, laneWidth, rowHeight, nodeRadius, cornerRadius, paddingX: regressionPadding });
  return result;
}
