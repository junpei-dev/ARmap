// ============================================================
// データの書き出し・取り込み（#/admin/data）
//
// 現地で直した内容はこの端末の localStorage にしか無い。
// 全端末へ反映するには、ここで書き出したJSONで
// src/data/campus.json を置き換えて push する。
// ============================================================

import { useState } from "react";
import {
  CAMPUS,
  CAMPUS_PLAN,
  clearDraft,
  loadDraft,
  saveDraft,
  type Draft,
} from "../../data/campus";
import {
  clearMeasurements,
  downloadFile,
  loadMeasurements,
  measurementsToCsv,
} from "../../lib/storage";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export default function DataView() {
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [, force] = useState(0);

  const draft = loadDraft();
  const draftCount = draft ? Object.keys(draft.nodes).length : 0;
  const measurements = loadMeasurements();

  const exportCampus = () => {
    // 現地の修正を当てた状態のデータをそのまま書き出す
    const json = JSON.stringify(
      { ...CAMPUS, meta: { ...CAMPUS.meta, updatedAt: new Date().toISOString().slice(0, 10) } },
      null,
      2,
    );
    downloadFile(`campus-${stamp()}.json`, json, "application/json;charset=utf-8");
    setMsg("campus.json を書き出しました。PCで src/data/campus.json を置き換えてください。");
  };

  const exportDraft = () => {
    if (!draft) return;
    downloadFile(
      `draft-${stamp()}.json`,
      JSON.stringify(draft, null, 2),
      "application/json;charset=utf-8",
    );
    setMsg("下書きだけを書き出しました。");
  };

  const exportCsv = () => {
    if (measurements.length === 0) return;
    downloadFile(
      `measurements-${stamp()}.csv`,
      measurementsToCsv(measurements),
      "text/csv;charset=utf-8",
    );
    setMsg("測定記録をCSVで書き出しました。検証データとして保管してください。");
  };

  const importDraft = () => {
    try {
      const d = JSON.parse(importText) as Draft;
      if (typeof d !== "object" || d === null || !d.nodes) {
        setMsg("下書きの形式ではありません。");
        return;
      }
      if (d.version !== CAMPUS_PLAN.version) {
        setMsg(
          `版が違います（データ v${CAMPUS_PLAN.version} / 取り込み v${d.version}）。取り込みを中止しました。`,
        );
        return;
      }
      saveDraft(d);
      setMsg("取り込みました。リロードすると反映されます。");
      setImportText("");
      force((v) => v + 1);
    } catch {
      setMsg("JSONとして読めませんでした。");
    }
  };

  const discardDraft = () => {
    if (!confirm("現地での修正をすべて破棄して、図面どおりの状態に戻します。よろしいですか？")) {
      return;
    }
    clearDraft();
    setMsg("下書きを破棄しました。リロードすると図面どおりに戻ります。");
    force((v) => v + 1);
  };

  const discardMeasurements = () => {
    if (!confirm(`測定記録 ${measurements.length} 件をすべて削除します。よろしいですか？`)) {
      return;
    }
    clearMeasurements();
    setMsg("測定記録を削除しました。");
    force((v) => v + 1);
  };

  return (
    <>
      <div className="card">
        <h2>いまの状態</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          現地での修正 <strong>{draftCount}</strong> 件
          {draft?.planUpBearing !== undefined &&
            `（planUpBearing を ${draft.planUpBearing}° に補正中）`}
          <br />
          測定記録 <strong>{measurements.length}</strong> 件
          {draft && (
            <>
              <br />
              最終更新 {new Date(draft.updatedAt).toLocaleString("ja-JP")}
            </>
          )}
        </p>
      </div>

      <div className="card">
        <h2>書き出し</h2>
        <p className="lead">
          現地での修正はこの端末にしか残りません。作業のあとは必ず書き出して、
          自分宛に送るかクラウドへ保存してください。
        </p>
        <div className="dest-list">
          <button className="btn btn-primary" onClick={exportCampus}>
            campus.json を書き出す（修正を反映した完成データ）
          </button>
          <button className="btn" onClick={exportDraft} disabled={!draft}>
            下書きだけを書き出す
          </button>
          <button
            className="btn"
            onClick={exportCsv}
            disabled={measurements.length === 0}
          >
            測定記録をCSVで書き出す（{measurements.length} 件）
          </button>
        </div>
      </div>

      <div className="card">
        <h2>取り込み</h2>
        <p className="lead">
          書き出した下書きJSONを貼り付けると、この端末に復元します。
        </p>
        <textarea
          className="verify-select"
          rows={5}
          value={importText}
          placeholder='{"version":2,"nodes":{...}}'
          onChange={(e) => setImportText(e.target.value)}
        />
        <button
          className="btn"
          onClick={importDraft}
          disabled={importText.trim() === ""}
        >
          取り込む
        </button>
      </div>

      <div className="card">
        <h2>本番へ反映する手順</h2>
        <ol className="lead" style={{ paddingLeft: 20, marginBottom: 0 }}>
          <li>上の「campus.json を書き出す」でファイルを保存する</li>
          <li>そのファイルをPCへ移す（メール・クラウド経由）</li>
          <li>
            <code>src/data/campus.json</code> を置き換える
          </li>
          <li>
            git に commit して push（Cloudflare が自動でビルドし直す）
          </li>
          <li>公開URLを開き直して反映を確認する</li>
        </ol>
      </div>

      <div className="card">
        <h2>やり直し</h2>
        <div className="dest-list">
          <button className="btn" onClick={discardDraft} disabled={!draft}>
            現地での修正を破棄して図面どおりに戻す
          </button>
          <button
            className="btn"
            onClick={discardMeasurements}
            disabled={measurements.length === 0}
          >
            測定記録をすべて削除する
          </button>
        </div>
      </div>

      {msg && <div className="notice">{msg}</div>}

      <div className="foot-links">
        <a href="#/admin">管理メニューへ</a>
      </div>
    </>
  );
}
