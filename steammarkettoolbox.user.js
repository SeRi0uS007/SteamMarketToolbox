// ==UserScript==
// @name        Steam Market Toolbox
// @namespace   Violentmonkey Scripts
// @match       https://steamcommunity.com/market/*
// @grant       unsafeWindow
// @grant       GM.setValue
// @grant       GM.getValue
// @grant       GM.addStyle
// @version     0.4
// @author      Andrii Lavrenko
// @description A set of utilities (or consider it as a single script) that enhances various components of the Steam Community Market
// @downloadURL https://github.com/SeRi0uS007/SteamMarketToolbox/raw/master/steammarkettoolbox.user.js
// @updateURL   https://github.com/SeRi0uS007/SteamMarketToolbox/raw/master/steammarkettoolbox.user.js
// ==/UserScript==

(function() {
    'use strict';

    GM.addStyle(`
        .lds-ellipsis,
        .lds-ellipsis div {
            box-sizing: border-box;
        }
        .lds-ellipsis {
            display: inline-block;
            position: relative;
            height: 23px;
        }
        .lds-ellipsis div {
            position: absolute;
            top: 16.66666px;
            width: 6.66666px;
            height: 6.66666px;
            border-radius: 50%;
            background: currentColor;
            animation-timing-function: cubic-bezier(0, 1, 1, 0);
            }
        .lds-ellipsis div:nth-child(1) {
            left: 4px;
            animation: lds-ellipsis1 0.6s infinite;
        }
        .lds-ellipsis div:nth-child(2) {
            left: 4px;
            animation: lds-ellipsis2 0.6s infinite;
        }
        .lds-ellipsis div:nth-child(3) {
            left: 16px;
            animation: lds-ellipsis2 0.6s infinite;
        }
        .lds-ellipsis div:nth-child(4) {
            left: 26px;
            animation: lds-ellipsis3 0.6s infinite;
        }
        @keyframes lds-ellipsis1 {
            0% {
                transform: scale(0);
            }
            100% {
                transform: scale(1);
            }
        }
        @keyframes lds-ellipsis3 {
            0% {
                transform: scale(1);
            }
            100% {
                transform: scale(0);
            }
        }
        @keyframes lds-ellipsis2 {
            0% {
                transform: translate(0, 0);
            }
            100% {
                transform: translate(12px, 0);
            }
        }
        .smt_game_button_game_price {
            float: right;
            background-color: #555555;
            border-top-left-radius: 5px;
            border-bottom-left-radius: 5px;
            padding-left: 5px;
            min-width: 40px;
        }
    `);

    const MARKET_MAIN_PATH = '/market/';
    const MARKET_SEARCH_PATH = '/market/search';
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const getRandom = (min, max) => Math.random() * (max - min) + min;


    if ([MARKET_MAIN_PATH, MARKET_SEARCH_PATH].includes(location.pathname)) {
        const $J = unsafeWindow.$J;
        const g_oSearchResults = unsafeWindow.g_oSearchResults;
        const walletInfo = unsafeWindow.g_rgWalletInfo;
        const v_currencyformat = unsafeWindow.v_currencyformat;
        const GetCurrencyCode = unsafeWindow.GetCurrencyCode;

        const renderVolumeHeaders = () => {
            const width = $J('<div class="market_listing_right_cell market_sortable_column" style="float:left;padding:0px 10px 0px 10px">VOLUME</div>')
                .insertBefore('.market_listing_table_header .market_listing_num_listings.market_listing_right_cell')
                .outerWidth();

            const listings = $J('.market_listing_row_link');
            for (let i = 0; i < listings.length; ++i) {
                const volumeElement = $J(`<div class="market_listing_right_cell market_listing_num_listings" style="width: ${width}px">Processing...</div>`)
                    .insertBefore(`#result_${i} .market_listing_price_listings_block .market_listing_right_cell.market_listing_num_listings`);

                const url = new URL(listings[i].href);
                const { appId, marketHashName } = url.pathname.match(/\/market\/listings\/(?<appId>\d+)\/(?<marketHashName>.*)/).groups;

                renderQueue.push({
                    appId,
                    marketHashName,
                    volumeElement
                });
            }
        }

        const getPriceOverview = async (appId, marketHashName) => {
            const itemKey = `marketPrice||${appId}||${marketHashName}`;

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
                        return await $J.ajax({
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

        const renderAppPrices = async () => {
            const getNextStoreUpdateDate = () => {
                const currentDate = new Date();
                let day = currentDate.getUTCDate();
                if (currentDate.getUTCHours >= 17) {
                    ++day;
                }
                return Date.UTC(
                    currentDate.getUTCFullYear(),
                    currentDate.getUTCMonth,
                    day,
                    17,
                    0,
                    0,
                    0
                );
            }

            $J('.game_button_contents').css('display', 'flex');
            $J('.game_button_game_name').css('flex-grow', '1');

            const spinner = $J(`<span style="padding-left: 45%">
                    <div class="lds-ellipsis">
                        <div>
                        </div>
                        <div>
                        </div>
                        <div>
                        </div>
                        <div>
                        </div>
                    </div>
                </span>`);

            spinner.insertAfter('#browseItems .market_search_sidebar_section_tip_small');

            const appCards = $J('.game_button');
            const checkedApps = [];
            const unchekedApps = [];

            for (let i = 0; i < appCards.length; ++i) {
                const app = appCards[i];
                // 47 is exact place where "=" symbol ends
                const appId = Number(app.href.substring(47));
                const appKey = `appPrice||${appId}`;
                const _cachedData = await GM.getValue(appKey);
                if (!_cachedData) {
                    unchekedApps.push({
                        appCard: appCards[i],
                        appId
                    });
                    continue;
                }

                const cachedDate = new Date(_cachedData.cached_time);
                if (cachedDate.getTime() <= getNextStoreUpdateDate()) {
                    unchekedApps.push({
                        appCard: appCards[i],
                        appId
                    });
                    continue;
                }

                checkedApps.push({
                    appCard: appCards[i],
                    appId,
                    price: _cachedData.price
                });
            }

            if (unchekedApps.length > 0) {
                let appIds = '';
                unchekedApps.forEach((value, index) => {
                    if (index == 0) appIds = String(value.appId);
                    appIds += `,${value.appId}`;
                });
                const pricesResult = await $J.ajax({
                    method: 'GET',
                    url: `https://store.steampowered.com/api/appdetails?appids=${appIds}&cc=${walletInfo.wallet_country}&filters=price_overview`
                })
                while (unchekedApps.length > 0) {
                    const card = unchekedApps.pop();
                    const appId = card.appId;
                    const appKey = `appPrice||${appId}`;

                    const data = {
                        price: -1,
                        cached_time: (new Date()).toJSON()
                    }
                    const result = pricesResult[appId];
                    if (result.success) {
                        data.price = result?.data?.price_overview?.final ?? 0;
                    }
                    await GM.setValue(appKey, data);

                    card.price = data.price;
                    checkedApps.push(card);
                }
            }

            for (const app of checkedApps) {
                const currencyCode = GetCurrencyCode(walletInfo.wallet_currency);
                let priceString;
                if (app.price == -1) {
                    priceString = `<del>${v_currencyformat(0, currencyCode)}</del>`
                } else {
                    priceString = `${v_currencyformat(app.price, currencyCode)}`
                }

                $J('.game_button_contents', $J(app.appCard))
                .append(`<span class="smt_game_button_game_price">${priceString}</span>`);
            }

            spinner.remove();
        }

        if (location.pathname === MARKET_MAIN_PATH) {
            // There are hidden games
            $J('.market_unvetted_games .game_button').appendTo('.market_more_games');
            unsafeWindow.ShowAllGames();

            renderVolumeHeaders();
            renderVolume();
        }

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

            const _onResponseRenderResults = unsafeWindow.CAjaxPagingControls.prototype.OnResponseRenderResults;
            unsafeWindow.CAjaxPagingControls.prototype.OnResponseRenderResults = function(transport) {
                _onResponseRenderResults.call(this, transport);
                renderVolumeHeaders();
                renderVolume();
            }

            g_oSearchResults.m_cPageSize = 100;

            const params = getSearchParams();
            g_oSearchResults.m_iCurrentPage = params.page - 1;
            unsafeWindow.g_strSortColumn = params.sortColumn;
            unsafeWindow.g_strSortDir = params.sortDir;
            g_oSearchResults.GoToPage(params.page, true)

            const appsSelector = $J('#market_advancedsearch_appselect_options .popup_item.popup_menu_item.market_advancedsearch_appname');

            // Render apps buttons
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
                            </span>
                            <span class="game_button_game_name"> ${app.appName} </span>
                        </span>
                    </a>`)
                    .appendTo('.market_search_game_button_group')
            }
        }

        renderAppPrices();
    }
})();