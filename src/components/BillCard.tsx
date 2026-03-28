'use client';

import Link from 'next/link';
import { ArrowUpRight, BellRing, ExternalLink, FileText } from 'lucide-react';
import Stepper, { type StepperStep } from '@/components/ui/stepper';
import { Bill, BillStatus, Petition } from '@/types';
import { getBillPdfSourceUrl } from '@/lib/pdf';

interface Props {
  bill: Bill;
  petition?: Petition;
}

const STAGES: BillStatus[] = ['First Reading', 'Committee', 'Second Reading', 'Third Reading', 'Presidential Assent'];
const STAGE_STEPS: StepperStep[] = STAGES.map((stage) => ({ key: stage, label: stage }));

const STATUS_STYLES: Record<BillStatus, string> = {
  'First Reading': 'border border-slate-950 bg-slate-950 text-white',
  Committee: 'border border-slate-300 bg-white text-slate-800',
  'Second Reading': 'border border-[#8c1d18] bg-[#b32018] text-white',
  'Third Reading': 'border border-forest-900 bg-forest-900 text-white',
  'Presidential Assent': 'border border-forest-200 bg-forest-50 text-forest-800',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default function BillCard({ bill, petition }: Props) {
  const livePetition = petition ?? bill.petition ?? undefined;
  const currentStage = bill.currentStage ?? bill.status;
  const pdfUrl = getBillPdfSourceUrl(bill);
  const billNumber = bill.id.replace(/-/g, ' ').toUpperCase();
  const leadSummary = bill.aiSummary?.trim() || bill.summary;

  return (
    <article className="group border-l-2 border-l-transparent px-6 py-6 transition-all duration-200 hover:border-l-clay-600 hover:bg-[#fbf7f1]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start 2xl:grid-cols-[minmax(0,1.7fr)_240px_260px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs uppercase tracking-[0.18em] text-slate-500">
            <span className="metric-mono">{formatDate(bill.dateIntroduced)}</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
            <span className="metric-mono">Bill No. {billNumber}</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-clay-700">
              {bill.category}
            </span>
          </div>

          <Link href={`/bills/${bill.id}`} className="mt-3 block">
            <h3 className="font-[family:var(--font-site-serif)] text-2xl font-semibold leading-tight text-slate-900 transition group-hover:text-brand-strong">
              {bill.title}
            </h3>
          </Link>

          <p className="mt-3 text-sm leading-7 text-slate-600">
            Sponsored by: <span className="font-medium text-forest-800">{bill.sponsor || 'Government of Kenya'}</span>
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{leadSummary}</p>

          {livePetition && (
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
              <span className="metric-mono text-clay-700">{livePetition.signatureCount.toLocaleString()}</span> signatures tracked
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-4 border border-slate-300 bg-[linear-gradient(180deg,rgba(15,23,42,0.03),rgba(255,255,255,0.95)_28%,rgba(187,61,42,0.07)_72%,rgba(24,85,64,0.08))] p-4 lg:col-span-2 2xl:col-span-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
            <span className={`mt-2 inline-flex px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${STATUS_STYLES[currentStage]}`}>
              {currentStage}
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">House Progress</p>
            <Stepper steps={STAGE_STEPS} currentStep={currentStage} showEdgeLabels colorScheme="kenya" />
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center lg:col-start-2 lg:row-start-1 lg:flex-col lg:items-stretch 2xl:col-start-auto 2xl:row-start-auto 2xl:items-end">
          <Link
            href={`/bills/${bill.id}`}
            className="inline-flex h-11 items-center justify-center gap-2 bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-forest-900 sm:min-w-[180px] lg:w-full 2xl:w-auto"
          >
            Open Bill Story
            <ArrowUpRight size={14} />
          </Link>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 bg-white text-slate-700 transition hover:border-clay-300 hover:bg-clay-50 hover:text-clay-700"
                aria-label={`Open PDF for ${bill.title}`}
                title="Open PDF"
              >
                <FileText size={16} />
              </a>
            )}
            <Link
              href={`/bills/${bill.id}/participation`}
              className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 bg-white text-slate-700 transition hover:border-forest-300 hover:bg-forest-50 hover:text-forest-800"
              aria-label={`Follow ${bill.title}`}
              title="Follow bill"
            >
              <BellRing size={16} />
            </Link>
          </div>

          {bill.parliamentUrl ? (
            <a
              href={bill.parliamentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-clay-700"
            >
              View on Parliament.go.ke
              <ExternalLink size={14} />
            </a>
          ) : (
            <span className="text-sm font-medium text-slate-400 lg:text-right">Parliament source unavailable</span>
          )}
        </div>
      </div>
    </article>
  );
}
