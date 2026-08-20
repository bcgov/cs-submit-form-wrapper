/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from 'node:stream';
import { storagePluginDefinition } from '../../../src/plugins/storage-memory';
import type { PluginConfigReader } from '../../../src/core/config/pluginConfig';

function makeConfig(): PluginConfigReader {
  return {
    getRequired: (k: string) => {
      throw new Error(`missing ${k}`);
    },
    getOptional: (_k: string, d?: string) => d,
    getBoolean: (_k: string) => false,
    getNumber: (_k: string) => 0,
    getOptionalNumber: (_k: string) => undefined,
    getCsv: (_k: string) => [],
  };
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('storage-memory adapter', () => {
  it('has the expected plugin code', () => {
    expect(storagePluginDefinition.code).toBe('storage-memory');
  });

  it('uploads, gets (with contents) and deletes a buffer file', async () => {
    const adapter = storagePluginDefinition.createAdapter(makeConfig());

    const result = await (adapter as any).uploadFile({
      workspaceId: 'w1',
      filename: 'hello.txt',
      buffer: Buffer.from('hello world'),
      contentType: 'text/plain',
    });
    expect(result).toHaveProperty('engineFileRef');
    expect(result.engineFileRef.startsWith('memory:')).toBe(true);

    const meta = await (adapter as any).getFile(result.engineFileRef);
    expect(meta).not.toBeNull();
    expect(meta.filename).toBe('hello.txt');
    expect(meta.contentType).toBe('text/plain');
    expect(meta.size).toBe(Buffer.byteLength('hello world'));
    expect(await readStream(meta.downloadStream)).toBe('hello world');

    await (adapter as any).deleteFile(result.engineFileRef);
    const after = await (adapter as any).getFile(result.engineFileRef);
    expect(after).toBeNull();
  });

  it('accepts a stream payload', async () => {
    const adapter = storagePluginDefinition.createAdapter(makeConfig());
    const result = await (adapter as any).uploadFile({
      workspaceId: 'w1',
      filename: 'streamed.txt',
      stream: Readable.from(Buffer.from('streamed bytes')),
    });
    const meta = await (adapter as any).getFile(result.engineFileRef);
    expect(await readStream(meta.downloadStream)).toBe('streamed bytes');
  });

  it('reports ready without a backing service', async () => {
    const adapter = storagePluginDefinition.createAdapter(makeConfig());
    expect(await (adapter as any).readinessCheck()).toEqual({ ok: true });
  });

  it('isolates state between adapter instances', async () => {
    const a = storagePluginDefinition.createAdapter(makeConfig());
    const b = storagePluginDefinition.createAdapter(makeConfig());
    const up = await (a as any).uploadFile({
      workspaceId: 'w1',
      filename: 'x.txt',
      buffer: Buffer.from('x'),
    });
    expect(await (b as any).getFile(up.engineFileRef)).toBeNull();
  });
});
