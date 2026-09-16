// ============================================================
// 地点の編集（#/admin/nodes）
//
// 図面と現況が違う箇所（増改築・用途変更など）を直す。
// 変更はこの端末の下書き（localStorage）に入り、
// 保存後のリロードで案内画面にも反映される。
// ============================================================

import { useState } from "react";
import {
  CAMPUS,
  CAMPUS_PLAN,
  emptyDraft,
  loadDraft,
  saveDraft,
  type NodeOverride,
} from "../../data/campus";
import { compassLabel } from "../../lib/geo";

export default function NodesView() {
  const [selId, setSelId] = useState(CAMPUS.nodes[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [, force] = useState(0);

  const node = CAMPUS.nodes.find((n) => n.id === selId) ?? CAMPUS.nodes[0];
  const planNode = CAMPUS_PLAN.nodes.find((n) => n.id === node?.id);
  const draft = loadDraft();
  const override: NodeOverride = draft?.nodes[node?.id ?? ""] ?? {};

  if (!node) return <p className="lead">データがありません。</p>;

  const patch = (changes: NodeOverride) => {
    const d = loadDraft() ?? emptyDraft(CAMPUS.version);
    d.nodes[node.id] = { ...d.nodes[node.id], ...changes };
    saveDraft(d);
    setMsg("保存しました。案内画面に反映するにはリロードしてください。");
    force((v) => v + 1);
  };

  const resetNode = () => {
    const d = loadDraft();
    if (!d) return;
    delete d.nodes[node.id];
    saveDraft(d);
    setMsg("この地点を図面どおりの値に戻しました。");
    force((v) => v + 1);
  };

  const edited = Object.keys(override).length > 0;

  return (
    <>
      <div className="card">
        <h2>地点の編集</h2>
        <select
          className="verify-select"
          value={node.id}
          onChange={(e) => {
            setSelId(e.target.value);
            setMsg(null);
          }}
        >
          {CAMPUS.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
              {n.qr ? "（QR）" : ""}
              {draft?.nodes[n.id] ? " ✎" : ""}
            </option>
          ))}
        </select>
        <p className="step-meta">
          ID {node.id}／{node.floor}階／
          {node.source === "survey" ? "現地で修正済み" : "図面から起こした値"}
        </p>
      </div>

      <div className="card">
        <h2>表示名</h2>
        <input
          className="verify-select"
          value={node.label}
          onChange={(e) => patch({ label: e.target.value })}
        />
        <p className="step-meta">
          表示名は自由に変えてよい（QRのURLはIDで決まるため影響しない）。
        </p>
      </div>

      <div className="card">
        <h2>図面座標（メートル）</h2>
        <div className="coord-row">
          <label>
            <span>x（図面の右方向）</span>
            <input
              className="verify-select"
              type="number"
              step="0.1"
              value={node.x}
              onChange={(e) => patch({ x: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>y（図面の下方向）</span>
            <input
              className="verify-select"
              type="number"
              step="0.1"
              value={node.y}
              onChange={(e) => patch({ y: Number(e.target.value) })}
            />
          </label>
        </div>
        {planNode && (planNode.x !== node.x || planNode.y !== node.y) && (
          <p className="step-meta">
            図面の値：x {planNode.x} / y {planNode.y}
          </p>
        )}
        <p className="step-meta">
          座標は「その部屋の前の廊下」を指す。動かすと方位と距離が自動で変わる。
        </p>
      </div>

      <div className="card">
        <h2>目印</h2>
        <input
          className="verify-select"
          value={node.landmark?.text ?? ""}
          placeholder="例：赤い消火器の横、掲示板の先"
          onChange={(e) => patch({ landmark: e.target.value })}
        />
        <p className="step-meta">
          案内文に添えられる。実際に見えるものを書くこと。
        </p>
      </div>

      {node.qr && (
        <div className="card">
          <h2>QRの掲示情報</h2>
          <label className="coord-label">
            <span>掲示場所のメモ</span>
            <input
              className="verify-select"
              value={node.qr.place}
              onChange={(e) => patch({ qrPlace: e.target.value })}
            />
          </label>
          <label className="coord-label">
            <span>
              QRを正面に見たときの方位（facing）
              {node.qr.facing !== null && `：${compassLabel(node.qr.facing)}`}
            </span>
            <input
              className="verify-select"
              type="number"
              step="1"
              min="0"
              max="359"
              value={node.qr.facing ?? ""}
              placeholder="未実測"
              onChange={(e) =>
                patch({
                  qrFacing:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <p className="step-meta">
            方位センサーが使えない利用者は、この値を基準に矢印を表示する。
            「方位の検証」画面で実測すると自動で入る。
          </p>
        </div>
      )}

      {edited && (
        <div className="card">
          <button className="btn" onClick={resetNode}>
            この地点を図面どおりに戻す
          </button>
        </div>
      )}

      {msg && (
        <div className="notice">
          {msg}
          <br />
          <button
            className="btn"
            style={{ marginTop: 8, padding: 10, textAlign: "center" }}
            onClick={() => location.reload()}
          >
            いますぐリロードする
          </button>
        </div>
      )}

      <div className="foot-links">
        <a href="#/admin">管理メニューへ</a>
        <a href="#/admin/plan">平面図で確認</a>
      </div>
    </>
  );
}
