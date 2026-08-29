/**
 * @jest-environment jsdom
 */

// The entry point is part of the product rule: on a chain without DePIN the
// Chat button is not merely inert, it says why. A disabled control with no
// reason is the same dead end, just quieter.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NavItem } from "@/NavItem";
import { Routes } from "@/Routes";
import { chatAvailability } from "@/depin/network";

/** Renders the Chat entry exactly as `Navigator` builds it for a given chain. */
function renderChatEntry(network: string): string {
  const chat = chatAvailability(network);
  const reason = chat.available ? undefined : chat.message;
  return renderToStaticMarkup(
    React.createElement(NavItem, {
      currentRoute: Routes.HOME,
      route: Routes.CHAT,
      setRoute: () => undefined,
      title: "Chat",
      variant: "full",
      disabled: Boolean(reason),
      disabledReason: reason,
    }),
  );
}

describe("Chat entry point", () => {
  it("is reachable on testnet", () => {
    const html = renderChatEntry("xna-test");

    expect(html).toContain('href="#"');
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("sr-only");
  });

  it("is closed on mainnet, and says why", () => {
    const html = renderChatEntry("xna");

    expect(html).toContain("DePIN messaging is not available on mainnet yet.");
    expect(html).toContain('aria-disabled="true"');
    // No href: the control leaves the tab order instead of looking active.
    expect(html).not.toContain('href="#"');
  });

  it("is closed on post-quantum wallets, for a different stated reason", () => {
    const html = renderChatEntry("xna-pq-test");

    expect(html).toContain("post-quantum");
    expect(html).not.toContain("mainnet");
  });

  it("associates the reason with the control instead of hiding it in a tooltip", () => {
    // A `title` alone is invisible to a screen reader and to touch.
    const html = renderChatEntry("xna-legacy");

    expect(html).toContain(`aria-describedby="nav-${Routes.CHAT}-reason"`);
    expect(html).toContain(`id="nav-${Routes.CHAT}-reason"`);
  });

  it("leaves every other entry untouched", () => {
    const html = renderToStaticMarkup(
      React.createElement(NavItem, {
        currentRoute: Routes.HOME,
        route: Routes.SEND,
        setRoute: () => undefined,
        title: "Send",
        variant: "full",
      }),
    );

    expect(html).toContain('href="#"');
    expect(html).not.toContain("aria-disabled");
  });
});
