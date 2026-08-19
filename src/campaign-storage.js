import { cloneCampaignProgress, emptyCampaignProgress } from "./campaign.js";

export const CAMPAIGN_STORAGE_KEY = "starDuelCampaignProgress";

function browserCampaignStorage() {
  try {
    const storage = typeof globalThis !== "undefined" ? globalThis.localStorage : null;
    return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function"
      ? storage
      : null;
  } catch (error) {
    return null;
  }
}

function resolveCampaignStorage(storage) {
  return storage === undefined ? browserCampaignStorage() : storage;
}

export function loadCampaignProgress(storage) {
  try {
    const target = resolveCampaignStorage(storage);
    const raw = target?.getItem?.(CAMPAIGN_STORAGE_KEY);
    if (typeof raw !== "string" || !raw) return emptyCampaignProgress();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyCampaignProgress();
    return cloneCampaignProgress(parsed);
  } catch (error) {
    return emptyCampaignProgress();
  }
}

export function saveCampaignProgress(progress = emptyCampaignProgress(), storage) {
  try {
    const target = resolveCampaignStorage(storage);
    if (typeof target?.setItem !== "function") return false;
    target.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(cloneCampaignProgress(progress)));
    return true;
  } catch (error) {
    return false;
  }
}
