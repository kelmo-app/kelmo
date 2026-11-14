import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { AfterCompletion, DayIndex, ScheduleRule } from '@/types';
import { BANDWIDTH_PRESETS } from '@/data/defaults';
import { cn } from '@/lib/cn';
import { formatMBps } from '@/lib/format';
import { ALL_DAYS, DAY_LABELS, DAY_LABELS_LONG, validateRule, type RuleErrors } from '@/services/SchedulerService';
import { useDownloadStore } from '@/store/instances';
import { useSchedulerStore } from '@/store/schedulerStore';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/components/ui/Button';
import { Field, NumberField, Select, TextField, Toggle } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';

export const AFTER_COMPLETION_LABELS: Record<AfterCompletion, string> = {
  none: 'Do nothing',
  notify: 'Show a notification',
  quit: 'Quit KELMO',
  sleep: 'Put the computer to sleep',
  shutdown: 'Shut the computer down',
};

type Draft = Omit<ScheduleRule, 'id'>;

function blankDraft(queueId: string): Draft {
  return {
    name: '',
    queueId,
    days: [0, 1, 2, 3, 4],
    startTime: '23:00',
    endTime: '06:00',
    bandwidthLimit: 0,
    maxSimultaneous: 3,
    afterCompletion: 'none',
    enabled: true,
  };
}

export function ScheduleRuleEditor({ onSaved }: { onSaved?: (id: string) => void }) {
  const { open, ruleId } = useUiStore((s) => s.ruleEditor);
  const close = useUiStore((s) => s.closeRuleEditor);
  const toast = useUiStore((s) => s.toast);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const queues = useDownloadStore((s) => s.queues);
  const rules = useSchedulerStore((s) => s.rules);
  const { addRule, updateRule, deleteRule } = useSchedulerStore.getState();
  const editing = rules.find((r) => r.id === ruleId);

  const [draft, setDraft] = useState<Draft>(() => blankDraft(queues[0]?.id ?? ''));
  const [errors, setErrors] = useState<RuleErrors>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id: _id, ...rest } = editing;
      void _id;
      setDraft({ ...rest, days: [...rest.days] });
    } else {
      setDraft(blankDraft(useDownloadStore.getState().queues[0]?.id ?? ''));
    }
    setErrors({});
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ruleId]);

  const patch = (p: Partial<Draft>) => {
    const next = { ...draft, ...p };
    setDraft(next);
    if (submitted) setErrors(validateRule(next));
  };

  const toggleDay = (d: DayIndex) => patch({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort((a, b) => a - b) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateRule(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const clean: Draft = { ...draft, name: draft.name.trim() };
    if (editing) {
      updateRule(editing.id, clean);
      toast({ tone: 'success', title: 'Rule updated', description: clean.name }, 2400);
      onSaved?.(editing.id);
    } else {
      const created = addRule(clean);
      toast({ tone: 'success', title: 'Rule created', description: clean.name }, 2400);
      onSaved?.(created.id);
    }
    close();
  };

  const onDelete = () => {
    if (!editing) return;
    askConfirm({
      title: `Delete “${editing.name}”?`,
      description: 'The schedule window is removed. Downloads in the queue are not affected.',
      confirmLabel: 'Delete rule',
      tone: 'danger',
      onConfirm: () => {
        deleteRule(editing.id);
        toast({ tone: 'info', title: 'Rule deleted', description: editing.name }, 2400);
      },
    });
    close();
  };

  const bandwidthOptions = BANDWIDTH_PRESETS.some((p) => p.value === draft.bandwidthLimit)
    ? BANDWIDTH_PRESETS
    : [...BANDWIDTH_PRESETS, { label: formatMBps(draft.bandwidthLimit), value: draft.bandwidthLimit }];

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? 'Edit rule' : 'New schedule rule'}
      description="Downloads in the chosen queue run only inside this window."
      size="md"
      testId="rule-editor"
      footer={
        <>
          {editing && (
            <Button variant="outline" className="mr-auto text-bad hover:bg-bad/10" icon={<Trash2 size={14} />} onClick={onDelete}>
              Delete rule
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="rule-editor-form" data-testid="rule-save">
            {editing ? 'Save changes' : 'Create rule'}
          </Button>
        </>
      }
    >
      <form id="rule-editor-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Rule name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} error={errors.name} placeholder="e.g. Night bandwidth" data-autofocus autoComplete="off" />
          <Select label="Queue" value={draft.queueId} onValueChange={(v) => patch({ queueId: v })} options={queues.map((q) => ({ value: q.id, label: q.name }))} error={errors.queueId} />
        </div>

        <Field label="Days" error={errors.days} htmlFor="rule-days">
          <div id="rule-days" role="group" aria-label="Days of the week" className="flex flex-wrap gap-1.5">
            {ALL_DAYS.map((d) => {
              const on = draft.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_LABELS_LONG[d]}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'h-9 min-w-[48px] rounded-full border px-3 text-[13px] font-medium transition',
                    on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface2 text-fg2 hover:text-fg',
                  )}
                >
                  {DAY_LABELS[d]}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <TextField label="Start time" type="time" value={draft.startTime} onChange={(e) => patch({ startTime: e.target.value })} error={errors.startTime} />
          <TextField
            label="End time"
            type="time"
            value={draft.endTime}
            onChange={(e) => patch({ endTime: e.target.value })}
            error={errors.endTime}
            hint={draft.endTime && draft.endTime <= draft.startTime ? 'Runs past midnight into the next day.' : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Maximum bandwidth"
            value={draft.bandwidthLimit}
            onValueChange={(n) => patch({ bandwidthLimit: n })}
            options={bandwidthOptions.map((p) => ({ value: p.value, label: p.label }))}
            error={errors.bandwidthLimit}
          />
          <NumberField label="Simultaneous downloads" min={1} max={20} value={draft.maxSimultaneous} onValueChange={(n) => patch({ maxSimultaneous: n })} error={errors.maxSimultaneous} />
        </div>

        <Select<AfterCompletion>
          label="After the queue finishes"
          value={draft.afterCompletion}
          onValueChange={(v) => patch({ afterCompletion: v })}
          options={(Object.keys(AFTER_COMPLETION_LABELS) as AfterCompletion[]).map((k) => ({ value: k, label: AFTER_COMPLETION_LABELS[k] }))}
        />

        <div className="flex items-center justify-between rounded-lg border border-line bg-surface2/50 px-4 py-3">
          <div>
            <p className="text-[13px] font-medium text-fg">Enabled</p>
            <p className="text-xs text-fg3">Disabled rules stay saved but never open a window.</p>
          </div>
          <Toggle label="Rule enabled" checked={draft.enabled} onChange={(v) => patch({ enabled: v })} />
        </div>
      </form>
    </Modal>
  );
}
