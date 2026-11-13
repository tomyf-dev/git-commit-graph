type Segment = { x: number; y: number; nx: number; ny: number; curve: boolean };
// Quadratic corners are sampled at 32 subdivisions. Isolated crossings are
// allowed; sustained near-parallel contact outside the shared node is not.
export function flatten(path: string): Segment[] {
  const tokens = path.split(/\s+/);
  const lines: Segment[] = [];
  let x = 0, y = 0;
  const add = (nx: number, ny: number, curve = false) => {
    if (nx !== x || ny !== y) lines.push({ x, y, nx, ny, curve });
    x = nx;
    y = ny;
  };
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    if (command === "M") { x = Number(tokens[i++]); y = Number(tokens[i++]); }
    else if (command === "H") add(Number(tokens[i++]), y);
    else if (command === "V") add(x, Number(tokens[i++]));
    else if (command === "Q") {
      const cx = Number(tokens[i++]), cy = Number(tokens[i++]);
      const ex = Number(tokens[i++]), ey = Number(tokens[i++]);
      const sx = x, sy = y;
      for (let step = 1; step <= 32; step++) {
        const u = step / 32, v = 1 - u;
        add(v*v*sx + 2*v*u*cx + u*u*ex, v*v*sy + 2*v*u*cy + u*u*ey, true);
      }
    } else throw new Error(`Unsupported SVG command: ${command}`);
  }
  return lines;
}
export function curvedOverlap(wip: Segment[], other: Segment[], head: { x: number; y: number } | readonly { x: number; y: number }[], lineWidth = 2, nodeRadius = 4) {
  const shared = Array.isArray(head) ? head : [head as { x: number; y: number }];
  const clearance = lineWidth - 0.1;
  let run = 0;
  for (const a of wip) {
    const px = (a.x + a.nx) / 2, py = (a.y + a.ny) / 2;
    let close = false;
    // Exclude only the shared node and half the rendered stroke width.
    if (a.curve && !shared.some(node => Math.hypot(px-node.x, py-node.y) <= nodeRadius + lineWidth / 2)) {
      for (const b of other) {
        if (px < Math.min(b.x,b.nx)-clearance || px > Math.max(b.x,b.nx)+clearance || py < Math.min(b.y,b.ny)-clearance || py > Math.max(b.y,b.ny)+clearance) continue;
        const dx=b.nx-b.x, dy=b.ny-b.y, ax=a.nx-a.x, ay=a.ny-a.y;
        const cosine=Math.abs((dx*ax+dy*ay)/(Math.hypot(dx,dy)*Math.hypot(ax,ay)));
        if(cosine < .95) continue;
        const t=Math.max(0,Math.min(1,((px-b.x)*dx+(py-b.y)*dy)/(dx*dx+dy*dy)));
        if(Math.hypot(px-b.x-t*dx,py-b.y-t*dy)<clearance) { close=true; break; }
      }
    }
    run = close ? run + Math.hypot(a.nx-a.x,a.ny-a.y) : 0;
    if (run > Math.max(1, lineWidth)) return true;
  }
  return false;
}
