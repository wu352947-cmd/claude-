import { useEffect, useState } from "react";
import { QuestionRunner } from "./components/QuestionRunner";
import { flush, onQueueChange } from "./offline";
import { AddQuestion } from "./pages/AddQuestion";
import { Bank } from "./pages/Bank";
import { Exams } from "./pages/Exams";
import { Mistakes } from "./pages/Mistakes";
import { Stats } from "./pages/Stats";
import { Today } from "./pages/Today";

const TABS = [
  { id: "today", label: "今日" },
  { id: "review", label: "错题本" },
  { id: "bank", label: "题库" },
  { id: "exam", label: "模考" },
  { id: "add", label: "录题" },
  { id: "stats", label: "看板" },
] as const;
type Tab = (typeof TABS)[number]["id"];

interface Queue {
  ids: string[];
  reasons: Record<string, string>;
  index: number;
  from: Tab;
}

function tabFromHash(): Tab {
  const h = location.hash.replace(/^#\/?/, "");
  return (TABS.find((t) => t.id === h)?.id ?? "today") as Tab;
}

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [toast, setToast] = useState("");

  // 离线作答：联网时自动同步
  useEffect(() => {
    const sync = async () => {
      const r = await flush();
      if (r?.synced) {
        setToast(`离线作答已同步：${r.synced} 题，全对 ${r.correct} 题`);
        setTimeout(() => setToast(""), 5000);
      }
    };
    const up = () => {
      setOnline(true);
      sync();
    };
    const down = () => setOnline(false);
    addEventListener("online", up);
    addEventListener("offline", down);
    const off = onQueueChange(setPending);
    sync();
    return () => {
      removeEventListener("online", up);
      removeEventListener("offline", down);
      off();
    };
  }, []);

  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash());
      setQueue(null);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const go = (t: Tab) => {
    setQueue(null);
    setRefresh((n) => n + 1);
    if (location.hash !== `#/${t}`) location.hash = `#/${t}`;
    else setTab(t);
  };
  const start = (ids: string[], reasons: Record<string, string> = {}) =>
    setQueue({ ids, reasons, index: 0, from: tab });

  let body: React.ReactNode;
  if (queue) {
    const id = queue.ids[queue.index];
    const last = queue.index + 1 >= queue.ids.length;
    body = (
      <>
        <button className="back" onClick={() => go(queue.from)}>
          ← 返回
        </button>
        <QuestionRunner
          key={`${id}-${queue.index}`}
          questionId={id}
          reason={queue.reasons[id]}
          position={queue.ids.length > 1 ? { index: queue.index, total: queue.ids.length } : undefined}
          onNext={last ? () => go(queue.from) : () => setQueue({ ...queue, index: queue.index + 1 })}
        />
      </>
    );
  } else if (tab === "today") body = <Today key={refresh} onStart={start} />;
  else if (tab === "review") body = <Mistakes key={refresh} onStart={start} />;
  else if (tab === "bank") body = <Bank key={refresh} onStart={start} />;
  else if (tab === "exam") body = <Exams key={refresh} onPractice={start} />;
  else if (tab === "add") body = <AddQuestion key={refresh} onCreated={(id) => setQueue({ ids: [id], reasons: {}, index: 0, from: "bank" })} />;
  else body = <Stats key={refresh} />;

  return (
    <>
      <nav className="nav">
        <span className="brand">数·途</span>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id && !queue ? "active" : ""} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {(!online || pending > 0) && (
        <div className="offline-bar" role="status">
          {!online ? "离线中：可以做已缓存的题，作答会在联网后同步" : `有 ${pending} 道离线作答等待同步`}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <main className="main">{body}</main>
    </>
  );
}
