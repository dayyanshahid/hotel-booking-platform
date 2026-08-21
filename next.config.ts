import type { NextConfig } from "next";

/**
 * Where the backend actually lives.
 *
 * Not `NEXT_PUBLIC_API_URL`: that one is inlined into the browser bundle, and
 * having the browser call the backend directly is what this exists to avoid.
 * Read here, at build time, on the server.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:5080").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /**
   * The API is served from this origin and proxied on to the backend.
   *
   * Both portals have done this since they were separated; the consumer site
   * was left behind when its API routes moved out, and nothing replaced them.
   * The result was a front end whose seventy-seven calls all went to a path on
   * its own origin that answered 404 — a site with no hotels, no search, no
   * error worth reading, on a repository where everything builds and every test
   * passes.
   *
   * A rewrite rather than a public origin, for the reason the portals give at
   * length: the browser only ever talks to the host it loaded the page from, so
   * there is no preflight to fail, no CORS allow-list to keep in step with the
   * domains, and the session cookie stays first-party. Third-party cookies are
   * already blocked in Safari and going in Chrome, and a session resting on one
   * stops working on mobile first.
   *
   * Deployments set `API_ORIGIN`; the default is the local backend, because a
   * default that reaches across the internet quietly works against somebody
   * else's data.
   */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },

  /**
   * Ship the supplier catalogues with the functions that read them.
   *
   * The tracer follows `import`, and these are read at run time with
   * `fs.readFile` on paths built from a city slug or a hotel code — so nothing
   * in the build knows the files exist and none of them would be bundled. The
   * failure would be quiet and total: a catalogue committed, present in the
   * repository, missing from the deployment, and a supplier returning no supply
   * while every log looks healthy.
   *
   * Both seeds live here now. TourMind's is the city index, without which their
   * availability call cannot be addressed at all; Hotelbeds' is property
   * content, without which a cold instance pays a request per property out of an
   * allowance of fifty a day and stops being able to search by the fourth.
   *
   * Matched against every route rather than the two that search today, because
   * the next thing to read a catalogue will not think to come back here, and
   * 2.7 MB is cheap beside a supplier silently disappearing.
   */
  outputFileTracingIncludes: {
    "/**": ["./data-seed/**/*"],
  },

  /**
   * Every response is the type it says it is.
   *
   * The API echoes what was typed — a destination query, a trip sentence — and
   * those responses are JSON, which a browser will not execute. That protection
   * lasts exactly as long as the browser believes the content type, and content
   * sniffing is the mechanism by which it stops believing it. One header ends
   * the argument for the whole app rather than for the routes somebody
   * remembered, which is how the logo endpoint already does it.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
