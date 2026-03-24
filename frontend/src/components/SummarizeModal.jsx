import { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { api } from "../api.js";
import { mono, sans, timeAgo } from "../constants.js";
import ExportButtons from "./ExportButtons.jsx";

export default function SummarizeModal({ item, onClose }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [fetchStatus, setFetchStatus] = useState("Locating source document...");
  const evtSourceRef = useRef(null);
  const bufferRef = useRef("");
  const flushTimerRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    const evtSource = api.summarizeStream(item.id, {
      onProgress: (msg) => setFetchStatus(msg),
      onChunk: (text) => {
        setStreaming(true);
        setLoading(false);
        bufferRef.current += text;
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(() => {
            const flushed = bufferRef.current;
            bufferRef.current = "";
            flushTimerRef.current = null;
            setResult(prev => prev + flushed);
          }, 80);
        }
      },
      onDone: (data) => {
        if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
        if (bufferRef.current) { setResult(prev => prev + bufferRef.current); bufferRef.current = ""; }
        if (data.result) setResult(data.result);
        setMeta({ generatedAt: data.generatedAt, provider: data.provider, model: data.model, contentSource: data.contentSource });
        setLoading(false);
        setStreaming(false);
        evtSourceRef.current = null;
      },
      onError: (msg) => {
        setError(msg);
        setLoading(false);
        setStreaming(false);
        evtSourceRef.current = null;
      },
    });
    evtSourceRef.current = evtSource;

    return () => {
      if (evtSourceRef.current) evtSourceRef.current.close();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [item.id]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const metaLine = meta ? `Generated ${meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : ""} · Powered by ${meta.provider}${meta.model ? ` / ${meta.model}` : ""} · Source: ${meta.contentSource || "unknown"}` : "";
  const markdownForExport = result + (metaLine ? `\n\n---\n*${metaLine}*\n` : "");
  const metaHtml = metaLine ? `<p style="color:#888;font-size:11px;font-style:italic">${metaLine.replace(/·/g, "&middot;")}</p>` : "";

  const done = !loading && !streaming && result;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12,
        width: "100%", maxWidth: 720, maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 600, fontFamily: sans, lineHeight: 1.4 }}>{item.title}</div>
            <div style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono, marginTop: 4 }}>
              {item.author || ""} {item.author ? "·" : ""} {item.feed_id} · {(item.relevance * 100).toFixed(0)}% relevance
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, flexShrink: 0, padding: 0, lineHeight: 1 }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {meta && (
            <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
              <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: sans, fontStyle: "italic" }}>
                Powered by {meta.provider}{meta.model ? ` / ${meta.model}` : ""}
              </span>
              <span style={{ color: "var(--text-faint)", fontSize: 10, fontFamily: mono }}>
                {meta.generatedAt ? `Generated ${timeAgo(meta.generatedAt)}` : ""}
              </span>
            </div>
          )}
          {loading && !streaming && (
            <div>
              <div style={{ height: 2, background: "var(--border)", borderRadius: 1, marginBottom: 10 }}>
                <div style={{ height: "100%", width: "60%", background: "var(--accent)", borderRadius: 1, animation: "analyzeProgress 2s ease-in-out infinite" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontFamily: mono, fontSize: 11 }}>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{fetchStatus}</span>
              </div>
            </div>
          )}
          {/* Content source warning */}
          {meta && meta.contentSource && !meta.contentSource.startsWith("full") && (
            <div style={{ padding: "8px 12px", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 6, marginBottom: 12, fontSize: 11, fontFamily: sans, color: "var(--text-secondary)" }}>
              <strong style={{ color: "#D97706" }}>Limited content:</strong> The full document could not be retrieved. This summary is based on the item's feed summary only and may not capture the complete scope of the work.
            </div>
          )}
          {streaming && (
            <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--accent)", animation: "pulse 1s ease-in-out infinite" }} />
              <span style={{ color: "var(--accent)", fontSize: 10, fontFamily: mono, fontWeight: 600 }}>Streaming...</span>
            </div>
          )}
          {error && <div style={{ color: "#EF4444", fontFamily: mono, fontSize: 13 }}>Error: {error}</div>}
          {result && (
            <div ref={contentRef} className="analysis-markdown" style={{ color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.75, fontFamily: sans }}>
              <Markdown components={{
                h1: ({ children }) => <h1 style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 600, fontFamily: mono, marginTop: 20, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 600, fontFamily: mono, marginTop: 18, marginBottom: 8 }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ color: "var(--text-secondary)", fontSize: 13.5, fontWeight: 600, fontFamily: mono, marginTop: 14, marginBottom: 6 }}>{children}</h3>,
                p: ({ children }) => <p style={{ marginTop: 0, marginBottom: 10 }}>{children}</p>,
                strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{children}</strong>,
                ul: ({ children }) => <ul style={{ paddingLeft: 20, marginTop: 4, marginBottom: 10 }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 20, marginTop: 4, marginBottom: 10 }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: 4, color: "var(--text-secondary)" }}>{children}</li>,
                hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />,
                code: ({ children, inline }) => inline !== false
                  ? <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4, fontSize: 12, fontFamily: mono, color: "var(--accent)" }}>{children}</code>
                  : <pre style={{ background: "var(--bg-elevated)", padding: 12, borderRadius: 6, overflow: "auto", fontSize: 12, fontFamily: mono, color: "var(--text-secondary)", margin: "8px 0" }}><code>{children}</code></pre>,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 14, margin: "10px 0", color: "var(--text-muted)" }}>{children}</blockquote>,
                a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px dotted var(--accent)" }}>{children}</a>,
              }}>{result}</Markdown>
            </div>
          )}
        </div>

        {/* Footer with export buttons */}
        {done && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
            <ExportButtons title={item.title} markdown={markdownForExport} contentRef={contentRef} metaHtml={metaHtml} />
          </div>
        )}
      </div>
    </div>
  );
}
