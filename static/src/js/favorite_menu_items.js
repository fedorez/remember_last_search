/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

/**
 * Переключатель «Запоминать мой поиск» — вкл/выкл запоминания
 * для текущего action. Меню не закрывается (parentClosingMode="none"),
 * как и штатные пункты-чекбоксы.
 */
export class RememberSearchToggle extends Component {
    static template = "remember_last_search.ToggleItem";
    static components = { DropdownItem };
    static props = {};

    setup() {
        this.state = useState({
            enabled: this.searchModel.isRememberEnabled(),
        });
    }

    get searchModel() {
        return this.env.searchModel;
    }

    get label() {
        return _t("Remember my search");
    }

    onToggle() {
        const enabled = !this.state.enabled;
        this.searchModel.setRememberEnabled(enabled);
        this.state.enabled = enabled;
    }
}

/**
 * «Забыть сохранённый поиск» — удаляет сохранённое состояние текущего
 * action и сбрасывает поиск к дефолтам. Неактивна, если сохранённого
 * поиска нет.
 */
export class ForgetSavedSearchItem extends Component {
    static template = "remember_last_search.ForgetItem";
    static components = { DropdownItem };
    static props = {};

    get searchModel() {
        return this.env.searchModel;
    }

    get label() {
        return _t("Forget saved search");
    }

    get hasSaved() {
        return this.searchModel.hasSavedSearch();
    }

    onClick() {
        if (this.hasSaved) {
            this.searchModel.forgetSavedSearch();
        }
    }
}

const favoriteMenuRegistry = registry.category("favoriteMenu");

// groupNumber: 3 — после приватных (1) и общих (2) избранных, с разделителем
favoriteMenuRegistry.add(
    "remember_last_search.toggle",
    {
        Component: RememberSearchToggle,
        groupNumber: 3,
        isDisplayed: (env) => env.searchModel.canRememberSearch(),
    },
    { sequence: 10 }
);

favoriteMenuRegistry.add(
    "remember_last_search.forget",
    {
        Component: ForgetSavedSearchItem,
        groupNumber: 3,
        isDisplayed: (env) => env.searchModel.canRememberSearch(),
    },
    { sequence: 20 }
);
