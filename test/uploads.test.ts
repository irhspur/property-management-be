// Upload middleware (config/multer.js): every Document upload route uses one
// of these wrappers, so type, size and count rejections come back as the 400
// validation envelope with field "files" — never Express's HTML 500.
import { AddressInfo } from 'net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { documentsUpload, receiptsUpload } = require('../config/multer');

const MB = 1024 * 1024;
type Part = [name: string, type: string, size: number];

const withServer = async (middleware: express.RequestHandler, fn: (send: (files: Part[]) => Promise<any>) => Promise<void>) => {
  const app = express();
  app.post('/u', middleware, (req, res) => res.json({ count: (req.files as unknown[]).length }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/u`;
  const send = async (files: Part[]) => {
    const form = new FormData();
    for (const [name, type, size] of files) form.append('files', new Blob([Buffer.alloc(size)], { type }), name);
    const res = await fetch(url, { method: 'POST', body: form });
    return { status: res.status, body: (await res.json()) as any };
  };
  try {
    await fn(send);
  } finally {
    server.close();
  }
};

for (const [label, middleware, maxFiles, maxMb] of [
  ['documents', documentsUpload, 10, 10],
  ['receipts', receiptsUpload, 5, 5],
] as const) {
  test(`${label}: up to ${maxFiles} files of ${maxMb} MB; anything else is the 400 envelope`, async () => {
    await withServer(middleware, async (send) => {
      assert.deepEqual(await send([['a.png', 'image/png', 10]]), { status: 200, body: { count: 1 } });
      assert.deepEqual(await send(Array(maxFiles).fill(['a.jpg', 'image/jpeg', 10])), {
        status: 200,
        body: { count: maxFiles },
      });

      const rejected: [string, Part[]][] = [
        ['type', [['a.gif', 'image/gif', 10]]],
        ['size', [['a.pdf', 'application/pdf', maxMb * MB + 1]]],
        ['count', Array(maxFiles + 1).fill(['a.pdf', 'application/pdf', 10])],
      ];
      for (const [why, files] of rejected) {
        const { status, body } = await send(files);
        assert.equal(status, 400, why);
        assert.equal(body.errors[0].field, 'files', why);
      }
    });
  });
}
