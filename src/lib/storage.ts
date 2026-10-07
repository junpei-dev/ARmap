// ============================================================
// 現地検証の測定ログ
//
// 図面から計算した値と、現地で実測した値の差を1件ずつ貯める。
// これがそのまま課題研究の検証データ（要件定義書 第8章）になるので、
// CSVで書き出せるようにしておく。
//
// 経路データの下書きは data/campus.ts 側で扱う（こちらは測定記録専用）。
// ============================================================

import { angleDiff } from "./geo";

const KEY = "arnav.measurements";

export interface Measurement {
  id: string;
  /** 記録日時（ISO8601） */
  at: string;
  /** axis = 廊下の軸方位 / qr = QRを正面に見た向き */
  kind: "axis" | "qr";
  /** 廊下なら "from|to"、QRならノードID */
  targetId: string;
  label: string;
  /** 図面から計算した方位。QRのfacingには基準が無いので null */
  planBearing: number | null;
  /** 実測値（サンプルの中央値） */
  measured: number;
  /** 採用したサンプル数 */
  samples: number;
  /** サンプルのばらつき（最大と最小の角度差） */
  spread: number;
  /** 実測 − 図面（-180〜180）。QRでは null */
  diff: number | null;
  /**
   * 測定した時点の planUpBearing。
   * 補正を当てたあとも古い記録が残るため、これが無いと
   * 「補正済みの値にさらに同じ補正を足す」二重補正が起きる。
   */
  planUpAtMeasure?: number;
  note?: string;
}

export function loadMeasurements(): Measurement[] {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return [];
    const list = JSON.parse(text) as Measurement[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveMeasurements(list: Measurement[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addMeasurement(m: Measurement): Measurement[] {
  const list = [...loadMeasurements(), m];
  saveMeasurements(list);
  return list;
}

export function deleteMeasurement(id: string): Measurement[] {
  const list = loadMeasurements().filter((m) => m.id !== id);
  saveMeasurements(list);
  return list;
}

export function clearMeasurements(): void {
  localStorage.removeItem(KEY);
}

/** サンプル列のばらつき（最大と最小の角度差）。円環なので単純な差は使えない */
export function spreadOf(samples: number[]): number {
  if (samples.length < 2) return 0;
  const base = samples[0];
  const norm = samples.map((d) => angleDiff(base, d));
  return Math.max(...norm) - Math.min(...norm);
}

/**
 * 廊下の測定結果から planUpBearing の補正量を求める。
 * どの廊下も同じだけずれていれば、それは図面全体の回転ずれなので、
 * 差の中央値を planUpBearing に足せば一斉に直る。
 */
export function suggestPlanUpCorrection(
  list: Measurement[],
  currentPlanUp: number,
): {
  correction: number;
  count: number;
  spread: number;
  /** 別の planUpBearing のときに測ったため除外した件数 */
  stale: number;
} | null {
  const axes = list.filter((m) => m.kind === "axis" && m.diff !== null);
  // 現在の planUpBearing のもとで測ったものだけを使う（二重補正の防止）
  const usable = axes.filter((m) => m.planUpAtMeasure === currentPlanUp);
  const stale = axes.length - usable.length;
  const diffs = usable.map((m) => m.diff as number);
  if (diffs.length === 0) {
    return stale > 0
      ? { correction: 0, count: 0, spread: 0, stale }
      : null;
  }

  const sorted = [...diffs].sort((a, b) => a - b);
  const mid =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  return {
    correction: mid,
    count: diffs.length,
    spread: Math.max(...sorted) - Math.min(...sorted),
    stale,
  };
}

export interface ReciprocalCheck {
  label: string;
  /** 往路の実測（中央値） */
  forward: number;
  /** 復路の実測（中央値） */
  backward: number;
  /** 往復の差が180度からどれだけ外れているか */
  error: number;
}

/**
 * 往復の整合性を調べる。
 *
 * 同じ廊下を逆向きに測った値は、本来ちょうど180度違うはず。
 * そこからのずれは、どちらかの地点で磁場が歪んでいることを示す。
 * 同じ場所で何回測っても系統誤差は消えないので、この照合でしか見抜けない。
 */
export function checkReciprocal(list: Measurement[]): ReciprocalCheck[] {
  const axes = list.filter((m) => m.kind === "axis");

  // 同じ向きの測定はまとめて中央値を取る
  const byTarget = new Map<string, number[]>();
  for (const m of axes) {
    const arr = byTarget.get(m.targetId);
    if (arr) arr.push(m.measured);
    else byTarget.set(m.targetId, [m.measured]);
  }
  const medianOf = (xs: number[]) => {
    const base = xs[0];
    const norm = xs.map((d) => angleDiff(base, d)).sort((a, b) => a - b);
    const mid =
      norm.length % 2 === 1
        ? norm[(norm.length - 1) / 2]
        : (norm[norm.length / 2 - 1] + norm[norm.length / 2]) / 2;
    return ((base + mid) % 360 + 360) % 360;
  };

  const out: ReciprocalCheck[] = [];
  const seen = new Set<string>();

  for (const [id, values] of byTarget) {
    if (seen.has(id)) continue;
    const [a, b] = id.split("|");
    const reverseId = `${b}|${a}`;
    const reverse = byTarget.get(reverseId);
    if (!reverse) continue;
    seen.add(id);
    seen.add(reverseId);

    const forward = medianOf(values);
    const backward = medianOf(reverse);
    // 復路を180度回せば往路と一致するはず
    const error = angleDiff(forward, (backward + 180) % 360);

    const label = axes.find((m) => m.targetId === id)?.label ?? id;
    out.push({ label, forward, backward, error });
  }

  return out;
}

/** Excelで開ける形のCSV（BOM付きUTF-8） */
export function measurementsToCsv(list: Measurement[]): string {
  const head = [
    "記録日時",
    "種別",
    "対象",
    "図面計算値(度)",
    "実測値(度)",
    "差(度)",
    "サンプル数",
    "ばらつき(度)",
    "測定時のplanUpBearing",
    "メモ",
  ];
  const rows = list.map((m) => [
    m.at,
    m.kind === "axis" ? "廊下の方位" : "QRの正面",
    m.label,
    m.planBearing === null ? "" : m.planBearing.toFixed(1),
    m.measured.toFixed(1),
    m.diff === null ? "" : m.diff.toFixed(1),
    String(m.samples),
    m.spread.toFixed(1),
    m.planUpAtMeasure === undefined ? "" : String(m.planUpAtMeasure),
    m.note ?? "",
  ]);
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return (
    "﻿" +
    [head, ...rows].map((r) => r.map(escape).join(",")).join("\r\n") +
    "\r\n"
  );
}

// ------------------------------------------------------------
// 現地メモ
//
// 図面から読めないこと（棟のつながり方、実際にどう歩くか、見える目印）を
// その場で書き留めるための記録欄。経路データにする前の素材として使う。
//
// 写真は localStorage の容量（数MB）を超えやすいので保存しない。
// 撮ったらその場で端末へダウンロードし、ここにはファイル名だけ残す。
// ------------------------------------------------------------

const NOTES_KEY = "arnav.notes";

export interface FieldNote {
  id: string;
  at: string;
  /** 何についてのメモか（例: 図書館への動線） */
  title: string;
  body: string;
  /** 撮影してダウンロードした写真のファイル名（本体は端末に保存される） */
  photoNames?: string[];
}

export function loadNotes(): FieldNote[] {
  try {
    const text = localStorage.getItem(NOTES_KEY);
    if (!text) return [];
    const list = JSON.parse(text) as FieldNote[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveNotes(list: FieldNote[]): void {
  localStorage.setItem(NOTES_KEY, JSON.stringify(list));
}

export function addNote(note: FieldNote): FieldNote[] {
  const list = [...loadNotes(), note];
  saveNotes(list);
  return list;
}

export function updateNote(id: string, changes: Partial<FieldNote>): FieldNote[] {
  const list = loadNotes().map((n) => (n.id === id ? { ...n, ...changes } : n));
  saveNotes(list);
  return list;
}

export function deleteNote(id: string): FieldNote[] {
  const list = loadNotes().filter((n) => n.id !== id);
  saveNotes(list);
  return list;
}

/** 持ち帰って読む用のテキスト */
export function notesToText(list: FieldNote[]): string {
  if (list.length === 0) return "（メモはありません）\r\n";
  return list
    .map((n) => {
      const when = new Date(n.at).toLocaleString("ja-JP");
      const photos =
        n.photoNames && n.photoNames.length > 0
          ? `\r\n写真: ${n.photoNames.join(" / ")}`
          : "";
      return `■ ${n.title}\r\n${when}\r\n${n.body}${photos}\r\n`;
    })
    .join("\r\n");
}

/** ブラウザからファイルとして保存させる */
export function downloadFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // すぐ revoke するとダウンロードが始まらない端末があるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
