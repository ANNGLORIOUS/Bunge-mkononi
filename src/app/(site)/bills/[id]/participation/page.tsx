import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, MessageSquare, ShieldCheck, Smartphone } from 'lucide-react';
import { ApiError, getBill } from '@/lib/api';
import ParticipationHub from '@/components/ParticipationHub';
import RegionalImpact from '@/components/RegionalImpact';
import type { BillDetail } from '@/types';

export const dynamic = 'force-dynamic';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default async function BillParticipationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: billId } = await params;

  let bill: BillDetail | null = null;

  try {
    bill = await getBill(billId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (!bill) notFound();

  const stage = bill.currentStage ?? bill.status;

  return (
    <div className="grid gap-8 xl:grid-cols-[200px_minmax(0,1fr)_280px] xl:items-start">
      {/* ── Left sidebar ── */}
      <aside className="overflow-hidden xl:sticky xl:top-[65px] xl:self-start xl:divide-y xl:divide-[var(--line-strong)] xl:border xl:border-[var(--line-strong)] xl:bg-white">
        <div className="h-1.5 bg-[linear-gradient(90deg,#020617_0_34%,#ffffff_34_40%,#185540_40_100%)]" />

        {/* Bill record */}
        <div className="px-5 py-5">
          <p className="eyebrow mb-4 text-forest-700">Current Record</p>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Status</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{stage}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Introduced</p>
              <p className="mt-1 font-mono text-xs font-semibold text-slate-900">{formatDate(bill.dateIntroduced)}</p>
            </div>
          </div>
        </div>

        {/* Participation channels */}
        <div className="px-5 py-5">
          <p className="eyebrow mb-4 text-clay-600">Channels</p>
          <div className="space-y-4">

            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-[#b32018] text-white">
                <MessageSquare size={13} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">SMS</p>
                <p className="mt-1 font-mono text-xs font-semibold text-slate-900">TRACK {bill.id}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-slate-950 text-white">
                <Smartphone size={13} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">USSD</p>
                <p className="mt-1 font-mono text-xs font-semibold text-slate-900">*384*16250#</p>
              </div>
            </div>

          </div>
        </div>

        {/* Back link */}
        <div className="px-5 py-4">
          <Link
            href={`/bills/${bill.id}`}
            className="inline-flex w-full items-center justify-center gap-1.5 border border-slate-300 bg-[#f7f5f0] px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-clay-400 hover:text-clay-700"
          >
            Back to overview <ArrowRight size={12} />
          </Link>
        </div>
      </aside>

      {/* ── Main: participation hub ── */}
      <div className="min-w-0">
        {/* Section header */}
        <div className="overflow-hidden border border-[var(--line-strong)] bg-[linear-gradient(180deg,#fffdfb_0%,#f7f2eb_100%)]">
          <div className="h-2 bg-[linear-gradient(90deg,#020617_0_20%,#ffffff_20_26%,#b32018_26_74%,#ffffff_74_80%,#185540_80_100%)]" />
          <div className="px-7 py-7">
            <p className="eyebrow text-forest-600">Civic Participation</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Public Response</h2>
            <p className="mt-3 max-w-xl text-base leading-7 text-slate-500">
              Register support, opposition, or a request for more information. Your response is recorded against the
              formal legislative record.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="badge badge-forest">{bill.category}</span>
              <span className="badge badge-clay">{stage}</span>
            </div>
          </div>
        </div>

        <ParticipationHub
          billId={bill.id}
          billTitle={bill.title}
          initialSignatureCount={bill.petition?.signatureCount ?? bill.petitionSignatureCount ?? 0}
          initialPolling={bill.polling}
        />
      </div>

      {/* ── Right sidebar ── */}
      <aside className="space-y-6 xl:sticky xl:top-[65px] xl:self-start">

        <RegionalImpact counties={bill.countyStats} />

        {/* How responses are used */}
        <div className="overflow-hidden border border-[var(--line-strong)] bg-white">
          <div className="h-1.5 bg-[linear-gradient(90deg,#b32018_0_60%,#ffffff_60_66%,#185540_66_100%)]" />
          <div className="flex items-center gap-2.5 px-5 py-4">
            <ShieldCheck size={13} className="text-clay-600" />
            <p className="eyebrow text-clay-600">How responses are used</p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {[
              { label: 'Support',       body: 'Signals direct public approval and adds to the visible support count.' },
              { label: 'Oppose',        body: 'Captures public resistance and balances the participation record.' },
              { label: 'Need more info', body: 'Flags uncertainty and indicates where clearer public education is needed.' },
            ].map(({ label, body }) => (
              <div key={label} className="px-5 py-4">
                <p className="eyebrow text-forest-600">{label}</p>
                <p className="mt-2 text-xs leading-6 text-slate-500">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Dark CTA */}
        <div className="overflow-hidden bg-slate-950 px-6 py-7">
          <div className="mb-5 h-1.5 bg-[linear-gradient(90deg,#ffffff_0_10%,#b32018_10_66%,#ffffff_66_72%,#185540_72_100%)]" />
          <h3 className="text-base font-bold text-white">Keep the record connected</h3>
          <p className="mt-2 text-xs leading-6 text-slate-300">
            Return to the overview or documents to reconnect your response with the legislative text.
          </p>
          <div className="mt-5 space-y-2">
            <Link
              href={`/bills/${bill.id}`}
              className="flex h-10 w-full items-center justify-center gap-1.5 bg-[#b32018] text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#971913]"
            >
              Back to overview <ArrowRight size={12} />
            </Link>
            <Link
              href={`/bills/${bill.id}/documents`}
              className="flex h-10 w-full items-center justify-center gap-1.5 border border-forest-500 text-xs font-bold uppercase tracking-[0.14em] text-forest-100 transition hover:border-forest-300 hover:text-white"
            >
              Read documents <MessageSquare size={12} />
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
