// Ambient declaration so TypeScript accepts side-effect CSS imports like
//   import "./styles/tailwind.css";
// Parcel handles the actual loading at build time.
declare module "*.css";
