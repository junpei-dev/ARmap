// ============================================================
// 管理メニュー（#/admin）
//
// PINは「来校者が誤って入らないようにする」ためのもので、
// セキュリティ目的ではない（公開リポジトリなので値は誰でも読める）。
// 本当に隠したいものはここに置かないこと。
// ============================================================

import { useState } from "react";
import { CAMPUS, loadDraft } from "../../data/campus";
import { loadMeasurements } from "../../lib/storage";

/** 管理モードのPIN。変えたいときはこの1行を直す */
const ADMIN_PIN = "2026";
const KEY_UNLOCKED = "arnav.adminUnlocked";

export function isAdminUnlocked(): boolean {
  return sessionStorage.getItem(KEY_UNLOCKED) === "1";
}

export function unlockAdmin(): void {
  sessionStorage.setItem(KEY_UNLOCKED, "1");
}

export function lockAdmin(): void {
  sessionStorage.removeItem(KEY_UNLOCKED);
}

interface Props {
  onUnlock: () => void;
}

export default function AdminHome({ onUnlock }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const unlocked = isAdminUnlocked();

  if (!unlocked) {
    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (pin === ADMIN_PIN) {
        unlockAdmin();
        setError(false);
        onUnlock();
      } else {
        setError(true);
        setPin("");
      }
    };

    return (
      <>
        <div className="card">
          <h2>管理モード</h2>
          <p className="lead">
            経路データの検証・編集を行う画面です。PINを入力してください。
          </p>
          <form onSubmit={submit}>
            <input
              className="verify-select"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              aria-label="管理モードのPIN"
            />
            {error && (
              <p className="verify-msg" style={{ color: "#b91c1c" }}>
                PINが違います。
              </p>
            )}
            <button className="btn btn-primary" type="submit">
              開く
            </button>
          </form>
        </div>
        <div className="foot-links">
          <a href="#/">ホームへ戻る</a>
        </div>
      </>
    );
  }

  const draft = loadDraft();
  const draftCount = draft ? Object.keys(draft.nodes).length : 0;
  const measureCount = loadMeasurements().length;

  return (
    <>
      <div className="card">
        <h2>管理メニュー</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          ノード {CAMPUS.nodes.length} 件／区間 {CAMPUS.edges.length} 件
          <br />
          図面の上方向 = {CAMPUS.meta.planUpBearing}°
          {draft?.planUpBearing !== undefined && "（現地補正あり）"}
          <br />
          現地での修正 {draftCount} 件／測定記録 {measureCount} 件
        </p>
      </div>

      <div className="card">
        <div className="dest-list">
          <a className="btn" href="#/admin/verify">
            <span className="dest-name">方位の検証</span>
            <span className="dest-note">
              現地で方位を測り、図面の計算値と照合する
            </span>
          </a>
          <a className="btn" href="#/admin/nodes">
            <span className="dest-name">地点の編集</span>
            <span className="dest-note">
              座標・QRの掲示場所・目印を直す
            </span>
          </a>
          <a className="btn" href="#/admin/plan">
            <span className="dest-name">平面図・区間一覧</span>
            <span className="dest-note">図面PDFと見比べて確認する</span>
          </a>
          <a className="btn" href="#/admin/qr">
            <span className="dest-name">掲示用QRコード</span>
            <span className="dest-note">印刷して掲示する</span>
          </a>
          <a className="btn" href="#/admin/data">
            <span className="dest-name">データの書き出し・取り込み</span>
            <span className="dest-note">
              現地での修正をPCへ持ち帰る／測定記録をCSVで出す
            </span>
          </a>
        </div>
      </div>

      <div className="foot-links">
        <a href="#/">ホームへ戻る</a>
        <a
          href="#/"
          onClick={() => {
            lockAdmin();
          }}
        >
          管理モードを閉じる
        </a>
      </div>
    </>
  );
}
