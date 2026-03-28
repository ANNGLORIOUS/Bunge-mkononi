'use client';

import { useMemo, useState } from 'react';
import { MinusCircle, Search, UserCheck, UserX } from 'lucide-react';
import { RepresentativeVoteSummary } from '@/types';

interface Props {
  billId: string;
  votes?: RepresentativeVoteSummary[];
}

export default function MemberTracker({ billId, votes = [] }: Props) {
  const [query, setQuery] = useState('');
  const totalVotes = votes.length;

  const filteredVotes = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return votes;
    }

    return votes.filter((vote) => {
      const representative = vote.representative;
      return (
        representative.name.toLowerCase().includes(needle) ||
        representative.role.toLowerCase().includes(needle) ||
        representative.constituency.toLowerCase().includes(needle) ||
        representative.county.toLowerCase().includes(needle) ||
        representative.party.toLowerCase().includes(needle)
      );
    });
  }, [query, votes]);

  const renderVote = (vote: RepresentativeVoteSummary['vote']) => {
    if (vote === 'Yes') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-forest-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.25em] text-forest-800">
          <UserCheck size={14} /> Yes
        </span>
      );
    }

    if (vote === 'No') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.25em] text-[#8c1d18]">
          <UserX size={14} /> No
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.25em] text-slate-700">
        <MinusCircle size={14} /> Abstain
      </span>
    );
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-sm">
      <div className="h-2 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
      <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#fffdfb_0%,#f7f2eb_100%)] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-forest-700">Legislative accountability</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">How representatives voted</h2>
            <p className="mt-2 text-sm text-slate-500">
              Bill ID {billId}. {totalVotes > 0 ? `${totalVotes} representative votes recorded.` : 'No representative votes loaded yet.'}
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-700" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="text"
              placeholder="Search MP, Senator, county, or party..."
              className="w-full rounded-[1.25rem] border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-clay-400 focus:ring-4 focus:ring-clay-100 lg:w-[320px]"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-slate-950 text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">
            <tr>
              <th className="px-6 py-4">Representative</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Constituency</th>
              <th className="px-6 py-4">Party</th>
              <th className="px-6 py-4 text-center">Vote</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredVotes.map((vote) => {
              const representative = vote.representative;
              return (
                <tr key={vote.id} className="transition hover:bg-[#f7f5f0]">
                  <td className="px-6 py-4 font-semibold text-slate-950">{representative.name}</td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.25em] ${
                        representative.role === 'Senator'
                          ? 'bg-rose-50 text-[#8c1d18]'
                          : representative.role === 'MP'
                            ? 'bg-forest-50 text-forest-800'
                            : 'border border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {representative.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {representative.constituency}, {representative.county}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{representative.party}</td>
                  <td className="px-6 py-4 text-center">{renderVote(vote.vote)}</td>
                </tr>
              );
            })}
            {filteredVotes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  No representative votes match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
