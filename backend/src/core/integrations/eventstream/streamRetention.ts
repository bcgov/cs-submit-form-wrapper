/**
 * Retention declared per stream, resolved the same way on every replica.
 *
 * Redis Streams have no server-side retention, so eventstream-redis emulates a cap by trimming on
 * append — consistent only if every appending pod resolves the same limit. Declaring it here (in
 * code, with an env override) keeps the limit a property of the stream rather than of whichever
 * caller provisioned it, so a pod that only produces trims the same way as the pod that consumes.
 * A JetStream adapter would read the same declarations at stream creation, where the server
 * enforces them.
 */
import { env, type EnvReader } from '../../config/env';
import { normalizeKey } from '../../config/pluginConfig';
import { log } from '../../logging';
import type { EventStreamConfig } from './EventStreamAdapter';

type OptionalEnvReader = Pick<EnvReader, 'getOptionalEnv'>;

const ENV_PREFIX = 'EVENTSTREAM_RETENTION_';

/**
 * Bounded streams, keyed by logical (unprefixed) stream name, e.g.
 *   'submission.events': { maxLen: 100_000 },
 * Absent means unbounded: trimming can drop un-acked entries, so a cap is always deliberate.
 */
export const declaredStreamRetention: Readonly<Record<string, EventStreamConfig | undefined>> = {};

/** Read a positive-integer retention override, ignoring (loudly) a value that isn't one. */
function readOverride(
  reader: OptionalEnvReader,
  stream: string,
  suffix: string,
): number | undefined {
  const key = `${ENV_PREFIX}${normalizeKey(stream)}_${suffix}`;
  const raw = reader.getOptionalEnv(key);
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    log.warn(
      { key, value: raw },
      '[eventstream] ignoring retention override: expected a positive integer',
    );
    return undefined;
  }
  return parsed;
}

/**
 * Effective retention for a stream: the code declaration, with per-limit env overrides so ops can
 * cap a runaway stream without a deploy (EVENTSTREAM_RETENTION_<STREAM>_MAXLEN /
 * EVENTSTREAM_RETENTION_<STREAM>_MAX_AGE_MS, stream name uppercased with non-alphanumerics as `_`).
 * Undefined means unbounded. The keys do not name the plugin, so swapping Redis for JetStream keeps
 * the same configuration. reader/declarations are injectable for tests; callers pass only the stream.
 */
export function resolveStreamRetention(
  stream: string,
  reader: OptionalEnvReader = env,
  declarations: Readonly<Record<string, EventStreamConfig | undefined>> = declaredStreamRetention,
): EventStreamConfig | undefined {
  const declared = declarations[stream];
  const maxLen = readOverride(reader, stream, 'MAXLEN') ?? declared?.maxLen;
  const maxAgeMs = readOverride(reader, stream, 'MAX_AGE_MS') ?? declared?.maxAgeMs;
  if (maxLen === undefined && maxAgeMs === undefined) return undefined;
  const retention: EventStreamConfig = {};
  if (maxLen !== undefined) retention.maxLen = maxLen;
  if (maxAgeMs !== undefined) retention.maxAgeMs = maxAgeMs;
  return retention;
}
