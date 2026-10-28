"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { profile, stations } from "../lib/data/portfolio";
import type { EngineStats, QualityMode, SpaceEngine } from "../lib/space/SpaceEngine";

/**
 * API điều khiển cho dev / AI agent trên trình duyệt.
 * Mở DevTools Console (⌘ + ⌥ + J) và thử:  __portfolio.focus("contact")
 */
export interface PortfolioAgentAPI {
  start: () => void;
  focus: (id: string) => boolean;
  overview: () => void;
  close: () => void;
  setQuality: (q: QualityMode) => void;
  getState: () => EngineStats & { openId: string | null };
  listStations: () => { id: string; title: string; planet: string }[];
}

declare global {
  interface Window {
    __portfolio?: PortfolioAgentAPI;
  }
}

export default function Space3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SpaceEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [intro, setIntro] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(() => new Set());

  const byId = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s])), []);
  const devOpenRef = useRef(devOpen);
  const openIdRef = useRef(openId);
  devOpenRef.current = devOpen;
  openIdRef.current = openId;

  const select = useCallback((id: string) => {
    setIntro(false);
    setOpenId(id);
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
    engineRef.current?.focusOn(id);
  }, []);

  const close = useCallback(() => {
    setOpenId(null);
    engineRef.current?.overview();
  }, []);

  const start = useCallback(() => {
    setIntro(false);
    engineRef.current?.startJourney();
  }, []);

  // Khởi tạo engine 1 lần; three.js được import động → trang hiện loader ngay
  useEffect(() => {
    let disposed = false;
    let engine: SpaceEngine | null = null;
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    Promise.all([import("../lib/space/SpaceEngine"), fontsReady])
      .then(([{ SpaceEngine }]) => {
        if (disposed || !mountRef.current) return;
        try {
          engine = new SpaceEngine(mountRef.current, stations);
        } catch (e) {
          setError("Trình duyệt không hỗ trợ WebGL 😢");
          console.error(e);
          return;
        }
        engineRef.current = engine;
        engine.on("select", select);
        engine.on("hover", setHoverId);
        engine.on("stats", (s) => devOpenRef.current && setStats(s));
        setReady(true);
      })
      .catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [select]);

  // Phím tắt: Esc đóng, ←/→ chuyển hành tinh, Enter bắt đầu, ` bật Dev
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.key === "Escape" && openIdRef.current) close();
      if (e.key === "Enter" && intro) start();
      if (e.key === "`") setDevOpen((v) => !v);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const i = stations.findIndex((s) => s.id === openIdRef.current);
        const d = e.key === "ArrowRight" ? 1 : -1;
        select(stations[(i + d + stations.length) % stations.length].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, select, start, intro]);

  useEffect(() => {
    if (!ready) return;
    const eng = () => engineRef.current!;
    window.__portfolio = {
      start,
      focus: (id) => (byId[id] ? (select(id), true) : false),
      overview: close,
      close,
      setQuality: (q) => eng().setQuality(q),
      getState: () => ({ ...eng().getState(), openId: openIdRef.current }),
      listStations: () => eng().listStations(),
    };
    return () => {
      delete window.__portfolio;
    };
  }, [ready, byId, select, close, start]);

  const opened = openId ? byId[openId] : null;
  const openedIndex = opened ? stations.findIndex((s) => s.id === opened.id) : -1;
  const step = (d: number) => select(stations[(openedIndex + d + stations.length) % stations.length].id);

  return (
    <main className="app" data-testid="app" data-ready={ready} data-open={openId ?? ""} data-intro={intro}>
      <div ref={mountRef} className="world" data-testid="world" />
      <div className="vignette" aria-hidden />

      {!ready && !error && (
        <div className="loader" data-testid="loader">
          <div className="spinner" />
          <p>Đang dựng vũ trụ…</p>
        </div>
      )}
      {error && <div className="loader">{error}</div>}

      <header className="hud-top">
        <a className="brand" href={profile.github} target="_blank" rel="noreferrer">
          <img className="avatar" src={profile.avatar} alt="" width={38} height={38} />
          <span>
            <strong>{profile.name}</strong>
            <small>{profile.role}</small>
          </span>
        </a>
        <div className="hud-right">
          {!intro && (
            <button className="btn ghost" onClick={close} data-testid="overview">
              Toàn cảnh
            </button>
          )}
          <a className="btn cv-link" href={profile.cv} target="_blank" rel="noreferrer" data-testid="cv-download">
            Tải CV
          </a>
          <div className="progress" data-testid="progress" title="Số hành tinh đã ghé thăm">
            <span>Đã khám phá</span>
            <b>{visited.size}/{stations.length}</b>
            <i style={{ width: `${(visited.size / stations.length) * 100}%` }} />
          </div>
          <button className="btn ghost icon" data-testid="dev-toggle" onClick={() => setDevOpen((v) => !v)} aria-label="Dev">
            {devOpen ? "✕" : "⚙"}
          </button>
        </div>
      </header>

      {!intro && (
        <nav className="station-nav" aria-label="Danh sách hành tinh" data-testid="station-nav">
          {stations.map((s) => (
            <button
              key={s.id}
              className={`chip ${openId === s.id || hoverId === s.id ? "active" : ""} ${visited.has(s.id) ? "seen" : ""}`}
              style={{ "--c": s.color } as React.CSSProperties}
              data-testid={`nav-${s.id}`}
              onClick={() => select(s.id)}
            >
              <span className="dot" />
              {s.title}
            </button>
          ))}
        </nav>
      )}

      {!intro && !opened && (
        <div className="hint" aria-hidden>
          <span>Kéo để xoay, cuộn để zoom</span>
          <span>Bấm vào hành tinh để xem</span>
          <span><kbd>←</kbd><kbd>→</kbd> chuyển hành tinh</span>
        </div>
      )}

      {intro && ready && (
        <section className="intro" data-testid="intro">
          <img className="intro-photo" src={profile.avatar} alt={profile.name} width={88} height={110} />
          <h1>{profile.name}</h1>
          <p className="lead">{profile.tagline}</p>
          <div className="intro-actions">
            <button className="btn big" data-testid="start" onClick={start}>
              Bay vào hệ mặt trời
            </button>
            <button className="btn ghost big" data-testid="open-cv" onClick={() => select("cv")}>
              Xem CV trên Trái Đất
            </button>
          </div>
          <p className="intro-hint">7 hành tinh: Trái Đất là CV của mình, các hành tinh còn lại là giới thiệu, kỹ năng, dự án và liên hệ.</p>
        </section>
      )}

      {opened && (
        <aside
          key={opened.id}
          className="panel"
          role="dialog"
          aria-label={opened.title}
          data-testid="panel"
          style={{ "--c": opened.color } as React.CSSProperties}
        >
          <button className="close" aria-label="Đóng" data-testid="panel-close" onClick={close}>
            ×
          </button>
          {opened.image && (
            <img className={`panel-img ${opened.kind === "cv" ? "portrait" : ""}`} src={opened.image} alt={opened.title} />
          )}
          <h2>{opened.title}</h2>
          <p className="sub">{opened.subtitle}</p>
          <p className="desc">{opened.description}</p>
          {opened.facts && (
            <dl className="facts">
              {opened.facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {opened.highlights && (
            <ul className="highlights">
              {opened.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
          {opened.tags && (
            <ul className="tags">
              {opened.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {opened.links && (
            <div className="links">
              {opened.links.map((l, i) => (
                <a key={l.href} className={i ? "btn ghost" : "btn"} href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ))}
            </div>
          )}
          <div className="panel-nav">
            <button className="btn ghost" onClick={() => step(-1)}>← Trước</button>
            <span>{openedIndex + 1} / {stations.length}</span>
            <button className="btn ghost" onClick={() => step(1)}>Tiếp →</button>
          </div>
        </aside>
      )}

      {devOpen && (
        <section className="dev" data-testid="dev-panel">
          <h3>Dev workspace</h3>
          <dl>
            <dt>FPS</dt>
            <dd data-testid="fps" className={stats && stats.fps < 40 ? "bad" : "good"}>{stats?.fps ?? "…"}</dd>
            <dt>Draw calls</dt>
            <dd>{stats?.drawCalls ?? "…"}</dd>
            <dt>Triangles</dt>
            <dd>{stats?.triangles.toLocaleString() ?? "…"}</dd>
            <dt>DPR</dt>
            <dd>{stats?.dpr ?? "…"}</dd>
            <dt>Đang xem</dt>
            <dd>{stats?.focusId ?? "—"}</dd>
          </dl>
          <label>
            Chất lượng
            <select
              data-testid="quality"
              defaultValue="auto"
              onChange={(e) => engineRef.current?.setQuality(e.target.value as QualityMode)}
            >
              <option value="auto">Auto ({stats?.quality ?? "…"})</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <p className="tip">
            Agent API: <code>window.__portfolio</code>
            <br />
            vd: <code>__portfolio.focus(&quot;contact&quot;)</code>
          </p>
        </section>
      )}
    </main>
  );
}
