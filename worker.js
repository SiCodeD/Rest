function getRestaurantSlug(pathname) {
    const match = pathname.match(/^\/([^/?.]+)\/?$/);
    if (!match) return "";

    let slug;
    try {
        slug = decodeURIComponent(match[1]).toLowerCase();
    } catch {
        return "";
    }

    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const slug = getRestaurantSlug(url.pathname);

        if (slug && ["GET", "HEAD"].includes(request.method)) {
            url.pathname = "/Pages/Menu.html";
            url.searchParams.set("slug", slug);
            url.searchParams.set("mode", "public");
            return env.ASSETS.fetch(new Request(url, request));
        }

        return env.ASSETS.fetch(request);
    },
};