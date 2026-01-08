import React from "react";
import { FaImage } from "react-icons/fa6";
import "./AssetPlaceholder.css";

type AssetPlaceholderProps = {
  size?: number;
  title?: string;
} & React.SVGAttributes<SVGElement>;

export function AssetPlaceholder({
  size = 32,
  title = "Asset placeholder",
  ...props
}: AssetPlaceholderProps) {
  return (
    <FaImage
      size={size}
      title={title}
      aria-hidden={title ? undefined : true}
      data-asset-placeholder="true"
      {...props}
    />
  );
}
