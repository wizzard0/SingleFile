/*
 * Copyright 2010-2019 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of SingleFile.
 *
 *   SingleFile is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   SingleFile is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with SingleFile.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global browser, singlefile */

singlefile.ui.button = (() => {

	const DEFAULT_ICON_PATH = "/extension/ui/resources/icon_128.png";
	const WAIT_ICON_PATH_PREFIX = "/extension/ui/resources/icon_128_wait";
	const DEFAULT_TITLE = browser.i18n.getMessage("buttonDefaultTooltip");
	const DEFAULT_COLOR = [2, 147, 20, 255];

	browser.browserAction.onClicked.addListener(async tab => {
		const tabs = await singlefile.tabs.get({ currentWindow: true, highlighted: true });
		if (!tabs.length) {
			singlefile.core.saveTab(tab);
		} else {
			tabs.forEach(tab => (tab.active || tab.highlighted) && singlefile.core.saveTab(tab));
		}
	});

	return {
		onMessage,
		onTabCreated,
		onTabActivated,
		onTabUpdated,
		onInitialize,
		onProgress,
		onEnd,
		onError,
		refresh: async tab => {
			if (tab.id) {
				await refresh(tab.id, getProperties({ autoSave: await singlefile.autosave.isEnabled(tab) }));
			}
		}
	};

	function onMessage(message, sender) {
		if (message.loadURL) {
			onLoad(sender.tab.id);
		}
		if (message.processProgress) {
			if (message.maxIndex) {
				onProgress(sender.tab.id, message.index, message.maxIndex, message.options);
			}
		}
		if (message.processEnd) {
			onEnd(sender.tab.id, message.options);
		}
		if (message.processError) {
			if (message.error) {
				console.error("Initialization error", message.error); // eslint-disable-line no-console
			}
			onError(sender.tab.id, message.options);
		}
		if (message.processCancelled) {
			onCancelled(sender.tab.id, message.options);
		}
	}

	function onTabUpdated(tabId, changeInfo, tab) {
		refreshTab(tab);
	}

	async function onTabCreated(tab) {
		await refreshProperty(tab.id, "setBadgeBackgroundColor", { color: DEFAULT_COLOR });
		refreshTab(tab);
	}

	async function onTabActivated(tab) {
		refreshTab(tab);
	}

	function onLoad(tabId) {
		refresh(tabId, getProperties({}, "", DEFAULT_COLOR, DEFAULT_TITLE));
	}

	function onInitialize(tabId, options, step) {
		if (step == 1) {
			onLoad(tabId);
		}
		refresh(tabId, getProperties(options, browser.i18n.getMessage("buttonInitializingBadge"), step == 1 ? DEFAULT_COLOR : [4, 229, 36, 255], browser.i18n.getMessage("buttonInitializingTooltip") + " (" + step + "/2)", WAIT_ICON_PATH_PREFIX + "0.png"));
	}

	function onError(tabId, options) {
		refresh(tabId, getProperties(options, browser.i18n.getMessage("buttonErrorBadge"), [229, 4, 12, 255]));
	}

	function onCancelled(tabId, options) {
		refresh(tabId, getProperties(options, "", DEFAULT_COLOR, DEFAULT_TITLE));
	}

	function onEnd(tabId, options) {
		refresh(tabId, getProperties(options, browser.i18n.getMessage("buttonOKBadge"), [4, 229, 36, 255]));
	}

	function onProgress(tabId, index, maxIndex, options) {
		const progress = Math.max(Math.min(20, Math.floor((index / maxIndex) * 20)), 0);
		const barProgress = Math.min(Math.floor((index / maxIndex) * 8), 8);
		const path = WAIT_ICON_PATH_PREFIX + barProgress + ".png";
		refresh(tabId, getProperties(options, "", [4, 229, 36, 255], browser.i18n.getMessage("buttonSaveProgressTooltip") + (progress * 5) + "%", path, [128, 128, 128, 255]));
	}

	async function refreshTab(tab) {
		const properties = getCurrentProperties(tab.id, { autoSave: await singlefile.autosave.isEnabled(tab) });
		await refresh(tab.id, properties, true);
		if (browser.browserAction && browser.browserAction.enable && browser.browserAction.disable) {
			if (singlefile.util.isAllowedURL(tab.url)) {
				try {
					await browser.browserAction.enable(tab.id);
				} catch (error) {
					/* ignored */
				}
			} else {
				try {
					await browser.browserAction.disable(tab.id);
				} catch (error) {
					/* ignored */
				}
			}
		}
	}

	function getCurrentProperties(tabId, options) {
		if (options.autoSave) {
			return getProperties(options);
		} else {
			const tabsData = singlefile.tabsData.getTemporary(tabId);
			const tabData = tabsData[tabId].button;
			if (tabData) {
				return tabData;
			} else {
				return getProperties(options);
			}
		}
	}

	function getProperties(options, text, color, title = DEFAULT_TITLE, path = DEFAULT_ICON_PATH, autoColor = [208, 208, 208, 255]) {
		return {
			setBadgeText: { text: options.autoSave ? browser.i18n.getMessage("buttonAutoSaveActiveBadge") : (text || "") },
			setBadgeBackgroundColor: { color: options.autoSave ? autoColor : color || DEFAULT_COLOR },
			setTitle: { title: options.autoSave ? browser.i18n.getMessage("buttonAutoSaveActiveTooltip") : title },
			setIcon: { path: options.autoSave ? DEFAULT_ICON_PATH : path }
		};
	}

	async function refresh(tabId, tabData) {
		const tabsData = singlefile.tabsData.getTemporary(tabId);
		const oldTabData = tabsData[tabId].button || {};
		tabsData[tabId].button = tabData;
		if (!tabData.pendingRefresh) {
			tabData.pendingRefresh = Promise.resolve();
		}
		try {
			await tabData.pendingRefresh;
		} catch (error) {
			/* ignored */
		}
		tabData.pendingRefresh = refreshAsync(tabId, tabData, oldTabData);
	}

	async function refreshAsync(tabId, tabData, oldTabData) {
		for (const browserActionMethod of Object.keys(tabData)) {
			if (browserActionMethod == "setBadgeBackgroundColor" || !oldTabData[browserActionMethod] || JSON.stringify(oldTabData[browserActionMethod]) != JSON.stringify(tabData[browserActionMethod])) {
				await refreshProperty(tabId, browserActionMethod, tabData[browserActionMethod]);
			}
		}
	}

	async function refreshProperty(tabId, browserActionMethod, browserActionParameter) {
		if (browser.browserAction[browserActionMethod]) {
			const parameter = JSON.parse(JSON.stringify(browserActionParameter));
			parameter.tabId = tabId;
			await browser.browserAction[browserActionMethod](parameter);
		}
	}

})();