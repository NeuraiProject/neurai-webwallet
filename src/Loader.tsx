import React from "react";
//@ts-ignore
import logo from "../neurai-xna-logo.png";
export function Loader() {
  return (
    <main className="container">
      <article id="loading">
        <h1 className="rebel-headline">Neurai wallet</h1>
        <img src={logo}></img>
      </article>
    </main>
  );
}
