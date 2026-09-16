// ============================================================
// 掲示用QRコードの生成・印刷（管理用）
//
// 重要: QRに焼き込まれるURLは、この画面を開いているアドレスから作られる。
// 本番の公開URLで開いてから印刷しないと、使えないQRができてしまう。
// 一度掲示したら貼り替えになるため、印刷前に必ずURLを確認すること。
// ============================================================

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { qrNodes, qrUrlFor, type CampusNode } from "../../data/campus";

export default function QrPrintView() {
  const nodes = qrNodes();
  const base = location.origin + location.pathname;
  const isLocal = /localhost|127\.0\.0\.1|^file:/.test(location.origin);
  const [images, setImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
      const map = new Map<string, string>();
      for (const n of nodes) {
        try {
          const url = await QRCode.toDataURL(qrUrlFor(n.id, base), {
            width: 640,
            margin: 1,
            errorCorrectionLevel: "M",
          });
          map.set(n.id, url);
        } catch {
          // 1件失敗しても他は表示する
        }
      }
      if (alive) setImages(map);
    })();
    return () => {
      alive = false;
    };
    // base はこの画面を開いている間は変わらない
  }, [base]);

  return (
    <>
      <div className="no-print">
        {isLocal && (
          <div
            className="notice"
            style={{
              background: "#fee2e2",
              borderColor: "#fca5a5",
              color: "#b91c1c",
            }}
          >
            <strong>いま開いているのは開発用のアドレスです。</strong>
            <br />
            このまま印刷すると、スマホから開けないQRコードになります。
            公開URL（Cloudflare Pages のアドレス）で開き直してから印刷してください。
          </div>
        )}

        <div className="card">
          <h2>掲示用QRコード</h2>
          <p className="lead">
            QRに焼き込まれるアドレス：
            <br />
            <code style={{ wordBreak: "break-all" }}>{base}#/at/&lt;ID&gt;</code>
          </p>
          <p className="lead" style={{ marginBottom: 0 }}>
            掲示後にアドレスを変更すると、貼り替えが必要になります。
            印刷前に公開URLが確定していることを確認してください。
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => window.print()}
          >
            印刷する（A4に2枚）
          </button>
        </div>
      </div>

      <div className="qr-sheet">
        {nodes.map((n) => (
          <QrCard key={n.id} node={n} image={images.get(n.id)} />
        ))}
      </div>

      <div className="foot-links no-print">
        <a href="#/admin">管理メニューへ</a>
        <a href="#/admin/plan">平面図・区間一覧</a>
      </div>
    </>
  );
}

function QrCard({ node, image }: { node: CampusNode; image?: string }) {
  return (
    <div className="qr-card">
      <p className="qr-school">延岡工業高等学校</p>
      <p className="qr-title">校内案内マップ</p>
      {image ? (
        <img className="qr-img" src={image} alt={`${node.label}のQRコード`} />
      ) : (
        <div className="qr-img qr-img-empty">生成中…</div>
      )}
      <p className="qr-lead">スマホのカメラで読み取ってください</p>
      <p className="qr-place">現在地：{node.label}</p>
      <p className="qr-id no-print">
        {node.id}／掲示場所：{node.qr?.place ?? "未定"}
      </p>
    </div>
  );
}
