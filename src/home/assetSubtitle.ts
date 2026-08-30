/**
 * The line under an asset's name in the home list.
 *
 * Pure and separate so the ordering of these rules is pinned by tests: an owner
 * token must be recognised before anything else, because "&TRAIN!" is the key
 * to &TRAIN rather than a holding of it, and calling it a DePIN token is
 * exactly backwards.
 */
export function subtitleFor(assetName: string, meta?: { has_ipfs?: number; ipfs_hash?: string }): string {
  // An owner token is what lets you administer the asset — reissue it, freeze
  // it, issue its sub-assets. That matters more than what kind of asset it
  // belongs to, so it is said first and it wins over every other label.
  if (assetName.endsWith("!")) return `Asset Master \u00b7 ${assetName.slice(0, -1)}`;

  if (meta?.has_ipfs && meta.ipfs_hash) {
    return `IPFS \u00b7 ${meta.ipfs_hash.slice(0, 6)}\u2026${meta.ipfs_hash.slice(-4)}`;
  }
  if (assetName.startsWith("&")) return "DePIN token";
  if (assetName.startsWith("#")) return "Qualifier";
  if (assetName.includes("/")) return `Sub-asset of ${assetName.slice(0, assetName.lastIndexOf("/"))}`;
  return "Asset";
}
