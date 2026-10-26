import { TestBed } from '@angular/core/testing';
import { CsvExportService } from './csv-export.service';

/** Reads the Blob most recently passed to `URL.createObjectURL`. */
async function lastBlobContent(spy: jasmine.Spy): Promise<string> {
  const blob = spy.calls.mostRecent().args[0] as Blob;
  return blob.text();
}

describe('CsvExportService', () => {
  let service: CsvExportService;
  let createObjectURLSpy: jasmine.Spy;
  let revokeObjectURLSpy: jasmine.Spy;
  let appendChildSpy: jasmine.Spy;
  let removeChildSpy: jasmine.Spy;
  let mockAnchor: { href: string; download: string; click: jasmine.Spy };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CsvExportService] });
    service = TestBed.inject(CsvExportService);

    // Mock the <a> element to avoid real DOM navigation.
    mockAnchor = { href: '', download: '', click: jasmine.createSpy('click') };
    const realCreateElement = document.createElement.bind(document);

    spyOn(document, 'createElement').and.callFake((tag: string) =>
      tag === 'a' ? (mockAnchor as unknown as HTMLAnchorElement) : realCreateElement(tag)
    );

    appendChildSpy = spyOn(document.body, 'appendChild').and.stub();
    removeChildSpy = spyOn(document.body, 'removeChild').and.stub();

    createObjectURLSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-url');
    revokeObjectURLSpy = spyOn(URL, 'revokeObjectURL');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ─── downloadFile() – guard conditions ──────────────────────────────────────

  describe('downloadFile() – guard conditions', () => {
    it('does nothing when data is an empty array', () => {
      service.downloadFile([]);
      expect(createObjectURLSpy).not.toHaveBeenCalled();
    });

    it('does nothing when data is null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.downloadFile(null as any);
      expect(createObjectURLSpy).not.toHaveBeenCalled();
    });

    it('does nothing when data is undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.downloadFile(undefined as any);
      expect(createObjectURLSpy).not.toHaveBeenCalled();
    });
  });

  // ─── downloadFile() – DOM & URL lifecycle ───────────────────────────────────

  describe('downloadFile() – DOM & URL lifecycle', () => {
    it('creates a blob URL and triggers a click on the anchor', () => {
      service.downloadFile([{ name: 'Alice' }]);
      expect(createObjectURLSpy).toHaveBeenCalledWith(jasmine.any(Blob));
      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('sets the href to the created blob URL', () => {
      service.downloadFile([{ id: 1 }]);
      expect(mockAnchor.href).toBe('blob:mock-url');
    });

    it('uses the provided filename with a .csv extension', () => {
      service.downloadFile([{ id: 1 }], 'my-export');
      expect(mockAnchor.download).toBe('my-export.csv');
    });

    it('defaults to "data.csv" when no filename is provided', () => {
      service.downloadFile([{ id: 1 }]);
      expect(mockAnchor.download).toBe('data.csv');
    });

    it('appends the anchor to the body before clicking', () => {
      service.downloadFile([{ id: 1 }]);
      expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
    });

    it('removes the anchor from the body after clicking', () => {
      service.downloadFile([{ id: 1 }]);
      expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
    });

    it('revokes the object URL after clicking', () => {
      service.downloadFile([{ id: 1 }]);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    });

    it('creates the blob with the correct MIME type', () => {
      service.downloadFile([{ id: 1 }]);
      const blob = createObjectURLSpy.calls.mostRecent().args[0] as Blob;

      expect(blob.type).toBe('text/csv;charset=utf-8;');
    });
  });

  // ─── CSV generation – flat objects ──────────────────────────────────────────

  describe('CSV generation – flat objects', () => {
    it('generates a header row followed by a data row', async () => {
      service.downloadFile([{ name: 'Alice', age: 30 }]);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('name,age\nAlice,30');
    });

    it('collects all unique headers across rows with sparse fields', async () => {
      service.downloadFile([{ a: 1 }, { b: 2 }]);
      const csv = await lastBlobContent(createObjectURLSpy);
      const [header, row1, row2] = csv.split('\n');

      expect(header).toBe('a,b');
      expect(row1).toBe('1,');
      expect(row2).toBe(',2');
    });

    it('renders multiple rows in order', async () => {
      service.downloadFile([
        { name: 'Alice', score: 10 },
        { name: 'Bob', score: 20 },
      ]);
      const csv = await lastBlobContent(createObjectURLSpy);

      expect(csv).toBe('name,score\nAlice,10\nBob,20');
    });

    it('handles boolean values', async () => {
      service.downloadFile([{ active: true, deleted: false }]);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('active,deleted\ntrue,false');
    });

    it('renders undefined and null object fields as empty cells', async () => {
      service.downloadFile([{ a: undefined, b: null }]);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('a,b\n,');
    });
  });

  // ─── CSV generation – nested objects ────────────────────────────────────────

  describe('CSV generation – nested objects', () => {
    it('flattens a single nesting level with dot-notation', async () => {
      service.downloadFile([{ a: { b: 1 } }]);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('a.b\n1');
    });

    it('flattens deeply nested objects', async () => {
      service.downloadFile([{ x: { y: { z: 99 } } }]);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('x.y.z\n99');
    });

    it('mixes top-level and nested keys', async () => {
      service.downloadFile([{ id: 1, meta: { label: 'test' } }]);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('id,meta.label\n1,test');
    });

    it('JSON-stringifies array values', async () => {
      service.downloadFile([{ tags: ['x', 'y'] }]);
      const csv = await lastBlobContent(createObjectURLSpy);

      // JSON.stringify produces ["x","y"] which contains quotes → escapeCsv doubles them
      expect(csv).toContain('[""x"",""y""]');
    });
  });

  // ─── CSV generation – primitive arrays ──────────────────────────────────────

  describe('CSV generation – primitive arrays', () => {
    it('wraps primitive items in a "value" column', async () => {
      service.downloadFile([42, 'hello']);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('value\n42\nhello');
    });

    it('handles a null item as an empty "value" cell', async () => {
      service.downloadFile([null]);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('value\n');
    });

    it('handles a single numeric value', async () => {
      service.downloadFile([0]);
      expect(await lastBlobContent(createObjectURLSpy)).toBe('value\n0');
    });
  });

  // ─── CSV generation – escaping ───────────────────────────────────────────────

  describe('CSV generation – escaping', () => {
    it('wraps cells containing a comma in double-quotes', async () => {
      service.downloadFile([{ label: 'hello, world' }]);
      const csv = await lastBlobContent(createObjectURLSpy);

      expect(csv).toContain('"hello, world"');
    });

    it('doubles embedded double-quotes per RFC 4180', async () => {
      service.downloadFile([{ label: 'say "hi"' }]);
      const csv = await lastBlobContent(createObjectURLSpy);

      expect(csv).toContain('"say ""hi"""');
    });

    it('wraps cells containing a newline in double-quotes', async () => {
      service.downloadFile([{ label: 'line1\nline2' }]);
      const csv = await lastBlobContent(createObjectURLSpy);

      expect(csv).toContain('"line1\nline2"');
    });

    it('does not wrap plain strings without special characters', async () => {
      service.downloadFile([{ label: 'plain' }]);
      const csv = await lastBlobContent(createObjectURLSpy);

      expect(csv).toBe('label\nplain');
    });
  });
});
