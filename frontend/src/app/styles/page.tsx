'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import {
  FACE_SHAPES,
  FaceScanError,
  analyzeFace,
  matchPercent,
  matchReason,
  preloadFaceModel,
  type FaceAnalysis,
} from '@/lib/faceShape';
import type { HairStyle } from '@/lib/types';

type Gender = 'MEN' | 'WOMEN';

function matchColour(pct: number) {
  if (pct >= 85) return { bar: 'bg-emerald-500', text: 'text-emerald-700', label: 'Great match' };
  if (pct >= 75) return { bar: 'bg-amber-500', text: 'text-amber-700', label: 'Good match' };
  return { bar: 'bg-neutral-400', text: 'text-muted', label: 'Not the best fit' };
}

/** Illustrated placeholder until an admin uploads a real photo for the style. */
function StylePlaceholder({ style }: { style: HairStyle }) {
  const palette =
    style.gender === 'MEN' ? 'from-sky-100 via-indigo-50 to-slate-100' : 'from-rose-100 via-orange-50 to-amber-50';
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${palette} p-2 text-center`}>
      <span className="text-4xl" aria-hidden>
        {style.gender === 'MEN' ? '💇‍♂️' : '💇‍♀️'}
      </span>
      <span className="mt-1 text-[11px] font-semibold text-foreground/70">{style.name}</span>
    </div>
  );
}

function StyleCard({
  style,
  analysis,
  revealed,
  onCompare,
}: {
  style: HairStyle;
  analysis: FaceAnalysis | null;
  revealed: boolean;
  onCompare: () => void;
}) {
  const pct = analysis ? matchPercent(style.faceShapeFit, analysis) : null;
  const colour = pct != null ? matchColour(pct) : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative aspect-[4/5] bg-neutral-100">
        {style.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={style.imageUrl} alt={style.name} className="h-full w-full object-cover" />
        ) : (
          <StylePlaceholder style={style} />
        )}
        {revealed && pct != null && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
            {pct}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="font-semibold leading-tight">{style.name}</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {style.length} · {style.maintenance} upkeep
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-foreground/70">{style.description}</p>

        {revealed && pct != null && analysis ? (
          <div className="mt-2">
            <div className="flex items-baseline justify-between">
              <span className={`text-xs font-semibold ${colour!.text}`}>{colour!.label}</span>
              <span className={`text-lg font-bold ${colour!.text}`}>{pct}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className={`h-full rounded-full ${colour!.bar}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-muted">{matchReason(style.faceShapeFit, analysis)}</p>
          </div>
        ) : (
          <button
            onClick={onCompare}
            className="mt-auto rounded-lg bg-brand-tint py-1.5 text-xs font-semibold text-brand-dark active:scale-[0.98]"
          >
            Compare with my face
          </button>
        )}
      </div>
    </div>
  );
}

export default function StyleFinderPage() {
  const [gender, setGender] = useState<Gender>('WOMEN');
  const [styles, setStyles] = useState<HairStyle[] | null>(null);
  const [analysis, setAnalysis] = useState<FaceAnalysis | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanTip, setScanTip] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [sortByMatch, setSortByMatch] = useState(false);
  const [nudge, setNudge] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const scanCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<HairStyle[]>('/styles')
      .then(setStyles)
      .catch(() => setStyles([]));
    preloadFaceModel();
  }, []);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setScanError(null);
    setNudge(false);
    try {
      const result = await analyzeFace(file);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(result.imageUrl);
      setAnalysis(result.analysis);
      setScanTip(result.tip);
      setSortByMatch(true);
    } catch (err) {
      setScanError(err instanceof FaceScanError ? err.message : 'Something went wrong scanning that photo. Please try again.');
    } finally {
      setScanning(false);
    }
  }

  function compare(id: string) {
    if (!analysis) {
      setNudge(true);
      scanCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setRevealed((r) => new Set(r).add(id));
  }

  const visible = useMemo(() => {
    const list = (styles ?? []).filter((s) => s.gender === gender);
    if (analysis && sortByMatch) {
      return [...list].sort((a, b) => matchPercent(b.faceShapeFit, analysis) - matchPercent(a.faceShapeFit, analysis));
    }
    return list;
  }, [styles, gender, analysis, sortByMatch]);

  const shapeInfo = analysis ? FACE_SHAPES[analysis.shape] : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24">
      <h1 className="text-2xl font-bold">✂️ Style Finder</h1>
      <p className="mt-1 text-sm text-muted">
        Not sure what to ask for? Browse popular cuts and see how well each one suits your face.
      </p>

      {/* Face scan */}
      <div
        ref={scanCardRef}
        className={`mt-4 scroll-mt-20 rounded-2xl border p-4 transition ${
          nudge ? 'border-brand bg-brand-tint/60 ring-2 ring-brand/40' : 'border-border bg-surface'
        }`}
      >
        {analysis && photoUrl ? (
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Your photo" className="h-24 w-20 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Your face shape</p>
              <p className="text-xl font-bold">
                {shapeInfo!.label}{' '}
                <span className="text-sm font-medium text-muted">· {Math.round(analysis.confidence * 100)}% sure</span>
              </p>
              <p className="mt-1 text-sm text-foreground/80">{shapeInfo!.tip}</p>
              <button onClick={() => cameraRef.current?.click()} className="mt-2 text-xs font-semibold text-accent underline">
                Retake photo
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-semibold">{nudge ? '👇 First, scan your face' : '📸 Scan your face'}</p>
            <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
              <li>• Face the camera straight on, in good light</li>
              <li>• Pull your hair back off your forehead and face</li>
              <li>• Remove glasses; keep a neutral expression</li>
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => cameraRef.current?.click()}
                disabled={scanning}
                className="rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
              >
                {scanning ? 'Scanning…' : 'Take a selfie'}
              </button>
              <button
                onClick={() => uploadRef.current?.click()}
                disabled={scanning}
                className="rounded-xl border border-border py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                Upload a photo
              </button>
            </div>
          </>
        )}
        {scanError && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{scanError}</p>}
        {analysis && !scanError && scanTip && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{scanTip}</p>
        )}
        <p className="mt-2 text-[11px] text-muted">
          🔒 Your photo stays on your phone — it&apos;s analysed on your device and never uploaded.
        </p>
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onPhoto} />
        <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
      </div>

      {/* Gender + sort */}
      <div className="sticky top-[52px] z-10 -mx-4 mt-5 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-2">
        <div className="flex min-w-0 gap-1 rounded-full border border-border bg-surface p-1">
          {(['WOMEN', 'MEN'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${gender === g ? 'bg-brand text-brand-foreground' : 'text-muted'}`}
            >
              {g === 'WOMEN' ? "Women's" : "Men's"}
            </button>
          ))}
        </div>
        {analysis && (
          <button
            onClick={() => setRevealed(new Set(visible.map((s) => s.id)))}
            className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold"
          >
            Compare all
          </button>
        )}
      </div>
      {analysis && (
        <label className="mt-1 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={sortByMatch}
            onChange={(e) => setSortByMatch(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Best matches first
        </label>
      )}

      {/* Catalogue */}
      {styles === null && <p className="mt-4 text-sm text-muted">Loading styles…</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visible.map((s) => (
          <StyleCard key={s.id} style={s} analysis={analysis} revealed={revealed.has(s.id)} onCompare={() => compare(s.id)} />
        ))}
      </div>
      {styles && visible.length === 0 && <p className="mt-4 text-sm text-muted">No styles yet — check back soon.</p>}

      <div className="mt-6 rounded-2xl bg-foreground p-4 text-white">
        <p className="font-semibold">Found a look you love?</p>
        <p className="mt-0.5 text-sm text-white/70">Show this style to your stylist when you book.</p>
        <Link
          href={`/search?category=${gender === 'MEN' ? 'Men' : 'Women'}`}
          className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
        >
          Find a {gender === 'MEN' ? "men's" : "women's"} salon near me →
        </Link>
      </div>

      <p className="mt-4 text-[11px] text-muted">
        Match scores are a styling guide based on your face shape, not a guarantee — hair type, texture and your stylist&apos;s
        advice matter too.
      </p>
    </div>
  );
}
