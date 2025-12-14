import React from "react";
import { IconSend } from "./icons";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useDePINChat } from "./hooks/useDePINChat";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { FaQrcode, FaRegClock, FaRegCircleCheck, FaRobot, FaUserGroup } from "react-icons/fa6";
import type { DepinChatIdentity } from "./utils/depinChatIdentity";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  // DePIN specific fields
  senderAddress?: string;
  sendDate?: string;
  expiresDate?: string;
  isDePIN?: boolean;
  token?: string;
  unixTimestamp?: number;
  delivery?: "pending" | "confirmed";
  deliveryKey?: string;
}

interface DePINMessage {
  recipient: string;
  sender: string;
  message: string;
  timestamp: number;
  date: string;
  expires: string;
}

interface ChatProps {
  wallet: Wallet;
  assets: any[];
  mempool: any;
  depinChatIdentity?: DepinChatIdentity | null;
}

function normalizeAssetAmountMaybe(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : (raw as number);
  if (!Number.isFinite(n)) return 0;

  // Heuristic: many RPCs return asset amounts in satoshis (1e8). If it looks like an integer
  // larger than typical human-scale amounts, treat it as satoshis.
  if (Number.isInteger(n) && Math.abs(n) > 100_000) {
    return n / 1e8;
  }

  return n;
}

function parsePubkeyMaybe(pubkeyResult: any): string | null {
  const candidate =
    (typeof pubkeyResult === "string" && pubkeyResult) ||
    pubkeyResult?.pubkey ||
    pubkeyResult?.result?.pubkey ||
    (typeof pubkeyResult?.result === "string" ? pubkeyResult.result : null) ||
    null;

  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();

  // Accept compressed (33 bytes) or uncompressed (65 bytes) pubkeys in hex.
  if (!/^[0-9a-fA-F]{66}$/.test(trimmed) && !/^[0-9a-fA-F]{130}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function parsePubkeyRevealedMaybe(pubkeyResult: any): boolean | null {
  if (pubkeyResult && typeof pubkeyResult === "object" && "revealed" in pubkeyResult) {
    return pubkeyResult.revealed === 1;
  }
  return null;
}

export function Chat({ wallet, assets, mempool, depinChatIdentity }: ChatProps) {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: 1,
      text: "Welcome to Chat DePIN",
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = React.useState("");
  const [showAssets, setShowAssets] = React.useState(false);
  const [assetAddresses, setAssetAddresses] = React.useState<Record<string, string>>({});
  const [chatAssets, setChatAssets] = React.useState<Record<string, number>>({});
  const [selectedAsset, setSelectedAsset] = React.useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = React.useState<string | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [validityStatus, setValidityStatus] = React.useState<any>(null);
  const [messageExpiryHours, setMessageExpiryHours] = React.useState<number | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const chatInputRef = React.useRef<HTMLTextAreaElement>(null);
  
  // Estado para el listado de direcciones con pubkeys
  const [showAddressList, setShowAddressList] = React.useState(false);
  const [addressList, setAddressList] = React.useState<Array<{address: string, amount: number, pubkey: string | null}>>([]);
  const [loadingAddressList, setLoadingAddressList] = React.useState(false);
  const [showDepinAddressQr, setShowDepinAddressQr] = React.useState(false);
  const [depinChatPubkeyRevealed, setDepinChatPubkeyRevealed] = React.useState<boolean | null>(null);
  const depinPubkeyIntervalRef = React.useRef<number | null>(null);

  // Preparar lista de recipients para el hook (address + pubkey)
  const recipientInfoList = React.useMemo(() => {
    return addressList.map(item => ({
      address: item.address,
      pubkey: item.pubkey
    }));
  }, [addressList]);

  const chatAddress = depinChatIdentity?.address ?? null;
  const depinAddressText = chatAddress ?? selectedAddress ?? "";
  const depinAddressQrSrc = depinAddressText
    ? "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" + encodeURIComponent(depinAddressText)
    : "";

  // Poll getpubkey for the DePIN chat address until revealed on-chain.
  React.useEffect(() => {
    if (!wallet || !chatAddress) return;

    // If already revealed, ensure we stop polling.
    if (depinChatPubkeyRevealed === true) {
      if (depinPubkeyIntervalRef.current !== null) {
        window.clearInterval(depinPubkeyIntervalRef.current);
        depinPubkeyIntervalRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const checkOnce = async () => {
      try {
        const res: any = await wallet.rpc('getpubkey', [chatAddress]);
        const revealed = parsePubkeyRevealedMaybe(res);

        if (cancelled) return;

        if (revealed !== null) {
          setDepinChatPubkeyRevealed(revealed);
          if (revealed === true && depinPubkeyIntervalRef.current !== null) {
            window.clearInterval(depinPubkeyIntervalRef.current);
            depinPubkeyIntervalRef.current = null;
          }
          return;
        }

        // Fallback: consider revealed if pubkey parses as valid hex.
        const pk = parsePubkeyMaybe(res);
        setDepinChatPubkeyRevealed(pk ? true : false);
      } catch {
        if (cancelled) return;
        setDepinChatPubkeyRevealed(null);
      }
    };

    // Initial check when entering chat / when wallet+address are ready.
    checkOnce();

    // Poll every 25s until revealed.
    if (depinPubkeyIntervalRef.current === null) {
      depinPubkeyIntervalRef.current = window.setInterval(checkOnce, 25_000);
    }

    return () => {
      cancelled = true;
      if (depinPubkeyIntervalRef.current !== null) {
        window.clearInterval(depinPubkeyIntervalRef.current);
        depinPubkeyIntervalRef.current = null;
      }
    };
  }, [wallet, chatAddress, depinChatPubkeyRevealed]);

  // Keep selectedAddress pinned to the dedicated chat address (account 100)
  React.useEffect(() => {
    if (chatAddress) {
      setSelectedAddress(chatAddress);
    }
  }, [chatAddress]);

  // Hook DePIN para mensajería
  const {
    messages: depinMessages,
    isPolling,
    setIsPolling,
    error: depinError,
    stats,
    lastPoll,
    sendMessage: sendDePINMessage,
    refreshMessages,
    fetchStats,
    getMsgInfo,
  } = useDePINChat(wallet, selectedAsset, selectedAddress, recipientInfoList, depinChatIdentity ?? null);

  const shortenAddress = React.useCallback((address?: string) => {
    const a = (address ?? '').trim();
    if (a.length <= 12) return a;
    return `${a.slice(0, 4)}...${a.slice(-4)}`;
  }, []);

  const computeExpiresDate = React.useCallback(
    (unixTimestamp: number) => {
      if (!messageExpiryHours || messageExpiryHours <= 0) return undefined;
      const expiresAt = unixTimestamp + messageExpiryHours * 60 * 60;
      return new Date(expiresAt * 1000).toLocaleString();
    },
    [messageExpiryHours]
  );

  const extractBotModel = (text: string): { cleanText: string; model: string | null } => {
    // Expected formats (at the start):
    // [BOT]: [google/gemma-3-1b]
    // [BOT]: google/gemma-3-1b
    // [BOT] google/gemma-3-1b
    const trimmed = text ?? "";
    const bracketed = /^\s*\[BOT\]\s*:?\s*\[([^\]]+)\]\s*\n?/i.exec(trimmed);
    if (bracketed) {
      return { cleanText: trimmed.slice(bracketed[0].length).trimStart(), model: bracketed[1].trim() };
    }

    const plain = /^\s*\[BOT\]\s*:?\s*([^\n]+)\s*\n?/i.exec(trimmed);
    if (plain) {
      const maybeModel = plain[1].trim();
      return { cleanText: trimmed.slice(plain[0].length).trimStart(), model: maybeModel || null };
    }

    return { cleanText: trimmed, model: null };
  };

  const renderBotMarkdown = (text: string) => {
    const html = DOMPurify.sanitize(
      marked.parse(text, {
        gfm: true,
        breaks: true,
      }) as string
    );

    return <div className="chat-md" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const scrollToBottom = () => {
    // Solo hacer scroll dentro del contenedor de mensajes, no de toda la página
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const autoResizeChatInput = React.useCallback((textarea: HTMLTextAreaElement) => {
    // Reset height to allow shrinking
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const minHeight = textarea.value.trim() ? scrollHeight : 48;
    textarea.style.height = `${minHeight}px`;
  }, []);

  React.useEffect(() => {
    if (chatInputRef.current) {
      autoResizeChatInput(chatInputRef.current);
    }
  }, [inputText, autoResizeChatInput]);

  React.useEffect(() => {
    // Solo hacer scroll si hay mensajes y estamos conectados
    if (messages.length > 1 && isConnected) {
      scrollToBottom();
    }
  }, [messages, isConnected]);

  // Sincronizar mensajes DePIN con la UI de mensajes local
  React.useEffect(() => {
    if (depinMessages && depinMessages.length > 0 && isConnected) {
      // Sort messages by timestamp (oldest first)
      const sortedMessages = [...depinMessages].sort((a, b) => a.timestamp - b.timestamp);
      
      const makeDeliveryKey = (
        token: string | null,
        senderAddress: string | undefined,
        unixTimestamp: number | undefined,
        text: string
      ) => {
        if (!token || !senderAddress || !unixTimestamp) return null;
        return `${token}|${senderAddress}|${unixTimestamp}|${text}`;
      };

      const poolMessages: Message[] = sortedMessages.map((msg, idx) => {
        const senderType: "user" | "bot" = msg.sender === selectedAddress ? "user" : "bot";
        const unixTimestamp = msg.timestamp;
        const deliveryKey = makeDeliveryKey(selectedAsset, msg.sender, unixTimestamp, msg.message) ?? undefined;

        return {
          id: idx + 100, // Offset to avoid conflicts with local messages
          text: msg.message,
          sender: senderType,
          timestamp: new Date(unixTimestamp * 1000),
          token: selectedAsset ?? undefined,
          unixTimestamp,
          deliveryKey,
          // DePIN specific fields
          senderAddress: msg.sender,
          sendDate: msg.date,
          expiresDate: computeExpiresDate(unixTimestamp) ?? msg.expires,
          isDePIN: true,
        };
      });

      setMessages((prev) => {
        const prevConfirmedKeys = new Set(
          prev
            .filter((m) => m.delivery === "confirmed" && m.deliveryKey)
            .map((m) => m.deliveryKey as string)
        );

        const prevPendingByKey = new Map(
          prev
            .filter((m) => m.delivery === "pending" && m.deliveryKey)
            .map((m) => [m.deliveryKey as string, m] as const)
        );

        const poolKeys = new Set(poolMessages.map((m) => m.deliveryKey).filter(Boolean) as string[]);

        const poolWithDelivery = poolMessages.map((m) => {
          if (!m.deliveryKey) return m;
          if (prevConfirmedKeys.has(m.deliveryKey) || prevPendingByKey.has(m.deliveryKey)) {
            return { ...m, delivery: "confirmed" as const };
          }
          return m;
        });

        const remainingPending = Array.from(prevPendingByKey.entries())
          .filter(([key]) => !poolKeys.has(key))
          .map(([, m]) => m);

        const merged = [...poolWithDelivery, ...remainingPending];
        merged.sort((a, b) => {
          const ta = (a.unixTimestamp ?? Math.floor(a.timestamp.getTime() / 1000)) * 1000;
          const tb = (b.unixTimestamp ?? Math.floor(b.timestamp.getTime() / 1000)) * 1000;
          return ta - tb;
        });

        return merged;
      });
    }
  }, [depinMessages, isConnected, selectedAddress, selectedAsset, computeExpiresDate]);

  // Obtener stats periódicamente si está conectado
  React.useEffect(() => {
    if (isConnected && selectedAsset) {
      fetchStats();
      const interval = setInterval(fetchStats, 30000); // Cada 30 segundos
      return () => clearInterval(interval);
    }
  }, [isConnected, selectedAsset, fetchStats]);

  // Obtener configuración del pool (por ejemplo expiración) al conectar
  React.useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    (async () => {
      try {
        const info: any = await getMsgInfo();
        const hours = typeof info?.messageexpiryhours === 'number' ? info.messageexpiryhours : null;
        if (!cancelled) setMessageExpiryHours(hours);
      } catch {
        if (!cancelled) setMessageExpiryHours(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, getMsgInfo]);

  const handleSend = async () => {
    console.log('=== handleSend START ===');
    console.log('Input text:', inputText);

    if (inputText.trim() === "") {
      console.log('Empty input, returning');
      return;
    }

    console.log('Current states:');
    console.log('  selectedAsset:', selectedAsset);
    console.log('  selectedAddress:', selectedAddress);
    console.log('  isConnected:', isConnected);
    console.log('  isPolling:', isPolling);

    // Verificar que hay un asset seleccionado
    if (!selectedAsset) {
      console.error('ERROR: No asset selected!');
      alert("Please select an asset first");
      return;
    }

    // Verificar que hay una dirección
    if (!selectedAddress) {
      console.error('ERROR: No address found for selected asset!');
      alert("No address found for selected asset");
      return;
    }

    console.log('All validations passed, attempting to send message...');

    const makeDeliveryKey = (
      token: string | null,
      senderAddress: string | null,
      unixTimestamp: number,
      text: string
    ) => {
      if (!token || !senderAddress) return null;
      return `${token}|${senderAddress}|${unixTimestamp}|${text}`;
    };

    const messageText = inputText;
    const unixTimestamp = Math.floor(Date.now() / 1000);
    const deliveryKey = makeDeliveryKey(selectedAsset, selectedAddress, unixTimestamp, messageText);

    // Optimistic UI: add message immediately as pending
    if (deliveryKey) {
      const sendDate = new Date(unixTimestamp * 1000).toLocaleString();
      const expiresDate = computeExpiresDate(unixTimestamp);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: messageText,
          sender: "user",
          timestamp: new Date(unixTimestamp * 1000),
          token: selectedAsset ?? undefined,
          unixTimestamp,
          delivery: "pending",
          deliveryKey,
          isDePIN: true,
          senderAddress: selectedAddress ?? undefined,
          sendDate,
          expiresDate,
        },
      ]);
    }

    // Clear input immediately
    setInputText("");

    try {
      // Enviar mensaje a través de DePIN usando el servidor RPC configurado
      console.log('📤 Sending message via DePIN...');
      const result = await sendDePINMessage(messageText);
      console.log('✅ Message sent successfully:', result);

      // Refrescar mensajes después de un breve delay para dar tiempo al servidor
      setTimeout(async () => {
        console.log('🔄 Refreshing messages after send...');
        await refreshMessages();
      }, 1000);
      
    } catch (error: any) {
      console.error("Error sending message:", error);
      // Rollback optimistic message if send fails
      if (deliveryKey) {
        setMessages((prev) => prev.filter((m) => m.deliveryKey !== deliveryKey));
      }
      alert(`Failed to send message: ${error.message}`);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setIsPolling(false);
    setSelectedAsset(null);
    setSelectedAddress(null);
    setMessages([{
      id: 1,
      text: "Welcome to Chat DePIN",
      sender: "bot",
      timestamp: new Date(),
    }]);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const loadAssetAddresses = async () => {
    setShowAssets(!showAssets);

    if (!showAssets && Object.keys(assetAddresses).length === 0) {
      if (!chatAddress || !depinChatIdentity) {
        setMessages([{
          id: 1,
          text: "DePIN Chat identity is not available. Please log in/unlock your mnemonic and reload.",
          sender: "bot",
          timestamp: new Date(),
        }]);
        return;
      }

      const addresses: Record<string, string> = {};
      console.log('🔵 RPC CALL: listassetbalancesbyaddress (chat address)');
      console.log('📤 Parameters:', JSON.stringify([chatAddress], null, 2));

      let balance: any = null;
      try {
        balance = await wallet.rpc('listassetbalancesbyaddress', [chatAddress]);
        console.log('✅ RPC SUCCESS: listassetbalancesbyaddress (chat address)');
        console.log('📥 Response:', balance);
      } catch (e: any) {
        console.error('❌ RPC ERROR: listassetbalancesbyaddress failed for chat address');
        console.error(e);
        setMessages([{
          id: 1,
          text: `Failed to load chat assets for ${chatAddress}.\n\nMake sure your RPC supports listassetbalancesbyaddress and try again.`,
          sender: 'bot',
          timestamp: new Date(),
        }]);
        return;
      }

      const nextChatAssets: Record<string, number> = {};
      if (balance && typeof balance === 'object') {
        for (const assetName of Object.keys(balance)) {
          if (assetName === wallet.baseCurrency) continue;
          const amount = normalizeAssetAmountMaybe(balance[assetName]);
          if (amount <= 0) continue;
          nextChatAssets[assetName] = amount;
          addresses[assetName] = chatAddress;
        }
      }

      setChatAssets(nextChatAssets);
      setAssetAddresses(addresses);
    }
  };

  const handleAssetSelection = async (assetName: string) => {
    console.log('=== handleAssetSelection START ===');
    console.log('Selected asset:', assetName);
    console.log('Asset type:', getAssetType(assetName));
    console.log('Current assetAddresses:', assetAddresses);

    setSelectedAsset(assetName);
    const address = assetAddresses[assetName] || null;
    console.log('Address for asset from assetAddresses:', address);
    
    // Verificar que tenemos una dirección válida
    if (!address || address === "Not found in wallet" || address === "Error loading" || address === "Loading...") {
      console.error('ERROR: No valid address found for asset in assetAddresses');
      console.log('assetAddresses keys:', Object.keys(assetAddresses));
      setSelectedAddress(null);
      setMessages([{
        id: 1,
        text: `Could not find a valid address for asset ${assetName}.\n\nPlease wait for the asset list to load completely and try again.`,
        sender: "bot",
        timestamp: new Date(),
      }]);
      return;
    }
    
    setSelectedAddress(address);
    console.log('Set selectedAddress to:', address);

    // Auto-load addresses list when selecting an asset
    console.log('Auto-loading addresses list for asset:', assetName);
    setTimeout(() => {
      loadAddressesWithPubkeysInternal(assetName);
    }, 100);

    // La dirección ya fue validada arriba, proceder a conectar
    console.log('Asset has valid address, attempting to connect...');
    console.log('Asset type:', getAssetType(assetName));
    
    const hasPubKey = depinChatPubkeyRevealed;
    const assetTypeLabel = getAssetTypeLabel(assetName);

    // Para cualquier tipo de asset, conectar si tiene pubkey o si no podemos verificar
    if (hasPubKey === true) {
      // Asset con pubkey disponible - conectar
      console.log('Asset has pubkey, connecting...');
      setValidityStatus({ has_asset: true, valid: 1, blocked: false, amount: chatAssets[assetName] });
      setIsConnected(true);
      setIsPolling(true);
      console.log('States set: isConnected=true, isPolling=true');

      setMessages([{
        id: 1,
        text: `Connected to ${assetTypeLabel} messaging network\nAsset: ${assetName}\nAddress: ${address.substring(0, 15)}...\n\nFetching messages from RPC server...`,
        sender: "bot",
        timestamp: new Date(),
      }]);
      console.log('=== handleAssetSelection END (success) ===');
    } else if (hasPubKey === null) {
      console.log('Cannot verify pubkey, connecting anyway...');
      // No podemos verificar pubkey - advertencia pero conectamos igual
      setValidityStatus({ has_asset: true, valid: 1, blocked: false, amount: chatAssets[assetName] });
      setIsConnected(true);
      setIsPolling(true);

      setMessages([{
        id: 1,
        text: `Connected to ${assetTypeLabel} messaging network (unverified)\nAsset: ${assetName}\nAddress: ${address.substring(0, 15)}...\n\nWarning: Cannot verify pubkey status.\nTrying to fetch messages...`,
        sender: "bot",
        timestamp: new Date(),
      }]);
      console.log('=== handleAssetSelection END (unverified) ===');
    } else {
      // No hay pubkey - no podemos descifrar mensajes
      console.log('No pubkey available, cannot connect');
      setMessages([{
        id: 1,
        text: `Cannot connect: Asset ${assetName} doesn't have a public key.\n\nTo use messaging, you need to reveal the public key for this address by sending a transaction from it.`,
        sender: "bot",
        timestamp: new Date(),
      }]);
      console.log('=== handleAssetSelection END (no pubkey) ===');
    }
  };

  // Determinar el tipo de asset basado en su prefijo
  const getAssetType = (assetName: string): 'depin' | 'qualifier' | 'normal' => {
    if (assetName.startsWith('&')) return 'depin';
    if (assetName.startsWith('#')) return 'qualifier';
    return 'normal';
  };

  // Verificar si es un asset válido para mensajería (cualquier asset con balance > 0)
  const isValidMessagingAsset = (assetName: string) => {
    return !!(assetName && chatAssets[assetName] && chatAssets[assetName] > 0);
  };

  // Obtener el icono según el tipo de asset
  const getAssetIcon = (assetName: string): React.ReactNode => {
    const type = getAssetType(assetName);
    switch (type) {
      case 'depin': return '🔒';
      case 'qualifier': return '#';
      default:
        return (
          <FaUserGroup
            size={16}
            style={{ verticalAlign: "-0.15em" }}
            aria-label="Chat"
          />
        );
    }
  };

  // Obtener etiqueta del tipo de asset
  const getAssetTypeLabel = (assetName: string) => {
    const type = getAssetType(assetName);
    switch (type) {
      case 'depin': return 'DePIN';
      case 'qualifier': return 'Qualifier';
      default: return 'Asset';
    }
  };

  // Internal function that accepts asset parameter for auto-loading
  const loadAddressesWithPubkeysInternal = async (assetName: string) => {
    if (!assetName) return;
    
    setLoadingAddressList(true);
    setShowAddressList(true);
    
    try {
      console.log(`🔵 RPC CALL: listaddressesbyasset`);
      console.log(`📤 Parameters: ["${assetName}"]`);
      
      // Obtener todas las direcciones que tienen este asset
      const addressesData: Record<string, unknown> = await wallet.rpc("listaddressesbyasset", [assetName]) as Record<string, unknown>;
      
      console.log(`✅ RPC SUCCESS: listaddressesbyasset`);
      console.log(`📥 Response:`, addressesData);
      
      const addresses = Object.keys(addressesData);
      const results: Array<{address: string, amount: number, pubkey: string | null}> = [];
      
      // Para cada dirección, obtener su pubkey (on-chain) usando getpubkey.
      for (const address of addresses) {
        const amount = normalizeAssetAmountMaybe(addressesData[address]);
        let pubkey: string | null = null;

        try {
          console.log(`🔵 RPC CALL: getpubkey`);
          console.log(`📤 Parameters: ["${address}"]`);

          const pubkeyResult: any = await wallet.rpc("getpubkey", [address]);

          console.log(`✅ RPC SUCCESS: getpubkey for ${address}`);
          console.log(`📥 Response:`, pubkeyResult);

          const revealed = parsePubkeyRevealedMaybe(pubkeyResult);
          if (revealed === false) {
            pubkey = null;
          } else {
            pubkey = parsePubkeyMaybe(pubkeyResult);
          }
        } catch (error: any) {
          console.warn(`❌ RPC ERROR: getpubkey failed for ${address}`);
          console.warn('Error:', error);
          // pubkey se queda en null
        }
        
        results.push({
          address,
          amount,
          pubkey
        });
      }
      
      setAddressList(results);
      console.log('📋 Address list loaded:', results);
      
    } catch (error: any) {
      console.error("Error loading addresses with pubkeys:", error);
      alert(`Failed to load addresses: ${error.message}`);
    } finally {
      setLoadingAddressList(false);
    }
  };

  // Public wrapper for button click (uses selectedAsset)
  const loadAddressesWithPubkeys = async () => {
    if (!selectedAsset) return;
    loadAddressesWithPubkeysInternal(selectedAsset);
  };

  return (
    <article>
      <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span />
        <span
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto",
            gridTemplateRows: "auto auto",
            columnGap: "0.5rem",
            rowGap: "0.25rem",
            justifyItems: "end",
            textAlign: "right",
          }}
        >
          <span style={{ fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <span
              aria-label="DePIN pubkey status"
              title={
                depinChatPubkeyRevealed === true
                  ? "PubKey revealed on-chain"
                  : depinChatPubkeyRevealed === false
                    ? "PubKey not revealed on-chain"
                    : "Checking pubkey status"
              }
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                display: "inline-block",
                backgroundColor:
                  depinChatPubkeyRevealed === true
                    ? "#22c55e"
                    : depinChatPubkeyRevealed === false
                      ? "#ef4444"
                      : "#9ca3af",
              }}
            />
            DePIN Address
          </span>
          <button
            type="button"
            aria-label="Show DePIN address QR"
            disabled={!depinAddressText}
            onClick={() => setShowDepinAddressQr((v) => !v)}
            style={{
              width: "auto",
              padding: "0.35rem 0.6rem",
              margin: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FaQrcode />
          </button>
          <span
            style={{
              gridColumn: "1 / 3",
              fontSize: "0.9rem",
              fontWeight: "normal",
              wordBreak: "break-all",
            }}
          >
            {depinAddressText || "-"}
          </span>
        </span>
      </h3>

      {showDepinAddressQr && depinAddressText && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: "0.75rem" }}>
          <img
            alt="DePIN address QR"
            src={depinAddressQrSrc}
            style={{
              width: "90%",
              maxWidth: "400px",
              marginBottom: 20,
              padding: "10px",
              background: "white",
              borderRadius: "10px",
            }}
          />
        </div>
      )}

      <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Asset Messaging</span>
        {selectedAsset && (
          <span style={{ fontSize: "0.9rem", fontWeight: "normal" }}>
            {getAssetIcon(selectedAsset)} {selectedAsset}
          </span>
        )}
      </h3>

      {/* Messaging Connection Controls - available for all asset types */}
      {selectedAsset && isValidMessagingAsset(selectedAsset) && (
        <div className="depin-control-panel" style={{
          marginTop: "1rem",
          padding: "1rem",
          border: "2px solid #e5e7eb",
          borderRadius: "12px",
          backgroundColor: "#f9fafb",
        }}>
          {/* Status indicators */}
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", flexWrap: "wrap" }}>
            <div>
              <strong>Status:</strong>{" "}
              <span style={{ color: isConnected ? "#22c55e" : "#6b7280" }}>
                {isConnected ? "● Connected" : "○ Disconnected"}
              </span>
            </div>
            <div>
              <strong>Polling:</strong>{" "}
              <span style={{ color: isPolling ? "#3b82f6" : "#6b7280" }}>
                {isPolling ? "ON" : "OFF"}
              </span>
            </div>
            {stats && (
              <>
                <div>
                  <strong>Messages:</strong> {stats.total_messages || 0}
                </div>
                <div>
                  <strong>Senders:</strong> {stats.unique_senders || 0}
                </div>
              </>
            )}
            {lastPoll && (
              <div>
                <strong>Last Poll:</strong> {lastPoll.toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Error display - hide 'no messages' type errors */}
          {depinError && !depinError.toLowerCase().includes('no message') && !depinError.toLowerCase().includes('empty') && (
            <div className="depin-error" style={{
              marginTop: "0.5rem",
              padding: "0.5rem",
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              borderRadius: "6px",
              fontSize: "0.8rem",
            }}>
              ⚠ {depinError}
            </div>
          )}

          {/* Validity status */}
          {validityStatus && (
            <div className={validityStatus.valid === 1 && !validityStatus.blocked ? "depin-success" : "depin-error"} style={{
              marginTop: "0.5rem",
              padding: "0.5rem",
              backgroundColor: validityStatus.valid === 1 && !validityStatus.blocked ? "#d1fae5" : "#fee2e2",
              color: validityStatus.valid === 1 && !validityStatus.blocked ? "#065f46" : "#991b1b",
              borderRadius: "6px",
              fontSize: "0.8rem",
            }}>
              {validityStatus.valid === 1 && !validityStatus.blocked
                ? `✓ Valid DePIN asset (Amount: ${validityStatus.amount})`
                : `✗ Invalid or blocked DePIN asset`}
            </div>
          )}
        </div>
      )}

      {/* Chat container */}
      <div
        style={{
          marginTop: "1.5rem",
          display: "flex",
          flexDirection: "column",
          height: "600px",
          border: "2px solid #e5e7eb",
          borderRadius: "16px",
          overflow: "hidden",
          backgroundColor: "#ffffff",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        }}
        className="chat-container"
      >
        {/* Messages area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            backgroundColor: "#f9fafb",
            backgroundImage: "linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)",
          }}
          className="chat-messages"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                display: "flex",
                justifyContent:
                  message.sender === "user" ? "flex-end" : "flex-start",
                animation: "slideIn 0.3s ease-out",
              }}
            >
              <div
                className={message.sender === "user" ? "chat-message-user" : "chat-message-bot"}
                style={{
                  maxWidth: "70%",
                  padding: "0.5rem 0.5rem",
                  borderRadius: message.sender === "user"
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                  backgroundColor:
                    message.sender === "user"
                      ? "rgb(247 232 209)"
                      : "rgb(239 239 239)",
                  color:
                    message.sender === "user"
                      ? "rgb(63 54 54)"
                      : "#1f2937",
                  boxShadow: message.sender === "user"
                    ? "rgb(42 47 55 / 74%) 0px 2px 8px"
                    : "rgb(42 47 55 / 74%) 0px 2px 8px",
                  border: message.sender === "user"
                    ? "none"
                    : "1px solid #e5e7eb",
                }}
              >
                {/* DePIN Message Format */}
                {message.isDePIN && (
                  <>
                    {/* Sender (left) + Expires (right) */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: "0.75rem",
                        margin: "0 0 0.5rem 0",
                        opacity: message.sender === "user" ? 0.95 : 0.8,
                      }}
                    >
                      <span style={{ fontWeight: "bold", fontSize: "0.85rem" }}>
                        {shortenAddress(message.senderAddress)}
                      </span>
                      {message.expiresDate && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            opacity: message.sender === "user" ? 0.85 : 0.6,
                          }}
                        >
                          Expires: {message.expiresDate}
                        </span>
                      )}
                    </div>
                    {/* BOT model (if present in prefix) */}
                    {message.sender === "bot" && extractBotModel(message.text).model && (
                      <p
                        style={{
                          margin: "0 0 0.75rem 0",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          opacity: 0.6,
                        }}
                      >
                        <FaRobot
                          size={14}
                          style={{ marginRight: "0.35rem", verticalAlign: "middle" }}
                        />
                        {extractBotModel(message.text).model}
                      </p>
                    )}
                    {/* Message Content */}
                    <div
                      style={{
                        margin: 0,
                        wordWrap: "break-word",
                        lineHeight: "1.5",
                        fontSize: "0.95rem",
                        padding: "0.5rem",
                        whiteSpace: message.sender === "user" ? "pre-wrap" : "normal",
                        backgroundColor: "transparent",
                        borderRadius: "8px",
                      }}
                    >
                      {message.sender === "bot" ? renderBotMarkdown(extractBotModel(message.text).cleanText) : message.text}
                    </div>
                  </>
                )}
                {/* Regular Message Format */}
                {!message.isDePIN && (
                  <div
                    style={{
                      margin: 0,
                      wordWrap: "break-word",
                      lineHeight: "1.5",
                      fontSize: "0.95rem",
                      whiteSpace: message.sender === "user" ? "pre-wrap" : "normal",
                    }}
                  >
                    {message.sender === "bot" ? renderBotMarkdown(extractBotModel(message.text).cleanText) : message.text}
                  </div>
                )}
                <small
                  style={{
                    display: "block",
                    marginTop: "0.375rem",
                    opacity: message.sender === "user" ? 0.9 : 0.6,
                    fontSize: "0.7rem",
                    textAlign: "right",
                  }}
                >
                  {message.sender === "user" && message.delivery === "pending" && (
                    <FaRegClock 
                      size={15}
                      color="#835608ff"
                      style={{ marginRight: "0.35rem", verticalAlign: "middle" }}
                    />
                  )}
                  {message.sender === "user" && message.delivery === "confirmed" && (
                    <FaRegCircleCheck 
                      size={15}
                      color="#22c55e"
                      style={{ marginRight: "0.35rem", verticalAlign: "middle" }}
                    />
                  )}
                  {message.isDePIN && message.sendDate
                    ? message.sendDate
                    : message.timestamp.toLocaleTimeString()}
                </small>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          style={{
            borderTop: "2px solid #e5e7eb",
            padding: "1rem 1.25rem",
            display: "flex",
            gap: "0.75rem",
            alignItems: "flex-end",
            backgroundColor: "#ffffff",
          }}
          className="chat-input-area"
        >
          <textarea
            ref={chatInputRef}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              autoResizeChatInput(e.target);
            }}
            onInput={(e) => {
              autoResizeChatInput(e.currentTarget);
            }}
            onKeyDown={handleKeyPress}
            placeholder={isConnected ? "Type your message..." : "Select an asset to start messaging..."}
            disabled={!isConnected}
            rows={1}
            style={{
              flex: 1,
              padding: "0.875rem 1rem",
              borderRadius: "24px",
              border: "2px solid #d1d5db",
              backgroundColor: isConnected ? "#ffffff" : "#e5e7eb",
              margin: 0,
              fontSize: "0.95rem",
              outline: "none",
              transition: "all 0.2s",
              opacity: isConnected ? 1 : 0.6,
              resize: "none",
              overflow: "hidden",
              lineHeight: "1.35",
              minHeight: "48px",
              fontFamily: "inherit",
            }}
            onFocus={(e) => {
              if (isConnected) {
                // Softer focus styling (avoid strong blue border)
                e.target.style.border = "2px solid rgba(59, 130, 246, 0.35)";
                e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.12)";
                e.target.style.backgroundColor = "#ffffff";
              }
            }}
            onBlur={(e) => {
              e.target.style.border = "2px solid #d1d5db";
              e.target.style.boxShadow = "none";
              e.target.style.backgroundColor = isConnected ? "#ffffff" : "#e5e7eb";
            }}
          />
          <div
            onClick={handleSend}
            className={inputText.trim() && isConnected ? "chat-send-button-active" : "chat-send-button-inactive"}
            style={{
              cursor: inputText.trim() && isConnected ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: inputText.trim() && isConnected
                ? "#3b82f6"
                : "#d1d5db",
              color: "#ffffff",
              transition: "all 0.2s",
              boxShadow: inputText.trim() && isConnected
                ? "0 4px 12px rgba(59, 130, 246, 0.4)"
                : "none",
              transform: "scale(1)",
            }}
            onMouseEnter={(e) => {
              if (inputText.trim() && isConnected) {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.backgroundColor = "#2563eb";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              if (inputText.trim() && isConnected) {
                e.currentTarget.style.backgroundColor = "#3b82f6";
              }
            }}
            title={!isConnected ? "Select an asset first" : "Send message"}
          >
            <IconSend />
          </div>
        </div>
      </div>

      {/* Asset List Button */}
      <div style={{ marginTop: "1rem", textAlign: "center", display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={loadAssetAddresses}>
          {showAssets ? "Hide Asset List" : "Asset List"}
        </button>
        {selectedAsset && (
          <>
            <button 
              onClick={handleDisconnect}
              style={{
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
              }}
            >
              Disconnect
            </button>
            <button 
              onClick={loadAddressesWithPubkeys}
              disabled={loadingAddressList}
              style={{
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
              }}
            >
              {loadingAddressList ? "Loading..." : "Show All Addresses"}
            </button>
          </>
        )}
      </div>

      {/* Address List Table - Shows all addresses with the selected asset */}
      {showAddressList && selectedAsset && (
        <div style={{ marginTop: "1rem" }}>
          <h4>Addresses holding {selectedAsset}</h4>
          {addressList.length === 0 && !loadingAddressList ? (
            <p>No addresses found or still loading...</p>
          ) : (
            <table role="grid">
              <thead>
                <tr>
                  <th>Address</th>
                  <th style={{ textAlign: "center", width: "100px" }}>Amount</th>
                  <th>Public Key</th>
                </tr>
              </thead>
              <tbody>
                {addressList.map((item) => (
                  <tr key={item.address}>
                    <td style={{
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                      wordBreak: "break-all"
                    }}>
                      {item.address}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {item.amount}
                    </td>
                    <td style={{
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                      wordBreak: "break-all",
                      color: item.pubkey ? "#22c55e" : "#ef4444"
                    }}>
                      {item.pubkey || "Not available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: "0.5rem", textAlign: "center" }}>
            <button onClick={() => setShowAddressList(false)}>
              Hide Address List
            </button>
          </div>
        </div>
      )}

      {/* Asset List Table */}
      {showAssets && (
        <div style={{ marginTop: "1rem" }}>
          <table role="grid">
            <thead>
              <tr>
                <th style={{ width: "50px", textAlign: "center" }}>Select</th>
                <th>Asset Name</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(chatAssets).map((assetName) => {
                if (assetName === wallet.baseCurrency) return null;
                if (chatAssets[assetName] === 0) return null;

                const address = assetAddresses[assetName] || "Loading...";

                return (
                  <tr key={assetName}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="radio"
                        name="selected-asset"
                        checked={selectedAsset === assetName}
                        onChange={() => handleAssetSelection(assetName)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td>
                      <span title={getAssetTypeLabel(assetName)}>{getAssetIcon(assetName)} </span>
                      {assetName}
                    </td>
                    <td style={{
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                      wordBreak: "break-all"
                    }}>
                      {address}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chat-message-user {
          box-shadow: rgb(42 47 55 / 74%) 0px 2px 8px;
        }

        .chat-message-bot {
          box-shadow: rgb(42 47 55 / 74%) 0px 2px 8px;
        }

        /* Light mode scrollbar */
        [data-theme="light"] .chat-messages::-webkit-scrollbar {
          width: 8px;
        }

        [data-theme="light"] .chat-messages::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 10px;
        }

        [data-theme="light"] .chat-messages::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 10px;
        }

        [data-theme="light"] .chat-messages::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }

        /* Dark mode scrollbar */
        [data-theme="dark"] .chat-messages::-webkit-scrollbar {
          width: 8px;
        }

        [data-theme="dark"] .chat-messages::-webkit-scrollbar-track {
          background: #1a1a1a;
          border-radius: 10px;
        }

        [data-theme="dark"] .chat-messages::-webkit-scrollbar-thumb {
          background: #4b5563;
          border-radius: 10px;
        }

        [data-theme="dark"] .chat-messages::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }

        /* Dark mode styles */
        [data-theme="dark"] .chat-container {
          background-color: #1a1a1a !important;
          border-color: #333333 !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3) !important;
        }

        [data-theme="dark"] .chat-messages {
          background-color: #0a0a0a !important;
          background-image: linear-gradient(to bottom, #0a0a0a 0%, #151515 100%) !important;
        }

        [data-theme="dark"] .chat-input-area {
          background-color: #1a1a1a !important;
          border-top-color: #333333 !important;
        }

        [data-theme="dark"] .chat-input-area textarea {
          background-color: #151515 !important;
          border-color: #333333 !important;
          color: var(--neurai-text) !important;
        }

        [data-theme="dark"] .chat-input-area textarea::placeholder {
          color: var(--neurai-text-secondary) !important;
        }

        [data-theme="dark"] .chat-input-area textarea:focus {
          background-color: #1a1a1a !important;
          border-color: var(--neurai-primary) !important;
        }

        [data-theme="dark"] .chat-message-user {
          background-color: rgb(85 80 73) !important;
          color: #e5e7eb !important;
          box-shadow: rgb(42 47 55 / 74%) 0px 2px 8px !important;
        }

        [data-theme="dark"] .chat-message-bot {
          background-color: #1e1e1e !important;
          color: var(--neurai-text) !important;
          border-color: #333333 !important;
        }

        [data-theme="dark"] .chat-send-button-active {
          background-color: var(--neurai-primary) !important;
          box-shadow: 0 4px 12px rgba(108, 92, 231, 0.5) !important;
        }

        [data-theme="dark"] .chat-send-button-active:hover {
          background-color: var(--neurai-primary-hover) !important;
        }

        [data-theme="dark"] .chat-send-button-inactive {
          background-color: #2a2a2a !important;
        }

        /* Dark mode - DePIN Controls */
        [data-theme="dark"] .depin-control-panel {
          background-color: #1a1a1a !important;
          border-color: #333333 !important;
        }

        [data-theme="dark"] .depin-control-panel input[type="text"] {
          background-color: #0a0a0a !important;
          border-color: #333333 !important;
          color: var(--neurai-text) !important;
        }

        [data-theme="dark"] .depin-control-panel input[type="text"]:disabled {
          background-color: #151515 !important;
          opacity: 0.6;
        }

        [data-theme="dark"] .depin-error {
          background-color: #2d0a0a !important;
          color: #ff6b6b !important;
        }

        [data-theme="dark"] .depin-success {
          background-color: #0a2d1a !important;
          color: #6bff9b !important;
        }

        /* Markdown formatting inside chat messages */
        .chat-md p {
          margin: 0 0 0.6rem 0;
        }

        .chat-md p:last-child {
          margin-bottom: 0;
        }

        .chat-md ol,
        .chat-md ul {
          margin: 0 0 0.6rem 1.25rem;
          padding: 0;
        }

        .chat-md li {
          margin: 0.2rem 0;
        }

        .chat-md a {
          color: inherit;
          text-decoration: underline;
        }

        .chat-md code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
          font-size: 0.9em;
        }
      `}</style>
    </article>
  );
}
