import { BOT_TYPE_POLICY_VALUE_SEARCH, BOT_TYPE_WEIGHTED_PREFERENCE, normalizeCustomBot } from './botProfiles.js';
import { PROMOTED_BOTS } from './promotedBotsManifest.js';

export function getPromotedBotEntries(entries = PROMOTED_BOTS) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => normalizePromotedBotEntry(entry))
    .filter(Boolean);
}

export function getPromotedBotDefinitions(entries = PROMOTED_BOTS) {
  return getPromotedBotEntries(entries).map((entry) => ({
    id: entry.id,
    name: entry.name,
    kind: 'promoted',
    botType: entry.botType,
    sourceFile: entry.sourceFile,
    promotedAt: entry.promotedAt,
    isChampion: entry.isChampion,
  }));
}

export function findPromotedBotEntry(botId, entries = PROMOTED_BOTS) {
  return getPromotedBotEntries(entries).find((entry) => entry.id === botId) ?? null;
}

export function normalizePromotedBotEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const bot = entry.bot ? normalizeCustomBot(entry.bot) : null;
  if (!bot) return null;

  const botType = bot.botType === BOT_TYPE_POLICY_VALUE_SEARCH
    ? BOT_TYPE_POLICY_VALUE_SEARCH
    : BOT_TYPE_WEIGHTED_PREFERENCE;
  const promotedAt = toIsoString(entry.promotedAt);
  const normalizedId = sanitizeId(entry.id || bot.id);
  if (!normalizedId) return null;

  return {
    id: normalizedId,
    name: sanitizeName(entry.name || bot.name),
    botType,
    sourceFile: String(entry.sourceFile ?? `./promoted/${normalizedId}.json`),
    promotedAt,
    notes: String(entry.notes ?? '').trim(),
    isChampion: Boolean(entry.isChampion),
    originalBotId: String(entry.originalBotId ?? bot.id ?? normalizedId),
    searchDepth: botType === BOT_TYPE_POLICY_VALUE_SEARCH
      ? normalizeSearchDepth(entry.searchDepth, bot)
      : null,
    bot,
  };
}

export function serializePromotedBotManifest(entries = PROMOTED_BOTS) {
  const normalizedEntries = getPromotedBotEntries(entries);
  const lines = [
    'export const PROMOTED_BOTS_MANIFEST_VERSION = 1;',
    '',
    'export const PROMOTED_BOTS = [',
  ];

  if (normalizedEntries.length) {
    const serializedEntries = normalizedEntries.map((entry) => (
      `  ${JSON.stringify(entry, null, 2).replace(/\n/g, '\n  ')}`
    ));
    lines.push(serializedEntries.join(',\n'));
  }

  lines.push('];', '', 'export default PROMOTED_BOTS;', '');
  return lines.join('\n');
}

function sanitizeId(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || null;
}

function sanitizeName(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.slice(0, 64) || 'Promoted Bot';
}

function toIsoString(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeSearchDepth(candidate, bot) {
  const fallback = Number(
    bot?.trainingMetadata?.lastLeagueTrainingRun?.searchDepth
      ?? bot?.trainingMetadata?.searchDepth
      ?? 2
  );
  const numeric = Number(candidate);
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(1, Math.floor(resolved || 2));
}
