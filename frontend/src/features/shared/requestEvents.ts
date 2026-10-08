import type { RequestEvent } from '../../types';

export function eventSummary(event: RequestEvent) {
  if (!event.metadata) return '';

  try {
    const metadata = JSON.parse(event.metadata) as Record<string, string>;
    return metadata.explanation || metadata.reason || metadata.response || '';
  } catch {
    return '';
  }
}