import { describe, expect, it } from 'vitest';
import { ART_LABEL, artKind } from './fileArt';

describe('file artwork', () => {
  it('picks artwork from the extension, any case', () => {
    expect(artKind('Windows_11_22H2.iso')).toBe('iso');
    expect(artKind('K-Lite_Codec_Pack_2010_Mega.EXE')).toBe('software');
    expect(artKind('Sahih-Adab-w-Akhlaq.pdf')).toBe('pdf');
    expect(artKind('song.MP3')).toBe('audio');
    expect(artKind('backup.tar.gz')).toBe('archive');
    expect(artKind('photo.jpeg')).toBe('image');
    expect(artKind('Game Of Thrones S02.mkv')).toBe('video');
    expect(artKind('notes.docx')).toBe('document');
    expect(artKind('Inter.woff2')).toBe('font');
    expect(artKind('main.ts')).toBe('code');
  });
  it('falls back to a plain file', () => {
    expect(artKind('file')).toBe('generic');
    expect(artKind('archive.unknownext')).toBe('generic');
    expect(artKind('trailing.dot.')).toBe('generic');
  });
  it('every kind has a label', () => {
    for (const k of ['iso', 'software', 'pdf', 'audio', 'archive', 'image', 'video', 'document', 'font', 'code', 'generic'] as const) expect(ART_LABEL[k].length).toBeGreaterThan(0);
  });
});
