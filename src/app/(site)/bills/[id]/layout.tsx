import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ArrowUpRight, FileText } from 'lucide-react';
import BillSectionNav from '@/components/bills/BillSectionNav';
import BillProcessingRefresh from '@/components/bills/BillProcessingRefresh';
import SiteBreadcrumbs from '@/components/site/SiteBreadcrumbs';
import { ApiError, getBill } from '@/lib/api';

export const dynamic = 'force-dynamic';

const MASTHEAD_STAT_TONES = [
  {
    card: 'border-slate-950 bg-slate-950',
    label: 'text-slate-400',
    value: 'text-white',
  },
  {
    card: 'border-slate-300 bg-white',
    label: 'text-slate-500',
    value: 'text-slate-950',
  },
  {
    card: 'border-[#8c1d18] bg-[#b32018]',
    label: 'text-rose-100/75',
    value: 'text-white',
  },
  {
    card: 'border-forest-900 bg-forest-900',
    label: 'text-forest-200/75',
    value: 'text-white',
  },
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default async function BillDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: billId } = await params;

  let bill = null;

  try {
    bill = await getBill(billId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (!bill) notFound();

  const stage = bill.currentStage ?? bill.status;
  const leadSummary = bill.aiSummary?.trim() || bill.summary;
  const statItems = [
    { label: 'Pages', value: bill.documentPageCount ?? 0 },
    { label: 'Words', value: (bill.documentWordCount ?? 0).toLocaleString() },
    { label: 'Subscribers', value: (bill.subscriberCount ?? 0).toLocaleString() },
    { label: 'Signatures', value: (bill.petition?.signatureCount ?? bill.petitionSignatureCount ?? 0).toLocaleString() },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <BillProcessingRefresh
        hasDocumentSource={Boolean(bill.fullTextUrl || bill.documentSourceUrl || bill.parliamentUrl)}
        documentStatus={bill.documentStatus}
        hasAiSummary={Boolean(bill.aiSummary?.trim())}
        hasAiKeyPoints={bill.aiKeyPoints.length > 0}
        aiError={bill.aiError}
      />

      <SiteBreadcrumbs
        items={[
          { href: '/', label: 'Home' },
          { href: '/bills', label: 'Bills' },
          { label: bill.title },
        ]}
      />

      {/* ── Bill masthead ── */}
      <header className="overflow-hidden border border-[var(--line-strong)] bg-white shadow-[0_24px_60px_-48px_rgba(15,23,42,0.35)]">
        <div className="h-2 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />

        {/* Top: identity + meta */}
        <div className="border-b border-[var(--line-strong)] bg-[linear-gradient(180deg,#fffdfb_0%,#f8f4ef_52%,#ffffff_100%)] px-7 py-7">
          <p className="eyebrow text-forest-700">Bill Story</p>

          {/* Badges + date */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="badge badge-forest">{bill.category}</span>
            <span className="badge badge-clay">{stage}</span>
            {bill.sponsor && (
              <span className="inline-flex items-center border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                {bill.sponsor}
              </span>
            )}
            <span className="ml-auto border border-slate-300 bg-slate-950 px-3 py-1 font-mono text-[11px] text-white">#{bill.id}</span>
          </div>

          {/* Title */}
          <h1 className="mt-5 text-4xl font-bold leading-tight text-slate-950 lg:text-5xl">
            {bill.title}
          </h1>

          {/* Lead summary */}
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">{leadSummary}</p>

          {/* Introduced + links */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <span className="text-sm text-slate-500">
              Introduced <time dateTime={bill.dateIntroduced}>{formatDate(bill.dateIntroduced)}</time>
            </span>

            <div className="flex flex-wrap items-center gap-2">
              {bill.parliamentUrl ? (
                <a
                  href={bill.parliamentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-clay-400 hover:text-clay-700"
                >
                  Parliament page <ArrowUpRight size={12} />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-400">
                  Parliament page unavailable
                </span>
              )}

              {bill.fullTextUrl ? (
                <a
                  href={bill.fullTextUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-forest-900"
                >
                  Full text <FileText size={12} />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-400">
                  Full text not published
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid gap-px border-b border-slate-300 bg-slate-300 md:grid-cols-2 xl:grid-cols-4">
          {statItems.map(({ label, value }, index) => {
            const tone = MASTHEAD_STAT_TONES[index % MASTHEAD_STAT_TONES.length];

            return (
              <div key={label} className={`px-6 py-4 ${tone.card}`}>
                <p className={`eyebrow ${tone.label}`}>{label}</p>
                <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${tone.value}`}>{value}</p>
              </div>
            );
          })}
        </div>

        {/* Section nav */}
        <BillSectionNav billId={bill.id} />
      </header>

      <div className="mt-8 pb-20">{children}</div>
    </div>
  );
}
