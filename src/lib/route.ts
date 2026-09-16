// ============================================================
// 経路探索と案内文の生成
//
// ダイクストラ法で最短経路を求め、ノード列を「人が読める手順」に変換する。
// 方位も距離もデータには持たず、すべて座標から計算する（lib/geo.ts）。
// ============================================================

import {
  CAMPUS,
  NODES,
  type CampusEdge,
  type CampusNode,
} from "../data/campus";
import {
  angleDiff,
  bearingOf,
  compassLabel,
  distanceOf,
  formatDistance,
  sideOf,
  turnInstruction,
  walkSeconds,
} from "./geo";

const UP = CAMPUS.meta.planUpBearing;

/** 階段1階分のコスト。同一階で行けるなら階段を避けたいので大きめに置く */
const STAIR_COST = 25;
const DOOR_COST = 3;
/** 渡り廊下は屋外に近く雨天で濡れるため、わずかに避ける */
const BRIDGE_FACTOR = 1.1;

interface Link {
  to: string;
  edge: CampusEdge;
  cost: number;
  /** from から to へ進む向きでの階数変化 */
  floorChange: number;
}

/** 隣接リスト（双方向） */
const ADJ: Map<string, Link[]> = (() => {
  const adj = new Map<string, Link[]>();
  const push = (from: string, link: Link) => {
    const list = adj.get(from);
    if (list) list.push(link);
    else adj.set(from, [link]);
  };

  for (const e of CAMPUS.edges) {
    const a = NODES.get(e.from);
    const b = NODES.get(e.to);
    if (!a || !b) continue;

    const dist = distanceOf(a, b);
    let cost: number;
    switch (e.kind) {
      case "stair":
        cost = STAIR_COST;
        break;
      case "door":
        cost = DOOR_COST;
        break;
      case "bridge":
        cost = dist * BRIDGE_FACTOR;
        break;
      default:
        cost = dist;
    }

    const fc = e.floorChange ?? 0;
    push(e.from, { to: e.to, edge: e, cost, floorChange: fc });
    push(e.to, { to: e.from, edge: e, cost, floorChange: -fc });
  }
  return adj;
})();

/**
 * ダイクストラ法で最短経路を求める。
 * ノード数は100程度なので、優先度キューなしの単純な実装で十分。
 */
export function findPath(fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];
  if (!NODES.has(fromId) || !NODES.has(toId)) return null;

  const dist = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();

  for (;;) {
    // 未確定のうち最小コストのノードを選ぶ
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        best = d;
        cur = id;
      }
    }
    if (cur === null) break;
    if (cur === toId) break;
    done.add(cur);

    for (const link of ADJ.get(cur) ?? []) {
      if (done.has(link.to)) continue;
      const next = best + link.cost;
      if (next < (dist.get(link.to) ?? Infinity)) {
        dist.set(link.to, next);
        prev.set(link.to, cur);
      }
    }
  }

  if (!dist.has(toId)) return null;

  const path: string[] = [toId];
  let cur = toId;
  while (cur !== fromId) {
    const p = prev.get(cur);
    if (!p) return null;
    path.unshift(p);
    cur = p;
  }
  return path;
}

// ------------------------------------------------------------
// 廊下の軸
//
// 現地で方位を測るとき、短い区間を1本ずつ測るのは意味がないうえ精度も悪い。
// 同じ直線上に並ぶ区間はまとめて1本の「廊下」として扱い、
// その端から端（いちばん遠い2点）を狙って測れるようにする。
//
// 10m先の目標を1m外すと約6度ずれるが、50m先なら約1度で済む。
// 遠くを狙うほど正確になるので、軸は長いほどよい。
// ------------------------------------------------------------

export interface CorridorAxis {
  id: string;
  fromId: string;
  toId: string;
  /** 途中にある地点（狙う対象ではない） */
  viaIds: string[];
  bearing: number;
  length: number;
  floor: number;
}

/** 同一直線とみなす方位の許容差（度） */
const AXIS_TOLERANCE = 5;

/**
 * 経路グラフから廊下の直線区間を抽出する。
 * 方位がほぼ同じで繋がっている区間を1本にまとめ、その両端を返す。
 */
export function corridorAxes(): CorridorAxis[] {
  const edges = CAMPUS.edges.filter(
    (e) => e.kind === "corridor" || e.kind === "bridge",
  );
  const used = new Set<number>();
  const axes: CorridorAxis[] = [];

  edges.forEach((seed, i) => {
    if (used.has(i)) return;
    const sa = NODES.get(seed.from);
    const sb = NODES.get(seed.to);
    if (!sa || !sb) return;

    const baseBearing = bearingOf(sa, sb, UP);
    const chain = [i];
    used.add(i);
    const nodeIds = new Set([seed.from, seed.to]);

    // 同じ向き（または真逆）で繋がっている区間を、伸びなくなるまで足していく
    let grew = true;
    while (grew) {
      grew = false;
      edges.forEach((e, j) => {
        if (used.has(j)) return;
        if (!nodeIds.has(e.from) && !nodeIds.has(e.to)) return;
        const a = NODES.get(e.from);
        const b = NODES.get(e.to);
        if (!a || !b) return;
        const d = Math.abs(angleDiff(baseBearing, bearingOf(a, b, UP)));
        if (d < AXIS_TOLERANCE || d > 180 - AXIS_TOLERANCE) {
          used.add(j);
          chain.push(j);
          nodeIds.add(e.from);
          nodeIds.add(e.to);
          grew = true;
        }
      });
    }

    // 端点＝この鎖の中で1回しか現れないノード
    const degree = new Map<string, number>();
    for (const k of chain) {
      const e = edges[k];
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const ends = [...degree.entries()]
      .filter(([, v]) => v === 1)
      .map(([id]) => id);
    if (ends.length !== 2) return; // 枝分かれしている場合は扱わない

    const p = NODES.get(ends[0]);
    const q = NODES.get(ends[1]);
    if (!p || !q) return;

    axes.push({
      id: `${p.id}|${q.id}`,
      fromId: p.id,
      toId: q.id,
      viaIds: [...nodeIds].filter((id) => id !== p.id && id !== q.id),
      bearing: bearingOf(p, q, UP),
      length: distanceOf(p, q),
      floor: p.floor,
    });
  });

  // 長い軸ほど測りやすいので先頭に出す
  return axes.sort((a, b) => b.length - a.length);
}

/** 経路上の1区間（マージ前） */
interface Segment {
  fromId: string;
  toId: string;
  kind: CampusEdge["kind"];
  bearing: number;
  distance: number;
  floorChange: number;
  instruction?: string;
  /** 直進マージで途中に埋もれた通過地点。案内の目印に使う */
  passed: string[];
}

/** 「校長室前」→「校長室」。案内文で「前」が重ならないようにする */
function roomName(label: string): string {
  return label.replace(/前$/, "");
}

/** 目的地の表示名（destinations に登録があればそちらを優先） */
function displayNameOf(node: CampusNode): string {
  const d = CAMPUS.destinations.find((x) => x.nodeId === node.id);
  return d?.displayName ?? roomName(node.label);
}

function toSegments(path: string[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = NODES.get(path[i]);
    const b = NODES.get(path[i + 1]);
    if (!a || !b) continue;
    const link = (ADJ.get(path[i]) ?? []).find((l) => l.to === path[i + 1]);
    const kind = link?.edge.kind ?? "corridor";
    segs.push({
      fromId: a.id,
      toId: b.id,
      kind,
      bearing: bearingOf(a, b, UP),
      distance: kind === "stair" ? 0 : distanceOf(a, b),
      floorChange: link?.floorChange ?? 0,
      instruction: link?.edge.instruction,
      passed: [],
    });
  }
  return segs;
}

/**
 * 連続する直進区間を1つにまとめる。
 * 曲がり角ごとに「直進」と言われると煩わしいため。
 * 階段・扉は必ず独立した手順にする。
 */
function mergeStraight(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    const mergeable =
      prev &&
      !prev.instruction &&
      !s.instruction &&
      (prev.kind === "corridor" || prev.kind === "bridge") &&
      (s.kind === "corridor" || s.kind === "bridge") &&
      Math.abs(angleDiff(prev.bearing, s.bearing)) < 20;

    if (mergeable) {
      // 距離で重みづけして方位を平均するのではなく、
      // 長い方の向きを採用する（曲がりが微小なので実用上の差はない）
      if (s.distance > prev.distance) prev.bearing = s.bearing;
      prev.distance += s.distance;
      // マージで消える中間地点は、目印として控えておく
      prev.passed.push(prev.toId);
      prev.toId = s.toId;
    } else {
      out.push({ ...s, passed: [...s.passed] });
    }
  }
  return out;
}

export type StepKind = "go" | "turn" | "stair" | "door" | "arrive";

export interface GuideStep {
  index: number;
  kind: StepKind;
  fromId: string;
  toId: string;
  /** 進むべき実方位（北=0度）。arrive では直前の進行方位 */
  bearing: number;
  distance: number;
  /** 主文 */
  text: string;
  /** 補足（目印など） */
  detail?: string;
}

export interface Guide {
  from: CampusNode;
  to: CampusNode;
  path: string[];
  steps: GuideStep[];
  totalDistance: number;
  totalSeconds: number;
}

/** 経路から案内手順を組み立てる */
export function buildGuide(fromId: string, toId: string): Guide | null {
  const from = NODES.get(fromId);
  const to = NODES.get(toId);
  if (!from || !to) return null;

  const path = findPath(fromId, toId);
  if (!path) return null;

  const segs = mergeStraight(toSegments(path));
  const steps: GuideStep[] = [];
  let total = 0;

  segs.forEach((s, i) => {
    const prev = segs[i - 1];
    const node = NODES.get(s.toId);
    total += s.distance;

    if (s.kind === "stair") {
      const dir = s.floorChange > 0 ? "上がる" : "下りる";
      const floor = node?.floor;
      steps.push({
        index: steps.length,
        kind: "stair",
        fromId: s.fromId,
        toId: s.toId,
        bearing: s.bearing,
        distance: 0,
        text: floor ? `階段で${floor}階まで${dir}` : `階段を${dir}`,
        detail: s.instruction,
      });
      return;
    }

    if (s.kind === "door") {
      steps.push({
        index: steps.length,
        kind: "door",
        fromId: s.fromId,
        toId: s.toId,
        bearing: s.bearing,
        distance: s.distance,
        text: s.instruction ?? `${node?.label ?? "次の地点"}へ進む`,
      });
      return;
    }

    // 通常の廊下・渡り廊下
    let text: string;
    if (s.instruction) {
      text = s.instruction;
    } else if (!prev) {
      // 最初の一歩は方位で示す（利用者はまだ向きが定まっていない）
      text = `${compassLabel(s.bearing)}の方向へ ${formatDistance(s.distance)} 進む`;
    } else {
      const turn = turnInstruction(prev.bearing, s.bearing);
      text =
        turn === "そのまま直進"
          ? `そのまま ${formatDistance(s.distance)} 進む`
          : `${turn}、${formatDistance(s.distance)} 進む`;
    }

    // 目印：渡り廊下である旨 → 登録済みの目印 → 途中で通過する部屋
    const detailParts: string[] = [];
    if (s.kind === "bridge") detailParts.push("渡り廊下を渡ります");
    const landmark = NODES.get(s.fromId)?.landmark?.text;
    if (landmark) detailParts.push(landmark);
    const passedRooms = s.passed
      .map((id) => NODES.get(id))
      .filter((n): n is CampusNode => !!n && n.kind === "room")
      .map((n) => roomName(n.label));
    if (passedRooms.length > 0) {
      detailParts.push(`途中で${passedRooms.join("・")}の前を通ります`);
    }

    steps.push({
      index: steps.length,
      kind: prev ? "turn" : "go",
      fromId: s.fromId,
      toId: s.toId,
      bearing: s.bearing,
      distance: s.distance,
      text,
      detail: detailParts.length > 0 ? detailParts.join("。") : undefined,
    });
  });

  // 到着の手順
  // 部屋が廊下のどちら側にあるか（entranceBearing）と、
  // 最後の進行方位を突き合わせて「右手／左手」を決める。
  const last = segs[segs.length - 1];
  const arriveBearing = last?.bearing ?? 0;
  const destName = displayNameOf(to);
  let arriveText = `${destName}に到着します`;
  if (last && to.entranceBearing !== undefined) {
    const side = sideOf(last.bearing, to.entranceBearing);
    arriveText =
      side === "正面" ? `正面が${destName}です` : `${side}が${destName}です`;
  }
  steps.push({
    index: steps.length,
    kind: "arrive",
    fromId: last?.toId ?? fromId,
    toId: to.id,
    bearing: arriveBearing,
    distance: 0,
    text: arriveText,
    detail: to.landmark?.text,
  });

  return {
    from,
    to,
    path,
    steps,
    totalDistance: total,
    totalSeconds: walkSeconds(total),
  };
}
