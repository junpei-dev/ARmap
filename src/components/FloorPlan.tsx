// ============================================================
// 平面図プレビュー（SVG）
//
// 図面座標をそのままSVG座標として描画する（どちらも y は下向き）。
// 図面PDFと見比べて、データが正しく起こせているかを確認するための画面。
// 経路が指定されていれば、その区間を強調表示する。
// ============================================================

import { CAMPUS, NODES, type CampusNode } from "../data/campus";

interface Props {
  /** 表示する階 */
  floor?: number;
  /** 強調表示する経路（ノードIDの列） */
  path?: string[];
  /** 図の高さ(px)。既定は内容に合わせる */
  height?: number;
  /** 現地測定の照準：ここに立つ */
  aimFrom?: string;
  /** 現地測定の照準：こちらを向く */
  aimTo?: string;
}

const PAD = 6; // 図の余白（メートル）

export default function FloorPlan({
  floor = 1,
  path,
  height = 520,
  aimFrom,
  aimTo,
}: Props) {
  const nodes = CAMPUS.nodes.filter((n) => n.floor === floor);
  if (nodes.length === 0) {
    return <p className="lead">{floor}階のデータはまだありません。</p>;
  }

  // 廊下の中心線（最も多くのノードが並ぶx）。ラベルを左右どちらに出すかの基準にする
  const xCount = new Map<number, number>();
  for (const n of nodes) xCount.set(n.x, (xCount.get(n.x) ?? 0) + 1);
  const corridorX = [...xCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // 描画範囲
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD;
  const maxY = Math.max(...ys) + PAD;
  const w = maxX - minX;
  const h = maxY - minY;

  const inPath = new Set(path ?? []);
  const pathPairs = new Set<string>();
  if (path) {
    for (let i = 0; i < path.length - 1; i++) {
      pathPairs.add(`${path[i]}|${path[i + 1]}`);
      pathPairs.add(`${path[i + 1]}|${path[i]}`);
    }
  }

  const edges = CAMPUS.edges.filter((e) => {
    const a = NODES.get(e.from);
    const b = NODES.get(e.to);
    return a?.floor === floor && b?.floor === floor;
  });

  const colorOf = (n: CampusNode): string => {
    if (inPath.has(n.id)) return "#1d4ed8";
    if (n.kind === "stair") return "#b45309";
    if (n.qr) return "#16a34a";
    if (n.kind === "room") return "#334155";
    return "#94a3b8";
  };

  // 図面の縦横比を保ったまま、指定された高さに収める
  const width = (w / h) * height;

  return (
    <div>
      <div className="plan-wrap">
        <svg
          viewBox={`${minX} ${minY} ${w} ${h}`}
          width={width}
          height={height}
          role="img"
          aria-label={`${floor}階の平面図`}
        >
          {/* 1mグリッド（薄く） */}
          <defs>
            <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <path
                d="M 1 0 L 0 0 0 1"
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="0.06"
              />
            </pattern>
          </defs>
          <rect x={minX} y={minY} width={w} height={h} fill="url(#grid)" />

          {/* 廊下（エッジ） */}
          {edges.map((e, i) => {
            const a = NODES.get(e.from)!;
            const b = NODES.get(e.to)!;
            const hot = pathPairs.has(`${e.from}|${e.to}`);
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={hot ? "#1d4ed8" : "#cbd5e1"}
                strokeWidth={hot ? 1.1 : 0.5}
                strokeLinecap="round"
                strokeDasharray={e.kind === "door" ? "0.8 0.6" : undefined}
              />
            );
          })}

          {/* ノード。廊下から外れた位置のもの（階段など）はラベルを反対側に出して重なりを避ける */}
          {nodes.map((n) => {
            const toLeft = n.x > corridorX;
            return (
              <g key={n.id}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={inPath.has(n.id) ? 1.0 : 0.7}
                  fill={colorOf(n)}
                />
                <text
                  x={toLeft ? n.x - 1.3 : n.x + 1.3}
                  y={n.y + 0.6}
                  textAnchor={toLeft ? "end" : "start"}
                  fontSize="1.7"
                  fill="#0f172a"
                  style={{ userSelect: "none" }}
                >
                  {n.label}
                </text>
              </g>
            );
          })}

          {/* 現地測定の照準：ここに立って、こちらを向く */}
          {(() => {
            const a = aimFrom ? NODES.get(aimFrom) : undefined;
            const b = aimTo ? NODES.get(aimTo) : undefined;
            if (!a || !b || a.floor !== floor) return null;
            // 矢印の先端は目標の手前で止める（目標マークと重ねない）
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const tipX = b.x - ux * 2.4;
            const tipY = b.y - uy * 2.4;
            const headL = 2.6;
            const headW = 1.5;
            const bx = tipX - ux * headL;
            const by = tipY - uy * headL;
            const px = -uy * headW;
            const py = ux * headW;
            return (
              <g>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={bx}
                  y2={by}
                  stroke="#dc2626"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
                <polygon
                  points={`${tipX},${tipY} ${bx + px},${by + py} ${bx - px},${by - py}`}
                  fill="#dc2626"
                />
                {/* 立つ位置 */}
                <circle
                  cx={a.x}
                  cy={a.y}
                  r="2.4"
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="0.8"
                />
                <circle cx={a.x} cy={a.y} r="1.2" fill="#dc2626" />
                {/* 狙う先 */}
                <circle
                  cx={b.x}
                  cy={b.y}
                  r="2.2"
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="0.8"
                  strokeDasharray="1 0.8"
                />
              </g>
            );
          })()}

          {/* 方位（図面の上が向いている実方位） */}
          <g transform={`translate(${minX + 3} ${minY + 4})`}>
            <line
              x1="0"
              y1="2.5"
              x2="0"
              y2="-2.5"
              stroke="#0f172a"
              strokeWidth="0.25"
            />
            <polygon points="0,-3.2 -0.7,-1.8 0.7,-1.8" fill="#0f172a" />
            <text x="1.2" y="-1.6" fontSize="1.6" fill="#0f172a">
              図面の上 = {CAMPUS.meta.planUpBearing}°
            </text>
          </g>
        </svg>
      </div>

      <div className="plan-legend">
        <span>
          <i style={{ background: "#16a34a" }} />
          QR掲示
        </span>
        <span>
          <i style={{ background: "#334155" }} />
          部屋
        </span>
        <span>
          <i style={{ background: "#b45309" }} />
          階段
        </span>
        <span>
          <i style={{ background: "#94a3b8" }} />
          曲がり角
        </span>
        <span>
          <i style={{ background: "#1d4ed8" }} />
          経路
        </span>
      </div>
    </div>
  );
}
