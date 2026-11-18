'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { api } from '@/lib/api';
import { EMOTIONS, EMOTION_META, type EmotionType } from '@/lib/emotions';
import type { AdminPhoto, AdminPhotoPage } from '@/lib/types';
import { Card, PageTitle } from '@/components/views/ui';
import { ago, ErrorNote, errorText, fullTime, SearchBox, useDebounced } from './shared';

const REFRESH_MS = 15_000;

/** Every expression photo stored in the database, across all classes and instructors (view only). */
export function PhotosTab() {
  const [data, setData] = useState<AdminPhotoPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emotion, setEmotionValue] = useState<EmotionType | ''>('');
  const [query, setQueryText] = useState('');
  const q = useDebounced(query);
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<AdminPhoto | null>(null);

  // A new filter or search starts at the first page
  const setEmotion = (e: EmotionType | '') => {
    setPage(1);
    setEmotionValue(e);
  };
  const setQuery = (v: string) => {
    setPage(1);
    setQueryText(v);
  };

  // Loading while the newest request has not answered yet
  const requestKey = JSON.stringify([emotion, q, page, tick]);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  const loading = answeredKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    api
      .adminPhotos({ emotion, q, page })
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(errorText(e, 'Could not load the photos')))
      .finally(() => !cancelled && setAnsweredKey(requestKey));
    return () => {
      cancelled = true;
    };
  }, [emotion, q, page, tick, requestKey]);

  // New photos appear on their own while the first page is open
  useEffect(() => {
    if (page !== 1) return;
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [page]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const allCount = data ? EMOTIONS.reduce((n, e) => n + (data.emotions[e] ?? 0), 0) : 0;

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${
      active ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }`;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Expression photos"
        subtitle={
          data
            ? `${data.total.toLocaleString()} photo${data.total === 1 ? '' : 's'} stored · newest first`
            : 'Every expression photo stored in the database'
        }
        action={
          <button
            onClick={() => setTick((t) => t + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEmotion('')} aria-pressed={emotion === ''} className={chip(emotion === '')}>
          All <span className="font-mono text-[11px] opacity-70">{data ? allCount : '–'}</span>
        </button>
        {EMOTIONS.map((e) => (
          <button key={e} onClick={() => setEmotion(e)} aria-pressed={emotion === e} className={chip(emotion === e)}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: EMOTION_META[e].color }} />
            {EMOTION_META[e].label}
            <span className="font-mono text-[11px] opacity-70">{data ? (data.emotions[e] ?? 0) : '–'}</span>
          </button>
        ))}
        <SearchBox value={query} onChange={setQuery} placeholder="Search student or class" />
      </div>

      <ErrorNote message={error} />

      <Card>
        {data && data.results.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400">
            {allCount === 0 && !q ? 'No expression photos are stored yet.' : 'No photos match.'}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {data?.results.map((photo) => {
            const meta = EMOTION_META[photo.emotion];
            return (
              <figure key={photo.id} className="min-w-0">
                <button
                  onClick={() => setSelected(photo)}
                  className="block w-full aspect-square rounded-xl overflow-hidden bg-slate-100 ring-2 ring-transparent hover:ring-violet-400 transition"
                  style={{ boxShadow: `inset 0 -3px 0 ${meta.color}` }}
                  aria-label={`${photo.student.name} - ${meta.label}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={api.url(photo.url)} alt={`${photo.student.name} ${meta.label}`} loading="lazy" className="w-full h-full object-cover" />
                </button>
                <figcaption className="mt-1.5 text-[11px] leading-tight">
                  <p className="font-semibold text-slate-800 truncate">{photo.student.name}</p>
                  <p className="flex items-center justify-between gap-1 text-slate-500">
                    <span className="flex items-center gap-1 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                      {meta.label}
                    </span>
                    <span className="font-mono text-slate-400">{photo.confidence}%</span>
                  </p>
                  <p className="text-slate-400 truncate" title={`${photo.course} · ${photo.session.title}`}>
                    {photo.session.title}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
            aria-label="Newer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          Page {page} of {pages}
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
            aria-label="Older"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-label={`${selected.student.name} - ${EMOTION_META[selected.emotion].label}`}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-2xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 shadow-2xl"
          >
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/90 text-slate-600 hover:text-slate-900 shadow-md border border-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={api.url(selected.url)}
              alt={`${selected.student.name} ${EMOTION_META[selected.emotion].label}`}
              className="w-full aspect-square object-cover rounded-xl bg-slate-100"
            />
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{selected.student.name}</p>
                <p className="text-[11px] font-mono text-slate-400 truncate">{selected.student.username}</p>
              </div>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${EMOTION_META[selected.emotion].pill}`}>
                {EMOTION_META[selected.emotion].label} · {selected.confidence}%
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-400">Class</dt>
              <dd className="text-slate-700">{selected.course}</dd>
              <dt className="text-slate-400">Session</dt>
              <dd className="text-slate-700">{selected.session.title}</dd>
              <dt className="text-slate-400">Instructor</dt>
              <dd className="text-slate-700">{selected.instructor}</dd>
              <dt className="text-slate-400">Captured</dt>
              <dd className="text-slate-700" title={fullTime(selected.created_at)}>
                {ago(selected.created_at)} · {fullTime(selected.created_at)}
              </dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
