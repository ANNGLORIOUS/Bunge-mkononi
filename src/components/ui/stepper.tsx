'use client';

import Box from '@mui/material/Box';
import MuiStep from '@mui/material/Step';
import MuiStepLabel from '@mui/material/StepLabel';
import MuiStepper from '@mui/material/Stepper';
import type { SxProps, Theme } from '@mui/material/styles';

type StepStatus = 'completed' | 'current' | 'upcoming';

export interface StepperStep {
  key: string;
  label: string;
}

interface StepperProps {
  steps: readonly StepperStep[];
  currentStep: string;
  variant?: 'compact' | 'timeline';
  showEdgeLabels?: boolean;
  statusLabels?: Partial<Record<StepStatus, string>>;
  colorScheme?: 'default' | 'kenya';
}

const DEFAULT_STATUS_LABELS: Record<StepStatus, string> = {
  completed: 'Complete',
  current: 'Current',
  upcoming: 'Upcoming',
};

function getStepStatus(index: number, currentIndex: number): StepStatus {
  if (index < currentIndex) {
    return 'completed';
  }

  if (index === currentIndex) {
    return 'current';
  }

  return 'upcoming';
}

export default function Stepper({
  steps,
  currentStep,
  variant = 'compact',
  showEdgeLabels = false,
  statusLabels,
  colorScheme = 'default',
}: StepperProps) {
  const currentIndex = Math.max(
    steps.findIndex((step) => step.key === currentStep),
    0,
  );
  const resolvedStatusLabels = { ...DEFAULT_STATUS_LABELS, ...statusLabels };
  const palette =
    colorScheme === 'kenya'
      ? {
          connectorInactive: '#d6d3d1',
          connectorActive: '#b32018',
          iconInactive: '#d6d3d1',
          iconActive: '#185540',
          statusLabel: '#8c2a1c',
          textUpcoming: '#78716c',
          textActive: '#111827',
          edgeText: '#185540',
        }
      : {
          connectorInactive: '#cbd5e1',
          connectorActive: '#1d4ed8',
          iconInactive: '#cbd5e1',
          iconActive: '#1d4ed8',
          statusLabel: '#64748b',
          textUpcoming: '#94a3b8',
          textActive: '#0f172a',
          edgeText: '#64748b',
        };
  const stepperSx: SxProps<Theme> = {
    '& .MuiStepConnector-root': {
      top: 16,
      left: 'calc(-50% + 16px)',
      right: 'calc(50% + 16px)',
    },
    '& .MuiStepConnector-line': {
      borderColor: palette.connectorInactive,
      borderTopWidth: 1,
    },
    '& .MuiStepConnector-root.Mui-active .MuiStepConnector-line, & .MuiStepConnector-root.Mui-completed .MuiStepConnector-line':
      {
        borderColor: palette.connectorActive,
      },
    '& .MuiStepLabel-iconContainer': {
      pr: 0,
    },
    '& .MuiStepIcon-root': {
      color: palette.iconInactive,
      fontSize: variant === 'timeline' ? 30 : 24,
    },
    '& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed': {
      color: palette.iconActive,
    },
    '& .MuiStepIcon-text': {
      fill: '#ffffff',
      fontSize: '0.72rem',
      fontWeight: 700,
    },
  };

  return (
    <Box sx={{ width: '100%' }}>
      <MuiStepper
        activeStep={currentIndex}
        alternativeLabel
        sx={[
          stepperSx,
          variant === 'compact'
            ? {
                '& .MuiStepLabel-labelContainer': {
                  display: 'none',
                },
              }
            : {},
        ]}
      >
        {steps.map((step, index) => {
          const status = getStepStatus(index, currentIndex);

          return (
            <MuiStep key={step.key}>
              <MuiStepLabel
                optional={
                  variant === 'timeline' ? (
                    <Box
                      component="span"
                      sx={{
                        mt: 0.75,
                        display: 'block',
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        letterSpacing: '0.2em',
                        textTransform: 'uppercase',
                        color: palette.statusLabel,
                      }}
                    >
                      {resolvedStatusLabels[status]}
                    </Box>
                  ) : undefined
                }
                sx={{
                  '& .MuiStepLabel-label': {
                    mt: variant === 'timeline' ? 1.75 : 0,
                    fontSize: variant === 'timeline' ? '0.72rem' : '0.7rem',
                    fontWeight: status === 'current' ? 700 : 600,
                    lineHeight: 1.35,
                    letterSpacing: variant === 'timeline' ? '0.16em' : '0.04em',
                    textTransform: variant === 'timeline' ? 'uppercase' : 'none',
                    color: status === 'upcoming' ? palette.textUpcoming : palette.textActive,
                  },
                }}
              >
                {step.label}
              </MuiStepLabel>
            </MuiStep>
          );
        })}
      </MuiStepper>

      {variant === 'compact' && showEdgeLabels && steps.length > 1 && (
        <Box
          sx={{
            mt: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            color: palette.edgeText,
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          <Box component="span">{steps[0]?.label}</Box>
          <Box component="span" sx={{ textAlign: 'right' }}>
            {steps[steps.length - 1]?.label}
          </Box>
        </Box>
      )}
    </Box>
  );
}
