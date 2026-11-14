import { isValidUrl } from '@/lib/url';

export interface AddFormValues {
  url: string;
  fileName: string;
  destination: string;
  queueId: string;
  connections: number;
}

export type AddFormErrors = Partial<Record<keyof AddFormValues | 'checksum', string>>;

const BAD_NAME_CHARS = /[\\/:*?"<>|]/;

/** Pure validation so the dialog and the tests share one source of truth. */
export function validateAddForm(v: AddFormValues): AddFormErrors {
  const e: AddFormErrors = {};
  const url = v.url.trim();
  if (!url) e.url = 'Paste a link to download.';
  else if (!isValidUrl(url)) e.url = 'Enter a valid http, https, ftp or magnet link, e.g. https://example.org/file.iso';

  const name = v.fileName.trim();
  if (name.length > 180) e.fileName = 'File names are limited to 180 characters.';
  else if (name && BAD_NAME_CHARS.test(name)) e.fileName = 'File names can’t contain \\ / : * ? " < > |';

  if (!v.destination.trim()) e.destination = 'Choose where to save the file.';
  if (!v.queueId) e.queueId = 'Choose a queue.';

  if (!Number.isFinite(v.connections) || !Number.isInteger(v.connections) || v.connections < 1 || v.connections > 16) {
    e.connections = 'Use a whole number between 1 and 16.';
  }
  return e;
}
