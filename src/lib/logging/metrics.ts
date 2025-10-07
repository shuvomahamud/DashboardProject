const METRIC_TAG = '[METRIC]';

type Loggable = string | number | boolean | Date | undefined | null;

function serializeValue(value: Loggable): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value).replace(/\s+/g, '_');
}

export function logMetric(event: string, fields: Record<string, Loggable> = {}): void {
  const body = Object.entries({ event, ...fields })
    .map(([key, value]) => `${key}=${serializeValue(value)}`)
    .join(' ');

  console.log(`${METRIC_TAG} ${body}`);
}

export { METRIC_TAG };
