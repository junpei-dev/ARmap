// ============================================================
// 現地メモ（#/admin/notes）
//
// 図面から読めないことを、その場で書き留めるための画面。
// いまの主な用途は図書館棟への動線確認。
//
// 写真は localStorage に入れると容量を超えるため保存しない。
// 撮ったらその場で端末へダウンロードし、ここにはファイル名だけ残す。
// ============================================================

import { useRef, useState } from "react";
import {
  addNote,
  deleteNote,
  downloadFile,
  loadNotes,
  notesToText,
  updateNote,
  type FieldNote,
} from "../../lib/storage";

/** よく使う題目。現地で入力の手間を減らす */
const PRESETS = [
  "図書館への動線",
  "棟のつながり方",
  "QRの掲示場所",
  "目印",
  "距離の実測",
  "気づいたこと",
];

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export default function NotesView() {
  const [list, setList] = useState<FieldNote[]>(() => loadNotes());
  const [title, setTitle] = useState(PRESETS[0]);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);

  const submit = () => {
    if (body.trim() === "") {
      setMsg("内容を入力してください。");
      return;
    }
    const next = addNote({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      title: title.trim() || "メモ",
      body: body.trim(),
      photoNames: pendingPhotos.length > 0 ? pendingPhotos : undefined,
    });
    setList(next);
    setBody("");
    setPendingPhotos([]);
    setMsg("保存しました。");
  };

  /**
   * 撮った写真をその場で端末へ保存する。
   * localStorage には入れない（容量を超えるため）。
   */
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop() || "jpg";
    const name = `arnav-${stamp()}.${ext}`;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setPendingPhotos((p) => [...p, name]);
    setMsg(
      `写真を ${name} として保存しました。端末に残っているか確認してください。`,
    );
    if (fileRef.current) fileRef.current.value = "";
  };

  const exportText = () => {
    downloadFile(`notes-${stamp()}.txt`, notesToText(list));
    setMsg("メモを書き出しました。");
  };

  return (
    <>
      <div className="card">
        <h2>現地メモ</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          図面から読めないことを書き留めます。
          <strong>いま必要なのは図書館棟への動線</strong>
          （管理棟のどこから出て、どう歩いて、図書館のどこに入るか）。
          持ち帰ってから経路データに起こします。
        </p>
      </div>

      <div className="card">
        <h2>新しいメモ</h2>

        <div className="note-presets">
          {PRESETS.map((p) => (
            <button
              key={p}
              className={p === title ? "note-chip is-on" : "note-chip"}
              onClick={() => setTitle(p)}
            >
              {p}
            </button>
          ))}
        </div>

        <input
          className="verify-select"
          value={title}
          placeholder="題目"
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="verify-select"
          rows={5}
          value={body}
          placeholder={
            "例）事務室前の廊下を北西へ進み、保健室を過ぎた突き当たりの扉から外へ出る。\n屋根付きの通路を20歩ほど。図書館の入口は通路の右側。"
          }
          onChange={(e) => setBody(e.target.value)}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={onPhoto}
        />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          写真を撮って端末に保存
        </button>

        {pendingPhotos.length > 0 && (
          <p className="step-meta">
            このメモに添える写真：{pendingPhotos.join(" / ")}
          </p>
        )}

        <button
          className="btn btn-primary"
          style={{ marginTop: 10 }}
          onClick={submit}
        >
          メモを保存
        </button>

        {msg && <p className="verify-msg">{msg}</p>}
      </div>

      <div className="card">
        <h2>記録（{list.length} 件）</h2>
        {list.length === 0 ? (
          <p className="lead" style={{ marginBottom: 0 }}>
            まだメモがありません。
          </p>
        ) : (
          <ul className="note-list">
            {[...list].reverse().map((n) => (
              <li key={n.id}>
                <div className="note-head">
                  <strong>{n.title}</strong>
                  <button
                    className="verify-del"
                    aria-label="このメモを削除"
                    onClick={() => {
                      if (confirm("このメモを削除します。よろしいですか？")) {
                        setList(deleteNote(n.id));
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
                <p className="step-meta">
                  {new Date(n.at).toLocaleString("ja-JP")}
                </p>
                <textarea
                  className="verify-select"
                  rows={3}
                  value={n.body}
                  onChange={(e) =>
                    setList(updateNote(n.id, { body: e.target.value }))
                  }
                />
                {n.photoNames && n.photoNames.length > 0 && (
                  <p className="step-meta">写真：{n.photoNames.join(" / ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {list.length > 0 && (
          <button className="btn" style={{ marginTop: 12 }} onClick={exportText}>
            メモをテキストで書き出す
          </button>
        )}
      </div>

      <div className="notice">
        メモはこの端末にしか残りません。現地作業のあとは必ず書き出すか、
        内容をそのまま送ってください。写真は撮った時点で端末に保存されています。
      </div>

      <div className="foot-links">
        <a href="#/admin">管理メニューへ</a>
        <a href="#/admin/data">データの書き出し</a>
      </div>
    </>
  );
}
