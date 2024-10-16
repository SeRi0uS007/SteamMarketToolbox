// ==UserScript==
// @name         Steam Market Toolbox
// @namespace    Violentmonkey Scripts
// @match        https://steamcommunity.com/market/*
// @grant        unsafeWindow
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.addStyle
// @grant        GM.xmlHttpRequest
// @version      0.5
// @author       Andrii Lavrenko
// @description  A set of utilities (or consider it as a single script) that enhances various components of the Steam Community Market
// @downloadURL  https://github.com/SeRi0uS007/SteamMarketToolbox/raw/master/steammarkettoolbox.user.js
// @updateURL    https://github.com/SeRi0uS007/SteamMarketToolbox/raw/master/steammarkettoolbox.user.js
// ==/UserScript==

(function () {
    "use strict";

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
        .smt_volume_header {
            float: left;
            padding: 0px 10px 0px 10px;
        }
        .smt_game_button_extra {
            float: right;
            background-color: #555555;
            border-top-left-radius: 5px;
            border-bottom-left-radius: 5px;
            padding-left: 5px;
            min-width: 60px;
            display: flex;
            flex-direction: column;
        }
        .smt_game_button_extra_price,
        .smt_game_button_extra_players {
            line-height: normal;
            height: 50%;
        }
        .smt_btn_override {
            flex-basis: 100%;
            text-align: center;
            padding: 0px;
        }
        #smt_filter_container {
            display: flex;
            column-gap: 0.3em;
            padding-top: 25px;
            padding-right: 7px;
        }
    `);

    const MARKET_MAIN_PATH = "/market/";
    const MARKET_SEARCH_PATH = "/market/search";

    if ([MARKET_MAIN_PATH, MARKET_SEARCH_PATH].includes(location.pathname)) {
        const $J = unsafeWindow.$J;
        const g_oSearchResults = unsafeWindow.g_oSearchResults;
        const walletInfo = unsafeWindow.g_rgWalletInfo;
        const v_currencyformat = unsafeWindow.v_currencyformat;
        const GetCurrencyCode = unsafeWindow.GetCurrencyCode;

        let renderAppsDom;

        const renderVolumeHeaders = () => {
            const width = $J(
                '<div class="market_listing_right_cell market_sortable_column smt_volume_header">VOLUME</div>'
            )
                .insertBefore(
                    ".market_listing_table_header .market_listing_num_listings.market_listing_right_cell"
                )
                .outerWidth();

            const listings = $J(".market_listing_row_link");
            for (let i = 0; i < listings.length; ++i) {
                const volumeElement = $J(
                    `<div class="market_listing_right_cell market_listing_num_listings" style="width: ${width}px">Processing...</div>`
                ).insertBefore(
                    `#result_${i} .market_listing_price_listings_block .market_listing_right_cell.market_listing_num_listings`
                );

                const url = new URL(listings[i].href);
                const { appId, marketHashName } = url.pathname.match(
                    /\/market\/listings\/(?<appId>\d+)\/(?<marketHashName>.*)/
                ).groups;

                renderQueue.push({
                    appId,
                    marketHashName,
                    volumeElement,
                });
            }
        };

        const getPriceOverview = async (appId, marketHashName) => {
            const itemKey = `marketPrice||${appId}||${marketHashName}`;

            const loadCachedPriceOverview = async () => {
                const _cachedData = await GM.getValue(itemKey);
                if (!_cachedData) {
                    return;
                }

                const cachedDate = new Date(_cachedData.cached_time);
                const currentDate = new Date();

                if (currentDate.getTime() - cachedDate.getTime() > 3600000) {
                    // 1 hour is too old
                    return;
                }

                return {
                    lowest_price: _cachedData.lowest_price,
                    success: _cachedData.success,
                    volume: _cachedData.volume,
                    median_price: _cachedData.median_price,
                };
            };
            const saveCachedPriceOverview = async (priceOverview) => {
                const currentDate = new Date();
                priceOverview.cached_time = currentDate.toJSON();

                await GM.setValue(itemKey, priceOverview);
            };
            const doAjax = async (url) => {
                let timeToDelay = 0;

                while (true) {
                    try {
                        return await $J.ajax({
                            url,
                            method: "GET",
                        });
                    } catch {
                        timeToDelay += 1000;
                        await delay(timeToDelay);
                        continue;
                    } finally {
                        await delay(getRandom(2000, 4000));
                    }
                }
            };

            const _cachedData = await loadCachedPriceOverview();
            if (_cachedData) {
                return _cachedData;
            }

            const country = walletInfo.wallet_country;
            const currency = walletInfo.wallet_currency;
            const downloadedData = await doAjax(
                `https://steamcommunity.com/market/priceoverview/?country=${country}&currency=${currency}&appid=${appId}&market_hash_name=${marketHashName}`
            );

            await saveCachedPriceOverview(downloadedData);
            return downloadedData;
        };

        let renderVolumeBusy = false;
        const renderQueue = [];
        const renderVolume = async () => {
            if (renderVolumeBusy) {
                return;
            }

            renderVolumeBusy = true;
            while (renderQueue.length) {
                const { appId, marketHashName, volumeElement } =
                    renderQueue.shift();
                if (!volumeElement[0].isConnected) {
                    continue;
                }
                const priceOverview = await getPriceOverview(
                    appId,
                    marketHashName
                );
                volumeElement.text(priceOverview?.volume ?? "0");
            }
            renderVolumeBusy = false;
        };

        const renderAppsSideMenu = async () => {
            const filterEvent = (apps, type) => {
                const clearTypes = () => {
                    $J("#smt_btn_filterNameType").text("");
                    $J("#smt_btn_filterPriceType").text("");
                    $J("#smt_btn_filterPlayersType").text("");
                };
                const render = () => {
                    const appsDom = [];
                    for (const app of apps) {
                        appsDom.push(app.element);
                    }
                    renderAppsDom(appsDom);
                };
                const sort = (selector, filterFnAsc, filterFnDesc) => {
                    const filterElement = $J(selector);
                    const arrowText = filterElement.text();

                    if (!arrowText || arrowText === "▲") {
                        clearTypes();
                        filterElement.text("▼");
                        apps.sort(filterFnAsc);
                    } else {
                        clearTypes();
                        filterElement.text("▲");
                        apps.sort(filterFnDesc);
                    }
                };

                if (type === 0) {
                    clearTypes();
                    $J(".game_button").remove();
                    apps.sort((a, b) => a.defaultIndex - b.defaultIndex);
                    render();
                } else if (type === 1) {
                    sort(
                        "#smt_btn_filterNameType",
                        (a, b) => {
                            const nameA = a.name.toLowerCase();
                            const nameB = b.name.toLowerCase();

                            if (nameA < nameB) {
                                return -1;
                            }
                            if (nameA > nameB) {
                                return 1;
                            }
                            return 0;
                        },
                        (a, b) => {
                            const nameA = a.name.toLowerCase();
                            const nameB = b.name.toLowerCase();

                            if (nameA < nameB) {
                                return 1;
                            }
                            if (nameA > nameB) {
                                return -1;
                            }
                            return 0;
                        }
                    );
                    render();
                } else if (type === 2) {
                    sort(
                        "#smt_btn_filterPriceType",
                        (a, b) => b.price - a.price,
                        (a, b) => a.price - b.price
                    );
                    render();
                } else {
                    sort(
                        "#smt_btn_filterPlayersType",
                        (a, b) => b.currentPlayers - a.currentPlayers,
                        (a, b) => a.currentPlayers - b.currentPlayers
                    );
                    render();
                }
            };
            const getStoreUpdatesDate = () => {
                const currentDate = new Date();
                let day = currentDate.getUTCDate();
                if (currentDate.getUTCHours() >= 17) {
                    ++day;
                }
                return {
                    lastUpdate: Date.UTC(
                        currentDate.getUTCFullYear(),
                        currentDate.getUTCMonth(),
                        day - 1,
                        17,
                        0,
                        0,
                        0
                    ),
                    nextUpdate: Date.UTC(
                        currentDate.getUTCFullYear(),
                        currentDate.getUTCMonth(),
                        day,
                        17,
                        0,
                        0,
                        0
                    ),
                };
            };

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

            spinner.insertAfter(
                "#browseItems .market_search_sidebar_section_tip_small"
            );

            const appCards = $J(".game_button");
            const apps = [];

            for (let i = 0; i < appCards.length; ++i) {
                const app = {
                    element: appCards[i],
                    // 47 is exact place where "=" symbol ends
                    appId: Number(appCards[i].href.substring(47)),
                    name: $J(".game_button_game_name", $J(appCards[i]))
                        .text()
                        .strip(),
                    price: null, // -1 means not sellable
                    defaultIndex: i,
                    currentPlayers: null,
                    cachedTime: new Date(0),
                };
                const appKey = `appPrice||${app.appId}`;
                const _cachedData = await GM.getValue(appKey);
                const cachedDate = new Date(_cachedData?.cachedTime ?? 0);
                const currentDate = new Date();
                const storeUpdates = getStoreUpdatesDate();
                if (
                    _cachedData?.price &&
                    storeUpdates.lastUpdate <=
                        cachedDate.getTime() <
                        storeUpdates.nextUpdate
                ) {
                    app.price = _cachedData.price;
                }
                if (
                    _cachedData?.currentPlayers &&
                    currentDate.getTime() - cachedDate.getTime() < 3600000
                ) {
                    app.currentPlayers = _cachedData.currentPlayers;
                }

                apps.push(app);
            }

            const priceUnchekedApps = [];
            apps.filter((app) => app.price === null).forEach((app) =>
                priceUnchekedApps.push(app.appId)
            );
            if (priceUnchekedApps.length != 0) {
                const pricesResult = await $J.ajax({
                    method: "GET",
                    url: `https://store.steampowered.com/api/appdetails?appids=${priceUnchekedApps.join(
                        ","
                    )}&cc=${walletInfo.wallet_country}&filters=price_overview`,
                });
                apps.forEach(async (app) => {
                    if (app.price !== null) {
                        return;
                    }

                    if (!(app.appId in pricesResult)) {
                        app.price = -1;
                        return;
                    }
                    const result = pricesResult[app.appId];
                    app.price = result?.data?.price_overview?.final ?? 0;

                    const appKey = `appPrice||${app.appId}`;
                    const currentDate = new Date();
                    app.cachedTime = currentDate.toJSON();
                    await GM.setValue(appKey, {
                        appId: app.appId,
                        price: app.price,
                        currentPlayers: app.currentPlayers,
                        cachedTime: app.cachedTime,
                    });
                });
            }

            for (const app of apps.filter(
                (app) => app.currentPlayers === null
            )) {
                let playersResult;
                try {
                    playersResult = await getRequest(
                        `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1?appid=${app.appId}`
                    );
                } catch {
                    playersResult = null;
                }
                app.currentPlayers = playersResult?.response?.player_count ?? 0;

                const appKey = `appPrice||${app.appId}`;
                const currentDate = new Date();
                app.cachedTime = currentDate.toJSON();
                await GM.setValue(appKey, {
                    appId: app.appId,
                    price: app.price,
                    currentPlayers: app.currentPlayers,
                    cachedTime: app.cachedTime,
                });
            }

            for (const app of apps) {
                const currencyCode = GetCurrencyCode(
                    walletInfo.wallet_currency
                );
                let priceString;
                if (app.price == -1) {
                    priceString = `<del>${v_currencyformat(
                        0,
                        currencyCode
                    )}</del>`;
                } else {
                    priceString = `${v_currencyformat(
                        app.price,
                        currencyCode
                    )}`;
                }

                const miniFormatter = Intl.NumberFormat("en", {
                    notation: "compact",
                });
                const players = miniFormatter.format(app.currentPlayers);

                $J(".game_button_contents", $J(app.element)).append(
                    `<div class="smt_game_button_extra">
                        <span class="smt_game_button_extra_price">${priceString}</span>
                        <span class="smt_game_button_extra_players">${players}</span>
                    </div>`
                );
            }

            spinner.remove();

            $J(".game_button_contents").css("display", "flex");
            $J(".game_button_game_name").css("flex-grow", "1");

            $J(`<div id="smt_filter_container">
                    <span id="smt_btn_filterDefault" class="pagebtn smt_btn_override">Default</span>
                    <span id="smt_btn_filterName" class="pagebtn smt_btn_override"><span id="smt_btn_filterNameType"></span>Name</span>
                    <span id="smt_btn_filterPrice" class="pagebtn smt_btn_override"><span id="smt_btn_filterPriceType"></span>Price</span>
                    <span id="smt_btn_filterPlayers" class="pagebtn smt_btn_override"><span id="smt_btn_filterPlayersType"></span>Players</span>
                </div>`).insertBefore("#browseItems");

            $J("#smt_btn_filterDefault").on("click", () =>
                filterEvent(apps, 0)
            );
            $J("#smt_btn_filterName").on("click", () => filterEvent(apps, 1));
            $J("#smt_btn_filterPrice").on("click", () => filterEvent(apps, 2));
            $J("#smt_btn_filterPlayers").on("click", () =>
                filterEvent(apps, 3)
            );
        };

        if (location.pathname === MARKET_MAIN_PATH) {
            renderAppsDom = (apps) => {
                for (let i = apps.length; i >= 0; --i) {
                    $J(apps[i]).insertAfter(
                        "#browseItems .market_search_sidebar_section_tip_small"
                    );
                }
            };
            // There are hidden games
            const apps = $J(".game_button");
            $J(".market_show_more_games").remove();
            $J(".market_more_games").remove();
            $J(".market_unvetted_games").remove();
            apps.remove();

            renderAppsDom(apps);
            renderVolumeHeaders();
            renderVolume();
        }

        if (location.pathname === MARKET_SEARCH_PATH) {
            renderAppsDom = (apps) => {
                for (let i = 0; i < apps.length; ++i) {
                    $J(apps[i]).appendTo(".market_search_game_button_group");
                }
            };

            const getSearchParams = () => {
                let params = location.hash.match(
                    /#p(?<page>\d*)_(?<sortColumn>.*)_(?<sortDir>.*)/
                )?.groups;
                if (params) {
                    params.page = Number(params.page) - 1;
                    return params;
                }

                return {
                    page: 0,
                    sortColumn: "popular",
                    sortDir: "desc",
                };
            };

            const _onResponseRenderResults =
                unsafeWindow.CAjaxPagingControls.prototype
                    .OnResponseRenderResults;
            unsafeWindow.CAjaxPagingControls.prototype.OnResponseRenderResults =
                function (transport) {
                    _onResponseRenderResults.call(this, transport);
                    renderVolumeHeaders();
                    renderVolume();
                };

            g_oSearchResults.m_cPageSize = 100;

            const params = getSearchParams();
            g_oSearchResults.m_iCurrentPage = params.page - 1;
            unsafeWindow.g_strSortColumn = params.sortColumn;
            unsafeWindow.g_strSortDir = params.sortDir;
            g_oSearchResults.GoToPage(params.page, true);

            const appsSelector = $J(
                "#market_advancedsearch_appselect_options .popup_item.popup_menu_item.market_advancedsearch_appname"
            );

            // Render apps buttons
            const appsData = [];
            // First one is a <span> with text "All games"
            for (let i = 1; i < appsSelector.length; ++i) {
                const appId = Number($J(appsSelector[i]).attr("data-appid"));
                const appName = $J("span", appsSelector[i]).text().strip();
                const appIcon = $J("img", appsSelector[i]).attr("src");

                appsData.push({
                    appId,
                    appName,
                    appIcon,
                });
            }

            $J(
                '<div id="browseItems" class="responsive_local_menu"><div class=market_search_game_button_group></div></div>'
            ).insertAfter(".market_search_box_container");

            const appsDom = [];
            for (let app of appsData) {
                appsDom.push(
                    $J(`<a href="https://steamcommunity.com/market/search?appid=${app.appId}" class="game_button">
                        <span class="game_button_contents">
                            <span class="game_button_game_icon">
                                <img src="${app.appIcon}" alt="${app.appName}">
                            </span>
                            <span class="game_button_game_name"> ${app.appName} </span>
                        </span>
                    </a>`)
                );
            }
            renderAppsDom(appsDom);
        }

        renderAppsSideMenu();
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const getRandom = (min, max) => Math.random() * (max - min) + min;
    const getRequest = (url) =>
        new Promise((resolve, reject) =>
            GM.xmlHttpRequest({
                url,
                method: "GET",
                onload: (response) => resolve(JSON.parse(response.response)),
                onerror: reject,
            })
        );
})();
