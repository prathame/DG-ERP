/**
 * Local store for service offline seat activation (mirrors on-prem license.dat idea).
 */
const SEAT_KEY = 'dg_mobile_seat_v1';

export type StoredSeat = {
  seatKey: string;
  slug: string;
  companyName?: string;
  activatedAt: string;
  offlineEnabled: boolean;
};

export function getStoredSeat(): StoredSeat | null {
  try {
    const raw = localStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSeat;
    if (!parsed?.seatKey || !parsed?.slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSeat(seat: StoredSeat) {
  localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
  localStorage.setItem('dg_mobile_offline_enabled', seat.offlineEnabled ? '1' : '0');
}

export function clearStoredSeat() {
  localStorage.removeItem(SEAT_KEY);
  localStorage.removeItem('dg_mobile_offline_enabled');
}

export function isOfflineEntitled(): boolean {
  return localStorage.getItem('dg_mobile_offline_enabled') === '1';
}

export function setOfflineEntitled(enabled: boolean) {
  localStorage.setItem('dg_mobile_offline_enabled', enabled ? '1' : '0');
  const seat = getStoredSeat();
  if (seat) {
    saveStoredSeat({ ...seat, offlineEnabled: enabled });
  }
}
