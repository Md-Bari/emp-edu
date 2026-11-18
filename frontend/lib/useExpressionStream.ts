'use client';

import { useEffect, useRef, useState } from 'react';
import { wsBase } from './config';
import { refreshAuth } from './api';
import type { EmotionType } from './emotions';

// Server close codes (apps/analytics/consumers.py). These are decisions, not failures: retrying
// cannot succeed, and the server sends an "error" message explaining why before closing.
const CLOSE_CONSENT_REQUIRED = 4003;
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_NOT_FOUND = 4404;
const CLOSE_SESSION_NOT_LIVE = 4409;
const FINAL_CLOSES = new Set([CLOSE_CONSENT_REQUIRED, CLOSE_UNAUTHORIZED, CLOSE_FORBIDDEN, CLOSE_NOT_FOUND, CLOSE_SESSION_NOT_LIVE]);

const FRAME_INTERVAL_MS = 350; // ~2.8 fps for responsive detection
const HEARTBEAT_MS = 10_000; // "still in the class" while no frames are sent (camera off)
const MAX_FRAME_WIDTH = 480;

export interface ExpressionState {
  status: 'off' | 'connecting' | 'on' | 'error';
  emotion: EmotionType | null;
  message: string | null;
}

const OFF: ExpressionState = { status: 'off', emotion: null, message: null };

/**
 * A student in the class meeting stays connected to the analysis socket for the whole meeting,
 * so the instructor sees them as present even without a camera. While their camera is on
 * (`track`, the camera already published to the meeting), a frame at most 640 px wide is sent
 * about every 0.7 s; with the camera off nothing is sent. Frames are analysed in server memory only.
 */
export function useExpressionStream(sessionId: number | null, track: MediaStreamTrack | null): ExpressionState {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reading, setReading] = useState<{ emotion: EmotionType | null; message: string | null; error: boolean }>({
    emotion: null,
    message: null,
    error: false,
  });

  // The socket: open for the whole meeting. A dropped connection (server restart, network blip,
  // tunnel hiccup) is reopened with backoff; without this the instructor silently stops getting
  // this student's data until the page is reloaded. Closes the server makes on purpose are final.
  useEffect(() => {
    if (sessionId === null) return;
    let disposed = false;
    let attempts = 0;
    let authRetried = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const ws = new WebSocket(`${wsBase()}/ws/student/${sessionId}/?consent=1`);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ready') {
            attempts = 0;
            authRetried = false;
            setConnected(true);
          } else if (data.type === 'telemetry') setReading({ emotion: data.emotion, message: null, error: false });
          // No face (or no model): drop the last reading rather than keep showing a stale expression
          else if (data.type === 'face.missing' || data.type === 'model.missing')
            setReading((r) => ({ ...r, emotion: null, message: data.message }));
          else if (data.type === 'error') setReading({ emotion: null, message: data.message, error: true });
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = (event) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        setConnected(false);
        if (event.code === CLOSE_UNAUTHORIZED && !authRetried) {
          // The sign-in cookie expired during a long class: renew it once, then rejoin
          authRetried = true;
          refreshAuth().then((ok) => {
            if (!disposed && ok) connect();
          });
          return;
        }
        if (FINAL_CLOSES.has(event.code)) return;
        // 1 s, 2 s, 4 s ... capped at 10 s
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10_000));
      };
      ws.onerror = () => ws.close();
    }

    connect();
    const heartbeat = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
    }, HEARTBEAT_MS);
    return () => {
      disposed = true;
      clearInterval(heartbeat);
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [sessionId]);

  // The frames: only while the camera is on
  useEffect(() => {
    if (!track || !connected) return;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    video.play().catch(() => undefined);
    const canvas = document.createElement('canvas');
    const timer = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || video.videoWidth === 0) return;
      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ws.send(JSON.stringify({ type: 'frame', image: canvas.toDataURL('image/jpeg', 0.7), timestamp: Date.now() }));
    }, FRAME_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      video.srcObject = null;
      // Camera off or socket dropped: the next reading starts fresh
      setReading((r) => (r.error ? r : { emotion: null, message: null, error: false }));
    };
  }, [track, connected]);

  if (sessionId === null) return OFF;
  if (reading.error) return { status: 'error', emotion: null, message: reading.message };
  if (!track) return OFF;
  if (!connected) return { status: 'connecting', emotion: null, message: null };
  return { status: 'on', emotion: reading.emotion, message: reading.message };
}
