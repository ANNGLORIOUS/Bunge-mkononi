import { ExternalLink, FileText } from 'lucide-react';
import { buildPdfProxyUrl } from '@/lib/pdf';

interface BillPdfViewerProps {
  billTitle: string;
  pdfUrl: string | null;
  officialUrl?: string;
}

export default function BillPdfViewer({ billTitle, pdfUrl, officialUrl }: BillPdfViewerProps) {
  const proxyUrl = pdfUrl ? buildPdfProxyUrl(pdfUrl) : null;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-sm">
      <div className="h-2 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
      <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#fffdfb_0%,#f7f2eb_100%)] p-6 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.35em] text-forest-700">
              <FileText size={14} />
              Official PDF
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Read the full bill inline</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              The bill document is embedded below so you can read the full text without leaving the page.
            </p>
          </div>

          {proxyUrl && (
            <a
              href={proxyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-clay-400 hover:text-clay-700"
            >
              Open PDF in new tab
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>

      {proxyUrl ? (
        <div className="bg-[linear-gradient(180deg,#fffdfb_0%,#f7f5f0_100%)] p-3 md:p-4">
          <div className="overflow-hidden rounded-[1.5rem] border border-slate-300 bg-white">
            <iframe
              src={proxyUrl}
              title={`${billTitle} official PDF`}
              className="h-[80vh] min-h-[640px] w-full bg-white"
              loading="lazy"
            />
          </div>
        </div>
      ) : (
        <div className="p-6">
          <div className="rounded-[1.5rem] border border-dashed border-clay-300 bg-[linear-gradient(180deg,#ffffff,#f7f5f0)] p-6 text-sm text-slate-600">
            <p className="font-semibold text-slate-950">No PDF preview is available for this bill yet.</p>
            <p className="mt-2">
              We could not find a direct PDF URL to embed inline. If the official page exists, you can open it from the
              resources panel{officialUrl ? ' below' : '.'}.
            </p>
            {officialUrl && (
              <a
                href={officialUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-forest-900"
              >
                Open official page
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
