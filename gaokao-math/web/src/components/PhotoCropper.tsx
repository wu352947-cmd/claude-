import { useEffect, useRef, useState } from "react";

const MAX_SIDE = 1600;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  canOcr: boolean;
  busy: string;
  onOcr: (dataUrl: string) => void;
  onFigure: (dataUrl: string) => void;
}

/** 拍照或选图 → 旋转 → 拖动框选 → 识别文字 / 设为配图。全部在手机本地处理，只上传裁好的那一块。 */
export function PhotoCropper({ canOcr, busy, onOcr, onFigure }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [sel, setSel] = useState<Rect | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotated = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  function load(file: File) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setRotation(0);
      setSel(null);
    };
    image.src = url;
  }

  // 旋转后的整图画在离屏 canvas 上，屏幕上的 canvas 只负责显示和框选
  useEffect(() => {
    if (!img) return;
    const r = document.createElement("canvas");
    const turned = rotation % 180 !== 0;
    r.width = turned ? img.naturalHeight : img.naturalWidth;
    r.height = turned ? img.naturalWidth : img.naturalHeight;
    const ctx = r.getContext("2d")!;
    ctx.translate(r.width / 2, r.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    rotated.current = r;
    draw(null);
  }, [img, rotation]);

  function draw(rect: Rect | null) {
    const c = canvasRef.current;
    const src = rotated.current;
    if (!c || !src) return;
    const width = c.parentElement!.clientWidth;
    c.width = width;
    c.height = Math.round((src.height / src.width) * width);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    if (rect) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, c.width, c.height);
      const sx = src.width / c.width;
      ctx.drawImage(src, rect.x * sx, rect.y * sx, rect.w * sx, rect.h * sx, rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = "#6cc0ab";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  function exportCrop(): string | null {
    const src = rotated.current;
    const c = canvasRef.current;
    if (!src || !c) return null;
    const sx = src.width / c.width;
    const r = sel && sel.w > 10 && sel.h > 10 ? sel : { x: 0, y: 0, w: c.width, h: c.height };
    const w = r.w * sx;
    const h = r.h * sx;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const out = document.createElement("canvas");
    out.width = Math.round(w * scale);
    out.height = Math.round(h * scale);
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, r.x * sx, r.y * sx, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", 0.85);
  }

  return (
    <fieldset className="cropper">
      <legend>拍照录题</legend>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
      />
      {img && (
        <>
          <p className="muted small">拖动框出要用的部分；不框选就用整张图。</p>
          <div className="crop-area">
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = point(e);
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const p = point(e);
                const r = {
                  x: Math.min(p.x, drag.current.x),
                  y: Math.min(p.y, drag.current.y),
                  w: Math.abs(p.x - drag.current.x),
                  h: Math.abs(p.y - drag.current.y),
                };
                setSel(r);
                draw(r);
              }}
              onPointerUp={() => (drag.current = null)}
            />
          </div>
          <div className="buttons">
            <button className="ghost" onClick={() => setRotation((rotation + 90) % 360)}>
              旋转
            </button>
            {sel && (
              <button
                className="ghost"
                onClick={() => {
                  setSel(null);
                  draw(null);
                }}
              >
                取消框选
              </button>
            )}
            {canOcr && (
              <button className="primary" disabled={!!busy} onClick={() => exportCrop() && onOcr(exportCrop()!)}>
                {busy === "ocr" ? "识别中…" : "识别文字"}
              </button>
            )}
            <button className="ghost" disabled={!!busy} onClick={() => exportCrop() && onFigure(exportCrop()!)}>
              {busy === "figure" ? "上传中…" : "设为题目配图"}
            </button>
          </div>
          {!canOcr && <p className="muted small">没有配置视觉模型，暂时不能识别文字；可以先设为配图，题干手动输入。</p>}
        </>
      )}
    </fieldset>
  );
}
