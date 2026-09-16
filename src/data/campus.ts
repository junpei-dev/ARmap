// ============================================================
// 経路データの型定義と読み込み
//
// 座標系は「図面座標」。学校施設台帳の平面図をそのまま座標系として使う。
//   x : 図面の右方向がプラス（メートル）
//   y : 図面の下方向がプラス（メートル）
//   原点: 管理・教室棟①の1階平面図の左上角
//
// 方位も距離もデータには持たない。ノードの座標から計算する（lib/geo.ts）。
// 同じ情報を2か所に持たないための設計。
// ============================================================

import raw from "./campus.json";

/** ノードの種別 */
export type NodeKind = "room" | "corner" | "stair" | "bridge" | "entrance";

/** 座標の出どころ。図面由来か、現地で直したか */
export type CoordSource = "plan" | "survey" | "estimate";

export interface Building {
  id: string;
  name: string;
  /** 図面の建物符号（例: "①"） */
  planCode: string;
  /** 図面のページ番号。出典を追えるように持つ */
  planPage: number;
  floors: number[];
}

/** DOM の Node と名前が衝突するので CampusNode とする */
export interface CampusNode {
  /** 不変ID。QRのURLに焼くので絶対に変えない */
  id: string;
  label: string;
  kind: NodeKind;
  building: string;
  floor: number;
  /** 図面座標(m)。部屋そのものではなく「その部屋の前の廊下」を指す */
  x: number;
  y: number;
  source: CoordSource;
  /**
   * 部屋の入口が廊下から見てどちらにあるかの実方位。
   * 到着時の「右手が職員室です」の判定に使う。
   * 延岡工業の管理棟は部屋が図面の左側に並ぶので 225 度（南西）。
   */
  entranceBearing?: number;
  /** QRを掲示するノードのみ */
  qr?: {
    /** 掲示場所のメモ */
    place: string;
    /** QRを正面に見たとき利用者が向く実方位。現地実測値（未実測なら null） */
    facing: number | null;
  };
  /** 目印 */
  landmark?: {
    text: string;
    photo?: string;
  };
}

export interface CampusEdge {
  from: string;
  to: string;
  kind: "corridor" | "bridge" | "stair" | "door";
  /** 階段のみ。上り +1 / 下り -1 */
  floorChange?: number;
  /** 案内文の上書き（省略時は自動生成） */
  instruction?: string;
}

export interface Destination {
  nodeId: string;
  displayName: string;
  category: string;
  order: number;
  note?: string;
}

export interface CampusMeta {
  school: string;
  /** 図面の上方向が向いている実方位（北=0度）。現地検証で補正する */
  planUpBearing: number;
  source: string;
  updatedAt: string;
}

export interface CampusData {
  version: number;
  meta: CampusMeta;
  buildings: Building[];
  nodes: CampusNode[];
  edges: CampusEdge[];
  destinations: Destination[];
}

// ------------------------------------------------------------
// 現地での修正（下書き）
//
// 現地検証モードで直した値は、この端末の localStorage に貯める。
// 起動時に campus.json へ重ねてから使うので、直した内容が
// そのまま案内画面にも反映される（保存後にリロードが必要）。
//
// 全端末へ反映するには、#/admin/data で書き出したJSONで
// src/data/campus.json を置き換えて push する。
// ------------------------------------------------------------

export const DRAFT_KEY = "arnav.draft";

/** 1ノードぶんの上書き。指定した項目だけが campus.json を上書きする */
export interface NodeOverride {
  x?: number;
  y?: number;
  label?: string;
  qrPlace?: string;
  qrFacing?: number | null;
  landmark?: string;
}

export interface Draft {
  /** campus.json の version と一致しない下書きは無視する */
  version: number;
  planUpBearing?: number;
  nodes: Record<string, NodeOverride>;
  updatedAt: string;
}

export function emptyDraft(version: number): Draft {
  return { version, nodes: {}, updatedAt: new Date().toISOString() };
}

export function loadDraft(): Draft | null {
  try {
    const text = localStorage.getItem(DRAFT_KEY);
    if (!text) return null;
    const d = JSON.parse(text) as Draft;
    // 版が違う下書きは構造が合わない可能性があるので捨てる
    if (d.version !== (raw as CampusData).version) return null;
    if (!d.nodes) d.nodes = {};
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  draft.updatedAt = new Date().toISOString();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}

/** campus.json に下書きを重ねる */
export function applyDraft(base: CampusData, draft: Draft | null): CampusData {
  if (!draft) return base;

  const merged: CampusData = {
    ...base,
    meta: {
      ...base.meta,
      planUpBearing: draft.planUpBearing ?? base.meta.planUpBearing,
    },
    nodes: base.nodes.map((n) => {
      const o = draft.nodes[n.id];
      if (!o) return n;
      const next: CampusNode = { ...n };
      if (o.x !== undefined) next.x = o.x;
      if (o.y !== undefined) next.y = o.y;
      if (o.label !== undefined) next.label = o.label;
      if (o.landmark !== undefined) {
        next.landmark = o.landmark ? { text: o.landmark } : undefined;
      }
      if (next.qr && (o.qrPlace !== undefined || o.qrFacing !== undefined)) {
        next.qr = {
          place: o.qrPlace ?? next.qr.place,
          facing: o.qrFacing !== undefined ? o.qrFacing : next.qr.facing,
        };
      }
      // 現地で直した箇所は図面由来と区別する
      if (o.x !== undefined || o.y !== undefined) next.source = "survey";
      return next;
    }),
  };
  return merged;
}

export const CAMPUS = applyDraft(raw as CampusData, loadDraft());

/** 下書きを当てていない、図面そのままのデータ（照合の基準に使う） */
export const CAMPUS_PLAN = raw as CampusData;

/** ノードIDから引くための索引 */
export const NODES: Map<string, CampusNode> = new Map(
  CAMPUS.nodes.map((n) => [n.id, n]),
);

export const BUILDINGS: Map<string, Building> = new Map(
  CAMPUS.buildings.map((b) => [b.id, b]),
);

/** 表示順に並べた目的地 */
export const DESTINATIONS: Destination[] = [...CAMPUS.destinations].sort(
  (a, b) => a.order - b.order,
);

export function getNode(id: string): CampusNode | undefined {
  return NODES.get(id);
}

export function buildingName(node: CampusNode): string {
  return BUILDINGS.get(node.building)?.name ?? node.building;
}

/** QRを掲示するノードの一覧 */
export function qrNodes(): CampusNode[] {
  return CAMPUS.nodes.filter((n) => n.qr);
}

/**
 * QRの読み取り結果からノードIDを取り出す。
 * 掲示するQRは `https://<ドメイン>/#/at/n001` の形式。
 * 開発時に手で作った生のID（"n001"）も受け付ける。
 */
export function parseQrPayload(data: string): string | null {
  const s = data.trim();
  const m = s.match(/#\/at\/([A-Za-z0-9_-]+)/);
  if (m) return NODES.has(m[1]) ? m[1] : null;
  return NODES.has(s) ? s : null;
}

/**
 * ノードのQRに焼き込むURL。
 * 掲示後は変更できないので、印刷は必ず本番URLで開いてから行うこと。
 */
export function qrUrlFor(nodeId: string, base?: string): string {
  const origin = base ?? location.origin + location.pathname;
  return `${origin}#/at/${nodeId}`;
}

// ------------------------------------------------------------
// データの妥当性チェック
// 起動時に呼び、おかしなデータを早期に見つける
// ------------------------------------------------------------

export interface ValidationIssue {
  level: "error" | "warn";
  message: string;
}

export function validateCampus(data: CampusData = CAMPUS): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  for (const n of data.nodes) {
    if (ids.has(n.id)) {
      issues.push({ level: "error", message: `ノードIDが重複: ${n.id}` });
    }
    ids.add(n.id);
    if (!data.buildings.some((b) => b.id === n.building)) {
      issues.push({
        level: "error",
        message: `ノード ${n.id} が未定義の建物を参照: ${n.building}`,
      });
    }
    if (n.source === "estimate") {
      issues.push({
        level: "warn",
        message: `ノード ${n.id}（${n.label}）は暫定座標。現地確認が必要`,
      });
    }
    if (n.qr && n.qr.facing === null) {
      issues.push({
        level: "warn",
        message: `QRノード ${n.id}（${n.label}）の facing が未実測`,
      });
    }
  }

  // エッジの参照先が存在するか
  const linked = new Set<string>();
  for (const e of data.edges) {
    for (const id of [e.from, e.to]) {
      if (!ids.has(id)) {
        issues.push({
          level: "error",
          message: `エッジが存在しないノードを参照: ${id}`,
        });
      }
      linked.add(id);
    }
  }

  // どこにも繋がっていないノード
  for (const n of data.nodes) {
    if (!linked.has(n.id)) {
      issues.push({
        level: "warn",
        message: `ノード ${n.id}（${n.label}）はどのエッジにも繋がっていない`,
      });
    }
  }

  // 目的地の参照
  for (const d of data.destinations) {
    if (!ids.has(d.nodeId)) {
      issues.push({
        level: "error",
        message: `目的地 ${d.displayName} が存在しないノードを参照: ${d.nodeId}`,
      });
    }
  }

  return issues;
}
