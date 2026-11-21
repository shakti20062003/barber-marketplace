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
  type ScanDiagnostics,
} from '@/lib/faceShape';
import type { HairStyle } from '@/lib/types';
import { useCachedState } from '@/lib/clientCache';
import SmoothImage, { cardImageUrl } from '@/components/SmoothImage';

type View = 'MEN' | 'WOMEN' | 'ALL';

// Remembered per device so the Style Finder opens on the customer's own list.
// Styles stay open to everyone — this is only the default view.
const VIEW_KEY = 'trimly_style_view';
const VIEW_LABEL: Record<View, string> = { MEN: "Men's styles", WOMEN: "Women's styles", ALL: 'All' };

function readSavedView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'MEN' || v === 'WOMEN' || v === 'ALL' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Broad bands only — never a percentage. The underlying score comes from
 * face-shape styling guidance, which is too rough to justify a precise
 * number (founder decision 2026-11-21: exact % looked authoritative but
 * wasn't, which is a trust risk). Score is used only for bands + sorting.
 */
function matchBand(score: number) {
  if (score >= 88) return { badge: 'bg-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Great match', icon: '✨' };
  if (score >= 78) return { badge: 'bg-amber-500', text: 'text-amber-800', bg: 'bg-amber-50', label: 'Good match', icon: '👍' };
  return { badge: 'bg-neutral-500', text: 'text-muted', bg: 'bg-neutral-100', label: 'May not suit you', icon: '🤔' };
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
  const band = analysis ? matchBand(matchPercent(style.faceShapeFit, analysis)) : null;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative aspect-[4/5] bg-neutral-100">
        {style.imageUrl ? (
          <SmoothImage src={cardImageUrl(style.imageUrl)} alt={style.name} className="h-full w-full object-cover" />
        ) : (
          <StylePlaceholder style={style} />
        )}
        {revealed && band && (
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${band.badge}`}>
            {band.label}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="font-semibold leading-tight">{style.name}</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {style.length} · {style.maintenance} upkeep
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-foreground/70">{style.description}</p>

        {revealed && band && analysis ? (
          <div className={`mt-2 rounded-lg p-2 ${band.bg}`}>
            <p className={`text-sm font-bold ${band.text}`}>
              {band.icon} {band.label}
            </p>
            <p className="mt-0.5 text-[11px] text-foreground/70">{matchReason(style.faceShapeFit, analysis)}</p>
          </div>
        ) : (
          <button
            onClick={onCompare}
            className="mt-auto rounded-lg bg-brand-tint py-1.5 text-xs font-semibold text-brand-dark active:scale-[0.98]"
          >
            Does it suit me?
          </button>
        )}
      </div>
    </div>
  );
}

export default function StyleFinderPage() {
  const [gender, setGenderState] = useState<View>('ALL');
  // null until we've read the saved choice; 'ask' = first visit, show the chooser.
  const [viewChosen, setViewChosen] = useState<'ask' | 'chosen' | null>(null);

  function setGender(v: View) {
    setGenderState(v);
    setViewChosen('chosen');
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode — just don't remember */
    }
  }
  const [styles, setStyles] = useCachedState<HairStyle[] | null>('styles:list', null);
  const [analysis, setAnalysis] = useState<FaceAnalysis | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanTip, setScanTip] = useState<string | null>(null);
  const [scanDiag, setScanDiag] = useState<ScanDiagnostics | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [sortByMatch, setSortByMatch] = useState(false);
  const [nudge, setNudge] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const scanCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = readSavedView();
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is browser-only */
    if (saved) {
      setGenderState(saved);
      setViewChosen('chosen');
    } else {
      setViewChosen('ask');
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    apiFetch<HairStyle[]>('/styles')
      .then(setStyles)
      .catch(() => setStyles([]));
    preloadFaceModel();
  }, [setStyles]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setScanError(null);
    setScanDiag(null);
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
      setScanDiag(err instanceof FaceScanError ? (err.diagnostics ?? null) : { preview: null, details: String(err) });
      // Don't leave an older photo's result on screen next to the error.
      setAnalysis(null);
      setScanTip(null);
      setRevealed(new Set());
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(null);
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
    const list = (styles ?? []).filter((s) => gender === 'ALL' || s.gender === gender);
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
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Your face shape looks closest to</p>
              <p className="text-xl font-bold">{shapeInfo!.label}</p>
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
              <li>• Hold the phone at arm&apos;s length, face the camera, good light</li>
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
        {scanError && scanDiag && (
          <details className="mt-2 rounded-lg border border-border p-2 text-xs text-muted">
            <summary className="cursor-pointer font-medium">What the scanner saw (for support)</summary>
            <div className="mt-2 flex gap-2">
              {scanDiag.preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scanDiag.preview} alt="What the scanner analysed" className="h-24 w-auto shrink-0 rounded border border-border" />
              )}
              <p className="break-all">{scanDiag.details}</p>
            </div>
            <p className="mt-1">If your face looks sideways, upside down or blank here, send us a screenshot of this box.</p>
          </details>
        )}
        {analysis && !scanError && scanTip && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{scanTip}</p>
        )}
        <p className="mt-2 text-[11px] text-muted">
          🔒 Your photo stays on your phone — it&apos;s analysed on your device and never uploaded.
        </p>
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onPhoto} />
        <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
      </div>

      {/* First visit: which styles to show by default (remembered). */}
      {viewChosen === 'ask' && (
        <div className="mt-5 rounded-2xl border border-brand/30 bg-brand-tint/50 p-4">
          <p className="font-semibold">Which styles should we show you?</p>
          <p className="text-xs text-muted">You can switch anytime — every style is open to everyone.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ['MEN', '👨', 'Men'],
                ['WOMEN', '👩', 'Women'],
                ['ALL', '✨', 'Both'],
              ] as const
            ).map(([v, emoji, label]) => (
              <button
                key={v}
                onClick={() => setGender(v)}
                className="flex flex-col items-center rounded-xl border border-border bg-surface py-3 text-sm font-semibold active:scale-[0.98]"
              >
                <span className="text-2xl" aria-hidden>
                  {emoji}
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gender + sort */}
      <div className="sticky top-[52px] z-10 -mx-4 mt-5 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-2">
        <div className="flex min-w-0 gap-1 rounded-full border border-border bg-surface p-1">
          {(['MEN', 'WOMEN', 'ALL'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:text-sm ${gender === g ? 'bg-brand text-brand-foreground' : 'text-muted'}`}
            >
              {VIEW_LABEL[g]}
            </button>
          ))}
        </div>
        {analysis && (
          <button
            onClick={() => setRevealed(new Set(visible.map((s) => s.id)))}
            className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold"
          >
            Check all
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

      {analysis && (
        <p className="mt-3 rounded-xl bg-accent-tint/60 p-3 text-sm text-foreground/80">
          💡 We recommend styles that usually suit your face shape — but the best style is the one <b>you</b> love. Your
          stylist can help you decide.
        </p>
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
          href={gender === 'ALL' ? '/search' : `/search?category=${gender === 'MEN' ? 'Men' : 'Women'}`}
          className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
        >
          Find a {gender === 'MEN' ? "men's " : gender === 'WOMEN' ? "women's " : ''}salon near me →
        </Link>
      </div>

      <p className="mt-4 text-[11px] text-muted">
        Suggestions are based only on your face shape. Hair type, texture and your own taste matter just as much — so
        treat these as ideas, not rules.
      </p>
    </div>
  );
}
