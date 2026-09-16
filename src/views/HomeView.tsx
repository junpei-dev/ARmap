// ============================================================
// ホーム画面：現在地の表示と行き先の選択
//
// 来校者は説明を読まない前提。
// 「QRを読み取る」か「行き先を選ぶ」のどちらから入っても案内が始まるようにする。
// ============================================================

import { useState } from "react";
import { CAMPUS, DESTINATIONS, NODES, qrNodes } from "../data/campus";

interface Props {
  currentId: string | null;
  onSelectDest: (nodeId: string) => void;
  onScan: () => void;
  onSetCurrent: (nodeId: string) => void;
  onClearCurrent: () => void;
}

export default function HomeView({
  currentId,
  onSelectDest,
  onScan,
  onSetCurrent,
  onClearCurrent,
}: Props) {
  const [picking, setPicking] = useState(false);
  const current = currentId ? NODES.get(currentId) : undefined;

  return (
    <>
      <div className="card">
        {current ? (
          <>
            <span className="chip">📍 現在地：{current.label}</span>
            <p className="lead" style={{ marginTop: 12, marginBottom: 0 }}>
              行き先を選んでください。
            </p>
          </>
        ) : (
          <>
            <p className="lead">
              校内に掲示されたQRコードを読み取ると現在地が確定し、
              目的地までの道順を案内します。
            </p>
            <button className="btn btn-primary" onClick={onScan}>
              QRコードを読み取る
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h2>行き先</h2>
        <div className="dest-list">
          {DESTINATIONS.map((d) => {
            const node = NODES.get(d.nodeId);
            const isHere = currentId === d.nodeId;
            return (
              <button
                key={d.nodeId}
                className="btn"
                disabled={isHere}
                style={isHere ? { opacity: 0.45 } : undefined}
                onClick={() => onSelectDest(d.nodeId)}
              >
                <span className="dest-item">
                  <span>
                    <span className="dest-name">{d.displayName}</span>
                    <span className="dest-note">
                      {node ? `${node.floor}階` : ""}
                      {d.note ? `／${d.note}` : ""}
                      {isHere ? "（ここが現在地です）" : ""}
                    </span>
                  </span>
                  <span className="dest-arrow">›</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* カメラが使えないとき・動作確認のための手動選択 */}
      <div className="card">
        <button
          className="btn"
          style={{ padding: 12, fontSize: 14, textAlign: "center" }}
          onClick={() => setPicking((v) => !v)}
        >
          {picking ? "閉じる" : "現在地を手で選ぶ"}
        </button>
        {picking && (
          <div className="dest-list" style={{ marginTop: 10 }}>
            {qrNodes().map((n) => (
              <button
                key={n.id}
                className="btn"
                onClick={() => {
                  setPicking(false);
                  onSetCurrent(n.id);
                }}
              >
                <span className="dest-name">{n.label}</span>
              </button>
            ))}
          </div>
        )}
        {current && (
          <button
            className="btn"
            style={{
              padding: 12,
              fontSize: 13,
              textAlign: "center",
              marginTop: 10,
            }}
            onClick={onClearCurrent}
          >
            現在地を解除する
          </button>
        )}
      </div>

      <p className="lead" style={{ fontSize: 12 }}>
        経路データ出典：{CAMPUS.meta.source}
      </p>

      <div className="foot-links">
        <a href="#/admin">管理モード</a>
      </div>
    </>
  );
}
