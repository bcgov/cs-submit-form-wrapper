import {
  env,
  parseBooleanEnvValue,
  parseNumberEnvValue,
  parseCsvValue,
  type EnvReader,
} from './env';

/** Normalize a key for env: trim, uppercase, replace non-alphanumeric with underscore. */
export const normalizeKey = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');

/** Minimal env reader interface for plugin config (e.g. from createEnvReader). */
export type PluginConfigEnvReader = Pick<EnvReader, 'getRequiredEnv' | 'getOptionalEnv'>;

const getRequiredBoolean = (reader: PluginConfigEnvReader, envKey: string): boolean => {
  return parseBooleanEnvValue(reader.getRequiredEnv(envKey));
};

const getRequiredNumber = (reader: PluginConfigEnvReader, envKey: string): number => {
  return parseNumberEnvValue(reader.getRequiredEnv(envKey));
};

const getRequiredCsv = (reader: PluginConfigEnvReader, envKey: string): string[] => {
  return parseCsvValue(reader.getRequiredEnv(envKey));
};

const getOptionalNumber = (reader: PluginConfigEnvReader, envKey: string): number | undefined => {
  const raw = reader.getOptionalEnv(envKey);
  return raw === undefined ? undefined : parseNumberEnvValue(raw);
};

export interface PluginConfigReader {
  getRequired(key: string): string;
  getOptional(key: string, defaultValue?: string): string | undefined;
  getBoolean(key: string): boolean;
  getNumber(key: string): number;
  /** Undefined when unset, so the consumer's default stands. */
  getOptionalNumber(key: string): number | undefined;
  getCsv(key: string): string[];
}

function buildConfigReader(reader: PluginConfigEnvReader, prefix: string): PluginConfigReader {
  const toEnvKey = (key: string) => `${prefix}${normalizeKey(key)}`;
  return {
    getRequired: (key: string) => reader.getRequiredEnv(toEnvKey(key)),
    getOptional: (key: string, defaultValue?: string) =>
      reader.getOptionalEnv(toEnvKey(key)) ?? defaultValue,
    getBoolean: (key: string) => getRequiredBoolean(reader, toEnvKey(key)),
    getNumber: (key: string) => getRequiredNumber(reader, toEnvKey(key)),
    getOptionalNumber: (key: string) => getOptionalNumber(reader, toEnvKey(key)),
    getCsv: (key: string) => getRequiredCsv(reader, toEnvKey(key)),
  };
}

export function createPluginConfigReaderFrom(
  reader: PluginConfigEnvReader,
  pluginCode: string,
): PluginConfigReader {
  return buildConfigReader(reader, `PLUGIN_${normalizeKey(pluginCode)}_`);
}

export const createPluginConfigReader = (pluginCode: string): PluginConfigReader => {
  return createPluginConfigReaderFrom(env, pluginCode);
};

/**
 * Config reader for a storage profile: keys resolve to STORAGE_PROFILE_<PROFILE>_<KEY>, so the same
 * backend (e.g. 'storage-s3') can be configured differently per profile.
 */
export function createStorageProfileConfigReaderFrom(
  reader: PluginConfigEnvReader,
  profile: string,
): PluginConfigReader {
  return buildConfigReader(reader, `STORAGE_PROFILE_${normalizeKey(profile)}_`);
}

export const createStorageProfileConfigReader = (profile: string): PluginConfigReader => {
  return createStorageProfileConfigReaderFrom(env, profile);
};
