import { EliteRulesBot } from './eliteRulesBot.js';
import { GreedyBot } from './greedyBot.js';
import { MinimaxBot } from './minimaxBot.js';
import { PolicyValueSearchBot } from './policyValueSearchBot.js';
import { RandomBot } from './randomBot.js';
import {
  getCustomBotId,
  getCustomBotOption,
  getProfileIdFromBotId,
  isCustomBotId,
  isPolicyValueSearchBot,
  normalizeCustomBot,
  normalizeProfile,
} from './botProfiles.js';
import { findPromotedBotEntry, getPromotedBotDefinitions, getPromotedBotEntries } from './promotedRegistry.js';
import { WeightedPreferenceBot } from './weightedPreferenceBot.js';

export function getBuiltinBotDefinitions() {
  return [
    { id: 'random', name: 'Random Bot', kind: 'builtin' },
    { id: 'greedy', name: 'Greedy Bot', kind: 'builtin' },
    { id: 'minimax', name: 'Minimax Bot (Depth 4)', kind: 'builtin' },
    { id: 'elite-rules', name: 'Elite Rules Bot', kind: 'builtin' },
  ];
}

export function getAvailableBotDefinitions(customProfiles = [], promotedEntries = getPromotedBotEntries()) {
  const builtins = getBuiltinBotDefinitions();
  const promoted = getPromotedBotDefinitions(promotedEntries);
  const customs = customProfiles.map((profile) => getCustomBotOption(profile));
  return [...builtins, ...promoted, ...customs];
}

export function getBotDisplayName(botId, customProfiles = [], promotedEntries = getPromotedBotEntries()) {
  const definition = getAvailableBotDefinitions(customProfiles, promotedEntries).find((bot) => bot.id === botId);
  return definition?.name ?? 'Unknown Bot';
}

export function createBuiltinBot(botId, { rng } = {}) {
  switch (botId) {
    case 'elite-rules':
      return new EliteRulesBot();
    case 'greedy':
      return new GreedyBot();
    case 'minimax':
      return new MinimaxBot({ depth: 4 });
    case 'random':
    default:
      return new RandomBot('Random Bot', { rng });
  }
}

export function createBotFromSelection(botId, customProfiles = [], { rng, promotedEntries = getPromotedBotEntries() } = {}) {
  const promotedEntry = findPromotedBotEntry(botId, promotedEntries);
  if (promotedEntry) {
    if (promotedEntry.botType === 'policy-value-search') {
      return new PolicyValueSearchBot(promotedEntry.bot, {
        depth: promotedEntry.searchDepth ?? getSearchDepthForBundle(promotedEntry.bot),
        name: promotedEntry.name,
      });
    }
    return new WeightedPreferenceBot(promotedEntry.bot, { rng });
  }

  if (isCustomBotId(botId)) {
    const profileId = getProfileIdFromBotId(botId);
    const profile = customProfiles.find((item) => normalizeCustomBot(item).id === profileId);
    if (profile) {
      if (isPolicyValueSearchBot(profile)) {
        return new PolicyValueSearchBot(profile, {
          depth: getSearchDepthForBundle(profile),
        });
      }
      return new WeightedPreferenceBot(profile, { rng });
    }
  }

  return createBuiltinBot(botId, { rng });
}

export function ensureValidBotSelection(botId, fallbackId, customProfiles = []) {
  const availableIds = new Set(getAvailableBotDefinitions(customProfiles).map((bot) => bot.id));
  if (availableIds.has(botId)) return botId;
  return availableIds.has(fallbackId) ? fallbackId : 'random';
}

export { getCustomBotId };

function getSearchDepthForBundle(bundle) {
  const candidateDepth = Number(
    bundle?.trainingMetadata?.lastLeagueTrainingRun?.searchDepth
      ?? bundle?.trainingMetadata?.searchDepth
      ?? 2,
  );
  return Number.isFinite(candidateDepth) ? Math.max(1, Math.floor(candidateDepth)) : 2;
}
