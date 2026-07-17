import { getOrCreateCloudDeviceId } from './deviceId';
import { serviceCloudClientHeader, serviceCloudClientKind } from './mode';
import { session } from '../../lib/session';

export type SessionHolder = {
  userId: string;
  userName: string;
  client: string;
  expiresAt?: string;
};

export type GateState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'active'; expiresAt?: string }
  | { kind: 'busy'; holder: SessionHolder }
  | { kind: 'offline' }
  | { kind: 'blocked'; message: string };

type Json = Record<string, unknown>;

async function scFetch(path: string, init?: RequestInit): Promise<{ status: number; body: Json }> {
  const token = session.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const client = serviceCloudClientHeader();
  if (client) headers['X-DG-Client'] = client;

  const res = await fetch(`/api${path}`, { ...init, headers });
  let body: Json = {};
  try {
    body = (await res.json()) as Json;
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

export async function claimAndAcquire(): Promise<GateState> {
  if (!navigator.onLine) return { kind: 'offline' };
  const kind = serviceCloudClientKind();
  if (!kind) return { kind: 'blocked', message: 'This client is not enrolled for service cloud seats.' };

  const machineId = await getOrCreateCloudDeviceId();
  const label =
    kind === 'desktop' ? `Desktop ${navigator.platform || ''}`.trim() : `Mobile ${navigator.userAgent.slice(0, 40)}`;

  const claim = await scFetch('/service-cloud/claim-device', {
    method: 'POST',
    body: JSON.stringify({ machineId, label, client: kind }),
  });
  if (claim.status === 403) {
    return { kind: 'blocked', message: String(claim.body.error || 'Device claim rejected') };
  }
  if (claim.status >= 400) {
    return { kind: 'blocked', message: String(claim.body.error || 'Could not claim device') };
  }

  const acq = await scFetch('/service-cloud/session/acquire', {
    method: 'POST',
    body: JSON.stringify({ machineId, client: kind }),
  });
  if (acq.status === 409 && acq.body.busy) {
    return { kind: 'busy', holder: acq.body.holder as SessionHolder };
  }
  if (acq.status >= 400) {
    return { kind: 'blocked', message: String(acq.body.error || 'Could not acquire session') };
  }
  return { kind: 'active', expiresAt: acq.body.expiresAt as string | undefined };
}

export async function heartbeatSession(): Promise<GateState> {
  if (!navigator.onLine) return { kind: 'offline' };
  const machineId = await getOrCreateCloudDeviceId();
  const kind = serviceCloudClientKind();
  const hb = await scFetch('/service-cloud/session/heartbeat', {
    method: 'POST',
    body: JSON.stringify({ machineId, client: kind }),
  });
  if (hb.status === 409) {
    if (hb.body.needAcquire) return claimAndAcquire();
    if (hb.body.busy) return { kind: 'busy', holder: hb.body.holder as SessionHolder };
  }
  if (hb.status >= 400) {
    return { kind: 'blocked', message: String(hb.body.error || 'Heartbeat failed') };
  }
  return { kind: 'active', expiresAt: hb.body.expiresAt as string | undefined };
}

export async function releaseSession(): Promise<void> {
  try {
    const machineId = await getOrCreateCloudDeviceId();
    await scFetch('/service-cloud/session/release', {
      method: 'POST',
      body: JSON.stringify({ machineId }),
    });
  } catch {
    /* best effort */
  }
}
