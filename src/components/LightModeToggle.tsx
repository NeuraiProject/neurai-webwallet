import React from "react";
import { IconSun, IconMoon } from "../icons";

/**
 * Toggle the wallet's color theme by flipping the `data-theme` attribute on
 * `<html>`. The values match DaisyUI's registered theme names (`light` /
 * `dark`) so a single attribute drives both DaisyUI and any leftover Pico
 * `[data-theme="..."]` selectors.
 */
export function LightModeToggle() {
  const element = document.querySelector("html");
  const attr = element?.getAttribute("data-theme");
  const [isDarkMode, setIsDarkMode] = React.useState(attr === "dark");

  const toggleMode = () => {
    const text = isDarkMode ? "light" : "dark";
    element?.setAttribute("data-theme", text);
    localStorage.setItem("data-theme", text);
    setIsDarkMode(!isDarkMode);
  };

  return (
    <button
      type="button"
      className="neurai-btn--icon"
      onClick={toggleMode}
      title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {isDarkMode ? <IconSun /> : <IconMoon />}
    </button>
  );
}
