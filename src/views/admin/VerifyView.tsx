// ============================================================
// 現地検証：方位の実測と照合（管理用 #/admin/verify）
//
// 図面から計算した方位と、その場で実測した方位の差を記録する。
// ゼロから測るのではなく「答え合わせ」をするための画面。
//
// 区間の測定が何本か貯まると、差の中央値から planUpBearing の
// 補正量を提案する。図面全体の回転ずれは、この1つの値で一斉に直る。
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  CAMPUS,
  NODES,
  emptyDraft,
  loadDraft,
  qrNodes,
  saveDraft,
} from "../../data/campus";
import { angleDiff, bearingOf, circularMedian, compassLabel } from "../../lib/geo";
import {
  addMeasurement,
  deleteMeasurement,
  loadMeasurements,
  spreadOf,
  suggestPlanUpCorrection,
  type Measurement,
} from "../../lib/storage";
import { useCompass } from "../../lib/compass";

type Mode = "edge" | "qr";

/** サンプリング時間（ミリ秒）。短いと磁気の揺れを拾う */
const SAMPLE_MS = 3000;

interface Target {
  id: string;
  label: string;
  planBearing: number | null;
}

export default function VerifyView() {
  const up = CAMPUS.meta.planUpBearing;
  const { heading, status, accuracy, start } = useCompass();

  const [mode, setMode] = useState<Mode>("edge");
  const [targetId, setTargetId] = useState<string>("");
  const [phase, setPhase] = useState<"idle" | "sampling" | "done">("idle");
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<{
    median: number;
    spread: number;
    count: number;
  } | null>(null);
  const [list, setList] = useState<Measurement[]>(() => loadMeasurements());
  const [msg, setMsg] = useState<string | null>(null);

  const samplesRef = useRef<number[]>([]);

  // 方位の候補（区間 or QR）
  const targets: Target[] = (() => {
    if (mode === "qr") {
      return qrNodes().map((n) => ({
        id: n.id,
        label: `${n.label}（QRの正面）`,
        planBearing: null,
      }));
    }
    return CAMPUS.edges
      .filter((e) => e.kind === "corridor" || e.kind === "bridge")
      .map((e): Target | null => {
        const a = NODES.get(e.from);
        const b = NODES.get(e.to);
        if (!a || !b) return null;
        return {
          id: `${e.from}|${e.to}`,
          label: `${a.label} → ${b.label}`,
          planBearing: bearingOf(a, b, up),
        };
      })
      .filter((t): t is Target => t !== null);
  })();

  const target = targets.find((t) => t.id === targetId) ?? targets[0];

  // サンプリング中だけ方位を貯める
  useEffect(() => {
    if (phase === "sampling" && heading !== null) {
      samplesRef.current.push(heading);
    }
  }, [heading, phase]);

  const startSampling = () => {
    if (heading === null) {
      setMsg("方位が取得できていません。先に「方位センサーを使う」を押してください。");
      return;
    }
    setMsg(null);
    setResult(null);
    samplesRef.current = [];
    setPhase("sampling");
    setLeft(Math.round(SAMPLE_MS / 1000));

    const tick = window.setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    window.setTimeout(() => {
      window.clearInterval(tick);
      const s = samplesRef.current;
      if (s.length === 0) {
        setPhase("idle");
        setMsg("方位の値が1つも取れませんでした。端末を少し動かしてから再試行してください。");
        return;
      }
      setResult({
        median: circularMedian(s),
        spread: spreadOf(s),
        count: s.length,
      });
      setPhase("done");
    }, SAMPLE_MS);
  };

  const diff =
    result && target?.planBearing !== null && target?.planBearing !== undefined
      ? angleDiff(target.planBearing, result.median)
      : null;

  const record = () => {
    if (!result || !target) return;
    const next = addMeasurement({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      kind: mode,
      targetId: target.id,
      label: target.label,
      planBearing: target.planBearing,
      measured: result.median,
      samples: result.count,
      spread: result.spread,
      diff,
    });
    setList(next);
    setResult(null);
    setPhase("idle");
    setMsg("記録しました。");
  };

  /** QRの正面方位を、そのノードの facing として下書きに保存する */
  const saveAsFacing = () => {
    if (!result || !target || mode !== "qr") return;
    const draft = loadDraft() ?? emptyDraft(CAMPUS.version);
    draft.nodes[target.id] = {
      ...draft.nodes[target.id],
      qrFacing: Math.round(result.median * 10) / 10,
    };
    saveDraft(draft);
    setMsg(
      `${NODES.get(target.id)?.label ?? target.id} の facing を ${Math.round(
        result.median,
      )}° として保存しました。反映にはリロードが必要です。`,
    );
  };

  const suggestion = suggestPlanUpCorrection(list);

  const applyCorrection = () => {
    if (!suggestion) return;
    const nextUp = (((up + suggestion.correction) % 360) + 360) % 360;
    const draft = loadDraft() ?? emptyDraft(CAMPUS.version);
    draft.planUpBearing = Math.round(nextUp * 10) / 10;
    saveDraft(draft);
    if (
      confirm(
        `planUpBearing を ${up}° → ${draft.planUpBearing}° に変更しました。\n` +
          "反映するにはページを再読み込みします。よろしいですか？",
      )
    ) {
      location.reload();
    }
  };

  return (
    <>
      <div className="card">
        <h2>方位の検証</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          進行方向（またはQRの正面）を向いて測り、図面の計算値と突き合わせます。
          区間を何本か測ると、図面全体のずれを補正できます。
        </p>
      </div>

      {/* センサーの状態 */}
      <div className="card">
        <div className="verify-heading">
          <span className="verify-deg">
            {heading === null ? "--" : Math.round(heading)}
            <small>°</small>
          </span>
          <span className="verify-dir">
            {heading === null ? "方位 未取得" : compassLabel(heading)}
          </span>
        </div>

        {status === "idle" && (
          <button className="btn btn-primary" onClick={() => void start()}>
            方位センサーを使う
          </button>
        )}
        {status === "denied" && (
          <p className="ar-warn">
            方位センサーの使用が許可されませんでした。
            ブラウザの設定から「モーションと画面の向き」を許可してください。
          </p>
        )}
        {status === "unsupported" && (
          <p className="ar-warn">この端末では方位センサーを利用できません。</p>
        )}
        {accuracy !== null && accuracy > 15 && (
          <p className="ar-warn">
            センサーの精度が低い状態です（±{Math.round(accuracy)}°）。
            端末を8の字に動かして較正してから測ってください。
          </p>
        )}
      </div>

      {/* 測定 */}
      <div className="card">
        <div className="verify-tabs">
          <button
            className={mode === "edge" ? "verify-tab is-on" : "verify-tab"}
            onClick={() => {
              setMode("edge");
              setTargetId("");
              setResult(null);
              setPhase("idle");
            }}
          >
            区間の方位
          </button>
          <button
            className={mode === "qr" ? "verify-tab is-on" : "verify-tab"}
            onClick={() => {
              setMode("qr");
              setTargetId("");
              setResult(null);
              setPhase("idle");
            }}
          >
            QRの正面
          </button>
        </div>

        <select
          className="verify-select"
          value={target?.id ?? ""}
          onChange={(e) => {
            setTargetId(e.target.value);
            setResult(null);
            setPhase("idle");
          }}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        {target?.planBearing !== null && target?.planBearing !== undefined && (
          <p className="verify-plan">
            図面の計算値：<strong>{Math.round(target.planBearing)}°</strong>（
            {compassLabel(target.planBearing)}）
          </p>
        )}
        {mode === "qr" && (
          <p className="verify-plan">
            QRを正面に見て立ち、その向きを測ります（図面には基準がありません）。
          </p>
        )}

        <button
          className="btn btn-primary"
          disabled={phase === "sampling"}
          onClick={startSampling}
        >
          {phase === "sampling" ? `測定中… ${left}` : "3秒間これを測る"}
        </button>

        {result && (
          <div className="verify-result">
            <p className="verify-result-main">
              実測 <strong>{Math.round(result.median)}°</strong>（
              {compassLabel(result.median)}）
            </p>
            {diff !== null && (
              <p
                className={
                  Math.abs(diff) <= 15
                    ? "verify-diff is-ok"
                    : Math.abs(diff) <= 45
                      ? "verify-diff is-warn"
                      : "verify-diff is-bad"
                }
              >
                図面との差 {diff > 0 ? "+" : ""}
                {Math.round(diff)}°
                {Math.abs(diff) <= 15
                  ? "　ほぼ一致"
                  : Math.abs(diff) <= 45
                    ? "　ずれあり"
                    : "　大きくずれています。向きを間違えていませんか"}
              </p>
            )}
            <p className="step-meta">
              {result.count}回のサンプル／ばらつき {Math.round(result.spread)}°
            </p>

            <div className="ar-card-row">
              <button className="ar-btn ar-btn-primary" onClick={record}>
                記録する
              </button>
              {mode === "qr" && (
                <button className="ar-btn" onClick={saveAsFacing}>
                  facing として保存
                </button>
              )}
            </div>
          </div>
        )}

        {msg && <p className="verify-msg">{msg}</p>}
      </div>

      {/* 補正の提案 */}
      {suggestion && (
        <div className="card">
          <h2>図面全体のずれ</h2>
          <p className="lead">
            区間 {suggestion.count} 本の測定から、差の中央値は{" "}
            <strong>
              {suggestion.correction > 0 ? "+" : ""}
              {Math.round(suggestion.correction)}°
            </strong>{" "}
            です（ばらつき {Math.round(suggestion.spread)}°）。
          </p>
          {Math.abs(suggestion.correction) < 3 ? (
            <p className="lead" style={{ marginBottom: 0 }}>
              図面の方位記号（{up}°）はほぼ正しいと言えます。補正は不要です。
            </p>
          ) : (
            <>
              <p className="lead">
                planUpBearing を {up}° →{" "}
                <strong>
                  {Math.round((((up + suggestion.correction) % 360) + 360) % 360)}°
                </strong>{" "}
                に補正すると、全区間の方位が一斉に合います。
              </p>
              <button className="btn btn-primary" onClick={applyCorrection}>
                この補正を適用する
              </button>
            </>
          )}
          {suggestion.spread > 40 && (
            <p className="ar-warn">
              測定値のばらつきが大きすぎます（{Math.round(suggestion.spread)}°）。
              向きを取り違えた記録が混じっていないか、一覧を確認してください。
            </p>
          )}
        </div>
      )}

      {/* 記録一覧 */}
      <div className="card">
        <h2>記録（{list.length} 件）</h2>
        {list.length === 0 ? (
          <p className="lead" style={{ marginBottom: 0 }}>
            まだ記録がありません。
          </p>
        ) : (
          <ul className="verify-list">
            {[...list]
              .reverse()
              .slice(0, 12)
              .map((m) => (
                <li key={m.id}>
                  <div>
                    <p className="verify-list-label">{m.label}</p>
                    <p className="step-meta">
                      実測 {Math.round(m.measured)}°
                      {m.planBearing !== null &&
                        `／図面 ${Math.round(m.planBearing)}°`}
                      {m.diff !== null &&
                        `／差 ${m.diff > 0 ? "+" : ""}${Math.round(m.diff)}°`}
                    </p>
                  </div>
                  <button
                    className="verify-del"
                    aria-label="この記録を削除"
                    onClick={() => setList(deleteMeasurement(m.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        )}
        {list.length > 12 && (
          <p className="step-meta">最新12件を表示しています。</p>
        )}
      </div>

      <div className="foot-links">
        <a href="#/admin">管理メニューへ</a>
        <a href="#/admin/data">データの書き出し</a>
      </div>
    </>
  );
}
