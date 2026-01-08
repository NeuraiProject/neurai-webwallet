import React from "react";

export function LabeledContent({ label, children }) {
  return (
    <div className="rebel-history__labeled">
      <div>{label}</div>
      <div>{children}</div>
    </div>
  );
}
