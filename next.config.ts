import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
