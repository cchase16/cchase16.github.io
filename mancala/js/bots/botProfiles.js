import { normalizeModelBundle, serializeModelBundle } from '../ml/modelBundle.js';

export const BOT_PROFILE_VERSION = 1;
export const BOT_TYPE_WEIGHTED_PREFERENCE = 'weighted-preference';
export const BOT_TYPE_POLICY_VALUE_SEARCH = 'policy-value-search';
export const BOT_PROFILE_STORAGE_KEY = 'mancala.botProfiles.v1';
export const CUSTOM_BOT_PREFIX = 'custom:';

export const FEATURE_KEYS = [
  'bias',
  'extraTurn',
  'capturedStonesNorm',
  'myStoreGainNorm',
  'oppStoreGainNorm',
  'mySideAfterNorm',
  'oppSideAfterNorm',
  'movePitNorm',
  'winningMove',
  'opponentReplyThreatNorm',
];

export const DEFAULT_PLAY_SETTINGS = {
  temperature: 0.9,
  epsilon: 0.08,
};

export const DEFAULT_TRAINING_SETTINGS = {
  learningRate: 0.03,
  gamma: 0.97,
  batchSize: 200,
  opponentBotId: 'greedy',
  evalGames: 500,
};

export function createEmptyWeights() {
  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

export function createProfileId(prefix = 'weighted-bot') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function createBotProfile({
  id = createProfileId(),
  name = 'Starter Weighted Bot',
  weights = {},
  play = {},
  training = {},
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
} = {}) {
  return normalizeProfile({
    version: BOT_PROFILE_VERSION,
    id,
    name,
    botType: BOT_TYPE_WEIGHTED_PREFERENCE,
    weights,
    play,
    training,
    createdAt,
    updatedAt,
  });
}

export function createStarterProfile() {
  return createBotProfile({
    id: 'starter-weighted-bot',
    name: 'Starter Weighted Bot',
  });
}

export function createStarterPolicyValueBot() {
  return normalizeCustomBot({
    ...normalizeModelBundle({
      id: 'starter-policy-value-model',
      name: 'Starter Policy Value Model',
    }),
    botType: BOT_TYPE_POLICY_VALUE_SEARCH,
  });
}

export function normalizeProfile(input = {}) {
  const createdAt = toIsoString(input.createdAt);
  const updatedAt = toIsoString(input.updatedAt ?? createdAt);

  return {
    version: BOT_PROFILE_VERSION,
    id: String(input.id ?? createProfileId()),
    name: sanitizeName(input.name),
    botType: BOT_TYPE_WEIGHTED_PREFERENCE,
    weights: normalizeWeights(input.weights),
    play: normalizePlay(input.play),
    training: normalizeTraining(input.training),
    createdAt,
    updatedAt,
  };
}

export function normalizeCustomBot(input = {}) {
  if (isPolicyValueSearchBot(input)) {
    const normalizedBundle = normalizeModelBundle(input);
    return {
      ...normalizedBundle,
      botType: BOT_TYPE_POLICY_VALUE_SEARCH,
    };
  }

  return normalizeProfile(input);
}

export function cloneProfile(profile) {
  return normalizeProfile(JSON.parse(JSON.stringify(profile)));
}

export function cloneCustomBot(bot) {
  return normalizeCustomBot(JSON.parse(JSON.stringify(bot)));
}

export function touchProfile(profile, updates = {}) {
  return normalizeProfile({
    ...profile,
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export function touchCustomBot(bot, updates = {}) {
  if (isPolicyValueSearchBot(bot) || isPolicyValueSearchBot(updates)) {
    return normalizeCustomBot({
      ...normalizeCustomBot(bot),
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  return touchProfile(bot, updates);
}

export function parseProfileJson(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => normalizeProfile(item));
  }
  return normalizeProfile(parsed);
}

export function parseCustomBotJson(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => normalizeCustomBot(item));
  }
  return normalizeCustomBot(parsed);
}

export function serializeProfile(profile) {
  return JSON.stringify(normalizeProfile(profile), null, 2);
}

export function serializeCustomBot(bot) {
  if (isPolicyValueSearchBot(bot)) {
    return serializeModelBundle(normalizeCustomBot(bot));
  }
  return serializeProfile(bot);
}

export function serializeProfiles(profiles) {
  return JSON.stringify(profiles.map((profile) => normalizeProfile(profile)), null, 2);
}

export function serializeCustomBots(bots) {
  return JSON.stringify(bots.map((bot) => normalizeCustomBot(bot)), null, 2);
}

export function getCustomBotId(profileId) {
  return `${CUSTOM_BOT_PREFIX}${profileId}`;
}

export function isCustomBotId(botId) {
  return typeof botId === 'string' && botId.startsWith(CUSTOM_BOT_PREFIX);
}

export function getProfileIdFromBotId(botId) {
  return isCustomBotId(botId) ? botId.slice(CUSTOM_BOT_PREFIX.length) : null;
}

export function getCustomBotOption(profile) {
  const normalized = normalizeCustomBot(profile);
  return {
    id: getCustomBotId(normalized.id),
    name: `Custom: ${normalized.name}`,
    kind: 'custom',
    profileId: normalized.id,
    botType: normalized.botType,
  };
}

export function isWeightedPreferenceBot(profile) {
  return normalizeCustomBot(profile).botType === BOT_TYPE_WEIGHTED_PREFERENCE;
}

export function isPolicyValueSearchBot(profile) {
  return profile?.botType === BOT_TYPE_POLICY_VALUE_SEARCH
    || profile?.modelType === BOT_TYPE_POLICY_VALUE_SEARCH
    || profile?.format === 'mancala-policy-value-model-v1';
}

function normalizeWeights(weights = {}) {
  const next = createEmptyWeights();
  for (const key of FEATURE_KEYS) {
    next[key] = clampNumber(weights[key], 0, -10, 10);
  }
  return next;
}

function normalizePlay(play = {}) {
  return {
    temperature: clampNumber(play.temperature, DEFAULT_PLAY_SETTINGS.temperature, 0.05, 5),
    epsilon: clampNumber(play.epsilon, DEFAULT_PLAY_SETTINGS.epsilon, 0, 1),
  };
}

function normalizeTraining(training = {}) {
  const opponentBotId = normalizeBotId(training.opponentBotId, DEFAULT_TRAINING_SETTINGS.opponentBotId);

  return {
    learningRate: clampNumber(training.learningRate, DEFAULT_TRAINING_SETTINGS.learningRate, 0.0001, 1),
    gamma: clampNumber(training.gamma, DEFAULT_TRAINING_SETTINGS.gamma, 0, 1),
    batchSize: Math.max(1, Math.round(clampNumber(training.batchSize, DEFAULT_TRAINING_SETTINGS.batchSize, 1, 100000))),
    opponentBotId,
    opponentProfile: normalizeOpponentProfileSnapshot(training.opponentProfile, opponentBotId),
    evalGames: Math.max(2, Math.round(clampNumber(training.evalGames, DEFAULT_TRAINING_SETTINGS.evalGames, 2, 10000))),
  };
}

function normalizeOpponentProfileSnapshot(profile, opponentBotId) {
  if (!isCustomBotId(opponentBotId) || !profile || typeof profile !== 'object') {
    return null;
  }

  if (isPolicyValueSearchBot(profile)) {
    return normalizeCustomBot(profile);
  }

  const sanitizedTraining = profile.training && typeof profile.training === 'object'
    ? { ...profile.training, opponentProfile: null }
    : {};

  return normalizeProfile({
    ...profile,
    training: sanitizedTraining,
  });
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function sanitizeName(name) {
  const trimmed = String(name ?? 'Weighted Bot').trim();
  return trimmed.slice(0, 48) || 'Weighted Bot';
}

function toIsoString(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeBotId(value, fallback) {
  const trimmed = String(value ?? '').trim();
  return trimmed || fallback;
}
