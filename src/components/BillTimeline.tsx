// BillTimeline Redesign
'use client';

import Stepper, { type StepperStep } from '@/components/ui/stepper';
import { BillStatus } from '@/types';

const STAGES: BillStatus[] = ['First Reading', 'Committee', 'Second Reading', 'Third Reading', 'Presidential Assent'];
const STAGE_STEPS: StepperStep[] = STAGES.map((stage) => ({ key: stage, label: stage }));

export default function BillTimeline({ currentStage }: { currentStage: BillStatus }) {
  return (
    <section className="overflow-hidden border border-[var(--line-strong)] bg-white">
      <div className="h-1.5 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
      <div className="p-8">
        <div className="mb-10 flex flex-col gap-2 border-b border-slate-200 pb-4">
          <p className="eyebrow text-forest-700">Process Tracking</p>
          <h3 className="text-2xl font-semibold text-slate-900">Legislative Journey</h3>
        </div>

        <Stepper
          steps={STAGE_STEPS}
          currentStep={currentStage}
          variant="timeline"
          colorScheme="kenya"
          statusLabels={{
            completed: 'Verified',
            current: 'Active Now',
            upcoming: 'Scheduled',
          }}
        />
      </div>
    </section>
  );
}
