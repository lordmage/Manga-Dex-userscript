// ==UserScript==
// @name         MangaDex++ Enhanced
// @namespace    https://github.com/MangaDexPP/userscript
// @version      1.0.6
// @description  Enhanced QOL features for MangaDex with stable controls and filtering
// @match        https://mangadex.org/*
// @match        http://mangadex.org/*
// @icon         https://icons.duckduckgo.com/ip2/www.mangadex.org.ico
// @grant        none
// ==/UserScript==

//------------------------------------------------//
//------------------CONFIGURABLE------------------//
//------------------------------------------------//

//-------------------UNIVERSAL--------------------//
const POLLING_TIME = 100;
const API_REQUEST_INTERVAL = 1000;

//--------------------TRACKER---------------------//
const READ_BUTTON_COLOR = "#13ab493d";
const IGNORE_BUTTON_COLOR = "#ab13133d";
const UNMARKED_BUTTON_COLOR = "#4242cd3d";
const HIDE_ALL_READ_BUTTON_COLOR = "#ff80003d";

//-----------------HIDE ALL READ------------------//
const DOES_HIDE_ALL_READ = true;

//------------------BLOCK USERS-------------------//
const USER_LIST = [];
const GROUP_LIST = [];
const TAG_LIST = ["boys' love"]; // IMPORTANT: Use all lowercase

//------------------------------------------------//
//------------------DO NOT TOUCH------------------//
//------------------------------------------------//
let hideRead = false;
let hideIgnore = true;
let hideUnmarked = false;
let hideAllRead = true;
let forceRecheckNewEntry = false;
let queue = [];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const CATEGORY_FEED = "/titles/feed";
const CATEGORY_FOLLOWS = "/titles/follows";
const CATEGORY_HISTORY = "/my/history";
const CATEGORY_ALL = "/titles";
const CATEGORY_RECENT = "/titles/recent";
const CATEGORY_LATEST = "/titles/latest";
const CATEGORY_AUTHOR = "/author/";
const CATEGORY_GROUP = "/group/";
const CATEGORY_TITLE = "/title/";
const CATEGORY_TAGS = "/tag/";

const FORMAT_NOT_FOUND = 0;
const FORMAT_LIST = 1;
const FORMAT_THUMBNAIL = 2;
const FORMAT_DETAIL = 3;

// ================ ENHANCED UTILITIES ================
function extractIdFromHref(href) {
    if (!href) return null;
    const m = href.match(UUID_RE);
    if (m) return m[0];
    const parts = href.split("/");
    for (const p of parts) if (p && p.length >= 10) return p;
    return null;
}

function getFormat(pathname) {
    if (pathname.startsWith(CATEGORY_TITLE)) {
        return FORMAT_DETAIL;
    }
    if (pathname.startsWith(CATEGORY_GROUP)) {
        return FORMAT_LIST;
    }
    if (pathname.startsWith(CATEGORY_AUTHOR)) {
        return FORMAT_THUMBNAIL;
    }
    if (pathname.startsWith(CATEGORY_TAGS)) {
        return FORMAT_THUMBNAIL;
    }
    switch (pathname) {
        case CATEGORY_FEED:
            return FORMAT_LIST;
        case CATEGORY_FOLLOWS:
            return FORMAT_THUMBNAIL;
        case CATEGORY_HISTORY:
            return FORMAT_LIST;
        case CATEGORY_ALL:
            return FORMAT_THUMBNAIL;
        case CATEGORY_RECENT:
            return FORMAT_THUMBNAIL;
        case CATEGORY_LATEST:
            return FORMAT_LIST;
        default:
            return FORMAT_NOT_FOUND;
    }
}

// ================ PER-TITLE CONTROLS ================
function createControlsRow(entryID, format) {
    const row = document.createElement("div");
    row.className = "mangadexpp-controls";
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.marginTop = "6px";
    
    // Fix: Always use flex-start for left alignment in all formats
    row.style.justifyContent = "flex-start";

    row.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    });

    function mk(label, cls, cb) {
        const b = document.createElement("input");
        b.type = "button";
        b.value = label;
        b.className = cls;
        b.setAttribute("entryid", entryID);
        b.style.padding = "0 8px";
        b.style.borderRadius = "4px";
        b.style.cursor = "pointer";
        b.style.background = "transparent";
        b.style.boxShadow = "inset 0 0 3px 1px #ddd";
        b.style.border = "none";
        b.style.fontSize = "12px";
        b.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            cb(entryID);
            applyFilters();
            return false;
        });
        return b;
    }

    row.appendChild(mk("Read", "mangadexpp-read", id => localStorage.setItem(id, "1")));
    row.appendChild(mk("Ignore", "mangadexpp-ignore", id => localStorage.setItem(id, "-1")));
    row.appendChild(mk("Clear", "mangadexpp-clear", id => localStorage.removeItem(id)));

    return row;
}

function insertControlsForMangaCard(card, format) {
    try {
        // Find the title link in the manga card
        const titleLink = card.querySelector("a[href*='/title/']");
        if (!titleLink) return;
        
        const href = titleLink.getAttribute("href") || titleLink.href || "";
        const id = extractIdFromHref(href);
        if (!id) return;
        
        // Check if controls already exist
        if (card.querySelector(`.mangadexpp-controls input[entryid="${id}"]`)) return;
        
        // Find where to insert controls - look for status or body
        const status = card.querySelector(".status");
        const body = card.querySelector(".manga-card-body");
        
        const controls = createControlsRow(id, format);
        
        if (status) {
            // Insert after status
            status.parentNode.insertBefore(controls, status.nextSibling);
        } else if (body) {
            // Append to body
            body.appendChild(controls);
        } else {
            // Append to card as fallback
            card.appendChild(controls);
        }
    } catch (e) {
        console.debug("Control insertion failed for manga card:", e);
    }
}

function insertControlsForFeedContainer(container, format) {
    try {
        const titleLink = container.querySelector(".chapter-feed__title");
        if (!titleLink) return;
        
        const href = titleLink.getAttribute("href") || titleLink.href || "";
        const id = extractIdFromHref(href);
        if (!id) return;
        
        if (container.querySelector(`.mangadexpp-controls input[entryid="${id}"]`)) return;
        
        const titleContainer = titleLink.parentElement;
        const controls = createControlsRow(id, format);
        
        // For feed format, insert after the title
        if (titleContainer) {
            titleContainer.appendChild(controls);
        } else {
            container.appendChild(controls);
        }
    } catch (e) {
        console.debug("Control insertion failed for feed:", e);
    }
}

function addControlsToAll(format) {
    // Handle manga cards (thumbnail format)
    if (format === FORMAT_THUMBNAIL) {
        document.querySelectorAll(".manga-card, .md-card, .group.md-card").forEach(card => {
            insertControlsForMangaCard(card, format);
        });
    }
    // Handle feed containers (list format)
    else if (format === FORMAT_LIST) {
        document.querySelectorAll(".chapter-feed__container").forEach(container => {
            insertControlsForFeedContainer(container, format);
        });
    }
}

// ================ FEED UNREAD DETECTION ================
function hasUnreadChaptersInFeedContainer(container) {
    const list = container.querySelector(".chapter-feed__chapters-list");
    if (!list) return null;
    const unread = list.querySelector(".readMarker:not(.opacity-40)");
    return !!unread;
}

function hideAllReadFeed() {
    if (!DOES_HIDE_ALL_READ) return;
    document.querySelectorAll(".chapter-feed__container").forEach(cont => {
        if (cont.closest(".layout-container")) {
            cont.style.display = "";
            return;
        }
        if (!hideAllRead) {
            if (cont.hasAttribute("feed-allread-hide")) {
                cont.removeAttribute("feed-allread-hide");
                cont.style.display = "";
            }
            return;
        }
        const unread = hasUnreadChaptersInFeedContainer(cont);
        if (unread === null) return;
        const allRead = unread === false;
        if (allRead) {
            cont.style.display = "none";
            cont.setAttribute("feed-allread-hide", "true");
        } else {
            if (cont.hasAttribute("feed-allread-hide")) {
                cont.removeAttribute("feed-allread-hide");
                cont.style.display = "";
            }
        }
    });
}

// ================ FILTER LOGIC ================
function syncColors(row, flag) {
    try {
        const readBtn = row.querySelector(".mangadexpp-read");
        const ignoreBtn = row.querySelector(".mangadexpp-ignore");
        if (readBtn) readBtn.style.background = flag === "1" ? READ_BUTTON_COLOR : "transparent";
        if (ignoreBtn) ignoreBtn.style.background = flag === "-1" ? IGNORE_BUTTON_COLOR : "transparent";
    } catch (e) { }
}

function applyFilters() {
    // Hide duplicate top control bars
    document.querySelectorAll(".controls").forEach((c, i) => {
        if (i > 0) c.style.display = "none";
    });

    document.querySelectorAll(".mangadexpp-controls").forEach(row => {
        const inp = row.querySelector("input[entryid]");
        if (!inp) return;
        const id = inp.getAttribute("entryid");
        const flag = localStorage.getItem(id);

        const cont = row.closest(".chapter-feed__container") ||
                     row.closest(".manga-card") ||
                     row.closest(".md-card") ||
                     row.closest(".group.md-card") ||
                     row.closest(".card") ||
                     row.closest("li") ||
                     row.closest("article");

        if (!cont) return;

        // Never hide content on title detail pages
        if (cont.closest(".layout-container")) {
            syncColors(row, flag);
            cont.style.display = "";
            return;
        }

        let shouldHide = false;
        if (flag === "1") shouldHide = hideRead;
        else if (flag === "-1") shouldHide = hideIgnore;
        else shouldHide = hideUnmarked;

        cont.style.display = shouldHide ? "none" : "";
        syncColors(row, flag);
    });

    // Apply feed-only hide-all-read
    hideAllReadFeed();
}

// ================ TOP CONTROLS ================
function addTopControls() {
    const allControls = document.querySelectorAll(".controls");
    if (!allControls || allControls.length === 0) return;
    const controls = allControls[0];
    if (controls.classList.contains("mangadexpp-has-controls")) return;
    controls.classList.add("mangadexpp-has-controls");
    for (let i = 1; i < allControls.length; i++) try {
        allControls[i].style.display = "none";
    } catch (e) { }

    function mk(label, get, set, color, cb) {
        const b = document.createElement("input");
        b.type = "button";
        b.value = label;
        b.style.padding = "0 1em";
        b.style.marginLeft = "6px";
        b.style.borderRadius = "4px";
        b.style.cursor = "pointer";
        b.style.backgroundColor = get() ? color : "transparent";
        b.style.boxShadow = "inset 0 0 3px 1px #ddd";
        b.style.border = "none";
        b.addEventListener("click", () => {
            const v = !get();
            set(v);
            b.style.backgroundColor = v ? color : "transparent";
            applyFilters();
            if (typeof cb === "function") cb();
        });
        return b;
    }

    controls.appendChild(mk("Toggle Read", () => hideRead, v => hideRead = v, READ_BUTTON_COLOR));
    controls.appendChild(mk("Toggle Ignore", () => hideIgnore, v => hideIgnore = v, IGNORE_BUTTON_COLOR));
    controls.appendChild(mk("Toggle Unmarked", () => hideUnmarked, v => hideUnmarked = v, UNMARKED_BUTTON_COLOR));
    if (DOES_HIDE_ALL_READ) controls.appendChild(mk("Hide All Read?", () => hideAllRead, v => hideAllRead = v, HIDE_ALL_READ_BUTTON_COLOR, hideAllReadFeed));
}

// ================ ORIGINAL FUNCTIONALITY ================
function blockUsers(format) {
    if (format == FORMAT_LIST) {
        // Completely remove chapter listing if all blocked
        var chapters = document.querySelectorAll(".chapter-feed__container");
        var toRemove = [];
        for (var i = 0; i < chapters.length; i++) {
            if (chapters[i].querySelectorAll(".chapter-grid.flex-grow").length == 0) {
                toRemove.push(chapters[i]);
            }
        }
        for (var i = 0; i < toRemove.length; i++) {
            var allChildren = document.querySelectorAll(".page-container > div");
            allChildren[allChildren.length - 1].removeChild(toRemove[i]);
        }
    }

    // Should work for both chapter listing in feeds and in manga page
    var chapterRows = document.querySelectorAll(".chapter-grid.flex-grow");
    for (var i = 0; i < chapterRows.length; i++) {
        var row = chapterRows[i];
        var uploader = row.querySelector(".user-tag > .line-clamp-1");
        if ((uploader != null && USER_LIST.includes(uploader.innerText)) || GROUP_LIST.includes(row.querySelector(".group-tag").innerText)) {
            row.parentNode.parentNode.removeChild(row.parentNode);
        }
    }
}

function checkPage(entryID) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', "https://api.mangadex.org/manga/" + entryID, true);
    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            var metadata = JSON.parse(xhr.responseText);
            parseAndHandleEntry(entryID, metadata);
        } else {
            console.error('Failed to fetch entry ' + entryID + ' with status ' + xhr.status);
        }
    };
    xhr.onerror = function () {
        console.error('Failed to fetch entry ' + entryID);
    };
    xhr.send();
}

function parseAndHandleEntry(entryID, metadata) {
    if (metadata["result"] != "ok") {
        console.error('Failed to fetch entry ' + entryID);
        return;
    }
    var tags = metadata["data"]["attributes"]["tags"];
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i]["attributes"]["name"]["en"].toLowerCase();
        // Blacklisted tag
        if (TAG_LIST.includes(tag)) {
            console.log("Ignore " + entryID + " due to blacklisted tag: " + tag);
            window.localStorage.setItem(entryID, -1);
            return;
        }
    }
    // Checked, but do nothing about it
    window.localStorage.setItem(entryID, -2);
}

function handle_queue() {
    if (queue.length > 0) {
        var entryID = queue.shift();
        console.debug("Popped ID " + entryID);
        checkPage(entryID);
    }
    setTimeout(handle_queue, API_REQUEST_INTERVAL);
}

function main() {
    var lastTagList = window.localStorage.getItem("_conf_tags");
    var currentTagList = TAG_LIST.toLocaleString();
    if (lastTagList != currentTagList) {
        forceRecheckNewEntry = true;
        window.localStorage.setItem("_conf_tags", currentTagList);
    }
    handleBaseUrl(window.location.href);
    setTimeout(main, POLLING_TIME);
}

function handleBaseUrl(baseUrl) {
    var url = new URL(baseUrl);
    var format = getFormat(url.pathname);

    blockUsers(format);
    if (format === FORMAT_NOT_FOUND) {
        return;
    }

    addTopControls();
    addControlsToAll(format);
    applyFilters();
}

// ================ INITIALIZATION ================
(function () {
    "use strict";

    // Start queue handler
    setTimeout(handle_queue, API_REQUEST_INTERVAL);

    // Setup MutationObserver for dynamic content
    let scheduled = false;
    function scheduleRun() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            try {
                main();
            } catch (e) {
                console.error(e);
            }
        }, 150);
    }

    new MutationObserver(scheduleRun).observe(document.body, { childList: true, subtree: true });

    // Initial run
    scheduleRun();
})();
