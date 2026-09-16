// ============================================================
// アプリ本体：ハッシュベースの画面切り替えと現在地の管理
//
//   来校者
//     #/                  ホーム（行き先の選択）
//     #/scan              QRスキャン
//     #/at/<nodeId>       QR読み取り後の着地点（現在地を確定）
//     #/go/<from>/<to>    道案内（ARカメラ／手順リスト）
//
//   管理（PINで保護。来校者の誤操作を防ぐためのもので、秘匿目的ではない）
//     #/admin             メニュー
//     #/admin/verify      方位の検証
//     #/admin/nodes       地点の編集
//     #/admin/plan        平面図・区間一覧
//     #/admin/qr          掲示用QRコード
//     #/admin/data        データの書き出し・取り込み
//
// 現在地と「選択中の行き先」は sessionStorage に持つ。
// リロードやQR読み取りによる画面遷移をまたいでも消えないようにするため。
// ============================================================

import { useEffect, useReducer, useState } from "react";
import { NODES } from "./data/campus";
import HomeView from "./views/HomeView";
import ScanView from "./views/ScanView";
import GuideView from "./views/GuideView";
import AdminHome, { isAdminUnlocked } from "./views/admin/AdminHome";
import VerifyView from "./views/admin/VerifyView";
import NodesView from "./views/admin/NodesView";
import PlanView from "./views/admin/PlanView";
import QrPrintView from "./views/admin/QrPrintView";
import DataView from "./views/admin/DataView";

type Route =
  | { view: "home" }
  | { view: "scan" }
  | { view: "at"; id: string }
  | { view: "go"; from: string; to: string }
  | { view: "admin"; page: string };

const KEY_CURRENT = "arnav.current";
const KEY_PENDING = "arnav.pendingDest";

function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, "")
    .split("/")
    .map(decodeURIComponent);
  switch (parts[0]) {
    case "scan":
      return { view: "scan" };
    case "at":
      return parts[1] ? { view: "at", id: parts[1] } : { view: "home" };
    case "go":
      return parts[1] && parts[2]
        ? { view: "go", from: parts[1], to: parts[2] }
        : { view: "home" };
    case "admin":
      return { view: "admin", page: parts[1] ?? "" };
    default:
      return { view: "home" };
  }
}

function go(hash: string) {
  location.hash = hash;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  const [currentId, setCurrentId] = useState<string | null>(() =>
    sessionStorage.getItem(KEY_CURRENT),
  );
  const [pendingId, setPendingId] = useState<string | null>(() =>
    sessionStorage.getItem(KEY_PENDING),
  );
  // PIN解除など、stateに載らない変化で描き直したいとき用
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // QR着地：現在地を確定し、行き先が決まっていればそのまま案内へ
  useEffect(() => {
    if (route.view !== "at") return;
    if (!NODES.has(route.id)) return;
    sessionStorage.setItem(KEY_CURRENT, route.id);
    setCurrentId(route.id);

    const pending = sessionStorage.getItem(KEY_PENDING);
    if (pending && NODES.has(pending) && pending !== route.id) {
      sessionStorage.removeItem(KEY_PENDING);
      setPendingId(null);
      go(`#/go/${encodeURIComponent(route.id)}/${encodeURIComponent(pending)}`);
    }
  }, [route]);

  /** 行き先を選んだ。現在地が未確定ならQRスキャンへ回す */
  const selectDest = (nodeId: string) => {
    if (currentId && NODES.has(currentId)) {
      go(`#/go/${encodeURIComponent(currentId)}/${encodeURIComponent(nodeId)}`);
      return;
    }
    sessionStorage.setItem(KEY_PENDING, nodeId);
    setPendingId(nodeId);
    go("#/scan");
  };

  const setCurrent = (nodeId: string) => {
    go(`#/at/${encodeURIComponent(nodeId)}`);
  };

  const clearCurrent = () => {
    sessionStorage.removeItem(KEY_CURRENT);
    setCurrentId(null);
  };

  const clearPending = () => {
    sessionStorage.removeItem(KEY_PENDING);
    setPendingId(null);
  };

  const homeProps = {
    onSelectDest: selectDest,
    onScan: () => go("#/scan"),
    onSetCurrent: setCurrent,
    onClearCurrent: clearCurrent,
  };

  let body: React.ReactNode;

  switch (route.view) {
    case "scan":
      body = (
        <ScanView
          onDetected={(id) => go(`#/at/${encodeURIComponent(id)}`)}
          onClose={() => {
            clearPending();
            go("#/");
          }}
          pendingLabel={pendingId ? NODES.get(pendingId)?.label ?? null : null}
        />
      );
      break;

    case "at": {
      const node = NODES.get(route.id);
      body = node ? (
        <HomeView currentId={node.id} {...homeProps} />
      ) : (
        <div className="card">
          <p className="lead">
            読み取ったQRコードに対応する地点が見つかりませんでした。
            掲示されているQRコードをもう一度読み取ってください。
          </p>
          <button className="btn btn-primary" onClick={() => go("#/scan")}>
            QRを読み取る
          </button>
        </div>
      );
      break;
    }

    case "go":
      body = (
        <GuideView
          fromId={route.from}
          toId={route.to}
          onFinish={() => go("#/")}
          onRelocate={(id) =>
            go(`#/go/${encodeURIComponent(id)}/${encodeURIComponent(route.to)}`)
          }
        />
      );
      break;

    case "admin": {
      if (!isAdminUnlocked()) {
        body = <AdminHome onUnlock={force} />;
        break;
      }
      switch (route.page) {
        case "verify":
          body = <VerifyView />;
          break;
        case "nodes":
          body = <NodesView />;
          break;
        case "plan":
          body = <PlanView />;
          break;
        case "qr":
          body = <QrPrintView />;
          break;
        case "data":
          body = <DataView />;
          break;
        default:
          body = <AdminHome onUnlock={force} />;
      }
      break;
    }

    default:
      body = <HomeView currentId={currentId} {...homeProps} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        {route.view !== "home" ? (
          <button
            className="back-btn"
            onClick={() => go("#/")}
            aria-label="ホームへ戻る"
          >
            ←
          </button>
        ) : (
          <span style={{ width: 30 }} />
        )}
        <div className="app-title">
          <h1>校内案内マップ</h1>
          <span>延岡工業高等学校</span>
        </div>
      </header>
      <main className="app-main">{body}</main>
    </div>
  );
}
