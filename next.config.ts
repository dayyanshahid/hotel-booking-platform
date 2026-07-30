import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Ship the supplier catalogue with the functions that read it.
   *
   * The tracer follows `import`, and this is read at run time with
   * `fs.readFile` on a path built from a city slug — so nothing in the build
   * knows the files exist and none of them would be bundled. The failure would
   * be quiet and total: the catalogue committed, present in the repository,
   * missing from the deployment, and TourMind returning no supply while every
   * log looks healthy.
   *
   * Matched against every route rather than the two that search today, because
   * the next thing to read a catalogue will not think to come back here, and
   * 1.7 MB is cheap beside a supplier silently disappearing.
   */
  outputFileTracingIncludes: {
    "/**": ["./data-seed/**/*"],
  },
};

export default nextConfig;
