'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  FileEdit,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  RefreshCcw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ApiError,
  clearQueuedBillProcessing,
  clearAdminCredentials,
  getBillProcessingDetail,
  getBillProcessingStatus,
  getStoredAdminUsername,
  hasStoredAdminCredentials,
  runBillProcessing,
  saveAdminCredentials,
} from '@/lib/api';
import type {
  BillProcessingDetailResponse,
  BillProcessingDetailScope,
  BillProcessingQueueClearSummary,
  BillProcessingRunSummary,
  BillProcessingScope,
  BillProcessingStatus,
} from '@/types';

type MetricPanelKey = 'eligible' | 'queued' | 'ready' | 'ai_status';

const DETAIL_RESULT_LIMIT = 40;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not yet';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function summarizeText(value?: string, limit = 150) {
  const collapsed = String(value || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return '';
  }

  if (collapsed.length <= limit) {
    return collapsed;
  }

  return `${collapsed.slice(0, limit - 3)}...`;
}

function isAuthError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (isAuthError(error)) {
    return 'Stored admin credentials were rejected. Re-enter them above.';
  }

  if (error instanceof ApiError && error.message) {
    return error.message;
  }

  return fallback;
}

function getDetailScopeForPanel(panel: MetricPanelKey | null): BillProcessingDetailScope | null {
  if (panel === 'eligible') {
    return 'eligible';
  }
  if (panel === 'queued') {
    return 'queued';
  }
  if (panel === 'ready') {
    return 'ready';
  }
  return null;
}

function StatusCard({
  label,
  value,
  helper,
  isActive,
  onClick,
}: {
  label: string;
  value: string;
  helper: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-panel-trigger="true"
      aria-pressed={isActive}
      className={`rounded-2xl border p-5 text-left transition ${
        isActive
          ? 'border-indigo-400 bg-slate-800 ring-1 ring-indigo-400/60'
          : 'border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-800/90'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-black text-slate-50">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{helper}</p>
        </div>
        <span
          className={`rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] ${
            isActive ? 'bg-indigo-500/20 text-indigo-200' : 'bg-slate-900 text-slate-400'
          }`}
        >
          Inspect
        </span>
      </div>
    </button>
  );
}

function ActionCard({
  title,
  description,
  count,
  buttonLabel,
  isRunning,
  onRun,
}: {
  title: string;
  description: string;
  count: number;
  buttonLabel: string;
  isRunning: boolean;
  onRun: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Queue Action</p>
          <h2 className="mt-3 text-xl font-semibold text-slate-50">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <span className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-bold text-indigo-300">
          {formatNumber(count)}
        </span>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={isRunning}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? <RefreshCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {isRunning ? 'Queueing...' : buttonLabel}
      </button>
    </section>
  );
}

const PROCESSING_ACTIONS: Array<{
  scope: BillProcessingScope;
  title: string;
  description: string;
  countKey: keyof Pick<BillProcessingStatus, 'missingDocuments' | 'missingAi' | 'failedDocuments' | 'eligibleBills'>;
  buttonLabel: string;
}> = [
  {
    scope: 'missing_documents',
    title: 'Missing Documents',
    description: 'Queue bills that have a source PDF but have never been read into structured text.',
    countKey: 'missingDocuments',
    buttonLabel: 'Queue Document Reads',
  },
  {
    scope: 'missing_ai',
    title: 'Missing AI Summaries',
    description: 'Queue bills whose document text is already ready, but whose AI summary and key points are still blank.',
    countKey: 'missingAi',
    buttonLabel: 'Queue AI Summaries',
  },
  {
    scope: 'failed',
    title: 'Failed Or OCR-Needed',
    description: 'Retry documents that previously failed or were marked as needing additional extraction.',
    countKey: 'failedDocuments',
    buttonLabel: 'Retry Failed Reads',
  },
  {
    scope: 'all',
    title: 'All Eligible Bills',
    description: 'Queue every bill with an attached Parliament document so the backlog can warm in the background.',
    countKey: 'eligibleBills',
    buttonLabel: 'Queue Full Warmup',
  },
];

export default function AdminAiWarmupPage() {
  const inspectorRef = useRef<HTMLElement | null>(null);
  const [statusSummary, setStatusSummary] = useState<BillProcessingStatus | null>(null);
  const [isStatusLoaded, setIsStatusLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeScope, setActiveScope] = useState<BillProcessingScope | null>(null);
  const [queueClearSummary, setQueueClearSummary] = useState<BillProcessingQueueClearSummary | null>(null);
  const [lastRun, setLastRun] = useState<BillProcessingRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [systemNote, setSystemNote] = useState<string | null>(null);
  const [credentialForm, setCredentialForm] = useState({ username: '', password: '' });
  const [adminUsername, setAdminUsername] = useState<string | null>(null);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState<MetricPanelKey | null>(null);
  const [panelDetail, setPanelDetail] = useState<BillProcessingDetailResponse | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isPanelLoading, setIsPanelLoading] = useState(false);
  const [isDequeueing, setIsDequeueing] = useState(false);

  const canUseProtectedActions = Boolean(adminUsername);
  const connectionStatus = !credentialsLoaded
    ? 'Checking saved credentials...'
    : canUseProtectedActions
      ? `Connected as ${adminUsername}`
      : 'Not connected';

  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const payload = await getBillProcessingStatus();
      setStatusSummary(payload);
      setIsStatusLoaded(true);
      setError(null);
      return payload;
    } catch (fetchError) {
      if (isAuthError(fetchError)) {
        clearAdminCredentials();
        setAdminUsername(null);
      }
      const message = getActionErrorMessage(fetchError, 'We could not load AI warmup status right now.');
      setError(message);
      setIsStatusLoaded(true);
      throw fetchError;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const loadPanelDetail = useCallback(
    async (panel: MetricPanelKey, options?: { silent?: boolean }) => {
      const detailScope = getDetailScopeForPanel(panel);
      if (!detailScope) {
        setPanelDetail(null);
        setPanelError(null);
        return null;
      }

      if (!canUseProtectedActions) {
        setPanelDetail(null);
        setPanelError('Add Django admin credentials above before loading bill details.');
        return null;
      }

      if (!options?.silent) {
        setIsPanelLoading(true);
      }

      try {
        const payload = await getBillProcessingDetail(detailScope, DETAIL_RESULT_LIMIT);
        setPanelDetail(payload);
        setPanelError(null);
        return payload;
      } catch (fetchError) {
        if (isAuthError(fetchError)) {
          clearAdminCredentials();
          setAdminUsername(null);
        }
        setPanelDetail(null);
        setPanelError(getActionErrorMessage(fetchError, 'We could not load bills for this metric right now.'));
        throw fetchError;
      } finally {
        if (!options?.silent) {
          setIsPanelLoading(false);
        }
      }
    },
    [canUseProtectedActions],
  );

  useEffect(() => {
    const storedUsername = getStoredAdminUsername();
    const storedCredentials = hasStoredAdminCredentials();

    setAdminUsername(storedCredentials ? storedUsername : null);
    setCredentialForm((current) => ({
      username: storedUsername ?? current.username,
      password: '',
    }));
    setCredentialsLoaded(true);

    if (!storedCredentials) {
      setSystemNote('Add Django admin credentials to unlock AI warmup controls.');
      setIsStatusLoaded(true);
      return;
    }

    refreshStatus().catch((fetchError) => {
      console.error(fetchError);
    });
  }, [refreshStatus]);

  useEffect(() => {
    if (!selectedPanel) {
      setPanelDetail(null);
      setPanelError(null);
      setIsPanelLoading(false);
      return;
    }

    if (selectedPanel === 'ai_status') {
      setPanelDetail(null);
      setPanelError(null);
      setIsPanelLoading(false);
      return;
    }

    loadPanelDetail(selectedPanel).catch((fetchError) => {
      console.error(fetchError);
    });
  }, [loadPanelDetail, selectedPanel]);

  useEffect(() => {
    if (!selectedPanel) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPanel(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPanel]);

  useEffect(() => {
    if (!selectedPanel) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (window.innerWidth < 768) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (inspectorRef.current?.contains(target)) {
        return;
      }

      if (target.closest('[data-panel-trigger="true"]')) {
        return;
      }

      setSelectedPanel(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [selectedPanel]);

  useEffect(() => {
    if (!canUseProtectedActions) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      refreshStatus().catch((fetchError) => {
        console.error(fetchError);
      });

      if (selectedPanel && selectedPanel !== 'ai_status') {
        loadPanelDetail(selectedPanel, { silent: true }).catch((fetchError) => {
          console.error(fetchError);
        });
      }
    }, statusSummary?.queuedJobs ? 5000 : 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canUseProtectedActions, loadPanelDetail, refreshStatus, selectedPanel, statusSummary?.queuedJobs]);

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const username = credentialForm.username.trim();
    const password = credentialForm.password;
    if (!username || !password) {
      setError('Enter both a Django admin username and password.');
      return;
    }

    saveAdminCredentials(username, password);
    setAdminUsername(username);
    setCredentialForm({ username, password: '' });
    setSystemNote(`Saved credentials locally for ${username}. Loading AI warmup controls...`);

    try {
      const payload = await refreshStatus();
      if (selectedPanel && selectedPanel !== 'ai_status') {
        await loadPanelDetail(selectedPanel);
      }
      setSystemNote(
        payload.aiEnabled
          ? `AI warmup dashboard connected for ${username}.`
          : `Connected for ${username}, but Cohere is not configured on the backend yet.`,
      );
    } catch (fetchError) {
      console.error(fetchError);
    }
  };

  const handleClearCredentials = () => {
    clearAdminCredentials();
    setAdminUsername(null);
    setStatusSummary(null);
    setLastRun(null);
    setQueueClearSummary(null);
    setSelectedPanel(null);
    setPanelDetail(null);
    setPanelError(null);
    setCredentialForm((current) => ({
      username: current.username,
      password: '',
    }));
    setError(null);
    setSystemNote('Admin credentials cleared. AI warmup controls are locked again.');
  };

  const runWarmup = async (scope: BillProcessingScope) => {
    if (!canUseProtectedActions) {
      setError('Add Django admin credentials above before queuing AI warmup jobs.');
      return;
    }

    setActiveScope(scope);
    setError(null);
    try {
      const payload = await runBillProcessing({ scope });
      setLastRun(payload);
      setSystemNote(payload.message);
      await refreshStatus();
      if (selectedPanel && selectedPanel !== 'ai_status') {
        await loadPanelDetail(selectedPanel);
      }
    } catch (runError) {
      console.error(runError);
      if (isAuthError(runError)) {
        clearAdminCredentials();
        setAdminUsername(null);
      }
      setError(getActionErrorMessage(runError, 'We could not queue AI warmup jobs right now.'));
    } finally {
      setActiveScope(null);
    }
  };

  const dequeueQueuedJobs = async () => {
    if (!canUseProtectedActions) {
      setError('Add Django admin credentials above before clearing queued jobs.');
      return;
    }

    setIsDequeueing(true);
    setError(null);
    try {
      const payload = await clearQueuedBillProcessing();
      setQueueClearSummary(payload);
      setSystemNote(payload.message);
      await refreshStatus();
      if (selectedPanel === 'queued') {
        await loadPanelDetail('queued');
      }
    } catch (clearError) {
      console.error(clearError);
      if (isAuthError(clearError)) {
        clearAdminCredentials();
        setAdminUsername(null);
      }
      setError(getActionErrorMessage(clearError, 'We could not clear queued jobs right now.'));
    } finally {
      setIsDequeueing(false);
    }
  };

  const queueSummary = useMemo(() => {
    if (!statusSummary) {
      return 'Waiting for status...';
    }

    if (statusSummary.queuedJobs === 0) {
      return 'No background AI jobs are currently queued.';
    }

    return `${formatNumber(statusSummary.queuedJobs)} bill job${statusSummary.queuedJobs === 1 ? '' : 's'} currently queued in the background.`;
  }, [statusSummary]);

  const aiStatusHelper = statusSummary?.aiEnabled
    ? 'Cohere is configured and AI summaries can be generated.'
    : 'Cohere is not configured, so AI-only warmup will not populate summaries yet.';

  const togglePanel = useCallback((panel: MetricPanelKey) => {
    setSelectedPanel((current) => (current === panel ? null : panel));
  }, []);

  const inspectorHeader = useMemo(() => {
    if (selectedPanel === 'ai_status') {
      return {
        label: 'AI Status',
        description: aiStatusHelper,
      };
    }

    if (panelDetail) {
      return {
        label: panelDetail.label,
        description: panelDetail.description,
      };
    }

    if (selectedPanel === 'eligible') {
      return {
        label: 'Eligible Bills',
        description: 'Bills with Parliament document links that can be processed in the background.',
      };
    }

    if (selectedPanel === 'queued') {
      return {
        label: 'Queued Jobs',
        description: 'Bills waiting in the in-process worker queue.',
      };
    }

    if (selectedPanel === 'ready') {
      return {
        label: 'Ready Documents',
        description: 'Bills whose document text has already been extracted.',
      };
    }

    return {
      label: 'Inspector',
      description: 'Select a metric to see the bills behind it.',
    };
  }, [aiStatusHelper, panelDetail, selectedPanel]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex">
      <aside className={selectedPanel ? 'hidden w-64 border-r border-slate-800 p-6 md:hidden' : 'hidden w-64 border-r border-slate-800 p-6 md:block'}>
        <div className="flex items-center gap-2 text-indigo-400 font-black text-xl">
          <LayoutDashboard /> Admin
        </div>
        <nav className="mt-8 space-y-4">
          <div className="text-xs font-bold uppercase text-slate-500">Management</div>
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-xl p-3 text-sm font-bold text-slate-400 transition hover:bg-slate-800"
          >
            <FileEdit size={18} /> Manage Bills
          </Link>
          <Link
            href="/admin/ai"
            className="flex items-center gap-3 rounded-xl bg-indigo-600 p-3 text-sm font-bold text-white"
          >
            <Sparkles size={18} /> AI Warmup
          </Link>
          <Link
            href="/admin/metrics"
            className="flex items-center gap-3 rounded-xl p-3 text-sm font-bold text-slate-400 transition hover:bg-slate-800"
          >
            <BarChart3 size={18} /> SMS Metrics
          </Link>
        </nav>
      </aside>

      <main className="relative min-w-0 flex-1 p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">AI Warmup Console</h1>
              <p className="mt-2 text-sm text-slate-400">
                Queue background document reads and AI summaries so bills are already populated before public traffic hits them.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Connection</p>
                <p className={`font-mono font-bold ${canUseProtectedActions ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {connectionStatus}
                </p>
              </div>
              {canUseProtectedActions && (
                <button
                  type="button"
                  onClick={handleClearCredentials}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
                >
                  <LockKeyhole size={16} />
                  Sign Out
                </button>
              )}
            </div>
          </header>

          {!canUseProtectedActions && (
            <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-indigo-300 font-bold">
                  <KeyRound size={18} />
                  Admin Credentials
                </div>
                <p className="text-sm text-slate-400">
                  Save a Django admin or staff account in this browser to unlock AI warmup controls.
                </p>
              </div>

              <form onSubmit={handleCredentialsSubmit} className="mt-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-300">
                    <span className="block text-xs font-bold uppercase tracking-widest text-slate-500">Username</span>
                    <input
                      type="text"
                      value={credentialForm.username}
                      onChange={(event) =>
                        setCredentialForm((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-500"
                      placeholder="Django admin username"
                      autoComplete="username"
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium text-slate-300">
                    <span className="block text-xs font-bold uppercase tracking-widest text-slate-500">Password</span>
                    <input
                      type="password"
                      value={credentialForm.password}
                      onChange={(event) =>
                        setCredentialForm((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-500"
                      placeholder="Django admin password"
                      autoComplete="current-password"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"
                >
                  <LockKeyhole size={16} />
                  Save Credentials
                </button>
              </form>
            </section>
          )}

          {error && (
            <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {systemNote && (
            <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {systemNote}
            </div>
          )}

          <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatusCard
              label="Eligible Bills"
              value={isStatusLoaded && statusSummary ? formatNumber(statusSummary.eligibleBills) : '...'}
              helper="Bills with a document source that can be read in the background."
              isActive={selectedPanel === 'eligible'}
              onClick={() => togglePanel('eligible')}
            />
            <StatusCard
              label="Queued Jobs"
              value={isStatusLoaded && statusSummary ? formatNumber(statusSummary.queuedJobs) : '...'}
              helper={queueSummary}
              isActive={selectedPanel === 'queued'}
              onClick={() => togglePanel('queued')}
            />
            <StatusCard
              label="Ready Documents"
              value={isStatusLoaded && statusSummary ? formatNumber(statusSummary.readyDocuments) : '...'}
              helper="Bills whose document text has already been extracted."
              isActive={selectedPanel === 'ready'}
              onClick={() => togglePanel('ready')}
            />
            <StatusCard
              label="AI Status"
              value={statusSummary?.aiEnabled ? 'ON' : 'OFF'}
              helper={aiStatusHelper}
              isActive={selectedPanel === 'ai_status'}
              onClick={() => togglePanel('ai_status')}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            {PROCESSING_ACTIONS.map((action) => (
              <ActionCard
                key={action.scope}
                title={action.title}
                description={action.description}
                count={statusSummary?.[action.countKey] ?? 0}
                buttonLabel={action.buttonLabel}
                isRunning={activeScope === action.scope || isRefreshing}
                onRun={() => {
                  void runWarmup(action.scope);
                }}
              />
            ))}
          </section>

          {lastRun && (
            <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-800 p-6">
              <div className="flex items-center gap-2 text-indigo-300">
                <AlertCircle size={18} />
                <h2 className="text-lg font-semibold text-slate-50">Last Queue Run</h2>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Scope</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-100">{lastRun.scope.replace('_', ' ')}</dd>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Matched</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-100">{formatNumber(lastRun.matchedBills)}</dd>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Queued</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-100">{formatNumber(lastRun.queuedBills)}</dd>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Already queued</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-100">{formatNumber(lastRun.alreadyQueuedBills)}</dd>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Queue depth</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-100">{formatNumber(lastRun.queuedJobs)}</dd>
                </div>
              </dl>
            </section>
          )}

          {queueClearSummary && (
            <section className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
              <div className="flex items-center gap-2 text-amber-200">
                <AlertCircle size={18} />
                <h2 className="text-lg font-semibold text-slate-50">Last Queue Clear</h2>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-amber-500/20 bg-slate-900 px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Dequeued</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-100">{formatNumber(queueClearSummary.dequeuedJobs)}</dd>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-slate-900 px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Still active</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-100">{formatNumber(queueClearSummary.activeJobs)}</dd>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-slate-900 px-4 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Queue depth</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-100">{formatNumber(queueClearSummary.queuedJobs)}</dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </main>

      {selectedPanel && (
        <>
          <button
            type="button"
            aria-label="Close right side panel"
            onClick={() => setSelectedPanel(null)}
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-[1px] md:hidden"
          />

          <aside
            ref={inspectorRef}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-slate-700 bg-slate-800 shadow-2xl md:sticky md:top-0 md:bottom-auto md:right-auto md:z-auto md:h-screen md:w-[26rem] md:max-w-[26rem] md:shrink-0 md:self-start md:shadow-none"
          >
              <section className="flex h-full flex-col p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="mt-3 text-2xl font-semibold text-slate-50">{inspectorHeader.label}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{inspectorHeader.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedPanel !== 'ai_status' && canUseProtectedActions && (
                      <button
                        type="button"
                        onClick={() => {
                          void loadPanelDetail(selectedPanel);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700"
                      >
                        <RefreshCcw size={14} className={isPanelLoading ? 'animate-spin' : ''} />
                        Refresh
                      </button>
                    )}
                    {selectedPanel === 'queued' && canUseProtectedActions && (
                      <button
                        type="button"
                        onClick={() => {
                          void dequeueQueuedJobs();
                        }}
                        disabled={isDequeueing || (statusSummary?.queuedJobs ?? 0) === 0}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDequeueing ? <RefreshCcw size={14} className="animate-spin" /> : <X size={14} />}
                        {isDequeueing ? 'Dequeuing...' : 'Dequeue Jobs'}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Close panel"
                      onClick={() => setSelectedPanel(null)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-slate-200 transition hover:border-slate-500 hover:bg-slate-700"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1">
                  {selectedPanel === 'ai_status' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Availability</p>
                        <p className={`mt-2 text-xl font-black ${statusSummary?.aiEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {statusSummary?.aiEnabled ? 'Cohere Connected' : 'Cohere Not Configured'}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{aiStatusHelper}</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Missing AI</p>
                          <p className="mt-2 text-2xl font-black text-slate-50">{formatNumber(statusSummary?.missingAi ?? 0)}</p>
                          <p className="mt-2 text-sm text-slate-400">Ready documents still waiting for an AI summary pass.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Ready Documents</p>
                          <p className="mt-2 text-2xl font-black text-slate-50">{formatNumber(statusSummary?.readyDocuments ?? 0)}</p>
                          <p className="mt-2 text-sm text-slate-400">Bills already holding extracted document text on the backend.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {panelError && (
                    <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      {panelError}
                    </div>
                  )}

                  {selectedPanel !== 'ai_status' && !panelError && (
                    <>
                      <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Results</p>
                        <p className="mt-2 text-2xl font-black text-slate-50">
                          {panelDetail ? formatNumber(panelDetail.count) : '...'}
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                          {panelDetail && panelDetail.count > (panelDetail.limit ?? DETAIL_RESULT_LIMIT)
                            ? `Showing the first ${formatNumber(panelDetail.limit ?? DETAIL_RESULT_LIMIT)} bills in this bucket.`
                            : 'Showing every matching bill currently returned by the admin API.'}
                        </p>
                      </div>

                      {isPanelLoading && !panelDetail && (
                        <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-8 text-center text-sm text-slate-400">
                          Loading bills for this metric...
                        </div>
                      )}

                      {!isPanelLoading && panelDetail && panelDetail.results.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-4 py-8 text-center text-sm text-slate-400">
                          No bills match this metric right now.
                        </div>
                      )}

                      {panelDetail?.results.map((bill) => {
                        const summaryText = summarizeText(bill.aiSummary) || summarizeText(bill.aiError) || 'No AI note saved yet.';

                        return (
                          <article key={bill.id} className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">{bill.category}</p>
                                <h3 className="mt-2 text-base font-semibold leading-6 text-slate-50">{bill.title}</h3>
                              </div>
                              <Link
                                href={`/bills/${bill.id}`}
                                target="_blank"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
                              >
                                View
                                <ArrowUpRight size={12} />
                              </Link>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-[11px] font-semibold text-indigo-200">
                                {bill.currentStage}
                              </span>
                              <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-semibold text-slate-300">
                                doc: {bill.documentStatus}
                              </span>
                            </div>

                            {bill.sponsor && <p className="mt-3 text-sm text-slate-400">Sponsor: {bill.sponsor}</p>}

                            <p className="mt-3 text-sm leading-6 text-slate-300">{summaryText}</p>

                            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                              <div>
                                <dt className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Document read</dt>
                                <dd className="mt-1 text-sm text-slate-300">{formatDateTime(bill.documentProcessedAt)}</dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">AI updated</dt>
                                <dd className="mt-1 text-sm text-slate-300">{formatDateTime(bill.aiGeneratedAt)}</dd>
                              </div>
                            </dl>

                            <div className="mt-4 flex flex-wrap gap-3 text-sm">
                              {bill.fullTextUrl && (
                                <a
                                  href={bill.fullTextUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-300 transition hover:text-indigo-200"
                                >
                                  Open PDF
                                </a>
                              )}
                              {bill.parliamentUrl && (
                                <a
                                  href={bill.parliamentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-300 transition hover:text-white"
                                >
                                  Parliament page
                                </a>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </>
                  )}
                </div>
              </section>
          </aside>
        </>
      )}
    </div>
  );
}
