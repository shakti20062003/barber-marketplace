'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getStoredUser, getToken } from '@/lib/auth-client';
import type { CurrentUser } from '@/lib/types';

/**
 * In-app voice call (WebRTC). See backend modules/calls for the signalling
 * design: the caller posts an offer, the callee posts an answer (ICE
 * gathered up front), both poll the call state. Audio goes phone-to-phone.
 */

interface CallView {
  id: string;
  you: 'caller' | 'callee';
  otherName: string;
  topic: string;
  state: 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
  offer: string | null;
  answer: string | null;
}

type Phase = 'loading' | 'incoming' | 'calling' | 'connecting' | 'connected' | 'over' | 'error';

/** Resolve once ICE gathering finishes (or after a cap, with what we have). */
function gatheringDone(pc: RTCPeerConnection, capMs = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, capMs);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

const OVER_TEXT: Record<string, string> = {
  ended: 'Call ended',
  declined: 'Call declined',
  missed: 'No answer',
};

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [call, setCall] = useState<CallView | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [overText, setOverText] = useState('Call ended');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const remoteSet = useRef(false);
  const startedRef = useRef(false);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  const finish = useCallback(
    (text: string) => {
      cleanup();
      setOverText(text);
      setPhase('over');
    },
    [cleanup],
  );

  const createPeer = useCallback(async () => {
    const token = getToken()!;
    const { iceServers } = await apiFetch<{ iceServers: RTCIceServer[] }>('/calls/ice-servers', { token });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new Error('Microphone access is needed for calls. Allow the microphone for Trimly and try again.');
    }
    streamRef.current = stream;
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
        audioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setPhase('connected');
      if (pc.connectionState === 'failed') {
        setError("Couldn't connect the call on this network. Try Wi-Fi, or try again.");
        finish('Call failed');
      }
    };
    return pc;
  }, [finish]);

  // Load the call; the caller starts dialling straight away.
  useEffect(() => {
    const token = getToken();
    if (!token || !getStoredUser<CurrentUser>()) {
      router.push(`/login?next=/call/${id}`);
      return;
    }
    apiFetch<CallView>(`/calls/${id}`, { token })
      .then(async (c) => {
        setCall(c);
        if (c.state !== 'ringing' && c.state !== 'active') return finish(OVER_TEXT[c.state] ?? 'Call ended');
        if (c.you === 'callee') return setPhase('incoming');

        // Caller. A reload can't resume an in-flight WebRTC session.
        const marker = `trimly-call-${id}`;
        if (sessionStorage.getItem(marker)) {
          await apiFetch(`/calls/${id}/end`, { method: 'POST', token }).catch(() => {});
          return finish('Call ended');
        }
        sessionStorage.setItem(marker, '1');
        if (startedRef.current) return;
        startedRef.current = true;
        setPhase('calling');
        try {
          const pc = await createPeer();
          await pc.setLocalDescription(await pc.createOffer());
          await gatheringDone(pc);
          await apiFetch(`/calls/${id}/offer`, { method: 'POST', token, body: JSON.stringify({ sdp: pc.localDescription!.sdp }) });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not start the call');
          await apiFetch(`/calls/${id}/end`, { method: 'POST', token }).catch(() => {});
          finish('Call failed');
        }
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load this call');
        setPhase('error');
      });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll the call state (answer arriving, hang-ups, timeouts).
  useEffect(() => {
    if (phase === 'loading' || phase === 'over' || phase === 'error') return;
    const token = getToken();
    if (!token) return;
    const t = setInterval(async () => {
      try {
        const c = await apiFetch<CallView>(`/calls/${id}`, { token });
        if (c.state === 'ended' || c.state === 'declined' || c.state === 'missed') {
          clearInterval(t);
          return finish(OVER_TEXT[c.state]);
        }
        if (c.you === 'caller' && c.answer && pcRef.current && !remoteSet.current) {
          remoteSet.current = true;
          setPhase('connecting');
          await pcRef.current.setRemoteDescription({ type: 'answer', sdp: c.answer });
        }
      } catch {
        clearInterval(t);
        finish('Call ended');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [id, phase, finish]);

  // Call timer.
  useEffect(() => {
    if (phase !== 'connected') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  async function accept() {
    const token = getToken()!;
    setPhase('connecting');
    try {
      // The caller may still be posting its offer — wait briefly for it.
      let c = call!;
      for (let i = 0; i < 10 && !c.offer; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        c = await apiFetch<CallView>(`/calls/${id}`, { token });
      }
      if (!c.offer) throw new Error('The caller is having trouble connecting. Please try again.');
      const pc = await createPeer();
      await pc.setRemoteDescription({ type: 'offer', sdp: c.offer });
      remoteSet.current = true;
      await pc.setLocalDescription(await pc.createAnswer());
      await gatheringDone(pc);
      await apiFetch(`/calls/${id}/answer`, { method: 'POST', token, body: JSON.stringify({ sdp: pc.localDescription!.sdp }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer the call');
      await apiFetch(`/calls/${id}/end`, { method: 'POST', token }).catch(() => {});
      finish('Call failed');
    }
  }

  async function decline() {
    await apiFetch(`/calls/${id}/decline`, { method: 'POST', token: getToken()! }).catch(() => {});
    finish('Call declined');
  }

  async function hangUp() {
    await apiFetch(`/calls/${id}/end`, { method: 'POST', token: getToken()! }).catch(() => {});
    finish('Call ended');
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  const status =
    phase === 'incoming'
      ? 'Incoming call…'
      : phase === 'calling'
        ? 'Ringing…'
        : phase === 'connecting'
          ? 'Connecting…'
          : phase === 'connected'
            ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
            : phase === 'over'
              ? overText
              : phase === 'error'
                ? 'Call unavailable'
                : '';

  return (
    <div className="flex min-h-[80vh] flex-1 flex-col items-center justify-between bg-foreground px-6 py-10 text-white">
      <audio ref={audioRef} autoPlay playsInline />
      <div className="mt-8 flex flex-col items-center text-center">
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-full bg-brand text-4xl font-bold text-brand-foreground ${
            phase === 'incoming' || phase === 'calling' ? 'animate-pulse' : ''
          }`}
        >
          {call?.otherName?.charAt(0).toUpperCase() ?? '📞'}
        </div>
        <p className="mt-4 text-2xl font-semibold">{call?.otherName ?? 'Trimly call'}</p>
        {call && <p className="mt-1 text-sm text-white/60">About your {call.topic} booking</p>}
        <p className="mt-3 text-lg text-white/80">{status}</p>
        {error && <p className="mt-3 max-w-xs text-sm text-amber-300">{error}</p>}
        <p className="mt-4 text-xs text-white/40">🔒 In-app call — your phone number is never shared.</p>
      </div>

      <div className="mb-6 flex items-center gap-8">
        {phase === 'incoming' && (
          <>
            <button onClick={decline} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl" aria-label="Decline">
              ✕
            </button>
            <button onClick={accept} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-2xl" aria-label="Accept">
              📞
            </button>
          </>
        )}
        {(phase === 'calling' || phase === 'connecting' || phase === 'connected') && (
          <>
            <button
              onClick={toggleMute}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-xl ${muted ? 'bg-white text-foreground' : 'bg-white/15'}`}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? '🔇' : '🎙️'}
            </button>
            <button onClick={hangUp} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl" aria-label="Hang up">
              ✕
            </button>
          </>
        )}
        {(phase === 'over' || phase === 'error') && (
          <button onClick={() => router.back()} className="rounded-full bg-white/15 px-6 py-3 text-sm font-semibold">
            Close
          </button>
        )}
      </div>
    </div>
  );
}
