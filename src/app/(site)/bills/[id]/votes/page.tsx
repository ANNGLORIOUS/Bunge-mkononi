import { notFound } from 'next/navigation';
import { buildVoteSummaryFromVotes } from '@/lib/vote-summary';
import { ApiError, getBill, getBillVoteSummary, getBillVotes } from '@/lib/api';
import BillVoteSummaryPanel from '@/components/BillVoteSummaryPanel';
import MemberTracker from '@/components/MemberTracker';
import type { BillDetail } from '@/types';

export const dynamic = 'force-dynamic';

export default async function BillVotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: billId } = await params;

  const billPromise = getBill(billId);
  const billVotesPromise = getBillVotes(billId).catch((fetchError) => {
    console.error(fetchError);
    return null;
  });
  const billVoteSummaryPromise = getBillVoteSummary(billId).catch((fetchError) => {
    console.error(fetchError);
    return null;
  });

  let bill: BillDetail | null = null;

  try {
    bill = await billPromise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  if (!bill) {
    notFound();
  }

  const [billVotesResponse, billVoteSummaryResponse] = await Promise.all([
    billVotesPromise,
    billVoteSummaryPromise,
  ]);
  const stage = bill.currentStage ?? bill.status;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden border border-[var(--line-strong)] bg-white">
        <div className="h-2 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
        <div className="bg-[linear-gradient(180deg,#fffdfb_0%,#f7f2eb_100%)] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="eyebrow text-forest-700">Recorded Votes</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-950">How Parliament aligned on this bill</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Compare the official roll call, the county breakdown, and party alignment using the same Kenyan palette as the main bills register.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-forest">{bill.category}</span>
              <span className="badge badge-clay">{stage}</span>
            </div>
          </div>
        </div>
      </section>

      <BillVoteSummaryPanel
        summary={
          billVoteSummaryResponse ??
          buildVoteSummaryFromVotes({
            billId: bill.id,
            billTitle: bill.title,
            billStatus: bill.currentStage ?? bill.status,
            votes: billVotesResponse?.votes ?? bill.representativeVotes ?? [],
          })
        }
      />

      <MemberTracker billId={bill.id} votes={billVotesResponse?.votes ?? bill.representativeVotes} />
    </div>
  );
}
