const INBUCKET_URL = process.env.INBUCKET_URL ?? 'http://localhost:9000';

export interface InbucketMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
}

export interface InbucketMessageDetail {
  id: string;
  subject: string;
  body: { text: string; html: string };
}

function mailbox(email: string): string {
  return email.split('@')[0];
}

export async function listMessages(email: string): Promise<InbucketMessage[]> {
  const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox(email)}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Inbucket error: ${res.status}`);
  return res.json();
}

export async function getMessage(
  email: string,
  id: string
): Promise<InbucketMessageDetail> {
  const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox(email)}/${id}`);
  if (!res.ok) throw new Error(`Inbucket error: ${res.status}`);
  return res.json();
}

export async function waitForEmail(
  email: string,
  predicate: (msg: InbucketMessage) => boolean,
  { timeout = 15000, interval = 1500 } = {}
): Promise<InbucketMessageDetail> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const messages = await listMessages(email);
    const match = messages.find(predicate);
    if (match) return getMessage(email, match.id);
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`No matching email for ${email} within ${timeout}ms`);
}

export function extractUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s"<>]+/g)].map(m => m[0]);
}