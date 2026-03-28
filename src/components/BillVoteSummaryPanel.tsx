import { BarChart3, Vote } from 'lucide-react';
import type { BillVotePartyBreakdown, BillVoteSummary } from '@/types';

interface Props {
  summary: BillVoteSummary;
}

type VoteMetricTone = 'green' | 'red' | 'white' | 'black';

const VOTE_METRIC_TONES: Record<
  VoteMetricTone,
  {
    card: string;
    label: string;
    value: string;
  }
> = {
  green: {
    card: 'border-forest-900 bg-forest-900',
    label: 'text-forest-200/80',
    value: 'text-white',
  },
  red: {
    card: 'border-[#8c1d18] bg-[#b32018]',
    label: 'text-rose-100/80',
    value: 'text-white',
  },
  white: {
    card: 'border-slate-300 bg-white',
    label: 'text-slate-500',
    value: 'text-slate-950',
  },
  black: {
    card: 'border-slate-950 bg-slate-950',
    label: 'text-slate-400',
    value: 'text-white',
  },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function VoteMetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: VoteMetricTone;
}) {
  const toneClasses = VOTE_METRIC_TONES[tone];

  return (
    <div className={`rounded-[1.5rem] border p-4 ${toneClasses.card}`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.35em] ${toneClasses.label}`}>{label}</p>
      <p className={`mt-2 text-3xl font-semibold leading-none ${toneClasses.value}`}>{value}</p>
    </div>
  );
}

function VoteBreakdownTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<{
    label: string;
    yes: number;
    no: number;
    abstain: number;
    total: number;
  }>;
}) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-300 bg-white">
      <div className="h-1.5 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_30%,#185540_30_100%)]" />
      <div className="p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        {rows.length > 0 ? (
          <div className="max-h-[28rem] overflow-auto rounded-[1.25rem] border border-slate-300">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-950 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">
                <tr>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3 text-center text-forest-300">Yes</th>
                  <th className="px-4 py-3 text-center text-rose-200">No</th>
                  <th className="px-4 py-3 text-center text-white">Abstain</th>
                  <th className="px-4 py-3 text-center text-slate-300">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.label} className="transition hover:bg-[#f7f5f0]">
                    <td className="px-4 py-3 font-semibold text-slate-950">{row.label}</td>
                    <td className="px-4 py-3 text-center font-semibold text-forest-800">{row.yes}</td>
                    <td className="px-4 py-3 text-center font-semibold text-[#8c1d18]">{row.no}</td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700">{row.abstain}</td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-950">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[1.25rem] border border-dashed border-clay-300 bg-[linear-gradient(180deg,#ffffff,#f7f5f0)] p-5 text-sm text-slate-500">
            No breakdown data is available yet.
          </div>
        )}
      </div>
    </div>
  );
}

function normalizePartyRows(byParty: Record<string, BillVotePartyBreakdown>) {
  return Object.entries(byParty)
    .map(([party, breakdown]) => ({
      label: party,
      ...breakdown,
    }))
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
}

export default function BillVoteSummaryPanel({ summary }: Props) {
  const countyRows = [...summary.byCounty].sort(
    (left, right) => right.total - left.total || left.county.localeCompare(right.county),
  );
  const partyRows = normalizePartyRows(summary.byParty);
  const leadingLabel =
    summary.totalVotes === 0
      ? 'No votes recorded yet'
      : summary.yes >= summary.no && summary.yes >= summary.abstain
        ? 'Yes is leading'
        : summary.no >= summary.yes && summary.no >= summary.abstain
          ? 'No is leading'
          : 'Abstain is leading';

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-sm">
      <div className="h-2 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
      <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#fffdfb_0%,#f7f2eb_100%)] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.35em] text-forest-700">
              <BarChart3 size={14} /> Vote summary
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Parliamentary vote breakdown</h2>
            <p className="mt-2 text-sm text-slate-500">
              {summary.billTitle} • Bill ID {summary.billId}
            </p>
            <p className="mt-1 text-sm font-semibold text-clay-700">{leadingLabel}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-forest-800">
              {summary.billStatus}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-white">
              {formatNumber(summary.totalVotes)} recorded votes
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-8 p-6 md:p-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <VoteMetricCard label="Yes" value={formatNumber(summary.yes)} tone="green" />
          <VoteMetricCard label="No" value={formatNumber(summary.no)} tone="red" />
          <VoteMetricCard label="Abstain" value={formatNumber(summary.abstain)} tone="white" />
          <VoteMetricCard label="Total" value={formatNumber(summary.totalVotes)} tone="black" />
        </div>

        <div className="rounded-[1.75rem] border border-slate-300 bg-[linear-gradient(180deg,#fffdfb_0%,#f7f2eb_100%)] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                <Vote className="text-clay-600" size={18} /> Vote split
              </h3>
              <p className="text-sm text-slate-500">Share of recorded representative votes on this bill.</p>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
              {summary.totalVotes > 0 ? 'Counts and percentages from the vote scrape endpoint' : 'No votes imported yet'}
            </p>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white shadow-inner">
            <div className="flex h-full w-full">
              <div className="bg-forest-700" style={{ width: `${summary.yesPercent}%` }} />
              <div className="bg-[#b32018]" style={{ width: `${summary.noPercent}%` }} />
              <div className="bg-slate-950" style={{ width: `${summary.abstainPercent}%` }} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-[0.25em]">
            <span className="rounded-full bg-forest-50 px-3 py-1 text-forest-800">Yes {summary.yesPercent}%</span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-[#8c1d18]">No {summary.noPercent}%</span>
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
              Abstain {summary.abstainPercent}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <VoteBreakdownTable
            title="By county"
            subtitle="See how each county leaned on this bill."
            rows={countyRows.map((row) => ({
              label: row.county,
              yes: row.yes,
              no: row.no,
              abstain: row.abstain,
              total: row.total,
            }))}
          />
          <VoteBreakdownTable title="By party" subtitle="Party alignment across the recorded vote." rows={partyRows} />
        </div>
      </div>
    </section>
  );
}
