import React from "react";
const imageUrl = new URL("../public/neurai-xna-logo.png", import.meta.url);

export function Loader() {
  return (
    <div id="loading" className="neurai-card flex flex-col items-center">
      <h3 className="text-2xl font-semibold text-primary m-0">Neurai Webwallet</h3>
      <img src={imageUrl.href} className="max-h-[60vh] w-auto object-contain" />
    </div>
  );
}
