import React from "react";
import { IconSun, IconMoon } from "../icons";

/*

  Modify the HTML element on switch light/dark mode
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
    <div className="rebel-login__topbar-icon" onClick={toggleMode} title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
      {isDarkMode ? <IconSun /> : <IconMoon />}
    </div>
  );
}
