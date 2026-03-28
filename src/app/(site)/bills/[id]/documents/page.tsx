import { notFound } from 'next/navigation';
import { ApiError, getBill } from '@/lib/api';
import BillQuestionAssistant from '@/components/BillQuestionAssistant';
import { getBillPdfSourceUrl } from '@/lib/pdf';
import BillPdfViewer from '@/components/BillPdfViewer';

export const dynamic = 'force-dynamic';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function BillDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: billId } = await params;

  let bill = null;

  try {
    bill = await getBill(billId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (!bill) notFound();

  const pdfSourceUrl = getBillPdfSourceUrl(bill);
  const summaryText = bill.aiSummary?.trim() || bill.documentText?.trim().slice(0, 600);
  const insightPoints = bill.aiKeyPoints.length > 0 ? bill.aiKeyPoints : bill.keyPoints;

  return (
    <div className="space-y-8">
      {/* ── Hero bar: merged document snapshot ── */}
      <section className="overflow-hidden border border-[var(--line-strong)] bg-white">
        <div className="h-2 bg-[linear-gradient(90deg,#020617_0_22%,#ffffff_22_28%,#b32018_28_70%,#ffffff_70_76%,#185540_76_100%)]" />
        <div className="border-b border-[var(--line-strong)] bg-[linear-gradient(180deg,#fffdfb_0%,#f7f2eb_100%)] px-6 py-6">
          <p className="eyebrow text-forest-700">Document Room</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Source Text And Extracted Insights</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Review the official bill document inline, then use the AI summary and Q&amp;A assistant to navigate the text more quickly.
          </p>
        </div>

        <div className="grid gap-px border-t border-slate-300 bg-slate-300 sm:grid-cols-2 xl:grid-cols-5">
          <div className="bg-slate-950 px-5 py-4">
            <p className="eyebrow text-slate-400">Source</p>
            <p className="mt-1 font-mono text-sm font-semibold text-white">
              {bill.documentMethod || '—'}
            </p>
          </div>
          <div className="bg-white px-5 py-4">
            <p className="eyebrow text-slate-500">Pages</p>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900">
              {bill.documentPageCount ?? '—'}
            </p>
          </div>
          <div className="bg-[#b32018] px-5 py-4">
            <p className="eyebrow text-rose-100/80">Words</p>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-white">
              {bill.documentWordCount ? bill.documentWordCount.toLocaleString() : '—'}
            </p>
          </div>
          <div className="bg-forest-900 px-5 py-4">
            <p className="eyebrow text-forest-200/80">Processed</p>
            <p className="mt-1 font-mono text-sm font-semibold text-white">
              {bill.documentProcessedAt ? formatDateTime(bill.documentProcessedAt) : '—'}
            </p>
          </div>
          <div className="bg-[#fffdfb] px-5 py-4">
            <p className="eyebrow text-clay-600">AI refresh</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {bill.aiGeneratedAt ? formatDateTime(bill.aiGeneratedAt) : '—'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Main viewer + sidebar ── */}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_300px] xl:items-start">

        {/* PDF viewer */}
        <div className="min-w-0">
          <BillPdfViewer
            billTitle={bill.title}
            pdfUrl={pdfSourceUrl}
            officialUrl={bill.parliamentUrl || bill.fullTextUrl}
          />
        </div>

        {/* Sidebar — summary only, specs moved to hero */}
        <aside className="overflow-hidden border border-[var(--line-strong)] bg-[#fffdfb]">
          <div className="h-1.5 bg-[linear-gradient(90deg,#020617_0_26%,#ffffff_26_32%,#185540_32_100%)]" />
          <div className="px-6 py-6">
            <p className="eyebrow mb-4 text-forest-700">Extracted summary</p>

            {insightPoints.length > 0 ? (
              <ol className="space-y-5">
                {insightPoints.map((point, index) => (
                  <li key={point} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center bg-slate-950 font-mono text-[10px] font-bold tabular-nums text-white">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="border-l-2 border-clay-200 pl-3">
                      <p className="text-xs leading-6 text-slate-600">{point}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : summaryText ? (
              <p className="text-xs leading-7 text-slate-600">{summaryText}</p>
            ) : (
              <p className="border border-dashed border-slate-300 bg-[var(--surface-muted)] px-4 py-5 text-xs leading-6 text-slate-400">
                No extracted summary available yet.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* ── Q&A assistant — full width below ── */}
      <div>
        <BillQuestionAssistant billId={bill.id} />
      </div>
    </div>
  );
}
