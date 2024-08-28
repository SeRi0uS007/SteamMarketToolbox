// ==UserScript==
// @name        Steam Market Toolbox
// @namespace   Violentmonkey Scripts
// @match       https://steamcommunity.com/market/*
// @grant       unsafeWindow
// @grant       GM.setValue
// @grant       GM.getValue
// @version     0.2
// @author      Andrii Lavrenko
// @description A set of utilities (or consider it as a single script) that enhances various components of the Steam Community Market
// @downloadURL https://github.com/SeRi0uS007/SteamMarketToolbox/raw/master/steammarkettoolbox.user.js
// @updateURL   https://github.com/SeRi0uS007/SteamMarketToolbox/raw/master/steammarkettoolbox.user.js
// ==/UserScript==

(function() {
    'use strict';
    // #region Constants
    const MARKET_MAIN_PATH = '/market/';
    const MARKET_SEARCH_PATH = '/market/search';
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const getRandom = (min, max) => Math.random() * (max - min) + min;
    // #endregion

    if (location.pathname === MARKET_SEARCH_PATH) {

        const getSearchParams = () => {
            let params = location.hash.match(/#p(?<page>\d*)_(?<sortColumn>.*)_(?<sortDir>.*)/)?.groups;
            if (params) {
                params.page = Number(params.page) - 1;
                return params;
            }

            return {
                page: 0,
                sortColumn: 'popular',
                sortDir: 'desc'
            }
        }

        const getPriceOverview = async (appId, marketHashName) => {
            const itemKey = `${appId}||${marketHashName}`;
            const walletInfo = unsafeWindow.g_rgWalletInfo;

            const loadCachedPriceOverview = async () => {
                const _cachedData = await GM.getValue(itemKey);
                if (!_cachedData) {
                    return;
                }

                const cachedDate = new Date(_cachedData.cached_time);
                const currentDate = new Date();

                if (currentDate.getTime() - cachedDate.getTime() > 3600000) { // 1 hour is too old
                    return;
                }

                return {
                    lowest_price: _cachedData.lowest_price,
                    success: _cachedData.success,
                    volume: _cachedData.volume,
                    median_price: _cachedData.median_price
                }
            }
            const saveCachedPriceOverview = async priceOverview => {
                const currentDate = new Date();
                priceOverview.cached_time = currentDate.toJSON();

                await GM.setValue(itemKey, priceOverview);
            }
            const doAjax = async url => {
                let timeToDelay = 0;

                while (true) {
                    try {
                        return await unsafeWindow.$J.ajax({
                            url,
                            method: 'GET'
                        });
                    } catch {
                        timeToDelay += 1000;
                        await delay(timeToDelay);
                        continue;
                    } finally {
                        await delay(getRandom(2000, 4000));
                    }
                }
            }

            const _cachedData = await loadCachedPriceOverview();
            if (_cachedData) {
                return _cachedData;
            }

            const country = walletInfo.wallet_country;
            const currency = walletInfo.wallet_currency;
            const downloadedData = await doAjax(`https://steamcommunity.com/market/priceoverview/?country=${country}&currency=${currency}&appid=${appId}&market_hash_name=${marketHashName}`);

            await saveCachedPriceOverview(downloadedData);
            return downloadedData;
        }

        let renderVolumeBusy = false;
        const renderQueue = [];
        const renderVolume = async () => {
            if (renderVolumeBusy) {
                return;
            }

            renderVolumeBusy = true;
            while (renderQueue.length) {
                const {appId, marketHashName, volumeElement} = renderQueue.shift();
                if (!volumeElement[0].isConnected) {
                    continue;
                }
                const priceOverview = await getPriceOverview(appId, marketHashName);
                volumeElement.text(priceOverview?.volume ?? '0');
            }
            renderVolumeBusy = false;
        }

        const $J = unsafeWindow.$J;
        const g_oSearchResults = unsafeWindow.g_oSearchResults;

        // region Market Search Monkeypatching
        const _onResponseRenderResults = unsafeWindow.CAjaxPagingControls.prototype.OnResponseRenderResults;
        unsafeWindow.CAjaxPagingControls.prototype.OnResponseRenderResults = function(transport) {
            _onResponseRenderResults.call(this, transport);
            const width = $J(
                `<div class="market_listing_right_cell market_sortable_column" style="float:left;padding:0px 10px 0px 10px">
                    VOLUME
                </div>`)
                .insertBefore('.market_listing_right_cell.market_listing_num_listings.market_sortable_column')
                .outerWidth();

            const listings = unsafeWindow.$J('.market_listing_row_link');
            for (let i = 0; i < listings.length; ++i) {
                const volumeElement = $J(`<div id="volume_${i}" class="market_listing_right_cell market_listing_num_listings" style="width: ${width}px">Processing...</div>`)
                    .insertBefore(`#result_${i} .market_listing_price_listings_block .market_listing_right_cell.market_listing_num_listings`);

                const url = new URL(listings[i].href);
                const { appId, marketHashName } = url.pathname.match(/\/market\/listings\/(?<appId>\d+)\/(?<marketHashName>.*)/).groups;

                renderQueue.push({
                    appId,
                    marketHashName,
                    volumeElement
                });
            }

            renderVolume();
        }

        g_oSearchResults.m_cPageSize = 100;

        const params = getSearchParams();
        g_oSearchResults.m_iCurrentPage = params.page - 1;
        unsafeWindow.g_strSortColumn = params.sortColumn;
        unsafeWindow.g_strSortDir = params.sortDir;
        g_oSearchResults.GoToPage(params.page, true)
        // endregion

        // region Market Search Group
        const appsSelector = $J('#market_advancedsearch_appselect_options .popup_item.popup_menu_item.market_advancedsearch_appname');

        const appsData = [];
        // First one is a <span> with text "All games"
        for (let i = 1; i < appsSelector.length; ++i) {
            const appId = Number($J(appsSelector[i]).attr('data-appid'));
            const appName = $J('span', appsSelector[i]).text().strip();
            const appIcon = $J('img', appsSelector[i]).attr('src');

            appsData.push({
                appId,
                appName,
                appIcon
            });
        }

        $J('<div id="browseItems" class="responsive_local_menu"><div class=market_search_game_button_group></div></div>')
            .insertAfter('.market_search_box_container');

        for (let app of appsData) {
            $J(`<a href="https://steamcommunity.com/market/search?appid=${app.appId}" class="game_button">
                    <span class="game_button_contents">
                        <span class="game_button_game_icon">
                            <img src="${app.appIcon}" alt="${app.appName}">
                            <span class="game_button_game_name"> ${app.appName} </span>
                        </span>
                    </span>
                </a>`)
                .appendTo('.market_search_game_button_group')
        }
        // endregion
    }
})();