// Simple Credits Store (Dev). Für Produktion DB integrieren.
type Balance = { userId: string; credits: number };
const store = new Map<string, Balance>();

export async function getCredits(userId: string): Promise<number> {
  return store.get(userId)?.credits ?? 100; // Default-Startguthaben
}

export async function setCredits(userId: string, credits: number): Promise<void> {
  store.set(userId, { userId, credits });
}

export async function ensureCredits(userId: string, cost: number): Promise<boolean> {
  const current = await getCredits(userId);
  if (current < cost) return false;
  await setCredits(userId, current - cost);
  return true;
}

