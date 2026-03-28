'use client';

import { FormEvent, useState } from 'react';
import { MessageSquareText, SearchCode } from 'lucide-react';
import { askBillQuestion } from '@/lib/api';
import type { BillQuestionResponse } from '@/types';

interface BillQuestionAssistantProps {
  billId: string;
}

const SUGGESTED_QUESTIONS = [
  'Who is most affected by this bill?',
  'What new obligations does it introduce?',
  'Does the bill mention timelines, penalties, or fees?',
];

export default function BillQuestionAssistant({ billId }: BillQuestionAssistantProps) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<BillQuestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submitQuestion(nextQuestion: string) {
    const trimmedQuestion = nextQuestion.trim();
    if (!trimmedQuestion) {
      setError('Ask a specific question about the bill.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await askBillQuestion(billId, trimmedQuestion);
      setResult(response);
      setQuestion(trimmedQuestion);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'We could not answer that question right now.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(question);
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-950 bg-slate-950 text-white shadow-sm">
      <div className="h-2 bg-[linear-gradient(90deg,#ffffff_0_10%,#b32018_10_66%,#ffffff_66_72%,#185540_72_100%)]" />
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400">Ask The Bill</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">Question the extracted text</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Ask for plain-language explanations drawn from the bill text already stored in Bunge Mkononi.
            </p>
          </div>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#b32018] text-white">
            <MessageSquareText size={18} />
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="sr-only">Ask a question about this bill</span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              placeholder="Ask something specific, like: What powers does this bill create for counties?"
              className="min-h-[132px] w-full rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-400 focus:border-clay-400 focus:bg-white/8"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setQuestion(suggestion);
                  void submitQuestion(suggestion);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-forest-400 hover:bg-forest-500/10 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-slate-400">
              Answers stay grounded in the extracted bill text and may note uncertainty when the document is unclear.
            </p>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-forest-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <SearchCode size={16} />
              {isLoading ? 'Analyzing...' : 'Ask Cohere'}
            </button>
          </div>
        </form>

        {error ? (
          <div className="mt-5 rounded-[1.5rem] border border-rose-400/30 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-slate-400">Answer</p>
              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-100">{result.answer}</p>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-slate-400">Source Excerpts</p>
              <div className="mt-4 space-y-3">
                {result.excerpts.map((excerpt, index) => (
                  <div key={`${excerpt.pageNumber}-${index}`} className="rounded-[1.25rem] border border-white/10 bg-slate-900/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                      {excerpt.pageNumber ? `Page ${excerpt.pageNumber}` : 'Extract'} - score {excerpt.score.toFixed(2)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{excerpt.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
