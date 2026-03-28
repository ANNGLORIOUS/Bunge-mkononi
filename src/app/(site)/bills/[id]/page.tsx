import Link from 'next/link';
import { ArrowRight, FileText, Sparkles } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ApiError, getBill } from '@/lib/api';
import BillTimeline from '@/components/BillTimeline';
import { BillDetail } from '@/types';

export const dynamic = 'force-dynamic';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
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

  const narrativeSummary = bill.aiSummary?.trim() || bill.summary;
  const keyPoints = bill.aiKeyPoints?.length ? bill.aiKeyPoints : bill.keyPoints ?? [];
  const aiTimeline = bill.aiTimeline ?? [];
  const stage = bill.currentStage ?? bill.status;
  const documentStatusLabel = bill.documentStatus === 'ready' ? 'Ready' : 'Processing';
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:items-start">
      {/* ── Main column ── */}
      <article className="min-w-0 space-y-8">
        {/* Summary — reads like a news lede */}
        <section className="overflow-hidden border border-[var(--line-strong)] bg-[linear-gradient(180deg,#fffdfb_0%,#f8f4ef_58%,#ffffff_100%)]">
          <div className="h-1.5 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
          <div className="p-8">
            <p className="eyebrow mb-5 text-forest-700">Summary</p>
            <p className="text-lg leading-9 text-slate-700">{narrativeSummary}</p>
            <div className="mt-8">
              <Link
                href={`/bills/${bill.id}/documents`}
                className="inline-flex items-center gap-2 bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest-900"
              >
                Read full document <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>

        {/* Legislative timeline */}
        <section>
          <BillTimeline currentStage={stage} />
        </section>

        {/* Key impact points */}
        <section className="overflow-hidden border border-[var(--line-strong)] bg-white">
          <div className="h-1.5 bg-[linear-gradient(90deg,#b32018_0_68%,#ffffff_68_72%,#185540_72_100%)]" />
          <div className="p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-clay-600">Impact Analysis</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">What this bill changes</h2>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 border border-forest-200 bg-forest-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-forest-800">
                <Sparkles size={10} /> AI curated
              </span>
            </div>

            {keyPoints.length > 0 ? (
              <ol className="space-y-6">
                {keyPoints.map((point, index) => (
                  <li key={`${point}-${index}`} className="flex gap-5">
                    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center bg-slate-950 font-mono text-xs font-bold tabular-nums text-white">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="border-l-2 border-clay-200 pl-5">
                      <p className="text-sm leading-8 text-slate-700">{point}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="border border-dashed border-clay-300 bg-[linear-gradient(180deg,#ffffff,#f7f5f0)] px-6 py-10 text-center text-sm font-medium text-slate-500">
                Analysis in progress — check back shortly.
              </div>
            )}
          </div>
        </section>

        {/* AI implementation timeline */}
        {aiTimeline.length > 0 && (
          <section className="overflow-hidden border border-[var(--line-strong)] bg-[#fffdfb]">
            <div className="h-1.5 bg-[linear-gradient(90deg,#185540_0_32%,#ffffff_32_36%,#020617_36_64%,#ffffff_64_68%,#b32018_68_100%)]" />
            <div className="p-8">
              <p className="eyebrow mb-2 text-forest-700">Implementation</p>
              <h2 className="mb-8 text-2xl font-bold text-slate-950">Expected milestones</h2>

              <div className="space-y-0">
                {aiTimeline.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="grid grid-cols-[120px_1fr] gap-6 border-t border-[var(--line-strong)] py-6 first:border-t-0"
                  >
                    <p className="eyebrow pt-1 text-clay-600">{item.label}</p>
                    <p className="text-sm leading-7 text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </article>

      {/* ── Sidebar ── */}
      <aside className="space-y-6 lg:sticky lg:top-[65px]">
        {/* Document specs */}
        <div className="overflow-hidden border border-[var(--line-strong)] bg-white">
          <div className="h-1.5 bg-[linear-gradient(90deg,#020617_0_40%,#ffffff_40_44%,#185540_44_100%)]" />
          <div className="flex items-center gap-2.5 border-b border-[var(--line-strong)] px-5 py-4">
            <FileText size={14} className="text-forest-700" />
            <p className="eyebrow text-forest-700">Technical Specs</p>
          </div>
          <dl className="divide-y divide-[var(--line)]">
            {[
              { label: 'Status', value: stage },
              { label: 'Document', value: documentStatusLabel },
              { label: 'Method', value: bill.documentMethod || 'Manual' },
              { label: 'Pages', value: (bill.documentPageCount ?? 0).toLocaleString() },
              { label: 'Words', value: bill.documentWordCount ? bill.documentWordCount.toLocaleString() : '—' },
              { label: 'Processed', value: bill.documentProcessedAt ? formatDate(bill.documentProcessedAt) : '—' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="eyebrow text-slate-500">{item.label}</dt>
                <dd className="font-mono text-xs font-semibold text-slate-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Deep dive CTA */}
        <div className="overflow-hidden bg-slate-950 px-6 py-7">
          <div className="mb-5 h-1.5 bg-[linear-gradient(90deg,#ffffff_0_10%,#b32018_10_66%,#ffffff_66_72%,#185540_72_100%)]" />
          <h3 className="text-lg font-bold text-white">Go deeper</h3>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            Read the source documents or examine how legislators voted on this bill.
          </p>
          <div className="mt-6 space-y-2">
            <Link
              href={`/bills/${bill.id}/documents`}
              className="flex h-11 w-full items-center justify-center bg-[#b32018] text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#971913]"
            >
              Read Documents
            </Link>
            <Link
              href={`/bills/${bill.id}/votes`}
              className="flex h-11 w-full items-center justify-center border border-forest-500 text-xs font-bold uppercase tracking-[0.18em] text-forest-100 transition hover:border-forest-300 hover:text-white"
            >
              Review Votes
            </Link>
          </div>
        </div>

        {/* Sponsor card — only if present */}
        {bill.sponsor && (
          <div className="overflow-hidden border border-[var(--line-strong)] bg-[#fffdfb] px-5 py-5">
            <p className="eyebrow mb-3 text-clay-600">Sponsored By</p>
            <p className="text-sm font-semibold text-slate-900">{bill.sponsor}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
