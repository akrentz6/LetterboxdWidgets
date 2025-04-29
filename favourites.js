const username = "your_username"; // Your Letterboxd username
const profile_url = "https://letterboxd.com/" + username;
const MAX_REQUESTS = 5;
const REQUEST_TIMEOUT = 10; // seconds

VERSION = "0.1.1";
const js = `
(function() {
    
    const section = document.getElementById("favourites");
    if (!section) {
        return null;
    }
    
    const filmList = section.querySelector("ul");
    if (!filmList) {
        return null;
    }
    
    const films = filmList.getElementsByTagName("li");
    const results = [];
    
    for (let i = 0; i < films.length; i++) {
        
        const film = films[i];
        
        const filmDiv = film.querySelector("div[data-film-slug]");
        if (!filmDiv) {
            continue;
        }
        
        const filmSlug = filmDiv.getAttribute("data-film-slug");
        if (!filmSlug) {
            continue;
        }
        
        const img = filmDiv.querySelector("img");
        const src = img ? img.getAttribute("srcset").replace(" ", "%20") : null;
        
        if (filmSlug && src) {
            results.push({ filmSlug, src });
        }
        
    }
        
    return results;
    
})();
`;

/* The cache folder stores a log file containing the last version
required for updates to the file structure and each user's last
favourite films displayed along with the last update time. It also
contains the cached movie poster for each film. */
const localFM = FileManager.local();
const documentsPath = localFM.documentsDirectory();
const cachePath = localFM.joinPath(documentsPath, "lbxdwidget_favourites_cache");
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
    const webview = new WebView();
    const cacheLog = JSON.parse(localFM.readString(logPath));

    for (let i = 0; i < MAX_REQUESTS; i++) {
        
        // try again if the request fails
        let result;
        try {
            const request = new Request(profile_url);
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
            const slug = film.filmSlug;
            const src = film.src;

            if (filmSlugs.includes(slug)) continue;
            
            // check if the poster is already cached
            const posterPath = localFM.joinPath(cachePath, slug);
            if (localFM.fileExists(posterPath)) {
                const poster = localFM.readImage(posterPath);
                filmSlugs.push(slug);
                films.push({ slug, poster });
            }

            // if not, download the poster
            else {

                // sometimes letterboxd does a 'lazy load' of the page
                if (src.includes("empty-poster")) continue;

                const poster = await scrapePoster(src);
                if (poster) {
                    localFM.writeImage(posterPath, poster);
                    filmSlugs.push(slug);
                    films.push({ slug, poster });
                }
            }

        }

        if (filmSlugs.length == result.length) break;

    }

    // update the cache log
    if (films.length == 0 && Object.hasOwn(cacheLog.users, username)) {

        for (let i = 0; i < cacheLog.users[username].filmSlugs.length; i++) {

            const slug = cacheLog.users[username].filmSlugs[i];
            const posterPath = localFM.joinPath(cachePath, slug);

            if (localFM.fileExists(posterPath)) {
                const poster = localFM.readImage(posterPath);
                films.push({ slug, poster });
            }

        }

        cacheLog.users[username].lastUpdate = Date.now();

    }

    else {
        cacheLog.users[username] = { lastUpdate: Date.now(), filmSlugs: filmSlugs };
    }

    return films;

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

    const title = titleStack.addText("Favourites");
    title.font = Font.semiboldRoundedSystemFont(16);
    titleStack.addSpacer();

    containerStack.addSpacer(16);

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