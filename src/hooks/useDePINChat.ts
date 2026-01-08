import { useState, useEffect, useCallback, useRef } from 'react';
import { Wallet } from '@neuraiproject/neurai-jswallet';
import type { DepinChatIdentity } from '../utils/depinChatIdentity';
import type { PubkeyResponse } from '../types/rpc';

// Side-effect import: attaches globalThis.neuraiDepinMsg (IIFE bundle)
import '@neuraiproject/neurai-depin-msg/dist/neurai-depin-msg.js';

const DEPIN_POLL_INTERVAL_MS = 5_000;

type DepinMsgApi = {
  unwrapMessageFromServer?: (payload: string, privateKey: string) => Promise<string>;
  decryptDepinReceiveEncryptedPayload?: (payloadHex: string, privateKey: string) => Promise<string>;
  buildDepinMessage?: (input: DepinBuildInput) => Promise<DepinBuildResult>;
  wrapMessageForServer?: (hexMessage: string, poolKey: string, senderAddress: string) => Promise<string | Record<string, unknown>>;
};

type DepinBuildInput = {
  token: string;
  senderAddress: string;
  senderPubKey: string;
  privateKey: string;
  timestamp: number;
  message: string;
  recipientPubKeys: string[];
  messageType: 'private' | 'group';
};

type DepinBuildResult = {
  hex: string;
  messageHash: string;
  [key: string]: unknown;
};

type DepinEncryptedResult = {
  encrypted: string;
};

type RpcErrorShape = {
  message?: string;
  description?: string;
  error?: {
    message?: string;
    error?: {
      message?: string;
    };
  };
  code?: unknown;
  status?: unknown;
  statusText?: unknown;
  stack?: string;
};

type MsgInfoResult = {
  depinpoolpkey?: string;
};

const getDepinMsgApi = (): DepinMsgApi | null => {
  const depinMsg = (globalThis as typeof globalThis & { neuraiDepinMsg?: DepinMsgApi }).neuraiDepinMsg;
  return depinMsg ?? null;
};

const isEncryptedResult = (value: unknown): value is DepinEncryptedResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof (value as DepinEncryptedResult).encrypted === 'string';
};

const asRpcError = (err: unknown): RpcErrorShape => {
  if (!err || typeof err !== 'object') return {};
  return err as RpcErrorShape;
};

interface DePINMessage {
  recipient: string;
  sender: string;
  message: string;
  timestamp: number;
  date: string;
  expires: string;
  messageHash?: string;
  messageType?: 'private' | 'group'; // From server
  contactAddress?: string; // For private messages: the other party's address
}

interface PrivateConversation {
  address: string;
  displayName: string;
  unreadCount: number;
  lastMessageTime: number;
  messages: DePINMessage[];
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
  token?: string; // May not be present in all responses
  sender: string;
  timestamp: number;
  message_type?: 'private' | 'group'; // Added by server
  date?: string; // Optional: formatted date
  expires?: string; // Optional: expiry date
  encryption_type?: string; // Optional: encryption method
  encrypted_payload_size?: number; // Optional: size info
  signature_size?: number; // Optional: size info
  encrypted_payload_hex: string;
  signature_hex: string;
  total_size?: number; // Optional: total size
}

export function useDePINChat(
  wallet: Wallet,
  selectedAsset: string | null,
  myAddress: string | null,
  recipientList?: RecipientInfo[],
  depinChatIdentity?: DepinChatIdentity | null
) {
  const [groupMessages, setGroupMessages] = useState<DePINMessage[]>([]);
  const [privateConversations, setPrivateConversations] = useState<Map<string, PrivateConversation>>(new Map());
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  const effectiveAddress = depinChatIdentity?.address ?? myAddress;

  const lastTimestampRef = useRef<number>(0);
  const seenMessageKeysRef = useRef<Set<string>>(new Set());
  const privateConversationsRef = useRef<Map<string, PrivateConversation>>(new Map());

  // Cache sender pubkey per address to avoid repeated getpubkey calls
  const senderPubKeyCacheRef = useRef<{ address: string | null; pubkey: string | null }>({
    address: null,
    pubkey: null,
  });

  // Cache recipient pubkeys per address to avoid repeated getpubkey calls
  const recipientPubKeyCacheRef = useRef<Map<string, string | null>>(new Map());

  // OPTIMIZACIÓN: Pre-cargar todas las pubkeys del asset en una sola llamada RPC
  const preloadRecipientPubkeys = useCallback(async (assetName: string) => {
    if (!assetName) return;

    try {

      const depinAddressesData: Array<{ address: string, pubkey: string }> = await wallet.rpc('listdepinaddresses', [assetName]) as Array<{ address: string, pubkey: string }>;

      let loadedCount = 0;
      for (const item of depinAddressesData) {
        if (item.pubkey) {
          const pkRaw = item.pubkey.trim().toLowerCase();
          // Validar que sea una pubkey comprimida válida
          if (pkRaw.length === 66 && (pkRaw.startsWith('02') || pkRaw.startsWith('03'))) {
            recipientPubKeyCacheRef.current.set(item.address, pkRaw);
            loadedCount++;
          } else {
            recipientPubKeyCacheRef.current.set(item.address, null);
          }
        } else {
          recipientPubKeyCacheRef.current.set(item.address, null);
        }
      }

    } catch (error) {
      console.warn('[DePIN Cache] Failed to preload pubkeys:', error);
      // No es crítico si falla, resolveRecipientPubkey hará las llamadas individuales
    }
  }, [wallet]);

  const resolveRecipientPubkey = useCallback(async (address: string, existing: string | null) => {
    const normalizedExisting = (existing || '').trim().toLowerCase();
    if (normalizedExisting) return normalizedExisting;

    if (recipientPubKeyCacheRef.current.has(address)) {
      return recipientPubKeyCacheRef.current.get(address) ?? null;
    }

    // Fallback: llamada individual si no está en caché
    try {
      const res = await wallet.rpc('getpubkey', [address]) as PubkeyResponse | string | null;
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

  // Get contact address for private messages
  const getContactAddress = useCallback((
    messageHash: string,
    sender: string,
    myAddr: string,
    messageType?: 'private' | 'group'
  ): string | undefined => {
    if (messageType !== 'private') return undefined;

    // If I sent this message, get recipient from localStorage
    if (sender === myAddr) {
      const storedRecipient = localStorage.getItem(`private_msg_${messageHash}`);
      if (storedRecipient) {
        return storedRecipient;
      }
      
      // Fallback: if it's a private message sent by me but recipient not found,
      // it's likely a message to myself or our own session lost the recipient info.
      // Defaulting to my own address puts it in a "self" private tab instead of Group.
      return myAddr;
    }

    // If I received this message, contact is the sender
    return sender;
  }, []);

  useEffect(() => {
    // Reset cache when effective address changes
    senderPubKeyCacheRef.current = {
      address: effectiveAddress,
      pubkey: depinChatIdentity?.publicKey ? String(depinChatIdentity.publicKey).trim().toLowerCase() : null,
    };
  }, [effectiveAddress, depinChatIdentity?.publicKey]);

  // Update ref whenever privateConversations changes
  useEffect(() => {
    privateConversationsRef.current = privateConversations;
  }, [privateConversations]);

  useEffect(() => {
    // Reset incremental polling + dedupe on token/address change
    lastTimestampRef.current = 0;
    seenMessageKeysRef.current = new Set();
    setGroupMessages([]);
    setPrivateConversations(new Map());
    privateConversationsRef.current = new Map();

    // OPTIMIZACIÓN: Pre-cargar pubkeys del nuevo asset
    recipientPubKeyCacheRef.current.clear();
    if (selectedAsset) {
      preloadRecipientPubkeys(selectedAsset);
    }
  }, [selectedAsset, effectiveAddress, preloadRecipientPubkeys]);

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

        const params: (string | number)[] = [selectedAsset, effectiveAddress];
        if (lastTimestampRef.current > 0) {
          params.push(lastTimestampRef.current);
        }

        const result = await wallet.rpc('depinreceivemsg', params);

        let items: DepinReceiveMsgItem[] = [];
        const depinMsg = getDepinMsgApi();

        // Privacy layer: check if result is { encrypted: "..." }
        if (isEncryptedResult(result)) {
          if (depinMsg?.unwrapMessageFromServer) {
            try {
              const decryptedJson = await depinMsg.unwrapMessageFromServer(
                result.encrypted,
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
            const depinMsg = getDepinMsgApi();
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

          const messageHash = String(item.hash ?? '');
          const sender = String(item.sender ?? '');
          const contactAddress = getContactAddress(messageHash, sender, effectiveAddress, item.message_type);

          newDecrypted.push({
            recipient: effectiveAddress,
            sender,
            message: plaintext,
            timestamp: ts,
            date: new Date(ts * 1000).toLocaleString(),
            expires: '',
            messageHash,
            messageType: item.message_type,
            contactAddress,
          });
        }

        lastTimestampRef.current = maxTimestamp;

        if (newDecrypted.length > 0) {


          // Separate messages by type
          const newGroupMessages: DePINMessage[] = [];
          const privateUpdates = new Map<string, DePINMessage[]>();

          for (const msg of newDecrypted) {


            if (msg.messageType === 'private' && msg.contactAddress) {
              if (!privateUpdates.has(msg.contactAddress)) {
                privateUpdates.set(msg.contactAddress, []);
              }
              privateUpdates.get(msg.contactAddress)!.push(msg);
            } else {
              newGroupMessages.push(msg);
            }
          }



          // Update both states atomically using React's batching
          // This prevents race conditions between the two updates
          if (newGroupMessages.length > 0) {
            setGroupMessages(prev => {
              const merged = [...prev, ...newGroupMessages];
              merged.sort((a, b) => a.timestamp - b.timestamp);
              return merged;
            });
          }

          if (privateUpdates.size > 0) {
            setPrivateConversations(prev => {
              const updated = new Map(prev);

              for (const [contactAddress, msgs] of privateUpdates.entries()) {
                const existing = updated.get(contactAddress);
                const allMessages = existing
                  ? [...existing.messages, ...msgs].sort((a, b) => a.timestamp - b.timestamp)
                  : msgs;

                const displayName = contactAddress === effectiveAddress
                  ? 'Me (Private Notes)'
                  : contactAddress.substring(0, 4) + '...' + contactAddress.substring(contactAddress.length - 4);

                updated.set(contactAddress, {
                  address: contactAddress,
                  displayName,
                  unreadCount: (existing?.unreadCount || 0) + msgs.length,
                  lastMessageTime: Math.max(...allMessages.map(m => m.timestamp)),
                  messages: allMessages,
                });
              }

              return updated;
            });
          }
        }

        setLastPoll(new Date());
        setError(null);
      } catch (err) {
        const errorInfo = asRpcError(err);
        console.error('❌ RPC ERROR: depinreceivemsg failed');
        console.error('Error object:', err);
        console.error('Error message:', errorInfo.message);
        console.error('Error description:', errorInfo.description);
        console.error('Error code:', errorInfo.code);
        console.error('Error status:', errorInfo.status);
        console.error('Error statusText:', errorInfo.statusText);
        console.error('Full error:', JSON.stringify(errorInfo, null, 2));

        // Extract nested error message if exists
        const errorMsg = errorInfo.message
          || errorInfo.description
          || errorInfo.error?.message
          || errorInfo.error?.error?.message
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

      const params: (string | number)[] = [selectedAsset, effectiveAddress];
      if (lastTimestampRef.current > 0) {
        params.push(lastTimestampRef.current);
      }

      console.log('🔄 Manual refresh: depinreceivemsg');
      console.log('📤 Parameters:', JSON.stringify(params, null, 2));

      const result = await wallet.rpc('depinreceivemsg', params);

      let items: DepinReceiveMsgItem[] = [];
      const depinMsg = getDepinMsgApi();

      // Privacy layer: check if result is { encrypted: "..." }
      if (isEncryptedResult(result)) {
        if (depinMsg?.unwrapMessageFromServer) {
          try {
            const decryptedJson = await depinMsg.unwrapMessageFromServer(
              result.encrypted,
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
          const depinMsg = getDepinMsgApi();
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

        const messageHash = String(item.hash ?? '');
        const sender = String(item.sender ?? '');
        const contactAddress = getContactAddress(messageHash, sender, effectiveAddress, item.message_type);

        newDecrypted.push({
          recipient: effectiveAddress,
          sender,
          message: plaintext,
          timestamp: ts,
          date: new Date(ts * 1000).toLocaleString(),
          expires: '',
          messageHash,
          messageType: item.message_type,
          contactAddress,
        });
      }

      lastTimestampRef.current = maxTimestamp;
      if (newDecrypted.length > 0) {
        // Separate messages by type
        const newGroupMessages: DePINMessage[] = [];
        const privateUpdates = new Map<string, DePINMessage[]>();

        for (const msg of newDecrypted) {
          if (msg.messageType === 'private' && msg.contactAddress) {
            if (!privateUpdates.has(msg.contactAddress)) {
              privateUpdates.set(msg.contactAddress, []);
            }
            privateUpdates.get(msg.contactAddress)!.push(msg);
          } else {
            newGroupMessages.push(msg);
          }
        }

        // Update group messages
        if (newGroupMessages.length > 0) {
          setGroupMessages(prev => {
            const merged = [...prev, ...newGroupMessages];
            merged.sort((a, b) => a.timestamp - b.timestamp);
            return merged;
          });
        }

        // Update private conversations
        if (privateUpdates.size > 0) {

          setPrivateConversations(prev => {
            const updated = new Map(prev);

            for (const [contactAddress, msgs] of privateUpdates.entries()) {
              const existing = updated.get(contactAddress);
              const allMessages = existing
                ? [...existing.messages, ...msgs].sort((a, b) => a.timestamp - b.timestamp)
                : msgs;



              updated.set(contactAddress, {
                address: contactAddress,
                displayName: contactAddress.substring(0, 4) + '...' + contactAddress.substring(contactAddress.length - 4),
                unreadCount: (existing?.unreadCount || 0) + msgs.length,
                lastMessageTime: Math.max(...allMessages.map(m => m.timestamp)),
                messages: allMessages,
              });
            }

            return updated;
          });
        }
      }

      setLastPoll(new Date());
      setError(null);
    } catch (err) {
      const errorInfo = asRpcError(err);
      console.error('❌ Refresh failed:', errorInfo.message);
      // Don't set error on refresh failure, just log it
    }
  }, [wallet, selectedAsset, effectiveAddress, depinChatIdentity?.wif]);

  // Fetch pool statistics
  const fetchStats = useCallback(async () => {
    try {


      const result = await wallet.rpc('depinpoolstats', []) as PoolStats;



      setStats(result);
      return result;
    } catch (err) {
      const errorInfo = asRpcError(err);
      console.error('❌ RPC ERROR: depinpoolstats failed');
      console.error('Error object:', err);
      console.error('Full error:', JSON.stringify(errorInfo, null, 2));
      return null;
    }
  }, [wallet]);

  // Send message via depinsubmismsg with client-side ECIES encryption
  const sendMessage = useCallback(async (
    message: string
  ) => {


    if (!selectedAsset || !effectiveAddress) {
      console.error('❌ Asset or address not selected');
      throw new Error('Asset or address not selected');
    }

    if (!recipientList || recipientList.length === 0) {
      console.error('❌ No recipients available');
      throw new Error('No recipients available. Click "Show All Addresses" first to load token holders.');
    }

    // Detectar si es un mensaje privado (@dirección)
    // Flag 's' permite que . coincida con saltos de línea
    const privateMessageMatch = message.match(/^@(N[a-zA-Z0-9]{33,34})\s+([\s\S]*)$/);
    const isPrivateMessage = !!privateMessageMatch;
    let targetRecipientAddress: string | null = null;
    let cleanedMessage = message;

    if (isPrivateMessage && privateMessageMatch) {
      targetRecipientAddress = privateMessageMatch[1];
      cleanedMessage = privateMessageMatch[2];

    }

    try {
      // Get sender's private key

      const senderPrivateKey = depinChatIdentity?.wif
        ? String(depinChatIdentity.wif)
        : (() => {
          const addressObjects = wallet.getAddressObjects();

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





      // Build recipient pubkeys list

      const recipientPubKeys: string[] = [];
      const recipientSet = new Set<string>();

      let recipientsWithPubkeys = 0;

      if (isPrivateMessage && targetRecipientAddress) {
        // Modo privado: solo cifrar para el destinatario específico

        const targetRecipient = recipientList.find((r) => r.address === targetRecipientAddress);

        if (!targetRecipient) {
          console.error('❌ Target recipient not found in recipient list');
          throw new Error(`Recipient ${targetRecipientAddress} not found in token holders. They must hold the ${selectedAsset} token.`);
        }

        const pk = await resolveRecipientPubkey(String(targetRecipient.address), targetRecipient.pubkey ?? null);
        if (!pk) {
          console.error('❌ Could not resolve pubkey for target recipient');
          throw new Error(`Could not get public key for ${targetRecipientAddress}. Recipient may need to reveal their pubkey first.`);
        }

        recipientPubKeys.push(pk);
        recipientsWithPubkeys = 1;

      } else {
        // Modo grupo: cifrar para todos los destinatarios

        for (const recipient of recipientList) {
          const pk = await resolveRecipientPubkey(String(recipient.address), recipient.pubkey ?? null);
          if (!pk) continue;
          recipientsWithPubkeys++;
          if (!recipientSet.has(pk)) {
            recipientSet.add(pk);
            recipientPubKeys.push(pk);
          }
        }
      }


      if (recipientPubKeys.length === 0) {
        console.error('❌ No valid public keys found');
        throw new Error('No valid public keys found for recipients');
      }

      // Get sender pubkey from cache/RPC (required by neuraiDepinMsg)
      let senderPubKey: string | null = null;
      if (depinChatIdentity?.publicKey) {
        senderPubKey = String(depinChatIdentity.publicKey).trim().toLowerCase();
        senderPubKeyCacheRef.current = { address: effectiveAddress, pubkey: senderPubKey };

      } else {
        const cache = senderPubKeyCacheRef.current;
        if (cache.address === effectiveAddress && cache.pubkey) {
          senderPubKey = cache.pubkey;

        } else {

          try {
            const pubkeyResult = await wallet.rpc('getpubkey', [effectiveAddress]) as PubkeyResponse | string | null;
            const pubkeyValue = typeof pubkeyResult === 'string'
              ? pubkeyResult
              : typeof pubkeyResult?.pubkey === 'string'
                ? pubkeyResult.pubkey
                : typeof pubkeyResult?.result === 'string'
                  ? pubkeyResult.result
                  : typeof pubkeyResult?.result === 'object' && typeof pubkeyResult.result?.pubkey === 'string'
                    ? pubkeyResult.result.pubkey
                    : null;
            senderPubKey = pubkeyValue ? String(pubkeyValue).trim().toLowerCase() : null;
            senderPubKeyCacheRef.current = { address: effectiveAddress, pubkey: senderPubKey };
          } catch (e) {
            const errorInfo = asRpcError(e);
            console.warn('❌ getpubkey failed for sender address:', errorInfo.message ?? String(e));
          }
        }
      }

      if (!senderPubKey || senderPubKey.length !== 66) {
        throw new Error('Sender public key not available. You must reveal the pubkey for this address (send any tx from it) and ensure RPC method getpubkey is available.');
      }

      // Build the encrypted and signed message using @neuraiproject/neurai-depin-msg
      console.log('\nCalling neuraiDepinMsg.buildDepinMessage...');
      const depinMsg = getDepinMsgApi();
      if (!depinMsg?.buildDepinMessage) {
        throw new Error('neuraiDepinMsg is not available. Ensure @neuraiproject/neurai-depin-msg is installed and bundled.');
      }

      const messageType = isPrivateMessage ? 'private' : 'group';
      console.log('  Message type:', messageType);

      const buildResult = await depinMsg.buildDepinMessage({
        token: selectedAsset,
        senderAddress: effectiveAddress,
        senderPubKey,
        privateKey: senderPrivateKey, // accepts WIF or 64-hex
        timestamp: Math.floor(Date.now() / 1000),
        message: cleanedMessage,
        recipientPubKeys,
        messageType
      });

      const hexMessage: string = buildResult.hex;
      console.log('  ✓ Built HEX length:', hexMessage.length);
      console.log('  ✓ messageHash:', buildResult.messageHash);

      let submissionPayload: string | Record<string, unknown> = hexMessage;

      // Privacy Layer: check if server privacy is enabled
      try {
        const msgInfoResult = await wallet.rpc('depingetmsginfo', []) as MsgInfoResult;
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

      // Store recipient for private messages (needed when we receive our own message back)
      if (isPrivateMessage && targetRecipientAddress) {
        // Store with buildResult.messageHash (calculated by library)
        localStorage.setItem(
          `private_msg_${buildResult.messageHash}`,
          targetRecipientAddress
        );
        console.log('  ✓ Private message recipient stored (lib hash):', buildResult.messageHash);

        // ALSO store with RPC result if it's a string (this is the authoritative hash on the pool)
        if (typeof result === 'string' && result !== buildResult.messageHash) {
          localStorage.setItem(
            `private_msg_${result}`,
            targetRecipientAddress
          );
          console.log('  ✓ Private message recipient stored (RPC hash):', result);
        }
      }

      console.log('='.repeat(60));
      console.log('🚀 SEND MESSAGE - COMPLETE');
      console.log('='.repeat(60));

      return result;
    } catch (err) {
      const errorInfo = asRpcError(err);
      console.error('\n' + '='.repeat(60));
      console.error('❌ SEND MESSAGE - ERROR');
      console.error('='.repeat(60));
      console.error('Error object:', err);
      console.error('Error message:', errorInfo.message);
      console.error('Error stack:', errorInfo.stack);

      if (errorInfo.error) {
        console.error('Nested error:', JSON.stringify(errorInfo.error, null, 2));
      }

      const actualError = errorInfo.error?.error?.message
        || errorInfo.error?.message
        || errorInfo.message
        || errorInfo.description
        || 'Failed to send message';
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
    } catch (err) {
      const errorInfo = asRpcError(err);
      console.error('❌ RPC ERROR: checkdepinvalidity failed');
      console.error('Error object:', err);
      console.error('Full error:', JSON.stringify(errorInfo, null, 2));
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

  // Create an empty private conversation
  const createPrivateConversation = useCallback((address: string) => {
    setPrivateConversations(prev => {
      if (prev.has(address)) {
        return prev; // Already exists
      }

      const updated = new Map(prev);
      const displayName = address === effectiveAddress
        ? 'Me (Private Notes)'
        : address.substring(0, 4) + '...' + address.substring(address.length - 4);

      updated.set(address, {
        address,
        displayName,
        unreadCount: 0,
        lastMessageTime: Date.now() / 1000,
        messages: []
      });
      console.log('[DePIN] Created empty conversation for:', address);
      return updated;
    });
  }, [effectiveAddress]);

  return {
    groupMessages,
    privateConversations,
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
    clearMessages,
    createPrivateConversation
  };
}
