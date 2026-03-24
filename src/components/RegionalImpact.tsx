'use client';

import { MapPin } from 'lucide-react';
import { CountyStat } from '@/types';

interface Props {
  counties?: CountyStat[];
}

export default function RegionalImpact({ counties = [] }: Props) {
  const visibleCounties = counties.slice(0, 4);
  const maxEngagement = Math.max(...visibleCounties.map((county) => county.engagementCount), 1);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
        <MapPin className="text-rose-500" /> Regional Engagement
      </h3>

      {visibleCounties.length > 0 ? (
        <div className="space-y-6">
          {visibleCounties.map((county) => (
            <div key={`${county.billId ?? 'global'}-${county.county}`}>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <span className="text-sm font-bold text-slate-900">{county.county}</span>
                  <span
                    className={`ml-2 text-[10px] uppercase font-black ${
                      county.sentiment === 'Oppose'
                        ? 'text-rose-500'
                        : county.sentiment === 'Support'
                          ? 'text-emerald-500'
                          : 'text-amber-500'
                    }`}
                  >
                    • {county.sentiment}
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {county.engagementCount.toLocaleString()} voices
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    county.sentiment === 'Oppose'
                      ? 'bg-rose-500'
                      : county.sentiment === 'Support'
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.max((county.engagementCount / maxEngagement) * 100, 10)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          County engagement will appear here once citizens start interacting with the bill.
        </p>
      )}
    </div>
  );
}
