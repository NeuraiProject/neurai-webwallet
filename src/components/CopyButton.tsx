import React from "react";

import { CopyIcon } from "../icons";
import "./CopyButton.css";
export function CopyButton({ value, title }: { value: string; title: string }) {
  return (
    <button
      className="outline rebel-copy-button"
      title={title}
      onClick={(event) => {
        navigator.clipboard.writeText(value);
      }}
    >
      <CopyIcon />
    </button>
  );
}
