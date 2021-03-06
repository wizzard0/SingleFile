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

/* global browser, singlefile, Blob, URL */

singlefile.download = (() => {

	const partialContents = new Map();

	return {
		onMessage,
		downloadPage
	};

	function onMessage(message, sender) {
		try {
			if (message.truncated) {
				let partialContent = partialContents.get(sender.tab.id);
				if (!partialContent) {
					partialContent = [];
					partialContents.set(sender.tab.id, partialContent);
				}
				partialContent.push(message.content);
				if (message.finished) {
					partialContents.delete(sender.tab.id);
					message.url = URL.createObjectURL(new Blob(partialContent, { type: "text/html" }));
				} else {
					return Promise.resolve({});
				}
			} else if (message.content) {
				message.url = URL.createObjectURL(new Blob([message.content], { type: "text/html" }));
			}
			return downloadPage(message, { confirmFilename: message.confirmFilename, incognito: sender.tab.incognito, conflictAction: message.filenameConflictAction })
				.catch(error => {
					if (error.message) {
						if (!error.message.toLowerCase().includes("canceled")) {
							if (error.message.includes("'incognito'")) {
								return downloadPage(message, { confirmFilename: message.confirmFilename, conflictAction: message.filenameConflictAction });
							} else {
								return { notSupported: true };
							}
						}
					}
				});
		} catch (error) {
			return Promise.resolve({ notSupported: true });
		}
	}

	async function downloadPage(page, options) {
		const downloadInfo = {
			url: page.url,
			saveAs: options.confirmFilename,
			filename: page.filename,
			conflictAction: options.filenameConflictAction
		};
		if (options.incognito) {
			downloadInfo.incognito = true;
		}
		const downloadId = await browser.downloads.download(downloadInfo);
		return new Promise((resolve, reject) => {
			browser.downloads.onChanged.addListener(onChanged);

			function onChanged(event) {
				if (event.id == downloadId && event.state) {
					if (event.state.current == "complete") {
						URL.revokeObjectURL(page.url);
						resolve({});
						browser.downloads.onChanged.removeListener(onChanged);
					}
					if (event.state.current == "interrupted" && (!event.error || event.error.current != "USER_CANCELED")) {
						URL.revokeObjectURL(page.url);
						reject(new Error(event.state.current));
						browser.downloads.onChanged.removeListener(onChanged);
					}
				}
			}
		});
	}

})();
