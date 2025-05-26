const username = "your_username"; // Your Letterboxd username
const profile_url = "https://letterboxd.com/" + username;
const MAX_REQUESTS = 5;
const REQUEST_TIMEOUT = 5; // seconds

VERSION = "0.1.1";
const js = `

function getTagValue(parent, tagName, defaultValue="") {

    const elements = parent.getElementsByTagName(tagName);
    if (elements.length == 0) {
        return defaultValue;
    }

    return elements[0].textContent;

}

(function() {
    
    const parser = new DOMParser();
    const items = document.getElementsByTagName("item");
    const results = [];
    
    for (let i = 0; i < Math.min(4, items.length); i++) {

        const item = items[i];
        const link = getTagValue(item, "link");
        const rating = getTagValue(item, "letterboxd:memberRating", -1);

        let poster = "";
        const descriptionContent = getTagValue(item, "description", "");
        if (descriptionContent) {

            const htmlDoc = parser.parseFromString(descriptionContent, "text/html");
            const img = htmlDoc.querySelector("img");
            if (img) {
                src = img.getAttribute("src").replace(" ", "%20") || "";
            }

        }
        
        results.push({ link, rating, src });

    }
    
    return results;
    
})();
`

/* The cache folder stores a log file containing the last version
required for updates to the file structure and each user's last
favourite films displayed along with the last update time. It also
contains the cached movie poster and rating for each film. */
const localFM = FileManager.local();
const documentsPath = localFM.documentsDirectory();
const cachePath = localFM.joinPath(documentsPath, "lbxdwidget_recents_cache");
const logPath = localFM.joinPath(cachePath, "log.json");

if (!localFM.isDirectory(cachePath)) {
    localFM.createDirectory(cachePath, true);
}
if (!localFM.fileExists(logPath)) {
    localFM.writeString(logPath, JSON.stringify({ version: VERSION, users: {} }));
}

async function scrapePoster(src) {

    try {
        const request = new Request(src);
        request.timeoutInterval = REQUEST_TIMEOUT;
        const img = await request.loadImage();
        return img;
    }
    catch (error) {
        // console.error(error);
        return null;
    }

}

async function scrapeFilms() {

    const films = [];
    const filmSlugs = [];
    const filmRatings = [];
    const webview = new WebView();
    const cacheLog = JSON.parse(localFM.readString(logPath));

    for (let i = 0; i < MAX_REQUESTS; i++) {

        // try again if the request fails
        let result;
        try {
            const request = new Request(profile_url + "/rss");
            request.timeoutInterval = REQUEST_TIMEOUT;
            await webview.loadRequest(request);
            result = await webview.evaluateJavaScript(js, false);
        }
        catch (error) {
            // console.error(error);
            continue;
        }

        // we assume that if result.length == 0, the page didn't load fully
        if (!Array.isArray(result) || result.length == 0) continue;
        
        for (let j = 0; j < result.length; j++) {

            const film = result[j];
            const link = film.link;
            const rating = film.rating;
            const src = film.src;

            const slug_match = link.match(/\/film\/([^\/]+)/);
            const slug = slug_match ? slug_match[1] : null;
            if (filmSlugs.includes(slug)) continue;

            // check if the poster is already cached
            const posterPath = localFM.joinPath(cachePath, slug);
            if (localFM.fileExists(posterPath)) {
                const poster = localFM.readImage(posterPath);
                filmSlugs.push(slug);
                filmRatings.push(rating);
                films.push({ slug, poster, rating });
            }

            // if not, download the poster
            else {

                const poster = await scrapePoster(src);
                if (poster) {
                    localFM.writeImage(posterPath, poster);
                    filmSlugs.push(slug);
                    filmRatings.push(rating);
                    films.push({ slug, poster, rating });
                }
            }

        }

        if (filmSlugs.length == result.length) break;

    }

    // update the cache log
    if (films.length == 0 && Object.hasOwn(cacheLog.users, username)) {

        for (let i = 0; i < cacheLog.users[username].filmSlugs.length; i++) {

            const slug = cacheLog.users[username].filmSlugs[i];
            const rating = cacheLog.users[username].ratings[i];
            const posterPath = localFM.joinPath(cachePath, slug);

            if (localFM.fileExists(posterPath)) {
                const poster = localFM.readImage(posterPath);
                films.push({ slug, poster, rating });
            }

        }

        cacheLog.users[username].lastUpdate = Date.now();

    }

    else {
        cacheLog.users[username] = { lastUpdate: Date.now(), filmSlugs: filmSlugs, filmRatings: filmRatings };
    }

    return films;

}

function formatRating(rating) {

    let ratingString = "★".repeat(Math.floor(rating));
    if (rating % 1 !== 0) {
        ratingString += "½";
    }

    return ratingString;

}

async function createWidget() {

    const gradient = new LinearGradient();
    gradient.colors = [new Color("#202831"), new Color("#15191E")];
    gradient.locations = [0, 1];

    const widget = new ListWidget();
    widget.url = profile_url; // universal link
    widget.backgroundGradient = gradient;
    widget.setPadding(4, 4, 4, 4);
    widget.addSpacer();

    const containerStack = widget.addStack();
    containerStack.layoutVertically();

    const titleStack = containerStack.addStack();
    titleStack.url = profile_url;
    titleStack.addSpacer();

    const title = titleStack.addText("Recents");
    title.font = Font.semiboldRoundedSystemFont(16);
    titleStack.addSpacer();

    containerStack.addSpacer(12);

    const filmRowStack = containerStack.addStack();
    filmRowStack.centerAlignContent();
    filmRowStack.addSpacer();
    
    const films = await scrapeFilms();
    for (let i = 0; i < films.length; i++) {

        const film = films[i];
        const posterStack = filmRowStack.addStack();
        posterStack.url = "https://letterboxd.com/film/" + film.slug; // universal link
        posterStack.layoutVertically();
        
        const photoStack = posterStack.addStack();
        photoStack.addSpacer();
        
        const posterPhoto = photoStack.addImage(film.poster);
        posterPhoto.imageSize = new Size(60, 90);
        posterPhoto.cornerRadius = 10;
        posterPhoto.applyFillingContentMode();
        
        photoStack.addSpacer();
        posterStack.addSpacer(4);

        const ratingStack = posterStack.addStack();
        ratingStack.addSpacer();

        const ratingText = ratingStack.addText((film.rating == -1) ? " " : formatRating(film.rating));
        ratingText.font = Font.mediumSystemFont(10);

        ratingStack.addSpacer();
        posterStack.addSpacer();

    }

    filmRowStack.addSpacer();
    widget.addSpacer();

    Script.setWidget(widget);
    return widget;

}

const widget = await createWidget();
widget.presentMedium();
Script.complete();