import React from "react";
const imageUrl = new URL("../public/neurai-xna-logo.png", import.meta.url);
import "./Loader.css";

export function Loader() {
  return (
    <main className="container">
      <article id="loading" className="rebel-loader__layout">
        <h3 className="rebel-headline">Neurai Webwallet</h3>
        <img src={imageUrl.href} className="rebel-loader__logo" />
      </article>
    </main>
  );
}
