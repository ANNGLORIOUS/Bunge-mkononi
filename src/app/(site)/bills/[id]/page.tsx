import Link from 'next/link';
import { ArrowRight, FileText, Sparkles } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ApiError, getBill } from '@/lib/api';
import BillTimeline from '@/components/BillTimeline';
import { BillDetail } from '@/types';

export const dynamic = 'force-dynamic';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="surface-panel p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-(--shadow-soft)">
      <p className="eyebrow text-slate-500">{label}</p>
      <p className="metric-mono mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{helper}</p>
    </div>
  );
}

export default async function BillOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: billId } = await params;
  let bill: BillDetail | null = null;

  try {
    bill = await getBill(billId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (!bill) notFound();

  const keyPoints = bill.keyPoints ?? [];
  const stage = bill.currentStage ?? bill.status;
  const documentStatusLabel = bill.documentStatus === 'ready' ? 'READY' : 'PROCESSING';

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-8">
        <section className="surface-card p-8">
          <div className="flex flex-col gap-6 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="eyebrow text-brand-strong">Intelligence Brief</p>
              <h2 className="mt-1 text-4xl font-semibold text-slate-900">Bill Overview</h2>
              <p className="mt-2 text-lg leading-8 text-slate-600">The essential story: impact, status, and public traction.</p>
            </div>
            <Link
              href={`/bills/${bill.id}/documents`}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white transition hover:bg-brand-strong"
            >
              Full Document View <ArrowRight size={16} />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Status" value={stage} helper={`Since ${formatDate(bill.dateIntroduced)}`} />
            <MetricCard label="Document" value={documentStatusLabel} helper="Text analysis state" />
            <MetricCard
              label="Signatures"
              value={(bill.petition?.signatureCount ?? bill.petitionSignatureCount ?? 0).toLocaleString()}
              helper="Public Support"
            />
            <MetricCard label="Watchers" value={(bill.subscriberCount ?? 0).toLocaleString()} helper="Following Updates" />
          </div>
        </section>

        <BillTimeline currentStage={stage} />

        <section className="surface-card p-8">
          <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 className="text-xl font-semibold uppercase tracking-tight text-slate-900">Impact Summary</h3>
            <span className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-1 text-[10px] font-semibold uppercase text-brand-strong">
              <Sparkles size={12} /> AI Curated Insight
            </span>
          </div>

          {keyPoints.length > 0 ? (
            <div className="grid gap-4">
              {keyPoints.map((point, index) => (
                <div key={`${point}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex gap-4">
                    <span className="metric-mono text-lg font-semibold text-brand-strong">0{index + 1}</span>
                    <p className="text-sm font-medium leading-7 text-slate-700">{point}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center font-semibold uppercase tracking-widest text-slate-500">
              Extraction in progress...
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-8">
        <section className="surface-card p-6">
          <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-4">
            <FileText size={20} className="text-brand-strong" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-900">Technical Specs</h3>
          </div>

          <dl className="space-y-2">
            {[
              { label: 'Method', value: bill.documentMethod || 'Manual' },
              { label: 'Page Count', value: (bill.documentPageCount ?? 0).toLocaleString() },
              { label: 'Word Count', value: bill.documentWordCount ? bill.documentWordCount.toLocaleString() : '--' },
              { label: 'Timestamp', value: bill.documentProcessedAt ? formatDate(bill.documentProcessedAt) : '--' },
            ].map((item) => (
              <div key={item.label} className="flex justify-between border-b border-slate-100 py-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</dt>
                <dd className="metric-mono text-xs font-semibold text-slate-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="surface-card bg-slate-900 p-8 text-white">
          <h3 className="mb-4 text-2xl font-semibold leading-none">Deep Dive</h3>
          <p className="mb-8 text-sm leading-7 text-slate-400">
            Navigate directly to the raw data or public consensus for this bill.
          </p>
          <div className="space-y-3">
            <Link
              href={`/bills/${bill.id}/documents`}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-xs font-semibold uppercase tracking-[0.24em] transition-colors hover:bg-white hover:text-brand-strong"
            >
              Read Documents
            </Link>
            <Link
              href={`/bills/${bill.id}/votes`}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white text-xs font-semibold uppercase tracking-[0.24em] transition-colors hover:bg-white hover:text-slate-900"
            >
              Review Votes
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
