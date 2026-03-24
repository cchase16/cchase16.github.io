import {
  BOT_PROFILE_STORAGE_KEY,
  BOT_TYPE_POLICY_VALUE_SEARCH,
  cloneCustomBot,
  createBotProfile,
  createProfileId,
  createStarterProfile,
  normalizeCustomBot,
  touchCustomBot,
} from './botProfiles.js';

export function loadStoredProfiles(storage = globalThis.localStorage) {
  if (!storage) return [createStarterProfile()];

  try {
    const raw = storage.getItem(BOT_PROFILE_STORAGE_KEY);
    if (!raw) return [createStarterProfile()];

    const parsed = JSON.parse(raw);
    const profiles = Array.isArray(parsed) ? parsed.map((profile) => normalizeCustomBot(profile)) : [normalizeCustomBot(parsed)];
    return profiles.length ? profiles : [createStarterProfile()];
  } catch {
    return [createStarterProfile()];
  }
}

export function saveStoredProfiles(profiles, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(BOT_PROFILE_STORAGE_KEY, JSON.stringify(profiles.map((profile) => normalizeCustomBot(profile))));
}

export function createDuplicateProfile(profile) {
  const normalized = normalizeCustomBot(profile);
  if (normalized.botType === BOT_TYPE_POLICY_VALUE_SEARCH) {
    return touchCustomBot({
      ...cloneCustomBot(normalized),
      id: createProfileId('policy-model'),
      name: buildDuplicateName(normalized.name),
    });
  }

  return createBotProfile({
    ...cloneCustomBot(normalized),
    id: createProfileId('weighted-bot'),
    name: buildDuplicateName(normalized.name),
  });
}

export function mergeImportedProfiles(existingProfiles, importedProfiles) {
  const existingIds = new Set(existingProfiles.map((profile) => normalizeCustomBot(profile).id));
  const merged = [...existingProfiles.map((profile) => normalizeCustomBot(profile))];

  for (const imported of importedProfiles) {
    const normalized = normalizeCustomBot(imported);
    if (existingIds.has(normalized.id)) {
      merged.push(touchCustomBot({
        ...normalized,
        id: createProfileId(normalized.botType === BOT_TYPE_POLICY_VALUE_SEARCH ? 'policy-model' : 'weighted-bot'),
      }));
    } else {
      merged.push(normalized);
      existingIds.add(normalized.id);
    }
  }

  return merged;
}

function buildDuplicateName(name) {
  return String(name).includes('(Copy)') ? name : `${name} (Copy)`;
}
