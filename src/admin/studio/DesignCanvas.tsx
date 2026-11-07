/**
 * Lienzo del Estudio Creativo (Konva). El mismo componente se usa para editar, para las
 * miniaturas de plantillas y para exportar, de modo que lo exportado es exactamente lo editado.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import Konva from 'konva';
import { Ellipse, Group, Image as KImage, Layer, Line, Path, Rect, Stage, Text, Transformer } from 'react-konva';
import type { MediaAsset } from '../../../shared/schema.ts';
import { BRAND_FONTS, ORNAMENTS } from '../../../shared/brand.ts';
import { STORY_SAFE, displayText, type Design, type DesignElement } from '../../../shared/studio.ts';

/* ---------- Carga de imágenes (caché compartida) ---------- */
const cache = new Map<string, Promise<HTMLImageElement>>();

export function assetSrc(a: MediaAsset): string {
  return a.kind === 'static' ? `${a.src}-${a.widths[a.widths.length - 1]}.webp` : a.src;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new window.Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

function useImage(url: string | null): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    let alive = true;
    setImg(undefined);
    if (url) loadImage(url).then((i) => alive && setImg(i), () => undefined);
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}

/** Espera a que estén listas las fuentes y todas las imágenes de un diseño (antes de exportar). */
export async function waitForDesignAssets(design: Design, media: Map<string, MediaAsset>): Promise<void> {
  const urls: string[] = [];
  const add = (id: string | undefined | null) => {
    const a = id ? media.get(id) : undefined;
    if (a) urls.push(assetSrc(a));
  };
  add(design.background.image?.asset);
  for (const e of design.elements) if (e.type === 'image') add(e.asset);
  await Promise.allSettled([document.fonts.ready, ...urls.map(loadImage)]);
}

export async function loadBrandFonts(): Promise<void> {
  const specs = ['300 40px', 'italic 300 40px', '400 40px', 'italic 400 40px', '600 40px'].map((s) => `${s} ${BRAND_FONTS.serif}`);
  specs.push(...['400 40px', '500 40px', '600 40px', '700 40px'].map((s) => `${s} ${BRAND_FONTS.sans}`));
  await Promise.allSettled(specs.map((s) => document.fonts.load(s, 'Áa€')));
}

/** Recorte tipo «cover»: rellena el marco sin deformar la imagen. */
function coverCrop(img: HTMLImageElement, w: number, h: number) {
  const ir = img.naturalWidth / img.naturalHeight;
  const fr = w / h;
  if (ir > fr) {
    const cw = img.naturalHeight * fr;
    return { x: (img.naturalWidth - cw) / 2, y: 0, width: cw, height: img.naturalHeight };
  }
  const ch = img.naturalWidth / fr;
  return { x: 0, y: (img.naturalHeight - ch) / 2, width: img.naturalWidth, height: ch };
}

function containBox(img: HTMLImageElement, w: number, h: number) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s;
  const ih = img.naturalHeight * s;
  return { x: (w - iw) / 2, y: (h - ih) / 2, width: iw, height: ih };
}

function gradientPoints(angle: number, W: number, H: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const dx = (Math.cos(rad) * W) / 2;
  const dy = (Math.sin(rad) * H) / 2;
  return { start: { x: W / 2 - dx, y: H / 2 - dy }, end: { x: W / 2 + dx, y: H / 2 + dy } };
}

interface ElementProps {
  el: DesignElement;
  media: Map<string, MediaAsset>;
  logo: MediaAsset | undefined;
  interactive: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<DesignElement>) => void;
  onDragMove?: (node: Konva.Node) => void;
  onDragEnd?: () => void;
}

function ElementNode({ el, media, logo, interactive, onSelect, onChange, onDragMove, onDragEnd }: ElementProps) {
  const asset = el.type === 'image' ? media.get(el.asset) : el.type === 'logo' ? logo : undefined;
  const img = useImage(asset ? assetSrc(asset) : null);
  const common = {
    id: el.id,
    name: 'element',
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    opacity: el.opacity,
    draggable: interactive && !el.locked,
    listening: interactive,
    onMouseDown: () => onSelect(el.id),
    onTap: () => onSelect(el.id),
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => onDragMove?.(e.target),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd?.();
      onChange(el.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      const sx = n.scaleX();
      const sy = n.scaleY();
      n.scaleX(1);
      n.scaleY(1);
      const patch: Partial<DesignElement> = {
        x: Math.round(n.x()),
        y: Math.round(n.y()),
        rotation: Math.round(n.rotation() * 10) / 10,
        width: Math.max(4, Math.round(el.width * sx)),
        height: Math.max(1, Math.round(el.height * (el.type === 'text' ? 1 : sy))),
      };
      onChange(el.id, patch);
    },
  };

  switch (el.type) {
    case 'text':
      return (
        <Text
          {...common}
          text={displayText(el)}
          width={el.width}
          fontFamily={`${el.font === 'serif' ? BRAND_FONTS.serif : BRAND_FONTS.sans}, serif`}
          fontSize={el.size}
          fontStyle={`${el.italic ? 'italic ' : ''}${el.weight}`}
          fill={el.color}
          align={el.align}
          letterSpacing={el.letterSpacing}
          lineHeight={el.lineHeight}
          wrap="word"
        />
      );
    case 'image': {
      const box = img ? (el.fit === 'cover' ? { x: 0, y: 0, width: el.width, height: el.height } : containBox(img, el.width, el.height)) : null;
      return (
        <Group
          {...common}
          width={el.width}
          height={el.height}
          clipFunc={(ctx) => {
            const r = Math.min(el.radius, el.width / 2, el.height / 2);
            ctx.beginPath();
            ctx.roundRect(0, 0, el.width, el.height, r);
            ctx.closePath();
          }}
        >
          <Rect width={el.width} height={el.height} fill={img ? undefined : '#2a2225'} />
          {img && box && <KImage image={img} {...box} crop={el.fit === 'cover' ? coverCrop(img, el.width, el.height) : undefined} />}
        </Group>
      );
    }
    case 'ornament': {
      const def = ORNAMENTS[el.ornament];
      return (
        <Group {...common} width={el.width} height={el.height}>
          <Rect width={el.width} height={el.height} fill="transparent" />
          <Group scaleX={el.width / def.box[0]} scaleY={el.height / def.box[1]}>
            {def.paths.map((p, i) => (
              <Path
                key={i}
                data={p.d}
                fill={p.mode === 'fill' ? el.color : undefined}
                stroke={p.mode === 'stroke' ? el.color : undefined}
                strokeWidth={el.strokeWidth}
                strokeScaleEnabled={false}
                lineCap="round"
                lineJoin="round"
              />
            ))}
          </Group>
        </Group>
      );
    }
    case 'shape':
      if (el.shape === 'line')
        return <Line {...common} points={[0, 0, el.width, 0]} stroke={el.stroke || el.fill || '#c9a96e'} strokeWidth={el.strokeWidth || 2} hitStrokeWidth={20} />;
      if (el.shape === 'ellipse')
        return (
          <Ellipse
            {...common}
            x={el.x + el.width / 2}
            y={el.y + el.height / 2}
            offsetX={0}
            radiusX={el.width / 2}
            radiusY={el.height / 2}
            fill={el.fill || undefined}
            stroke={el.stroke || undefined}
            strokeWidth={el.strokeWidth}
            onDragEnd={(e) => {
              onDragEnd?.();
              onChange(el.id, { x: Math.round(e.target.x() - el.width / 2), y: Math.round(e.target.y() - el.height / 2) });
            }}
            onTransformEnd={(e) => {
              const n = e.target;
              const w = Math.round(el.width * n.scaleX());
              const h = Math.round(el.height * n.scaleY());
              n.scaleX(1);
              n.scaleY(1);
              onChange(el.id, { width: w, height: h, x: Math.round(n.x() - w / 2), y: Math.round(n.y() - h / 2), rotation: n.rotation() });
            }}
          />
        );
      return <Rect {...common} width={el.width} height={el.height} cornerRadius={el.radius} fill={el.fill || undefined} stroke={el.stroke || undefined} strokeWidth={el.strokeWidth} />;
    case 'logo': {
      if (img) {
        const box = containBox(img, el.width, el.height);
        return (
          <Group {...common} width={el.width} height={el.height}>
            <Rect width={el.width} height={el.height} fill="transparent" />
            <KImage image={img} {...box} />
          </Group>
        );
      }
      const w = el.width;
      return (
        <Group {...common} width={w} height={el.height}>
          <Rect width={w} height={el.height} fill="transparent" />
          <Text text="GASTROBAR" width={w} align="center" fontFamily={BRAND_FONTS.sans} fontStyle="700" fontSize={w * 0.06} letterSpacing={w * 0.028} fill={el.accent} />
          <Text text="Torero" y={w * 0.075} width={w} align="center" fontFamily={BRAND_FONTS.serif} fontStyle="400" fontSize={w * 0.2} fill={el.color} />
        </Group>
      );
    }
  }
}

export interface DesignCanvasProps {
  design: Design;
  media: Map<string, MediaAsset>;
  logo?: MediaAsset;
  scale: number;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<DesignElement>) => void;
  stageRef?: RefObject<Konva.Stage | null>;
  showSafeArea?: boolean;
}

export function DesignCanvas({ design, media, logo, scale, interactive = false, selectedId, onSelect, onChange, stageRef, showSafeArea }: DesignCanvasProps) {
  const W = design.width;
  const H = design.height;
  const bgAsset = design.background.image ? media.get(design.background.image.asset) : undefined;
  const bgImg = useImage(bgAsset ? assetSrc(bgAsset) : null);
  const trRef = useRef<Konva.Transformer>(null);
  const localStage = useRef<Konva.Stage>(null);
  const stage = stageRef ?? localStage;
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const g = design.background.gradient ? gradientPoints(design.background.gradient.angle, W, H) : null;

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? stage.current?.findOne(`#${selectedId}`) : null;
    tr.nodes(node ? [node] : []);
    const el = design.elements.find((e) => e.id === selectedId);
    tr.enabledAnchors(el?.type === 'text' ? ['middle-left', 'middle-right'] : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']);
    tr.keepRatio(el?.type === 'ornament' || el?.type === 'logo');
    tr.getLayer()?.batchDraw();
  }, [selectedId, design, stage]);

  /** Ajuste magnético a centros y bordes del lienzo, con guías visibles. */
  const snap = (node: Konva.Node) => {
    const box = node.getClientRect({ relativeTo: node.getLayer() ?? undefined });
    const T = 10;
    const v: number[] = [];
    const h: number[] = [];
    const targetsX = [0, W / 2, W];
    const targetsY = [0, H / 2, H];
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (const t of targetsX) {
      if (Math.abs(cx - t) < T) {
        node.x(node.x() + (t - cx));
        v.push(t);
      } else if (Math.abs(box.x - t) < T) {
        node.x(node.x() + (t - box.x));
        v.push(t);
      } else if (Math.abs(box.x + box.width - t) < T) {
        node.x(node.x() + (t - box.x - box.width));
        v.push(t);
      }
    }
    for (const t of targetsY) {
      if (Math.abs(cy - t) < T) {
        node.y(node.y() + (t - cy));
        h.push(t);
      }
    }
    setGuides({ v, h });
  };

  const visible = design.elements.filter((e) => design.showLogo || e.type !== 'logo');

  return (
    <Stage
      ref={stage}
      width={Math.round(W * scale)}
      height={Math.round(H * scale)}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (interactive && (e.target === e.target.getStage() || e.target.name() === 'background')) onSelect?.(null);
      }}
      onTouchStart={(e) => {
        if (interactive && (e.target === e.target.getStage() || e.target.name() === 'background')) onSelect?.(null);
      }}
    >
      <Layer>
        <Rect
          name="background"
          width={W}
          height={H}
          fill={g ? undefined : design.background.color}
          fillLinearGradientStartPoint={g?.start}
          fillLinearGradientEndPoint={g?.end}
          fillLinearGradientColorStops={g ? [0, design.background.color, 1, design.background.gradient!.to] : undefined}
        />
        {bgImg && design.background.image && (
          <KImage name="background" image={bgImg} width={W} height={H} crop={coverCrop(bgImg, W, H)} opacity={design.background.image.opacity} />
        )}
        {visible.map((el) => (
          <ElementNode
            key={el.id}
            el={el}
            media={media}
            logo={logo}
            interactive={interactive}
            onSelect={(id) => onSelect?.(id)}
            onChange={(id, p) => onChange?.(id, p)}
            onDragMove={snap}
            onDragEnd={() => setGuides({ v: [], h: [] })}
          />
        ))}
      </Layer>
      {interactive && (
        <Layer name="ui">
          {showSafeArea && (
            <>
              <Rect y={0} width={W} height={STORY_SAFE.top} fill="#3b82f6" opacity={0.14} listening={false} />
              <Rect y={H - STORY_SAFE.bottom} width={W} height={STORY_SAFE.bottom} fill="#3b82f6" opacity={0.14} listening={false} />
              <Rect x={STORY_SAFE.side} y={STORY_SAFE.top} width={W - STORY_SAFE.side * 2} height={H - STORY_SAFE.top - STORY_SAFE.bottom} stroke="#3b82f6" strokeWidth={2 / scale} dash={[12, 10]} listening={false} />
              <Text x={20} y={20} text="Zona de interfaz de Instagram" fontSize={28} fill="#93c5fd" listening={false} />
            </>
          )}
          {guides.v.map((x) => (
            <Line key={`v${x}`} points={[x, 0, x, H]} stroke="#e11d48" strokeWidth={1.5 / scale} dash={[8, 6]} listening={false} />
          ))}
          {guides.h.map((y) => (
            <Line key={`h${y}`} points={[0, y, W, y]} stroke="#e11d48" strokeWidth={1.5 / scale} dash={[8, 6]} listening={false} />
          ))}
          <Transformer ref={trRef} rotateEnabled anchorSize={10} borderStroke="#c9a96e" anchorStroke="#c9a96e" anchorFill="#fff" ignoreStroke />
        </Layer>
      )}
    </Stage>
  );
}

/** Exporta el lienzo al tamaño real del formato (sin guías ni selección), con dimensiones exactas. */
export async function exportStage(stage: Konva.Stage, design: Design, type: 'image/png' | 'image/jpeg', quality = 0.95, targetWidth = design.width): Promise<string> {
  const ui = stage.findOne('.ui');
  const prev = { width: stage.width(), height: stage.height(), scale: stage.scaleX() };
  ui?.hide();
  stage.size({ width: design.width, height: design.height });
  stage.scale({ x: 1, y: 1 });
  stage.draw();
  try {
    return stage.toDataURL({ mimeType: type, quality, pixelRatio: targetWidth / design.width });
  } finally {
    stage.size({ width: prev.width, height: prev.height });
    stage.scale({ x: prev.scale, y: prev.scale });
    ui?.show();
    stage.draw();
  }
}
