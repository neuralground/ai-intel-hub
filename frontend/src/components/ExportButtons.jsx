import { mono } from "../constants.js";

function sanitizeFilename(title) {
  return (title || "export").replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_").slice(0, 60);
}

const PDF_STYLES = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; font-size: 14px; }
h1 { font-size: 20px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
h2 { font-size: 16px; margin-top: 24px; }
h3 { font-size: 14px; }
a { color: #4F8EF7; }
code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
blockquote { border-left: 3px solid #4F8EF7; padding-left: 14px; color: #666; }
ul, ol { padding-left: 20px; }
`.trim();

function buildPDFHtml(title, contentEl, metaHtml) {
  const contentHtml = contentEl?.innerHTML || "";
  return `<!DOCTYPE html><html><head><title>${title}</title>
<style>${PDF_STYLES}</style></head><body>
${metaHtml}
${contentHtml}
</body></html>`;
}

export function saveAsMarkdown(title, markdown) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(title)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveAsPDF(title, contentEl, metaHtml = "") {
  const html = buildPDFHtml(title, contentEl, metaHtml);
  const filename = `${sanitizeFilename(title)}.pdf`;

  // Electron: use native save dialog + printToPDF
  if (window.electronAPI?.savePDF) {
    const result = await window.electronAPI.savePDF({ html, defaultFilename: filename });
    return result?.ok;
  }

  // Web fallback: hidden iframe + print dialog
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:none";
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 250);
}

export default function ExportButtons({ title, markdown, contentRef, metaHtml }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={() => saveAsMarkdown(title, markdown)} style={{
        padding: "6px 14px", background: "transparent", border: "1px solid var(--border)",
        borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: mono,
      }}>Save as Markdown</button>
      <button onClick={() => saveAsPDF(title, contentRef?.current, metaHtml)} style={{
        padding: "6px 14px", background: "var(--accent-bg)", border: "1px solid var(--accent)",
        borderRadius: 6, color: "var(--accent)", cursor: "pointer", fontSize: 11, fontFamily: mono, fontWeight: 600,
      }}>Save as PDF</button>
    </div>
  );
}
