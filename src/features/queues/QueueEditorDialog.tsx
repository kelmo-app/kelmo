import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { Queue } from '@/types';
import { useDownloadStore } from '@/store/instances';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/components/ui/Button';
import { Select, TextArea, TextField } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { QUEUE_TONES } from './tones';

type Tone = Queue['tone'];

export function QueueEditorDialog() {
  const { open, queueId } = useUiStore((s) => s.queueEditor);
  const close = useUiStore((s) => s.closeQueueEditor);
  const toast = useUiStore((s) => s.toast);
  const askConfirm = useUiStore((s) => s.askConfirm);
  const queues = useDownloadStore((s) => s.queues);
  const createQueue = useDownloadStore((s) => s.createQueue);
  const updateQueue = useDownloadStore((s) => s.updateQueue);
  const deleteQueue = useDownloadStore((s) => s.deleteQueue);
  const navigate = useNavigate();
  const editing = queues.find((q) => q.id === queueId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<Tone>('cyan');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setDescription(editing?.description ?? '');
    setTone(editing?.tone ?? 'cyan');
    setError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, queueId]);

  const validate = (v: string): string | undefined => {
    const t = v.trim();
    if (!t) return 'Give the queue a name.';
    if (t.length > 40) return 'Keep the name under 40 characters.';
    if (queues.some((q) => q.id !== queueId && q.name.toLowerCase() === t.toLowerCase())) return 'A queue with this name already exists.';
    return undefined;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = validate(name);
    setError(err);
    if (err) return;
    if (editing) {
      updateQueue(editing.id, { name: name.trim(), description: description.trim(), tone });
      toast({ tone: 'success', title: 'Queue updated', description: name.trim() }, 2400);
    } else {
      const q = createQueue({ name: name.trim(), description, tone });
      toast({ tone: 'success', title: 'Queue created', description: q.name }, 2400);
      navigate(`/queues/${q.id}`);
    }
    close();
  };

  const onDelete = () => {
    if (!editing) return;
    const fallback = queues.find((q) => q.id !== editing.id);
    askConfirm({
      title: `Delete “${editing.name}”?`,
      description: `Its ${editing.itemIds.length} item${editing.itemIds.length === 1 ? '' : 's'} will move to “${fallback?.name}”. Nothing is deleted from disk.`,
      confirmLabel: 'Delete queue',
      tone: 'danger',
      onConfirm: () => {
        if (deleteQueue(editing.id, fallback?.id)) {
          toast({ tone: 'info', title: 'Queue deleted', description: editing.name }, 2400);
          navigate(`/queues/${fallback?.id ?? ''}`);
        }
      },
    });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? 'Queue settings' : 'New queue'}
      description={editing ? 'Rename or recolour this queue. Policies live in the panel on the right.' : 'Group downloads that should share limits and a schedule.'}
      size="sm"
      testId="queue-editor"
      footer={
        <>
          {editing && queues.length > 1 && (
            <Button variant="outline" className="mr-auto text-bad hover:bg-bad/10" icon={<Trash2 size={14} />} onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="queue-editor-form">
            {editing ? 'Save' : 'Create queue'}
          </Button>
        </>
      }
    >
      <form id="queue-editor-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Queue name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(validate(e.target.value));
          }}
          error={error}
          data-autofocus
          autoComplete="off"
        />
        <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this queue for?" />
        <Select<Tone> label="Colour" value={tone} onValueChange={setTone} options={(Object.keys(QUEUE_TONES) as Tone[]).map((t) => ({ value: t, label: QUEUE_TONES[t].label }))} />
      </form>
    </Modal>
  );
}
