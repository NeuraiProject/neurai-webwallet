/**
 * @jest-environment jsdom
 */

// Privacy Pool is announced before it exists: a reachable entry with its own
// icon, and a page that says it is coming rather than an empty screen.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NavItem } from "@/NavItem";
import { PrivacyPool } from "@/PrivacyPool";
import { Routes } from "@/Routes";

describe("Privacy Pool", () => {
  it("has a reachable navigation entry with the keyhole shield icon", () => {
    const html = renderToStaticMarkup(
      React.createElement(NavItem, {
        currentRoute: Routes.HOME,
        route: Routes.PRIVACY,
        setRoute: () => undefined,
        title: "Privacy Pool",
        variant: "full",
      }),
    );

    expect(html).toContain('href="#"');
    expect(html).toContain("Privacy Pool");
    expect(html).toContain('<circle cx="12" cy="10" r="2"></circle>');
  });

  it("shows only its title and that it is coming soon", () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPool));

    expect(html).toContain("Privacy Pool");
    expect(html).toContain("Soon");
  });
});
