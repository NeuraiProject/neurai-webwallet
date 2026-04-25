import React from "react";
import { CopyIcon } from "../icons";

export function CopyButton({ value, title }: { value: string; title: string }) {
  return (
    <button
      type="button"
      className="neurai-btn--icon"
      title={title}
      onClick={() => {
        navigator.clipboard.writeText(value);
      }}
    >
      <CopyIcon />
    </button>
  );
}
