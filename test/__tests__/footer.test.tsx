import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Footer } from "@/Footer";

// The footer names the release, taken from package.json like the header, so
// a version bump can never leave it behind.
test("the footer shows the wallet version from package.json", () => {
  const { version } = require("../../package.json") as { version: string };
  const text = renderToStaticMarkup(<Footer />).replace(/<[^>]+>/g, "");

  expect(text).toContain(`Neurai Webwallet ${version} © 2026`);
});
