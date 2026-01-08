/**
 * Asset utilities for the Neurai WebWallet
 * Functions for classifying and working with Neurai assets
 */

import React from 'react';
import { AssetPlaceholder } from "../components/AssetPlaceholder";

// Decorative icon properties for accessibility
const decorativeIconProps = { role: "presentation", "aria-hidden": true };

/**
 * Determines the type of a Neurai asset based on its prefix
 *
 * Asset types:
 * - DePIN: Prefix '&' - Used for decentralized physical infrastructure networks
 * - Qualifier: Prefix '#' - Used for asset qualifiers/tags
 * - Normal: No special prefix - Standard assets
 *
 * @param assetName - The name of the asset
 * @returns The asset type: 'depin', 'qualifier', or 'normal'
 *
 * @example
 * getAssetType("&TESTDEPIN112025") // Returns 'depin'
 * getAssetType("#VERIFIED") // Returns 'qualifier'
 * getAssetType("MY_TOKEN") // Returns 'normal'
 */
export function getAssetType(assetName: string): 'depin' | 'qualifier' | 'normal' {
  if (assetName.startsWith('&')) return 'depin';
  if (assetName.startsWith('#')) return 'qualifier';
  return 'normal';
}

/**
 * Checks if an asset is valid for messaging
 *
 * An asset is valid for messaging if it exists in the user's balance
 * and has a balance greater than 0.
 *
 * @param assetName - The name of the asset to check
 * @param chatAssets - Object mapping asset names to their balances
 * @returns true if the asset can be used for messaging, false otherwise
 *
 * @example
 * isValidMessagingAsset("&TESTDEPIN", { "&TESTDEPIN": 1.5 }) // Returns true
 * isValidMessagingAsset("&TESTDEPIN", { "&TESTDEPIN": 0 }) // Returns false
 * isValidMessagingAsset("&TESTDEPIN", {}) // Returns false
 */
export function isValidMessagingAsset(assetName: string, chatAssets: Record<string, number>): boolean {
  return !!(assetName && chatAssets[assetName] && chatAssets[assetName] > 0);
}

/**
 * Returns an icon component representing the asset type
 *
 * @param assetName - The name of the asset
 * @returns React node with the appropriate icon
 *
 * @example
 * getAssetIcon("&TESTDEPIN") // Returns '🔒' (lock emoji for DePIN)
 * getAssetIcon("#VERIFIED") // Returns '#' (hashtag for qualifiers)
 * getAssetIcon("MY_TOKEN") // Returns <AssetPlaceholder /> (generic asset icon)
 */
export function getAssetIcon(assetName: string): React.ReactNode {
  const type = getAssetType(assetName);
  switch (type) {
    case 'depin': return '🔒';
    case 'qualifier': return '#';
    default:
      return <AssetPlaceholder size={16} {...decorativeIconProps} />;
  }
}

/**
 * Returns a human-readable label for an asset type
 *
 * @param assetName - The name of the asset
 * @returns Display label for the asset type
 *
 * @example
 * getAssetTypeLabel("&TESTDEPIN") // Returns "DePIN"
 * getAssetTypeLabel("#VERIFIED") // Returns "Qualifier"
 * getAssetTypeLabel("MY_TOKEN") // Returns "Asset"
 */
export function getAssetTypeLabel(assetName: string): string {
  const type = getAssetType(assetName);
  switch (type) {
    case 'depin': return 'DePIN';
    case 'qualifier': return 'Qualifier';
    default: return 'Asset';
  }
}
