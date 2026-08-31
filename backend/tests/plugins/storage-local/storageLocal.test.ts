/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { storagePluginDefinition } from '../../../src/plugins/storage-local';
import type { PluginConfigReader } from '../../../src/core/config/pluginConfig';

function makeConfig(basePath: string): PluginConfigReader {
  return {
    getRequired: (k: string) => {
      if (k === 'BASE_PATH') return basePath;
      throw new Error(`missing ${k}`);
    },
    getOptional: (k: string, d?: string) => {
      if (k === 'BASE_PATH') return basePath;
      return d;
    },
    getBoolean: (_k: string) => false,
    getNumber: (_k: string) => 0,
    getOptionalNumber: (_k: string) => undefined,
    getCsv: (_k: string) => [],
  };
}

describe('storage-local adapter', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-local-test-'));
  const adapter = storagePluginDefinition.createAdapter(makeConfig(tmp));

  it('uploads, gets and deletes a file', async () => {
    const result = await (adapter as any).uploadFile({
      workspaceId: 'w1',
      filename: 'hello.txt',
      buffer: Buffer.from('hello world'),
      contentType: 'text/plain',
    });
    expect(result).toHaveProperty('engineFileRef');
    const meta = await (adapter as any).getFile(result.engineFileRef);
    expect(meta).not.toBeNull();
    expect(meta.filename).toBeDefined();
    // Drain the stream so its file descriptor opens and closes before we delete.
    await new Promise<void>((resolve, reject) => {
      meta.downloadStream.on('end', resolve).on('error', reject).resume();
    });

    await (adapter as any).deleteFile(result.engineFileRef);
    const after = await (adapter as any).getFile(result.engineFileRef);
    expect(after).toBeNull();
  });

  it('rejects path-traversal refs that escape basePath', async () => {
    expect(await (adapter as any).getFile('local:../../../etc/passwd')).toBeNull();
    await expect((adapter as any).deleteFile('local:../../../etc/passwd')).resolves.toBeUndefined();
  });
});
