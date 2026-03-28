'use client';

import { startTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface BillProcessingRefreshProps {
  hasDocumentSource: boolean;
  documentStatus: string;
  hasAiSummary: boolean;
  hasAiKeyPoints: boolean;
  aiError?: string | null;
}

const REFRESH_INTERVAL_MS = 5000;
const MAX_REFRESH_ATTEMPTS = 18;

function shouldKeepRefreshing({
  hasDocumentSource,
  documentStatus,
  hasAiSummary,
  hasAiKeyPoints,
  aiError,
}: BillProcessingRefreshProps) {
  if (!hasDocumentSource) {
    return false;
  }

  if (String(aiError || '').trim()) {
    return false;
  }

  if (documentStatus === 'failed') {
    return false;
  }

  if (documentStatus !== 'ready') {
    return true;
  }

  return !hasAiSummary && !hasAiKeyPoints;
}

export default function BillProcessingRefresh(props: BillProcessingRefreshProps) {
  const router = useRouter();
  const { aiError, documentStatus, hasAiKeyPoints, hasAiSummary, hasDocumentSource } = props;

  useEffect(() => {
    if (
      !shouldKeepRefreshing({
        aiError,
        documentStatus,
        hasAiKeyPoints,
        hasAiSummary,
        hasDocumentSource,
      })
    ) {
      return undefined;
    }

    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      startTransition(() => {
        router.refresh();
      });

      if (attempts >= MAX_REFRESH_ATTEMPTS) {
        window.clearInterval(intervalId);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [aiError, documentStatus, hasAiKeyPoints, hasAiSummary, hasDocumentSource, router]);

  return null;
}
