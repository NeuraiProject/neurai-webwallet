import { useState, useEffect, useCallback, useRef } from 'react';
import { Wallet } from '@neuraiproject/neurai-jswallet';
import type { DepinChatIdentity } from '../utils/depinChatIdentity';

// Side-effect import: attaches globalThis.neuraiDepinMsg (IIFE bundle)
import '@neuraiproject/neurai-depin-msg/dist/neurai-depin-msg.js';

const DEPIN_POLL_INTERVAL_MS = 5_000;

interface DePINMessage {
  recipient: string;
  sender: string;
  message: string;
  timestamp: number;
  date: string;
  expires: string;
}

interface PoolStats {
  enabled: boolean;
  token: string;
  total_messages: number;
  total_size_bytes: number;
  memory_usage_bytes: number;
  oldest_message?: string;
  newest_message?: string;
  messages_by_age?: {
    last_hour: number;
    last_day: number;
    last_week: number;
  };
  unique_senders: number;
  avg_message_size: number;
  expiring_in_24h: number;
}

interface AssetValidity {
  has_asset: boolean;
  amount?: number;
  valid?: 0 | 1;
  blocked?: boolean;
}

interface RecipientInfo {
  address: string;
  pubkey: string | null;
}

interface DepinReceiveMsgItem {
  hash: string;
  token: string;
  sender: string;
  timestamp: number;
  encrypted_payload_hex: string;
  signature_hex: string;
}

export function useDePINChat(
  wallet: Wallet,
  selectedAsset: string | null,
  myAddress: string | null,
  recipientList?: RecipientInfo[],
  depinChatIdentity?: DepinChatIdentity | null
) {
  const [messages, setMessages] = useState<DePINMessage[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  const effectiveAddress = depinChatIdentity?.address ?? myAddress;

  const lastTimestampRef = useRef<number>(0);
  const seenMessageKeysRef = useRef<Set<string>>(new Set());

  // Cache sender pubkey per address to avoid repeated getpubkey calls
  const senderPubKeyCacheRef = useRef<{ address: string | null; pubkey: string | null }>({
    address: null,
    pubkey: null,
  });

  // Cache recipient pubkeys per address to avoid repeated getpubkey calls
  const recipientPubKeyCacheRef = useRef<Map<string, string | null>>(new Map());

  const resolveRecipientPubkey = useCallback(async (address: string, existing: string | null) => {
    const normalizedExisting = (existing || '').trim().toLowerCase();
    if (normalizedExisting) return normalizedExisting;

    if (recipientPubKeyCacheRef.current.has(address)) {
      return recipientPubKeyCacheRef.current.get(address) ?? null;
    }

    try {
      const res: any = await wallet.rpc('getpubkey', [address]);
      const revealed = typeof res?.revealed === 'number' ? res.revealed === 1 : null;
      const pkRaw = typeof res?.pubkey === 'string' ? res.pubkey.trim().toLowerCase() : '';

      // If revealed is explicitly false, treat as no pubkey.
      if (revealed === false) {
        recipientPubKeyCacheRef.current.set(address, null);
        return null;
      }

      // Accept only compressed 33-byte pubkeys for message encryption.
      if (pkRaw.length === 66 && (pkRaw.startsWith('02') || pkRaw.startsWith('03'))) {
        recipientPubKeyCacheRef.current.set(address, pkRaw);
        return pkRaw;
      }

      recipientPubKeyCacheRef.current.set(address, null);
      return null;
    } catch {
      recipientPubKeyCacheRef.current.set(address, null);
      return null;
    }
  }, [wallet]);

  useEffect(() => {
    // Reset cache when effective address changes
    senderPubKeyCacheRef.current = {
      address: effectiveAddress,
      pubkey: depinChatIdentity?.publicKey ? String(depinChatIdentity.publicKey).trim().toLowerCase() : null,
    };
  }, [effectiveAddress, depinChatIdentity?.publicKey]);

  useEffect(() => {
    // Reset incremental polling + dedupe on token/address change
    lastTimestampRef.current = 0;
    seenMessageKeysRef.current = new Set();
    setMessages([]);
  }, [selectedAsset, effectiveAddress]);

  // Automatic message polling every 5 seconds
  useEffect(() => {
    if (!selectedAsset || !effectiveAddress || !isPolling) {
      return;
    }

    const pollMessages = async () => {
      try {
        const recipientPrivateKey = depinChatIdentity?.wif
          ? String(depinChatIdentity.wif)
          : (() => {
            const addressObjects = wallet.getAddressObjects();
            const addressObj = addressObjects.find(obj => obj.address === effectiveAddress);
            return addressObj?.privateKey;
          })();
        if (!recipientPrivateKey) {
          throw new Error('Private key not available for selected address');
        }

        const params: any[] = [selectedAsset, effectiveAddress];
        if (lastTimestampRef.current > 0) {
          params.push(lastTimestampRef.current);
        }

        const result = await wallet.rpc('depinreceivemsg', params);

        let items: DepinReceiveMsgItem[] = [];
        const depinMsg = (globalThis as any).neuraiDepinMsg;

        // Privacy layer: check if result is { encrypted: "..." }
        if (result && typeof result === 'object' && !Array.isArray(result) && (result as any).encrypted) {
          if (depinMsg?.unwrapMessageFromServer) {
            try {
              const decryptedJson = await depinMsg.unwrapMessageFromServer(
                (result as any).encrypted,
                String(recipientPrivateKey)
              );
              if (decryptedJson && typeof decryptedJson === 'string') {
                items = JSON.parse(decryptedJson);
              }
            } catch (e) {
              console.error('[DePIN] Failed to parse decrypted JSON response:', e);
            }
          } else {
            console.warn('[DePIN] unwrapMessageFromServer not available in library');
          }
        } else {
          items = Array.isArray(result) ? result : [];
        }

        let maxTimestamp = lastTimestampRef.current;
        const newDecrypted: DePINMessage[] = [];
        const seen = seenMessageKeysRef.current;

        for (const item of items) {
          if (typeof item?.timestamp === 'number') {
            maxTimestamp = Math.max(maxTimestamp, item.timestamp);
          }

          const key = `${String(item?.hash ?? '')}|${String(item?.signature_hex ?? '')}`;
          if (!item?.hash || seen.has(key)) continue;

          let plaintext: string | null = null;
          try {
            const depinMsg = (globalThis as any).neuraiDepinMsg;
            if (!depinMsg?.decryptDepinReceiveEncryptedPayload) {
              throw new Error('neuraiDepinMsg.decryptDepinReceiveEncryptedPayload is not available');
            }
            plaintext = await depinMsg.decryptDepinReceiveEncryptedPayload(
              String(item.encrypted_payload_hex ?? ''),
              String(recipientPrivateKey)
            );
          } catch (e) {
            // Non-decryptable or malformed payload; ignore.
            plaintext = null;
          }

          if (typeof plaintext !== 'string' || plaintext.length === 0) {
            continue;
          }

          seen.add(key);
          const ts = typeof item.timestamp === 'number' ? item.timestamp : Math.floor(Date.now() / 1000);
          newDecrypted.push({
            recipient: effectiveAddress,
            sender: String(item.sender ?? ''),
            message: plaintext,
            timestamp: ts,
            date: new Date(ts * 1000).toLocaleString(),
            expires: '',
          });
        }

        lastTimestampRef.current = maxTimestamp;

        if (newDecrypted.length > 0) {
          console.log(`[DePIN] +${newDecrypted.length} mensaje(s) descifrado(s)`);
          setMessages(prev => {
            const merged = [...prev, ...newDecrypted];
            merged.sort((a, b) => a.timestamp - b.timestamp);
            return merged;
          });
        }

        setLastPoll(new Date());
        setError(null);
      } catch (err: any) {
        console.error('❌ RPC ERROR: depinreceivemsg failed');
        console.error('Error object:', err);
        console.error('Error message:', err.message);
        console.error('Error description:', err.description);
        console.error('Error code:', err.code);
        console.error('Error status:', err.status);
        console.error('Error statusText:', err.statusText);
        console.error('Full error:', JSON.stringify(err, null, 2));

        // Extract nested error message if exists
        const errorMsg = err.message
          || err.description
          || err.error?.message
          || err.error?.error?.message
          || 'Failed to fetch messages';

        console.error('⚠️ Extracted error message:', errorMsg);
        setError(errorMsg);
      }
    };

    pollMessages(); // Initial call
    const interval = setInterval(pollMessages, DEPIN_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [wallet, selectedAsset, effectiveAddress, depinChatIdentity?.wif, isPolling]);

  // Manual refresh
  const refreshMessages = useCallback(async () => {
    if (!selectedAsset || !effectiveAddress) {
      console.log('Cannot refresh: no asset or address selected');
      return;
    }

    try {
      // Trigger an immediate poll (same incremental + dedupe logic)
      // Note: we keep lastTimestampRef as-is to avoid re-downloading the whole pool.
      const recipientPrivateKey = depinChatIdentity?.wif
        ? String(depinChatIdentity.wif)
        : (() => {
          const addressObjects = wallet.getAddressObjects();
          const addressObj = addressObjects.find(obj => obj.address === effectiveAddress);
          return addressObj?.privateKey;
        })();
      if (!recipientPrivateKey) return;

      const params: any[] = [selectedAsset, effectiveAddress];
      if (lastTimestampRef.current > 0) {
        params.push(lastTimestampRef.current);
      }

      console.log('🔄 Manual refresh: depinreceivemsg');
      console.log('📤 Parameters:', JSON.stringify(params, null, 2));

      const result = await wallet.rpc('depinreceivemsg', params);

      let items: DepinReceiveMsgItem[] = [];
      const depinMsg = (globalThis as any).neuraiDepinMsg;

      // Privacy layer: check if result is { encrypted: "..." }
      if (result && typeof result === 'object' && !Array.isArray(result) && (result as any).encrypted) {
        if (depinMsg?.unwrapMessageFromServer) {
          try {
            const decryptedJson = await depinMsg.unwrapMessageFromServer(
              (result as any).encrypted,
              String(recipientPrivateKey)
            );
            if (decryptedJson && typeof decryptedJson === 'string') {
              items = JSON.parse(decryptedJson);
            }
          } catch (e) {
            console.error('[DePIN] Failed to parse decrypted JSON response:', e);
          }
        } else {
          console.warn('[DePIN] unwrapMessageFromServer not available in library');
        }
      } else {
        items = Array.isArray(result) ? result : [];
      }

      let maxTimestamp = lastTimestampRef.current;
      const newDecrypted: DePINMessage[] = [];
      const seen = seenMessageKeysRef.current;

      for (const item of items) {
        if (typeof item?.timestamp === 'number') {
          maxTimestamp = Math.max(maxTimestamp, item.timestamp);
        }

        const key = `${String(item?.hash ?? '')}|${String(item?.signature_hex ?? '')}`;
        if (!item?.hash || seen.has(key)) continue;

        let plaintext: string | null = null;
        try {
          const depinMsg = (globalThis as any).neuraiDepinMsg;
          if (!depinMsg?.decryptDepinReceiveEncryptedPayload) {
            throw new Error('neuraiDepinMsg.decryptDepinReceiveEncryptedPayload is not available');
          }
          plaintext = await depinMsg.decryptDepinReceiveEncryptedPayload(
            String(item.encrypted_payload_hex ?? ''),
            String(recipientPrivateKey)
          );
        } catch {
          plaintext = null;
        }

        if (typeof plaintext !== 'string' || plaintext.length === 0) continue;
        seen.add(key);
        const ts = typeof item.timestamp === 'number' ? item.timestamp : Math.floor(Date.now() / 1000);
        newDecrypted.push({
          recipient: effectiveAddress,
          sender: String(item.sender ?? ''),
          message: plaintext,
          timestamp: ts,
          date: new Date(ts * 1000).toLocaleString(),
          expires: '',
        });
      }

      lastTimestampRef.current = maxTimestamp;
      if (newDecrypted.length > 0) {
        setMessages(prev => {
          const merged = [...prev, ...newDecrypted];
          merged.sort((a, b) => a.timestamp - b.timestamp);
          return merged;
        });
      }

      setLastPoll(new Date());
      setError(null);
    } catch (err: any) {
      console.error('❌ Refresh failed:', err.message);
      // Don't set error on refresh failure, just log it
    }
  }, [wallet, selectedAsset, effectiveAddress, depinChatIdentity?.wif]);

  // Fetch pool statistics
  const fetchStats = useCallback(async () => {
    try {
      console.log('🔵 RPC CALL: depinpoolstats');
      console.log('📤 Parameters: []');

      const result = await wallet.rpc('depinpoolstats', []) as PoolStats;

      console.log('✅ RPC SUCCESS: depinpoolstats');
      console.log('📥 Response:', JSON.stringify(result, null, 2));

      setStats(result);
      return result;
    } catch (err: any) {
      console.error('❌ RPC ERROR: depinpoolstats failed');
      console.error('Error object:', err);
      console.error('Full error:', JSON.stringify(err, null, 2));
      return null;
    }
  }, [wallet]);

  // Send message via depinsubmitmsg with client-side ECIES encryption
  const sendMessage = useCallback(async (
    message: string
  ) => {
    console.log('='.repeat(60));
    console.log('🚀 SEND MESSAGE - START');
    console.log('='.repeat(60));
    console.log('Input:');
    console.log('  Message:', message);
    console.log('  Selected asset:', selectedAsset);
    console.log('  My address:', effectiveAddress);
    console.log('  Recipient list length:', recipientList?.length || 0);

    if (!selectedAsset || !effectiveAddress) {
      console.error('❌ Asset or address not selected');
      throw new Error('Asset or address not selected');
    }

    if (!recipientList || recipientList.length === 0) {
      console.error('❌ No recipients available');
      throw new Error('No recipients available. Click "Show All Addresses" first to load token holders.');
    }

    try {
      // Get sender's private key
      console.log('\nGetting sender private key...');
      const senderPrivateKey = depinChatIdentity?.wif
        ? String(depinChatIdentity.wif)
        : (() => {
          const addressObjects = wallet.getAddressObjects();
          console.log('  Address objects count:', addressObjects.length);
          const addressObj = addressObjects.find(obj => obj.address === effectiveAddress);
          if (!addressObj) {
            console.error('❌ Address object not found for:', effectiveAddress);
            throw new Error('Address not found in wallet: ' + effectiveAddress);
          }
          if (!addressObj.privateKey) {
            console.error('❌ Private key not found for address');
            throw new Error('Private key not found for address: ' + effectiveAddress);
          }
          return String(addressObj.privateKey);
        })();

      console.log('  ✓ Private key found, length:', senderPrivateKey.length);

      console.log('\n📝 Building DePIN message...');
      console.log('  Token:', selectedAsset);
      console.log('  Sender:', effectiveAddress);
      console.log('  Message:', message);
      console.log('  Recipients with provided pubkeys:', recipientList.filter((r) => !!r.pubkey).length);

      // Build recipient pubkeys list
      console.log('\nBuilding recipient pubkeys list...');
      const recipientPubKeys: string[] = [];
      const recipientSet = new Set<string>();

      let recipientsWithPubkeys = 0;
      for (const recipient of recipientList) {
        const pk = await resolveRecipientPubkey(String(recipient.address), recipient.pubkey ?? null);
        if (!pk) continue;
        recipientsWithPubkeys++;
        if (!recipientSet.has(pk)) {
          recipientSet.add(pk);
          recipientPubKeys.push(pk);
        }
      }

      console.log('  Total recipients:', recipientList.length);
      console.log('  Recipients with pubkeys:', recipientsWithPubkeys);

      console.log('  Final recipient pubkeys:', recipientPubKeys.length);
      if (recipientPubKeys.length === 0) {
        console.error('❌ No valid public keys found');
        throw new Error('No valid public keys found for recipients');
      }

      // Get sender pubkey from cache/RPC (required by neuraiDepinMsg)
      let senderPubKey: string | null = null;
      if (depinChatIdentity?.publicKey) {
        senderPubKey = String(depinChatIdentity.publicKey).trim().toLowerCase();
        senderPubKeyCacheRef.current = { address: effectiveAddress, pubkey: senderPubKey };
        console.log('\nUsing derived chat sender pubkey');
      } else {
        const cache = senderPubKeyCacheRef.current;
        if (cache.address === effectiveAddress && cache.pubkey) {
          senderPubKey = cache.pubkey;
          console.log('\nUsing cached sender pubkey');
        } else {
          console.log('\nGetting sender pubkey via getpubkey...');
          try {
            const pubkeyResult: any = await wallet.rpc('getpubkey', [effectiveAddress]);
            senderPubKey = pubkeyResult?.pubkey ? String(pubkeyResult.pubkey).trim().toLowerCase() : null;
            senderPubKeyCacheRef.current = { address: effectiveAddress, pubkey: senderPubKey };
          } catch (e: any) {
            console.warn('❌ getpubkey failed for sender address:', e?.message || e);
          }
        }
      }

      if (!senderPubKey || senderPubKey.length !== 66) {
        throw new Error('Sender public key not available. You must reveal the pubkey for this address (send any tx from it) and ensure RPC method getpubkey is available.');
      }

      // Build the encrypted and signed message using @neuraiproject/neurai-depin-msg
      console.log('\nCalling neuraiDepinMsg.buildDepinMessage...');
      const depinMsg = (globalThis as any).neuraiDepinMsg;
      if (!depinMsg?.buildDepinMessage) {
        throw new Error('neuraiDepinMsg is not available. Ensure @neuraiproject/neurai-depin-msg is installed and bundled.');
      }

      const buildResult = await depinMsg.buildDepinMessage({
        token: selectedAsset,
        senderAddress: effectiveAddress,
        senderPubKey,
        privateKey: senderPrivateKey, // accepts WIF or 64-hex
        timestamp: Math.floor(Date.now() / 1000),
        message,
        recipientPubKeys
      });

      const hexMessage: string = buildResult.hex;
      console.log('  ✓ Built HEX length:', hexMessage.length);
      console.log('  ✓ messageHash:', buildResult.messageHash);

      let submissionPayload: any = hexMessage;

      // Privacy Layer: check if server privacy is enabled
      try {
        const msgInfoResult: any = await wallet.rpc('depingetmsginfo', []);
        if (msgInfoResult && msgInfoResult.depinpoolpkey && msgInfoResult.depinpoolpkey !== '0') {
          console.log('\n🔒 Server privacy layer active (pool key found). Wrapping message...');
          if (depinMsg.wrapMessageForServer) {
            console.log('🔒 ENCRYPTED TRANSMISSION: Message encrypted with server key', msgInfoResult.depinpoolpkey);
            submissionPayload = await depinMsg.wrapMessageForServer(
              hexMessage,
              msgInfoResult.depinpoolpkey,
              effectiveAddress
            );
            console.log('  ✓ Message wrapped successfully for server');
          } else {
            console.warn('  ⚠️ wrapMessageForServer not available in library. Sending unwrapped.');
          }
        }
      } catch (e) {
        console.warn('  ⚠️ Failed to check server privacy layer info:', e);
      }

      console.log('\n🔵 RPC CALL: depinsubmitmsg');
      console.log('📤 Payload type:', typeof submissionPayload === 'string' ? 'HEX' : 'JSON Object');

      const result = await wallet.rpc('depinsubmitmsg', [submissionPayload]);

      console.log('✅ RPC SUCCESS: depinsubmitmsg');
      console.log('📥 Response:', JSON.stringify(result, null, 2));
      console.log('='.repeat(60));
      console.log('🚀 SEND MESSAGE - COMPLETE');
      console.log('='.repeat(60));

      return result;
    } catch (err: any) {
      console.error('\n' + '='.repeat(60));
      console.error('❌ SEND MESSAGE - ERROR');
      console.error('='.repeat(60));
      console.error('Error object:', err);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);

      if (err.error) {
        console.error('Nested error:', JSON.stringify(err.error, null, 2));
      }

      const actualError = err.error?.error?.message || err.error?.message || err.message || err.description || 'Failed to send message';
      console.error('Actual error to throw:', actualError);
      throw new Error(actualError);
    }
  }, [wallet, selectedAsset, effectiveAddress, depinChatIdentity?.wif, depinChatIdentity?.publicKey, recipientList, resolveRecipientPubkey]);

  // Check DePIN asset validity
  const checkAssetValidity = useCallback(async (): Promise<AssetValidity | null> => {
    if (!selectedAsset || !effectiveAddress) return null;

    const params = [selectedAsset, effectiveAddress];

    try {
      console.log('🔵 RPC CALL: checkdepinvalidity');
      console.log('📤 Parameters:', JSON.stringify(params, null, 2));

      const result = await wallet.rpc('checkdepinvalidity', params) as AssetValidity;

      console.log('✅ RPC SUCCESS: checkdepinvalidity');
      console.log('📥 Response:', JSON.stringify(result, null, 2));

      return result;
    } catch (err: any) {
      console.error('❌ RPC ERROR: checkdepinvalidity failed');
      console.error('Error object:', err);
      console.error('Full error:', JSON.stringify(err, null, 2));
      return null;
    }
  }, [wallet, selectedAsset, effectiveAddress]);

  // Get messaging system info
  const getMsgInfo = useCallback(async () => {
    try {
      const result = await wallet.rpc('depingetmsginfo', []);
      return result;
    } catch (err) {
      console.error('Error getting msg info:', err);
      return null;
    }
  }, [wallet]);

  // Clear old messages
  const clearMessages = useCallback(async (mode?: 'all' | number) => {
    try {
      const params = mode !== undefined ? [mode] : [];
      const result = await wallet.rpc('depinclearmsg', params);
      return result;
    } catch (err) {
      console.error('Error clearing messages:', err);
      return null;
    }
  }, [wallet]);

  return {
    messages,
    isPolling,
    setIsPolling,
    error,
    stats,
    lastPoll,
    sendMessage,
    refreshMessages,
    fetchStats,
    checkAssetValidity,
    getMsgInfo,
    clearMessages
  };
}
