'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  MessageSquare,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { ApiError, clearAdminCredentials, getAdminMetrics, getStoredAdminUsername, hasStoredAdminCredentials } from '@/lib/api';
import { AdminSmsMetricsResponse } from '@/types';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function isAuthError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function MetricCard({
  label,
  value,
  description,
  icon,
  accentClassName,
}: {
  label: string;
  value: string;
  description: string;
  icon: ReactNode;
  accentClassName: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
      <div className={`mb-4 inline-flex rounded-xl p-3 ${accentClassName}`}>{icon}</div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-black">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<AdminSmsMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState<string | null>(null);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);

  const hydrateAdminCredentials = () => {
    const storedCredentials = hasStoredAdminCredentials();
    const storedUsername = getStoredAdminUsername();

    setAdminUsername(storedCredentials ? storedUsername : null);
    setCredentialsLoaded(true);

    return storedCredentials;
  };

  const loadMetrics = async () => {
    setError(null);
    setIsRefreshing(true);

    try {
      const payload = await getAdminMetrics();
      setMetrics(payload);
    } catch (fetchError) {
      console.error(fetchError);
      if (isAuthError(fetchError)) {
        clearAdminCredentials();
        setAdminUsername(null);
        setError('Saved admin credentials were rejected. Sign in again on the main admin page.');
      } else if (fetchError instanceof ApiError && fetchError.message) {
        setError(fetchError.message);
      } else {
        setError('We could not load the SMS metrics right now.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const hasCredentials = hydrateAdminCredentials();
    if (!hasCredentials) {
      setIsLoading(false);
      setError('Sign in on the main admin page to unlock SMS webhook metrics.');
      return;
    }

    void loadMetrics();
  }, []);

  const successRate = useMemo(() => {
    if (!metrics || metrics.deliveryReports.received === 0) {
      return 0;
    }

    return Math.round((metrics.deliveryReports.delivered / metrics.deliveryReports.received) * 100);
  }, [metrics]);

  const connectionStatus = !credentialsLoaded
    ? 'Checking saved credentials...'
    : adminUsername
      ? `Connected as ${adminUsername}`
      : 'Not connected';

  const callbackRows = metrics
    ? [
        { label: 'USSD callback', value: metrics.callbackUrls.ussd },
        { label: 'Inbound SMS callback', value: metrics.callbackUrls.smsInbound },
        { label: 'Delivery report callback', value: metrics.callbackUrls.smsDeliveryReports },
      ]
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500 font-black">Admin / SMS Metrics</p>
              <h1 className="text-2xl font-black">Webhooks, subscriptions, and delivery reports</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Connection</p>
              <p className={`font-mono text-sm font-bold ${adminUsername ? 'text-emerald-400' : 'text-amber-400'}`}>
                {connectionStatus}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadMetrics()}
              disabled={isLoading || isRefreshing || !adminUsername}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? <RefreshCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Refresh metrics
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="mb-8 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 to-slate-950 p-6 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">
                <ShieldCheck size={14} />
                Africa&apos;s Talking webhooks
              </div>
              <h2 className="text-3xl font-black text-white">Track inbound SMS subscriptions and delivery reports in one place.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Configure the callback URLs below in Africa&apos;s Talking, then watch SMS subscription activity and delivery
                reports roll into the metrics dashboard as they arrive.
              </p>
            </div>

            <div className="grid min-w-65 grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Subscriptions</p>
                <p className="mt-2 text-2xl font-black text-white">{formatNumber(metrics?.subscriptionMetrics.sms ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Delivery success</p>
                <p className="mt-2 text-2xl font-black text-white">{successRate}%</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {callbackRows.map((row) => (
              <div key={row.label} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-black">{row.label}</p>
                    <p className="mt-2 break-all font-mono text-sm text-slate-100">{row.value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(row.value)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
                    title={`Copy ${row.label}`}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="SMS subscriptions"
            value={isLoading ? '...' : formatNumber(metrics?.subscriptionMetrics.sms ?? 0)}
            description="People subscribed through SMS."
            icon={<Users size={20} className="text-emerald-300" />}
            accentClassName="bg-emerald-500/10"
          />
          <MetricCard
            label="USSD subscriptions"
            value={isLoading ? '...' : formatNumber(metrics?.subscriptionMetrics.ussd ?? 0)}
            description="People subscribed through USSD."
            icon={<MessageSquare size={20} className="text-indigo-300" />}
            accentClassName="bg-indigo-500/10"
          />
          <MetricCard
            label="Inbound SMS"
            value={isLoading ? '...' : formatNumber(metrics?.inboundSms.received ?? 0)}
            description="Webhook hits from incoming messages."
            icon={<Send size={20} className="text-orange-300" />}
            accentClassName="bg-orange-500/10"
          />
          <MetricCard
            label="Delivery reports"
            value={isLoading ? '...' : formatNumber(metrics?.deliveryReports.received ?? 0)}
            description="Webhook hits for SMS delivery status."
            icon={<CheckCircle2 size={20} className="text-sky-300" />}
            accentClassName="bg-sky-500/10"
          />
        </section>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-black">Inbound SMS</p>
                <h3 className="text-xl font-black text-white">Recent subscription requests</h3>
              </div>
              <p className="text-sm text-slate-400">
                {formatNumber(metrics?.inboundSms.matchedSubscriptions ?? 0)} matched,{' '}
                {formatNumber(metrics?.inboundSms.unmatched ?? 0)} unmatched
              </p>
            </div>

            <div className="space-y-3">
              {(metrics?.inboundSms.recent ?? []).length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-500">
                  No inbound SMS messages yet. Once a subscriber texts the shortcode, the webhook activity will appear here.
                </p>
              ) : (
                metrics?.inboundSms.recent.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{item.billTitle ?? 'Bill not matched yet'}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.phoneNumber || item.rawPhoneNumber || 'Unknown number'} · {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                          item.created ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        {item.created ? 'Subscribed' : item.action}
                      </span>
                    </div>
                    {item.message && <p className="mt-3 text-sm text-slate-300">{item.message}</p>}
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-black">Delivery reports</p>
                <h3 className="text-xl font-black text-white">Recent SMS status updates</h3>
              </div>
              <p className="text-sm text-slate-400">
                {formatNumber(metrics?.deliveryReports.delivered ?? 0)} delivered,{' '}
                {formatNumber(metrics?.deliveryReports.failed ?? 0)} failed
              </p>
            </div>

            <div className="space-y-3">
              {(metrics?.deliveryReports.recent ?? []).length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-500">
                  No delivery reports yet. Once Africa&apos;s Talking starts pushing delivery webhooks, they&apos;ll show here.
                </p>
              ) : (
                metrics?.deliveryReports.recent.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{item.billTitle ?? 'Unlinked message'}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.phoneNumber || item.rawPhoneNumber || 'Unknown number'} · {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                          item.status.toLowerCase() === 'delivered'
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : item.status.toLowerCase() === 'failed'
                              ? 'bg-rose-500/10 text-rose-300'
                              : 'bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Message ID</p>
                        <p className="mt-1 break-all font-mono">{item.messageId || 'n/a'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Network</p>
                        <p className="mt-1">{item.network || 'n/a'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Cost</p>
                        <p className="mt-1">{item.cost || 'n/a'}</p>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-black">Top bills</p>
              <h3 className="text-xl font-black text-white">Most subscribed bills</h3>
            </div>
            <p className="text-sm text-slate-400">
              {formatNumber(metrics?.subscriptionMetrics.total ?? 0)} total subscriptions tracked
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {(metrics?.subscriptionMetrics.topBills ?? []).length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-500">
                No subscription data yet.
              </p>
            ) : (
              metrics?.subscriptionMetrics.topBills.map((bill) => (
                <div key={bill.billId} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-black">Bill</p>
                  <p className="mt-2 text-sm font-semibold text-white">{bill.title}</p>
                  <p className="mt-3 text-2xl font-black text-emerald-300">{formatNumber(bill.subscriberCount)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
