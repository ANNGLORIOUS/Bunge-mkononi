'use client';

import { ChangeEvent, FocusEvent, FormEvent, useState } from 'react';
import { CheckCircle, MessageSquare, PhoneCall } from 'lucide-react';
import { postVote, trackSubscription } from '@/lib/api';
import { formatKenyanPhoneNumber, normalizeKenyanPhoneNumber } from '@/lib/phone';
import { PollChoice, PollTally } from '@/types';

interface Props {
  billId: string;
  billTitle: string;
  initialSignatureCount: number;
  initialPolling?: PollTally;
}

const OPTIONS: Array<{ label: string; choice: PollChoice }> = [
  { label: 'Yes, I support', choice: 'support' },
  { label: 'No, I oppose', choice: 'oppose' },
  { label: 'I need more info', choice: 'need_more_info' },
];

const PARTICIPATION_STAT_TONES = [
  {
    card: 'border-slate-950 bg-slate-950',
    label: 'text-slate-400',
    value: 'text-white',
    helper: 'text-slate-500',
  },
  {
    card: 'border-forest-900 bg-forest-900',
    label: 'text-forest-200/80',
    value: 'text-white',
    helper: 'text-forest-200/70',
  },
  {
    card: 'border-[#8c1d18] bg-[#b32018]',
    label: 'text-rose-100/80',
    value: 'text-white',
    helper: 'text-rose-100/70',
  },
  {
    card: 'border-slate-300 bg-white',
    label: 'text-slate-500',
    value: 'text-slate-950',
    helper: 'text-slate-400',
  },
] as const;

const POLL_OPTION_STYLES: Record<PollChoice, string> = {
  support: 'hover:border-forest-500 hover:bg-forest-50 hover:text-forest-900',
  oppose: 'hover:border-[#b32018] hover:bg-rose-50 hover:text-[#8c1d18]',
  need_more_info: 'hover:border-slate-500 hover:bg-slate-50 hover:text-slate-950',
};

export default function ParticipationHub({
  billId,
  billTitle,
  initialSignatureCount,
  initialPolling = { yes: 0, no: 0, undecided: 0 },
}: Props) {
  const [hasVoted, setHasVoted] = useState(false);
  const [votedOption, setVotedOption] = useState('');
  const [signatureCount, setSignatureCount] = useState(initialSignatureCount);
  const [polling, setPolling] = useState<PollTally>(initialPolling);
  const [isIncrementing, setIsIncrementing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [isNotificationRailFocused, setIsNotificationRailFocused] = useState(false);
  const [isNotificationRailPinned, setIsNotificationRailPinned] = useState(false);

  const isNotificationRailOpen = isNotificationRailFocused || isNotificationRailPinned;

  const getSubscriptionErrorMessage = (subscriptionErrorValue: unknown) => {
    if (subscriptionErrorValue instanceof Error && subscriptionErrorValue.message) {
      return subscriptionErrorValue.message;
    }

    return 'We could not save your subscription right now. Please try again.';
  };

  const handleVote = async (optionLabel: string, choice: PollChoice) => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await postVote({ billId, choice });
      setVotedOption(optionLabel);
      setHasVoted(true);

      if (choice === 'support') {
        setIsIncrementing(true);
        setSignatureCount((current) =>
          typeof response.petitionSignatureCount === 'number' ? response.petitionSignatureCount : current + 1,
        );
        setTimeout(() => setIsIncrementing(false), 300);
      }

      setPolling((current) => {
        if (choice === 'support') {
          return { ...current, yes: current.yes + 1 };
        }
        if (choice === 'oppose') {
          return { ...current, no: current.no + 1 };
        }
        return { ...current, undecided: current.undecided + 1 };
      });
    } catch (voteError) {
      console.error(voteError);
      setError('We could not submit your vote right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubscriptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscriptionError(null);
    setSubscriptionMessage(null);

    const normalizedPhoneNumber = normalizeKenyanPhoneNumber(phoneNumber);

    if (!normalizedPhoneNumber) {
      setSubscriptionError('Enter a valid Kenyan phone number so we can send this bill’s SMS updates.');
      return;
    }

    setIsSubscribing(true);
    const displayPhoneNumber = phoneNumber || normalizedPhoneNumber;

    try {
      const response = await trackSubscription({
        billId,
        phoneNumber: normalizedPhoneNumber,
        channel: 'sms',
      });

      setPhoneNumber('');
      setSubscriptionMessage(
        response.created
          ? `Subscribed ${displayPhoneNumber} to ${billTitle} alerts.`
          : `${displayPhoneNumber} is already subscribed to ${billTitle} alerts.`,
      );
    } catch (subscriptionErrorValue) {
      console.error(subscriptionErrorValue);
      setSubscriptionError(getSubscriptionErrorMessage(subscriptionErrorValue));
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleNotificationRailBlur = (event: FocusEvent<HTMLElement>) => {
    const nextFocusedElement = event.relatedTarget;

    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }

    setIsNotificationRailFocused(false);
  };

  return (
    <div className="mt-8 space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Supporters', value: signatureCount.toLocaleString(), helper: 'Live signature count' },
          { label: 'Support', value: polling.yes.toLocaleString(), helper: 'Votes in favor' },
          { label: 'Oppose', value: polling.no.toLocaleString(), helper: 'Votes against' },
          { label: 'Need Info', value: polling.undecided.toLocaleString(), helper: 'Undecided responses' },
        ].map((item, index) => {
          const tone = PARTICIPATION_STAT_TONES[index];

          return (
            <div
              key={item.label}
              className={`border p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-(--shadow-soft) ${tone.card}`}
            >
              <p className={`eyebrow ${tone.label}`}>{item.label}</p>
              <p
                className={`metric-mono mt-3 text-2xl font-semibold transition duration-300 ${tone.value} ${
                  index === 0 && isIncrementing ? 'scale-105' : 'scale-100'
                }`}
              >
                {item.value}
              </p>
              <p className={`mt-1 text-xs uppercase tracking-[0.2em] ${tone.helper}`}>{item.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-6">
        <section className="overflow-hidden border border-[var(--line-strong)] bg-white">
          <div className="h-2 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
          <div className="p-6">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow text-forest-700">Public Opinion Poll</p>
                <h3 className="font-[family:var(--font-site-serif)] text-2xl font-semibold text-slate-900">
                  Submit A Structured Response
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                  Choose the position that best reflects your reading of the bill. Each response updates the public
                  participation register.
                </p>
              </div>
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold ${
                      i === 1
                        ? 'bg-slate-950 text-white'
                        : i === 2
                          ? 'bg-white text-slate-700'
                          : i === 3
                            ? 'bg-[#b32018] text-white'
                            : 'bg-forest-900 text-white'
                    }`}
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
                <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-forest-700 text-[10px] font-bold text-white">
                  +12
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-forest-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-forest-800">Support</p>
                <p className="metric-mono mt-1 text-lg font-semibold text-forest-800">{polling.yes}</p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8c1d18]">Oppose</p>
                <p className="metric-mono mt-1 text-lg font-semibold text-[#8c1d18]">{polling.no}</p>
              </div>
              <div className="rounded-xl border border-slate-300 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-700">Need Info</p>
                <p className="metric-mono mt-1 text-lg font-semibold text-slate-900">{polling.undecided}</p>
              </div>
            </div>

            {!hasVoted ? (
              <div className="mt-6 animate-in fade-in duration-500">
                <p className="text-sm leading-7 text-slate-600">
                  Do you support the clauses in {billTitle}? Your response helps inform the public record and the next
                  citizen action.
                </p>
                <div className="mt-5 space-y-3">
                  {OPTIONS.map((option) => (
                    <button
                      key={option.choice}
                      type="button"
                      onClick={() => handleVote(option.label, option.choice)}
                      disabled={isSubmitting}
                      className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${POLL_OPTION_STYLES[option.choice]}`}
                    >
                      {isSubmitting ? 'Submitting your vote...' : option.label}
                    </button>
                  ))}
                </div>
                {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
              </div>
            ) : (
              <div className="mt-8 flex animate-in zoom-in flex-col items-center justify-center rounded-xl border border-forest-200 bg-forest-50 px-6 py-10 text-center duration-300">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-forest-700 text-white shadow-lg shadow-forest-700/20">
                  <CheckCircle size={40} />
                </div>
                <h4 className="text-2xl font-semibold text-slate-950">Response Shared</h4>
                <p className="mt-2 text-sm text-slate-500">
                  You chose <span className="font-semibold text-forest-800">{votedOption}</span>
                </p>
                <button
                  onClick={() => setHasVoted(false)}
                  className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 underline underline-offset-4 transition hover:text-clay-700"
                >
                  Edit Response
                </button>
              </div>
            )}
          </div>
        </section>

        <section
          className={`overflow-hidden border border-slate-300 bg-white p-6 xl:fixed xl:right-6 xl:bottom-6 xl:z-40 xl:max-w-[calc(100vw-3rem)] xl:transition-[width,max-height,padding,transform,box-shadow,background-color,border-color] xl:duration-300 xl:ease-out ${
            isNotificationRailOpen
              ? 'xl:w-[22rem] xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:border-slate-300 xl:bg-white/95 xl:p-6 xl:shadow-[var(--shadow-lift)] xl:backdrop-blur-sm'
              : 'xl:h-14 xl:w-14 xl:max-h-14 xl:max-w-none xl:overflow-visible xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none xl:backdrop-blur-none'
          }`}
          onFocusCapture={() => setIsNotificationRailFocused(true)}
          onBlurCapture={handleNotificationRailBlur}
        >
          <button
            type="button"
            className={`hidden xl:flex xl:items-center xl:text-left ${
              isNotificationRailOpen
                ? 'xl:w-full xl:gap-3 xl:border-b xl:border-slate-200 xl:pb-4'
                : 'xl:h-14 xl:w-14 xl:justify-center xl:gap-0'
            }`}
            aria-controls={`notification-rail-${billId}`}
            aria-expanded={isNotificationRailOpen}
            aria-pressed={isNotificationRailPinned}
            aria-label={isNotificationRailOpen ? 'Collapse notification register' : 'Open notification register'}
            onClick={(event) => {
              const nextPinnedState = !isNotificationRailPinned;
              setIsNotificationRailPinned(nextPinnedState);

              if (!nextPinnedState) {
                setIsNotificationRailFocused(false);
                event.currentTarget.blur();
              }
            }}
          >
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.9)]">
              <PhoneCall size={18} />
            </span>
            <span
              className={`min-w-0 transition-all duration-200 ${
                isNotificationRailOpen ? 'translate-x-0 opacity-100' : 'w-0 -translate-x-2 overflow-hidden opacity-0'
              }`}
            >
              <span className="eyebrow block text-slate-500">
                {isNotificationRailPinned ? 'Pinned Action Rail' : 'Action Rail'}
              </span>
              <span className="mt-1 block font-[family:var(--font-site-serif)] text-lg font-semibold text-slate-900">
                Notification Register
              </span>
              <span className="mt-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {isNotificationRailPinned ? 'Click to collapse' : 'Click or tab to open'}
              </span>
            </span>
          </button>

          <div className="border-b border-slate-200 pb-4 xl:hidden">
            <h3 className="flex items-center gap-2 font-[family:var(--font-site-serif)] text-2xl font-semibold text-slate-950">
              <PhoneCall className="text-clay-600" size={18} />
              Notification Register
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Register a phone number for bill alerts or use the offline public channels below for lower-bandwidth access.
            </p>
          </div>

          <div
            id={`notification-rail-${billId}`}
            className={`mt-6 space-y-6 xl:transition-[opacity,transform,max-height,margin] xl:duration-300 ${
              isNotificationRailOpen
                ? 'xl:pointer-events-auto xl:max-h-[48rem] xl:translate-y-0 xl:opacity-100'
                : 'xl:pointer-events-none xl:mt-0 xl:max-h-0 xl:translate-y-3 xl:opacity-0'
            }`}
          >
            <p className="hidden text-sm leading-7 text-slate-600 xl:block">
              Register a phone number for bill alerts or use the offline public channels below for lower-bandwidth access.
            </p>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-950 bg-slate-950 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">USSD</p>
                <p className="metric-mono mt-2 text-lg font-semibold text-white">*384*16250#</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                  Open the menu and subscribe from any phone
                </p>
              </div>

              <div className="rounded-xl border border-[#8c1d18] bg-[#b32018] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-100/80">SMS</p>
                <p className="metric-mono mt-2 text-lg font-semibold text-white">TRACK {billId}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-rose-100/70">
                  Send to start receiving bill updates
                </p>
              </div>
            </div>

            <form onSubmit={handleSubscriptionSubmit} className="space-y-3">
              <label className="block text-sm font-semibold text-slate-950" htmlFor={`phone-${billId}`}>
                Subscribe With Your Phone Number
              </label>
              <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                <input
                  id={`phone-${billId}`}
                  value={phoneNumber}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPhoneNumber(formatKenyanPhoneNumber(e.target.value))}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0712 345 678"
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-clay-400 focus:ring-4 focus:ring-clay-100"
                />
                <button
                  type="submit"
                  disabled={isSubscribing}
                  className="rounded-xl bg-forest-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubscribing ? 'Saving...' : 'Subscribe'}
                </button>
              </div>
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">
                By subscribing, you consent to receive bill updates via SMS.
              </p>
            </form>

            <div className="min-h-[2.5rem]">
              {subscriptionMessage && (
                <div className="inline-flex items-center gap-2 rounded-xl bg-forest-50 px-3 py-2 text-sm font-medium text-forest-800">
                  <CheckCircle size={16} /> {subscriptionMessage}
                </div>
              )}
              {subscriptionError && (
                <div className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-[#8c1d18]">
                  <MessageSquare size={16} /> {subscriptionError}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
