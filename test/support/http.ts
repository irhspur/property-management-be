// HTTP tests: an app with the routers under test mounted, listening on a free
// port, and a call() helper. useApp() also creates an admin, an owner and a
// tenant and signs a session token for each, so routes run through the real
// authorize(). Use it after useTestDatabase().
import 'dotenv/config';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { before, after } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import * as fixtures from './fixtures';

export interface Listening {
  url: string;
  close: () => void;
}

export const listen = (app: express.Express): Listening => {
  const server: Server = app.listen(0);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
};

export const sessionToken = (userId: string): string => jwt.sign({ id: userId }, process.env.JWT_SECRET as string);

type As = 'admin' | 'owner' | 'tenant';

export interface TestApp {
  ids: Record<As, string>;
  // JSON request as one of the three users (admin by default).
  call: (method: string, path: string, opts?: { as?: As; body?: unknown }) => Promise<{ status: number; body: any }>;
}

export const useApp = (mount: (app: express.Express) => void): TestApp => {
  let server: Listening;
  const ids = {} as Record<As, string>;
  const tokens = {} as Record<As, string>;

  before(async () => {
    ids.admin = await fixtures.admin();
    ids.owner = await fixtures.owner();
    ids.tenant = await fixtures.tenant({ linkedTo: ids.owner });
    for (const as of ['admin', 'owner', 'tenant'] as As[]) tokens[as] = sessionToken(ids[as]);

    const app = express();
    app.use(express.json());
    mount(app);
    server = listen(app);
  });

  after(() => server.close());

  return {
    ids,
    call: async (method, path, opts = {}) => {
      const res = await fetch(`${server.url}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[opts.as ?? 'admin']}` },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      return { status: res.status, body: (await res.json()) as any };
    },
  };
};
