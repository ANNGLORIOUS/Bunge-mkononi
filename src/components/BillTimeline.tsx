// BillTimeline Redesign
'use client';

import { Check } from 'lucide-react';
import { BillStatus } from '@/types';

const STAGES: BillStatus[] = ['First Reading', 'Committee', 'Second Reading', 'Third Reading', 'Presidential Assent'];

export default function BillTimeline({ currentStage }: { currentStage: BillStatus }) {
  const currentIndex = Math.max(STAGES.indexOf(currentStage), 0);

  return (
    <section className="surface-card p-8">
      <div className="mb-10 flex flex-col gap-2 border-b border-slate-200 pb-4">
        <p className="eyebrow text-brand-strong">Process Tracking</p>
        <h3 className="text-2xl font-semibold text-slate-900">Legislative Journey</h3>
      </div>

      <div className="relative">
        <div className="absolute left-0 top-5 hidden h-0.5 w-full bg-slate-200 lg:block" />
        
        <ol className="grid gap-6 lg:grid-cols-5 relative">
          {STAGES.map((stage, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isPending = index > currentIndex;

            return (
              <li key={stage} className="relative flex flex-col">
                <div className={`z-10 flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                  isCurrent ? 'border-brand-strong bg-brand text-white shadow-lg shadow-brand/15' :
                  isCompleted ? 'border-slate-900 bg-slate-900 text-white' : 
                  'border-slate-200 bg-white text-slate-400'
                }`}>
                  {isCompleted ? <Check size={18} /> : <span className="metric-mono text-xs font-semibold">{index + 1}</span>}
                </div>

                <div className={`mt-4 rounded-xl border p-4 ${isCurrent ? 'border-brand/20 bg-brand-soft/40' : 'border-slate-200 bg-slate-50/80'}`}>
                  <p className={`text-xs font-semibold uppercase tracking-[0.24em] ${isPending ? 'text-slate-400' : 'text-slate-900'}`}>
                    {stage}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {isCurrent ? 'Active Now' : isCompleted ? 'Verified' : 'Scheduled'}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
