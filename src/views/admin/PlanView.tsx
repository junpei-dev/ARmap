// ============================================================
// 平面図・データ確認画面（管理・検証用）
//
// 図面PDFと見比べて、起こしたデータが正しいかを確認するための画面。
// 各区間の方位と距離を一覧できるので、現地検証の際の答え合わせにも使う。
// ============================================================

import { useState } from "react";
import { CAMPUS, NODES, validateCampus } from "../../data/campus";
import { bearingOf, compassLabel, distanceOf } from "../../lib/geo";
import FloorPlan from "../../components/FloorPlan";

export default function PlanView() {
  const floors = [...new Set(CAMPUS.nodes.map((n) => n.floor))].sort();
  const [floor, setFloor] = useState(floors[0] ?? 1);
  const issues = validateCampus();
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  const up = CAMPUS.meta.planUpBearing;

  return (
    <>
      <div className="card">
        <h2>データの状態</h2>
        <p className="lead" style={{ margin: 0 }}>
          ノード {CAMPUS.nodes.length} 件／区間 {CAMPUS.edges.length} 件／
          行き先 {CAMPUS.destinations.length} 件
          <br />
          図面の上方向 = 実方位 {up}°（{compassLabel(up)}）
        </p>
      </div>

      {errors.length > 0 && (
        <div className="notice" style={{ background: "#fee2e2", borderColor: "#fca5a5", color: "#b91c1c" }}>
          <strong>エラー {errors.length} 件</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {warns.length > 0 && (
        <div className="notice">
          <strong>要確認 {warns.length} 件</strong>
          <ul>
            {warns.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>平面図</h2>
        {floors.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {floors.map((f) => (
              <button
                key={f}
                className="btn"
                style={{
                  width: "auto",
                  padding: "8px 16px",
                  background: f === floor ? "var(--accent)" : undefined,
                  color: f === floor ? "#fff" : undefined,
                }}
                onClick={() => setFloor(f)}
              >
                {f}階
              </button>
            ))}
          </div>
        )}
        <FloorPlan floor={floor} height={560} />
      </div>

      <div className="card">
        <h2>区間の方位と距離</h2>
        <p className="lead">
          現地でこの値と実測値を照合する。方位が全区間で同じだけずれていれば、
          <code>planUpBearing</code> を直せば一斉に補正できる。
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "6px 4px" }}>区間</th>
                <th style={{ padding: "6px 4px" }}>方位</th>
                <th style={{ padding: "6px 4px" }}>距離</th>
              </tr>
            </thead>
            <tbody>
              {CAMPUS.edges.map((e, i) => {
                const a = NODES.get(e.from);
                const b = NODES.get(e.to);
                if (!a || !b) return null;
                const bearing = bearingOf(a, b, up);
                const dist = distanceOf(a, b);
                return (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 4px" }}>
                      {a.label} → {b.label}
                    </td>
                    <td style={{ padding: "6px 4px" }}>
                      {Math.round(bearing)}°（{compassLabel(bearing)}）
                    </td>
                    <td style={{ padding: "6px 4px" }}>{dist.toFixed(1)} m</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="foot-links">
        <a href="#/admin">管理メニューへ</a>
        <a href="#/admin/qr">掲示用QRコード</a>
      </div>
    </>
  );
}
