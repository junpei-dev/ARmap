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
): { correction: number; count: number; spread: number } | null {
  const diffs = list
    .filter((m) => m.kind === "axis" && m.diff !== null)
    .map((m) => m.diff as number);
  if (diffs.length === 0) return null;

  const sorted = [...diffs].sort((a, b) => a - b);
  const mid =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  return {
    correction: mid,
    count: diffs.length,
    spread: Math.max(...sorted) - Math.min(...sorted),
  };
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
