import React from "react";
import { FaImage } from "react-icons/fa6";

type AssetPlaceholderProps = {
  size?: number;
  title?: string;
} & React.SVGAttributes<SVGElement>;

export function AssetPlaceholder({
  size = 32,
  title = "Asset placeholder",
  className,
  ...props
}: AssetPlaceholderProps) {
  return (
    <FaImage
      size={size}
      title={title}
      aria-hidden={title ? undefined : true}
      className={`inline-flex items-center justify-center text-base-content/60 align-middle ${className ?? ""}`.trim()}
      {...props}
    />
  );
}
