import { useUiStore } from '@/store/uiStore';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

/** Renders whatever confirmation `uiStore.askConfirm` has queued. */
export function ConfirmDialog() {
  const req = useUiStore((s) => s.confirm);
  const close = useUiStore((s) => s.closeConfirm);
  return (
    <Modal
      open={!!req}
      onClose={close}
      title={req?.title ?? ''}
      description={req?.description}
      size="sm"
      testId="confirm-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={close} data-autofocus>
            {req?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={req?.tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => {
              const run = req?.onConfirm;
              close();
              run?.();
            }}
          >
            {req?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <span className="sr-only">Please confirm this action.</span>
    </Modal>
  );
}
