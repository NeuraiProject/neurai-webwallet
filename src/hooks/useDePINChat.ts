import { useState, useEffect, useCallback, useRef } from 'react';
import { Wallet } from '@neuraiproject/neurai-jswallet';

// Side-effect import: attaches globalThis.neuraiDepinMsg (IIFE bundle)
import '@neuraiproject/neurai-depin-msg/dist/neurai-depin-msg.js';

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

export function useDePINChat(
  wallet: Wallet,
  selectedAsset: string | null,
  myAddress: string | null,
  recipientList?: RecipientInfo[]
) {
  const [messages, setMessages] = useState<DePINMessage[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  // Cache sender pubkey per address to avoid repeated getpubkey calls
  const senderPubKeyCacheRef = useRef<{ address: string | null; pubkey: string | null }>({
    address: null,
    pubkey: null,
  });

  useEffect(() => {
    // Reset cache when address changes
    senderPubKeyCacheRef.current = { address: myAddress, pubkey: null };
  }, [myAddress]);

  // Helper function to check if messages have changed
  const messagesAreEqual = (oldMsgs: DePINMessage[], newMsgs: DePINMessage[]): boolean => {
    if (oldMsgs.length !== newMsgs.length) return false;
    
    // Compare by timestamp and message content (unique identifiers)
    const oldKeys = new Set(oldMsgs.map(m => `${m.timestamp}-${m.sender}-${m.message}`));
    return newMsgs.every(m => oldKeys.has(`${m.timestamp}-${m.sender}-${m.message}`));
  };

  // Automatic message polling every 5 seconds
  useEffect(() => {
    console.log('=== useDePINChat useEffect triggered ===');
    console.log('  selectedAsset:', selectedAsset);
    console.log('  myAddress:', myAddress);
    console.log('  isPolling:', isPolling);

    if (!selectedAsset || !myAddress || !isPolling) {
      console.log('Polling conditions not met, skipping...');
      return;
    }

    console.log('Starting message polling...');

    const pollMessages = async () => {
      try {
        // Local query via the configured RPC server
        // depingetmsg format:
        //   - depingetmsg "TOKEN" -> local, for all wallet addresses
        const params = [selectedAsset];

        console.log('🔵 RPC CALL: depingetmsg');
        console.log('📤 Parameters:', JSON.stringify(params, null, 2));

        const result = await wallet.rpc('depingetmsg', params);

        console.log('✅ RPC SUCCESS: depingetmsg');
        console.log('📥 Response:', JSON.stringify(result, null, 2));
        console.log('Number of messages received:', Array.isArray(result) ? result.length : 0);

        const newMessages = Array.isArray(result) ? result : [];
        
        // Only update state if messages have actually changed
        setMessages(prevMessages => {
          if (messagesAreEqual(prevMessages, newMessages)) {
            console.log('📋 No new messages, skipping update');
            return prevMessages;
          }
          console.log('📬 New messages detected, updating state');
          return newMessages;
        });
        
        setLastPoll(new Date());
        setError(null);
      } catch (err: any) {
        console.error('❌ RPC ERROR: depingetmsg failed');
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
    const interval = setInterval(pollMessages, 5000); // Every 5 seconds

    return () => {
      console.log('Stopping message polling...');
      clearInterval(interval);
    };
  }, [wallet, selectedAsset, myAddress, isPolling]);

  // Manual refresh
  const refreshMessages = useCallback(async () => {
    if (!selectedAsset || !myAddress) {
      console.log('Cannot refresh: no asset or address selected');
      return;
    }

    try {
      // Local query via the configured RPC server
      const params = [selectedAsset];

      console.log('🔄 Manual refresh: depingetmsg');
      console.log('📤 Parameters:', JSON.stringify(params, null, 2));

      const result = await wallet.rpc('depingetmsg', params);

      console.log('✅ Refresh SUCCESS');
      console.log('📥 Response:', JSON.stringify(result, null, 2));

      const newMessages = Array.isArray(result) ? result : [];
      
      setMessages(prevMessages => {
        if (messagesAreEqual(prevMessages, newMessages)) {
          console.log('📋 No new messages after refresh');
          return prevMessages;
        }
        console.log('📬 New messages detected after refresh');
        return newMessages;
      });
      
      setLastPoll(new Date());
      setError(null);
    } catch (err: any) {
      console.error('❌ Refresh failed:', err.message);
      // Don't set error on refresh failure, just log it
    }
  }, [wallet, selectedAsset, myAddress]);

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
    console.log('  My address:', myAddress);
    console.log('  Recipient list length:', recipientList?.length || 0);

    if (!selectedAsset || !myAddress) {
      console.error('❌ Asset or address not selected');
      throw new Error('Asset or address not selected');
    }

    if (!recipientList || recipientList.length === 0) {
      console.error('❌ No recipients available');
      throw new Error('No recipients available. Click "Show All Addresses" first to load token holders.');
    }

    // Filter recipients that have public keys
    console.log('\nFiltering recipients with pubkeys...');
    const validRecipients = recipientList.filter(r => r.pubkey !== null);
    console.log('  Total recipients:', recipientList.length);
    console.log('  Recipients with pubkeys:', validRecipients.length);
    
    if (validRecipients.length === 0) {
      console.error('❌ No recipients with public keys');
      throw new Error('No recipients with public keys available. Recipients need to have revealed their public keys.');
    }

    try {
      // Get sender's private key
      console.log('\nGetting sender private key...');
      const addressObjects = wallet.getAddressObjects();
      console.log('  Address objects count:', addressObjects.length);
      
      const addressObj = addressObjects.find(obj => obj.address === myAddress);
      
      if (!addressObj) {
        console.error('❌ Address object not found for:', myAddress);
        throw new Error('Address not found in wallet: ' + myAddress);
      }
      
      if (!addressObj.privateKey) {
        console.error('❌ Private key not found for address');
        throw new Error('Private key not found for address: ' + myAddress);
      }
      
      console.log('  ✓ Private key found, length:', addressObj.privateKey.length);

      console.log('\n📝 Building DePIN message...');
      console.log('  Token:', selectedAsset);
      console.log('  Sender:', myAddress);
      console.log('  Message:', message);
      console.log('  Recipients with pubkeys:', validRecipients.length);

      // Build recipient pubkeys list
      console.log('\nBuilding recipient pubkeys list...');
      const recipientPubKeys: string[] = [];
      const recipientSet = new Set<string>();

      for (const recipient of validRecipients) {
        const pk = (recipient.pubkey || '').trim().toLowerCase();
        if (pk.length !== 66) {
          console.warn(`    ❌ Invalid pubkey length for ${recipient.address}: ${pk.length}`);
          continue;
        }
        if (!(pk.startsWith('02') || pk.startsWith('03'))) {
          console.warn(`    ❌ Pubkey not compressed for ${recipient.address}: ${pk.substring(0, 2)}`);
          continue;
        }
        if (!recipientSet.has(pk)) {
          recipientSet.add(pk);
          recipientPubKeys.push(pk);
        }
      }

      console.log('  Final recipient pubkeys:', recipientPubKeys.length);
      if (recipientPubKeys.length === 0) {
        console.error('❌ No valid public keys found');
        throw new Error('No valid public keys found for recipients');
      }

      // Get sender pubkey from cache/RPC (required by neuraiDepinMsg)
      let senderPubKey: string | null = null;
      const cache = senderPubKeyCacheRef.current;
      if (cache.address === myAddress && cache.pubkey) {
        senderPubKey = cache.pubkey;
        console.log('\nUsing cached sender pubkey');
      } else {
        console.log('\nGetting sender pubkey via getpubkey...');
        try {
          const pubkeyResult: any = await wallet.rpc('getpubkey', [myAddress]);
          senderPubKey = pubkeyResult?.pubkey ? String(pubkeyResult.pubkey).trim().toLowerCase() : null;
          senderPubKeyCacheRef.current = { address: myAddress, pubkey: senderPubKey };
        } catch (e: any) {
          console.warn('❌ getpubkey failed for sender address:', e?.message || e);
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
        senderAddress: myAddress,
        senderPubKey,
        privateKey: addressObj.privateKey, // accepts WIF or 64-hex
        timestamp: Math.floor(Date.now() / 1000),
        message,
        recipientPubKeys
      });

      const hexMessage: string = buildResult.hex;
      console.log('  ✓ Built HEX length:', hexMessage.length);
      console.log('  ✓ messageHash:', buildResult.messageHash);

      console.log('\n🔵 RPC CALL: depinsubmitmsg');
      console.log('📤 Message hex length:', hexMessage.length);
      console.log('📤 FULL HEX MESSAGE:');
      console.log(hexMessage);
      console.log('📤 End of hex message');

      const result = await wallet.rpc('depinsubmitmsg', [hexMessage]);

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
  }, [wallet, selectedAsset, myAddress, recipientList]);

  // Check DePIN asset validity
  const checkAssetValidity = useCallback(async (): Promise<AssetValidity | null> => {
    if (!selectedAsset || !myAddress) return null;

    const params = [selectedAsset, myAddress];

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
  }, [wallet, selectedAsset, myAddress]);

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
