import React from "react";
const imageUrl = new URL("../neurai-xna-logo.png", import.meta.url);

export function Loader() {
  return (
    <main className="container">
      <article id="loading" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h3 className="rebel-headline">Neurai Webwallet</h3>
        <img 
          src={imageUrl.href}
          style={{
            height: "512px",
            width: "auto",
            objectFit: "contain"
          }}
        ></img>
      </article>
    </main>
  );
}
