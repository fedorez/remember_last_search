/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { patch } from "@web/core/utils/patch";
import { SearchModel } from "@web/search/search_model";

const STORAGE_PREFIX = "remember_last_search:v1";
const LOG_PREFIX = "[remember_last_search]";
let warnedNoStorage = false;
let warnedWriteFailure = false;

function storageAvailable() {
    try {
        const probe = `${STORAGE_PREFIX}:probe`;
        browser.localStorage.setItem(probe, "1");
        browser.localStorage.removeItem(probe);
        return true;
    } catch (error) {
        if (!warnedNoStorage) {
            warnedNoStorage = true;
            console.warn(
                `${LOG_PREFIX} localStorage is not available, search persistence is disabled.`,
                error
            );
        }
        return false;
    }
}

function getStorageKey(actionId, userId) {
    return `${STORAGE_PREFIX}:${userId}:${actionId}`;
}

function getDisabledKey(actionId, userId) {
    return `${STORAGE_PREFIX}:off:${userId}:${actionId}`;
}

function getExplicitDefaults(config) {
    const context = config.context || {};
    const searchDefaults = Object.keys(context)
        .filter((key) => key.startsWith("search_default_"))
        .map((key) => key.slice("search_default_".length));
    const searchPanelDefaults = Object.keys(context).filter((key) =>
        key.startsWith("searchpanel_default_")
    );
    return {
        searchDefaults,
        searchPanelDefaults,
        hasDynamicFilters: Boolean(config.dynamicFilters && config.dynamicFilters.length),
    };
}

function savedStateCoversDefaults(savedState, names) {
    const query = savedState.query || [];
    const items = savedState.searchItems || {};
    return names.every((name) =>
        query.some((elem) => {
            const item = items[elem.searchItemId];
            if (!item) {
                return false;
            }
            if (item.type === "field") {
                return item.fieldName === name && Boolean(elem.autocompleteValue);
            }
            return item.name === name;
        })
    );
}

const loggedSkips = new Set();
function logSkipOnce(actionId, reason) {
    const token = `${actionId}:${reason}`;
    if (loggedSkips.has(token)) {
        return;
    }
    loggedSkips.add(token);
    console.info(`${LOG_PREFIX} action ${actionId}: restore skipped (${reason})`);
}

function prepareStateForStorage(state) {
    state.sections = (state.sections || []).map(([sectionId, section]) => [
        sectionId,
        { ...section, values: [], groups: [] },
    ]);
    state.searchPanelInfo = {
        ...(state.searchPanelInfo || {}),
        loaded: false,
        shouldReload: true,
    };
    return state;
}

function readState(key) {
    try {
        const raw = browser.localStorage.getItem(key);
        if (!raw) {
            return null;
        }
        const state = JSON.parse(raw);
        const isValid =
            state &&
            Array.isArray(state.query) &&
            state.searchItems &&
            typeof state.searchItems === "object" &&
            Array.isArray(state.sections);
        if (isValid) {
            return prepareStateForStorage(state);
        }
        throw new Error("Malformed saved search state");
    } catch (error) {
        browser.localStorage.removeItem(key);
        console.warn(`${LOG_PREFIX} dropped saved search for key "${key}":`, error);
        return null;
    }
}

function writeState(key, searchModel) {
    if (!storageAvailable()) {
        return;
    }
    try {
        const state = prepareStateForStorage(searchModel.exportState());
        browser.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
        if (!warnedWriteFailure) {
            warnedWriteFailure = true;
            console.warn(`${LOG_PREFIX} could not save search state:`, error);
        }
    }
}

patch(SearchModel.prototype, {
    async load(config) {
        const { actionId, userId } = this._rememberKeyParts();
        let usedSavedState = false;
        if (actionId) {
            const explicit = getExplicitDefaults(config);
            if (explicit.hasDynamicFilters) {
                logSkipOnce(actionId, "action opened with dynamic filters");
            } else if (explicit.searchPanelDefaults.length) {
                logSkipOnce(actionId, "action context has searchpanel_default_*");
            } else if (!storageAvailable()) {
                logSkipOnce(actionId, "localStorage unavailable");
            } else if (!this.isRememberEnabled()) {
                logSkipOnce(actionId, "remembering disabled for this action");
            } else {
                const key = getStorageKey(actionId, userId);
                const savedState = readState(key);
                if (savedState && !savedStateCoversDefaults(savedState, explicit.searchDefaults)) {
                    logSkipOnce(
                        actionId,
                        "saved search conflicts with the default filters from the action context"
                    );
                } else if (savedState) {
                    try {
                        await super.load({ ...config, state: savedState });
                        usedSavedState = true;
                    } catch (error) {
                        browser.localStorage.removeItem(key);
                        console.warn(
                            `${LOG_PREFIX} saved search for key "${key}" could not be applied and was removed:`,
                            error
                        );
                    }
                }
            }
        }
        if (!usedSavedState) {
            await super.load(config);
        }
    },

    async _notify() {
        const blocked = this.blockNotification;
        const skipSave = this._skipNextRememberSave;
        this._skipNextRememberSave = false;
        await super._notify();
        if (blocked || skipSave) {
            return;
        }
        const { actionId, userId } = this._rememberKeyParts();
        if (actionId && this.resModel && this.isRememberEnabled()) {
            writeState(getStorageKey(actionId, userId), this);
        }
    },

    _rememberKeyParts() {
        return {
            actionId: this.env.config ? this.env.config.actionId : undefined,
            userId: this.userService ? this.userService.userId : 0,
        };
    },

    canRememberSearch() {
        return Boolean(this._rememberKeyParts().actionId);
    },

    isRememberEnabled() {
        const { actionId, userId } = this._rememberKeyParts();
        if (!actionId || !storageAvailable()) {
            return false;
        }
        try {
            return browser.localStorage.getItem(getDisabledKey(actionId, userId)) === null;
        } catch (error) {
            return false;
        }
    },

    setRememberEnabled(enabled) {
        const { actionId, userId } = this._rememberKeyParts();
        if (!actionId || !storageAvailable()) {
            return;
        }
        try {
            const key = getDisabledKey(actionId, userId);
            if (enabled) {
                browser.localStorage.removeItem(key);
            } else {
                browser.localStorage.setItem(key, "1");
            }
        } catch (error) {}
    },

    hasSavedSearch() {
        const { actionId, userId } = this._rememberKeyParts();
        if (!actionId || !storageAvailable()) {
            return false;
        }
        try {
            return browser.localStorage.getItem(getStorageKey(actionId, userId)) !== null;
        } catch (error) {
            return false;
        }
    },

    async forgetSavedSearch() {
        const { actionId, userId } = this._rememberKeyParts();
        if (!actionId) {
            return;
        }
        try {
            browser.localStorage.removeItem(getStorageKey(actionId, userId));
        } catch (error) {}
        const items = Object.values(this.searchItems || {});
        const defaultFavorite = items.find((item) => item.type === "favorite" && item.isDefault);
        this.blockNotification = true;
        this.clearQuery();
        if (defaultFavorite) {
            this.toggleSearchItem(defaultFavorite.id);
        } else {
            items
                .filter((item) => item.isDefault && item.type !== "favorite")
                .sort((a, b) => (a.defaultRank || 100) - (b.defaultRank || 100))
                .forEach((item) => {
                    if (item.type === "dateFilter") {
                        this.toggleDateFilter(item.id);
                    } else if (item.type === "dateGroupBy") {
                        this.toggleDateGroupBy(item.id);
                    } else if (item.type === "field") {
                        this.addAutoCompletionValues(item.id, item.defaultAutocompleteValue);
                    } else {
                        this.toggleSearchItem(item.id);
                    }
                });
        }
        this.blockNotification = false;
        this._skipNextRememberSave = true;
        await this._notify();
    },
});

console.info(`${LOG_PREFIX} SearchModel patch applied`);