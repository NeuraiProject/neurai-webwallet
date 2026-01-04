import React from "react";
import { IconSend } from "./icons";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useDePINChat } from "./hooks/useDePINChat";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { FaBomb, FaFireFlameCurved, FaQrcode, FaRegClock, FaRegCircleCheck, FaRegCopy, FaRobot, FaUserGroup, FaBars, FaXmark, FaArrowDown, FaArrowUp } from "react-icons/fa6";
import { betterAlert, betterToast } from "./betterDialog";
import type { DepinChatIdentity } from "./utils/depinChatIdentity";

const decorativeIconProps = { "aria-hidden": true, focusable: false } as const;

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
  // Cache de mensajes por pestaña para evitar recalcular
  const [messagesByTab, setMessagesByTab] = React.useState<Map<string, Message[]>>(new Map());

  // Mensajes pendientes por pestaña (optimistic UI)
  const [pendingMessagesByTab, setPendingMessagesByTab] = React.useState<Map<string, Message[]>>(new Map());

  // Último mensaje leído por pestaña (para scroll y unreadCount)
  const [lastReadMessageByTab, setLastReadMessageByTab] = React.useState<Map<string, string>>(new Map());
  const [inputText, setInputText] = React.useState("");
  const [showAssets, setShowAssets] = React.useState(false);
  const [assetAddresses, setAssetAddresses] = React.useState<Record<string, string>>({});
  const [chatAssets, setChatAssets] = React.useState<Record<string, number>>({});
  const [selectedAsset, setSelectedAsset] = React.useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = React.useState<string | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [validityStatus, setValidityStatus] = React.useState<any>(null);
  const [msgInfo, setMsgInfo] = React.useState<any>(null);
  const [messageExpiryHours, setMessageExpiryHours] = React.useState<number | null>(null);
  const messagesEndRef = React.useRef<Map<string, HTMLDivElement | null>>(new Map());
  const chatInputRef = React.useRef<HTMLTextAreaElement>(null);

  // Estado para el listado de direcciones con pubkeys
  const [showAddressList, setShowAddressList] = React.useState(false);
  const [addressList, setAddressList] = React.useState<Array<{ address: string, amount: number, pubkey: string | null }>>([]);
  const [loadingAddressList, setLoadingAddressList] = React.useState(false);
  const [showDepinAddressQr, setShowDepinAddressQr] = React.useState(false);
  const [depinChatPubkeyRevealed, setDepinChatPubkeyRevealed] = React.useState<boolean | null>(null);
  const depinPubkeyIntervalRef = React.useRef<number | null>(null);
  const [isBurningDepinPubkey, setIsBurningDepinPubkey] = React.useState(false);
  const [isSidebarOpen, setSidebarOpen] = React.useState(true); // Default open on desktop? Maybe make responsive later

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

  // Tab state for private conversations
  const [activeTab, setActiveTab] = React.useState<string>("group");
  const [closedTabs, setClosedTabs] = React.useState<Map<string, number>>(new Map()); // Map<address, closeTimestamp>

  // Hook DePIN para mensajería
  const {
    groupMessages,
    privateConversations,
    isPolling,
    setIsPolling,
    error: depinError,
    stats,
    lastPoll,
    sendMessage: sendDePINMessage,
    refreshMessages,
    fetchStats,
    getMsgInfo,
    createPrivateConversation,
  } = useDePINChat(wallet, selectedAsset, selectedAddress, recipientInfoList, depinChatIdentity ?? null);

  const shortenAddress = React.useCallback((address?: string) => {
    const a = (address ?? '').trim();
    if (a.length <= 12) return a;
    return `${a.slice(0, 4)}...${a.slice(-4)}`;
  }, []);

  const formatUnixTimestampNoSeconds = React.useCallback((unixTimestamp: number) => {
    const d = new Date(unixTimestamp * 1000);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, []);

  const formatUnixTimestampNoSecondsShortYear = React.useCallback((unixTimestamp: number) => {
    const d = new Date(unixTimestamp * 1000);
    return d.toLocaleString(undefined, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, []);

  const copyToClipboard = React.useCallback(async (text: string) => {
    const value = (text ?? "").trim();
    if (!value) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const el = document.createElement("textarea");
        el.value = value;
        el.style.position = "fixed";
        el.style.left = "-9999px";
        el.style.top = "-9999px";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      betterToast("✓ Address copied");
    } catch (e) {
      console.error("Copy failed", e);
      betterAlert("Error", "Unable to copy address to clipboard");
    }
  }, []);

  const burnDepinPubkeyAddress = React.useMemo(() => {
    return "NbURNXXXXXXXXXXXXXXXXXXXXXXXT65Gdr";
  }, []);

  const pickForcedUtxosForAmount = React.useCallback(
    (utxos: any[], requiredSats: number) => {
      const norm = (u: any) => {
        const satoshis =
          typeof u?.satoshis === "number"
            ? u.satoshis
            : typeof u?.value === "number"
              ? Math.round(u.value * 1e8)
              : 0;
        return { ...u, satoshis };
      };

      const normalized = (utxos ?? []).map(norm).filter((u) => Number.isFinite(u.satoshis) && u.satoshis > 0);
      normalized.sort((a, b) => b.satoshis - a.satoshis);

      const picked: any[] = [];
      let sum = 0;
      for (const u of normalized) {
        picked.push(u);
        sum += u.satoshis;
        if (sum >= requiredSats) break;
      }

      return { picked, sumSats: sum };
    },
    []
  );

  const handleBurnDepinPubkey = React.useCallback(async () => {
    if (isBurningDepinPubkey) return;

    if (!chatAddress || !depinChatIdentity?.wif) {
      betterAlert("Error", "DePIN Chat identity is not available. Please unlock your mnemonic and reload.");
      return;
    }

    const minSendXna = 1;
    const burnAmountXna = 0.1;
    const feeBufferXna = 0.01;
    const requiredXna = burnAmountXna + feeBufferXna;
    const requiredSats = Math.round(requiredXna * 1e8);

    setIsBurningDepinPubkey(true);
    try {
      const baseUtxosAny: any = await wallet.rpc("getaddressutxos", [
        {
          addresses: [chatAddress],
        },
      ]);

      const baseUtxos: any[] = Array.isArray(baseUtxosAny) ? baseUtxosAny : [];
      const filtered = baseUtxos.filter((u) => (u?.assetName ?? wallet.baseCurrency) === wallet.baseCurrency);
      const { picked, sumSats } = pickForcedUtxosForAmount(filtered, requiredSats);

      if (!picked.length || sumSats < requiredSats) {
        betterAlert(
          "Insufficient funds",
          `Send at least ${minSendXna} ${wallet.baseCurrency} to the DePIN address and try again:\n\n${chatAddress}`
        );
        return;
      }

      const forcedUTXOs = picked.map((utxo) => ({
        utxo,
        address: chatAddress,
        privateKey: depinChatIdentity.wif,
      }));

      const tx = await wallet.createTransaction({
        toAddress: burnDepinPubkeyAddress,
        assetName: wallet.baseCurrency,
        amount: burnAmountXna,
        forcedUTXOs,
        forcedChangeAddressBaseCurrency: chatAddress,
        forcedChangeAddressAssets: chatAddress,
      } as any);

      // Safety: do not allow the wallet to add inputs from other addresses.
      // If it does, abort before broadcasting.
      const debug: any = (tx as any)?.debug;
      const inputAddresses: string[] = Array.isArray(debug?.inputs)
        ? debug.inputs.map((i: any) => i?.address).filter((a: any) => typeof a === "string")
        : [];
      const utxoAddresses: string[] = Array.isArray(debug?.UTXOs)
        ? debug.UTXOs.map((u: any) => u?.address).filter((a: any) => typeof a === "string")
        : [];
      const allAddresses = Array.from(new Set([...inputAddresses, ...utxoAddresses]));
      const hasForeignInputs = allAddresses.some((a) => a !== chatAddress);
      if (hasForeignInputs) {
        betterAlert(
          "Insufficient funds",
          `The burn transaction would require funds from another address.\n\nSend at least ${minSendXna} ${wallet.baseCurrency} to the DePIN address and try again:\n\n${chatAddress}`
        );
        return;
      }

      const raw = debug?.signedTransaction;
      if (!raw || typeof raw !== "string") {
        throw new Error("Failed to create a signed burn transaction");
      }

      await wallet.sendRawTransaction(raw);
      betterToast("✓ Burn transaction sent");
    } catch (e: any) {
      console.error("Burn pubkey error", e);
      betterAlert(
        "Error",
        `Unable to burn from the DePIN address. Send at least ${minSendXna} ${wallet.baseCurrency} to the DePIN address and try again:\n\n${chatAddress}`
      );
    } finally {
      setIsBurningDepinPubkey(false);
    }
  }, [isBurningDepinPubkey, chatAddress, depinChatIdentity?.wif, wallet, burnDepinPubkeyAddress, pickForcedUtxosForAmount]);

  const computeExpiresDate = React.useCallback(
    (unixTimestamp: number) => {
      if (!messageExpiryHours || messageExpiryHours <= 0) return undefined;
      const expiresAt = unixTimestamp + messageExpiryHours * 60 * 60;
      return formatUnixTimestampNoSecondsShortYear(expiresAt);
    },
    [messageExpiryHours, formatUnixTimestampNoSecondsShortYear]
  );

  // Update message cache when DePIN data changes
  React.useEffect(() => {
    const isDepinExpired = (m: Pick<Message, "isDePIN" | "unixTimestamp" | "timestamp">) => {
      if (!m.isDePIN) return false;
      if (!messageExpiryHours || messageExpiryHours <= 0) return false;

      const ts = typeof m.unixTimestamp === "number"
        ? m.unixTimestamp
        : Math.floor(m.timestamp.getTime() / 1000);

      const expiresAt = ts + messageExpiryHours * 60 * 60;
      return Math.floor(Date.now() / 1000) >= expiresAt;
    };

    const newCache = new Map<string, Message[]>();

    // Process group messages
    const groupDepinMessages = groupMessages.map((msg) => {
      const senderType: "user" | "bot" = msg.sender === selectedAddress ? "user" : "bot";
      const unixTimestamp = msg.timestamp;
      const messageHash = msg.messageHash || '';
      const stableId = messageHash ? parseInt(messageHash.substring(0, 8), 16) : Date.now();

      return {
        id: stableId,
        text: msg.message,
        sender: senderType,
        timestamp: new Date(unixTimestamp * 1000),
        token: selectedAsset ?? undefined,
        unixTimestamp,
        deliveryKey: `${selectedAsset}|${msg.sender}|${unixTimestamp}|${msg.message}`,
        senderAddress: msg.sender,
        sendDate: formatUnixTimestampNoSeconds(unixTimestamp),
        expiresDate: computeExpiresDate(unixTimestamp) ?? msg.expires,
        isDePIN: true,
        delivery: "confirmed" as const,
      };
    });

    const groupPending = pendingMessagesByTab.get("group") || [];
    const groupConfirmedKeys = new Set(groupDepinMessages.map(m => m.deliveryKey));
    const groupStillPending = groupPending.filter(m => m.deliveryKey && !groupConfirmedKeys.has(m.deliveryKey));
    const allGroupMessages = [...groupDepinMessages, ...groupStillPending].filter(m => !isDepinExpired(m));
    allGroupMessages.sort((a, b) => {
      const ta = (a.unixTimestamp ?? Math.floor(a.timestamp.getTime() / 1000)) * 1000;
      const tb = (b.unixTimestamp ?? Math.floor(b.timestamp.getTime() / 1000)) * 1000;
      return ta - tb;
    });

    newCache.set("group", allGroupMessages);

    // Process private conversations
    for (const [address, conversation] of privateConversations.entries()) {
      const privateDepinMessages = conversation.messages.map((msg) => {
        const senderType: "user" | "bot" = msg.sender === selectedAddress ? "user" : "bot";
        const unixTimestamp = msg.timestamp;
        const messageHash = msg.messageHash || '';
        const stableId = messageHash ? parseInt(messageHash.substring(0, 8), 16) : Date.now();

        return {
          id: stableId,
          text: msg.message,
          sender: senderType,
          timestamp: new Date(unixTimestamp * 1000),
          token: selectedAsset ?? undefined,
          unixTimestamp,
          deliveryKey: `${selectedAsset}|${msg.sender}|${unixTimestamp}|${msg.message}`,
          senderAddress: msg.sender,
          sendDate: formatUnixTimestampNoSeconds(unixTimestamp),
          expiresDate: computeExpiresDate(unixTimestamp) ?? msg.expires,
          isDePIN: true,
          delivery: "confirmed" as const,
        };
      });

      const privatePending = pendingMessagesByTab.get(address) || [];
      const privateConfirmedKeys = new Set(privateDepinMessages.map(m => m.deliveryKey));
      const privateStillPending = privatePending.filter(m => m.deliveryKey && !privateConfirmedKeys.has(m.deliveryKey));
      const allPrivateMessages = [...privateDepinMessages, ...privateStillPending].filter(m => !isDepinExpired(m));
      allPrivateMessages.sort((a, b) => {
        const ta = (a.unixTimestamp ?? Math.floor(a.timestamp.getTime() / 1000)) * 1000;
        const tb = (b.unixTimestamp ?? Math.floor(b.timestamp.getTime() / 1000)) * 1000;
        return ta - tb;
      });
      newCache.set(address, allPrivateMessages);
    }

    setMessagesByTab(newCache);

    // Reabrir pestañas cerradas si hay mensajes nuevos posteriores al cierre
    setClosedTabs(prevClosed => {
      if (prevClosed.size === 0) return prevClosed;

      const updatedClosed = new Map(prevClosed);
      let hasChanges = false;

      for (const [address, closeTimestamp] of prevClosed.entries()) {
        const tabMessages = newCache.get(address) || [];
        if (tabMessages.length === 0) continue;

        // Verificar si hay algún mensaje posterior al cierre
        const hasNewMessage = tabMessages.some(msg => {
          const msgTimestamp = msg.unixTimestamp ?? Math.floor(msg.timestamp.getTime() / 1000);
          return msgTimestamp > closeTimestamp;
        });

        if (hasNewMessage) {

          updatedClosed.delete(address);
          hasChanges = true;
        }
      }

      return hasChanges ? updatedClosed : prevClosed;
    });
  }, [groupMessages, privateConversations, selectedAddress, selectedAsset, pendingMessagesByTab, messageExpiryHours, formatUnixTimestampNoSeconds, computeExpiresDate]);

  // Calcular unreadCount para cada conversación privada
  const getUnreadCount = React.useCallback((address: string): number => {
    const lastRead = lastReadMessageByTab.get(address);
    const tabMessages = messagesByTab.get(address) || [];

    if (!lastRead || tabMessages.length === 0) {
      return tabMessages.length;
    }

    const lastReadIndex = tabMessages.findIndex(m => m.deliveryKey === lastRead);
    if (lastReadIndex === -1) {
      return tabMessages.length;
    }

    return Math.max(0, tabMessages.length - lastReadIndex - 1);
  }, [lastReadMessageByTab, messagesByTab]);

  // Get messages for current tab from cache
  const messages = messagesByTab.get(activeTab) || [];



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

  const scrollToLastUnread = React.useCallback((tabKey: string) => {
    const lastReadId = lastReadMessageByTab.get(tabKey);
    const tabMessages = messagesByTab.get(tabKey) || [];

    if (!lastReadId || tabMessages.length === 0) {
      // No hay último leído, ir al final
      const endRef = messagesEndRef.current.get(tabKey);
      if (endRef) {
        endRef.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    // Buscar el primer mensaje no leído
    const lastReadIndex = tabMessages.findIndex(m => m.deliveryKey === lastReadId);
    if (lastReadIndex === -1 || lastReadIndex === tabMessages.length - 1) {
      // No encontrado o es el último, ir al final
      const endRef = messagesEndRef.current.get(tabKey);
      if (endRef) {
        endRef.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    // Hacer scroll al primer mensaje no leído
    const firstUnreadId = tabMessages[lastReadIndex + 1]?.id;
    if (firstUnreadId) {
      const element = document.getElementById(`message-${firstUnreadId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [lastReadMessageByTab, messagesByTab]);

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

  // Marcar mensajes como leídos y hacer scroll cuando cambia la pestaña o llegan mensajes
  const prevMessagesStateRef = React.useRef<{ tab: string, length: number, lastHash: string }>({
    tab: activeTab,
    length: 0,
    lastHash: ''
  });

  React.useEffect(() => {
    const prev = prevMessagesStateRef.current;
    const currentHash = messages.length > 0 ? messages[messages.length - 1].deliveryKey || '' : '';

    // Si cambiamos de pestaña, hacer scroll al último no leído
    if (prev.tab !== activeTab && messages.length > 0) {
      setTimeout(() => scrollToLastUnread(activeTab), 100);
    }

    // Si llegan nuevos mensajes en la pestaña actual, scroll al final
    const shouldScroll = (
      prev.tab === activeTab &&
      (messages.length > prev.length || (messages.length > 0 && currentHash !== prev.lastHash)) &&
      isConnected
    );

    if (shouldScroll) {
      const endRef = messagesEndRef.current.get(activeTab);
      if (endRef) {
        endRef.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    // Marcar todos los mensajes de esta pestaña como leídos
    if (messages.length > 0 && isConnected) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.deliveryKey) {
        setLastReadMessageByTab(prev => {
          // Solo actualizar si el valor cambió
          const currentLastRead = prev.get(activeTab);
          if (currentLastRead !== lastMsg.deliveryKey) {
            const updated = new Map(prev);
            updated.set(activeTab, lastMsg.deliveryKey!);
            return updated;
          }
          return prev; // No cambiar el estado si el valor es el mismo
        });
      }
    }

    prevMessagesStateRef.current = {
      tab: activeTab,
      length: messages.length,
      lastHash: currentHash
    };
  }, [messages, activeTab, isConnected, scrollToLastUnread]);

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
        if (!cancelled) setMsgInfo(info ?? null);
        if (!cancelled) setMessageExpiryHours(hours);
      } catch {
        if (!cancelled) setMsgInfo(null);
        if (!cancelled) setMessageExpiryHours(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, getMsgInfo]);

  const handleSend = async () => {


    if (inputText.trim() === "") {
      return;
    }


    // Verificar que hay un asset seleccionado
    if (!selectedAsset) {
      alert("Please select an asset first");
      return;
    }

    // Verificar que hay una dirección
    if (!selectedAddress) {
      alert("No address found for selected asset");
      return;
    }



    // Check for /private command
    const privateCommandMatch = inputText.trim().match(/^\/private\s+(N[a-zA-Z0-9]{33,34})$/);
    if (privateCommandMatch) {
      const targetAddress = privateCommandMatch[1];


      // Verify the address is in the recipient list
      if (!addressList.find(r => r.address === targetAddress)) {
        alert(`Address ${targetAddress} is not a holder of ${selectedAsset}. Cannot open private conversation.`);
        setInputText("");
        return;
      }

      // Create empty conversation if it doesn't exist
      createPrivateConversation(targetAddress);

      // Switch to private tab
      setActiveTab(targetAddress);
      setInputText("");
      return;
    }

    const makeDeliveryKey = (
      token: string | null,
      senderAddress: string | null,
      unixTimestamp: number,
      text: string
    ) => {
      if (!token || !senderAddress) return null;
      return `${token}|${senderAddress}|${unixTimestamp}|${text}`;
    };

    // Determine message text for sending and display
    let messageToSend = inputText;
    let messageToDisplay = inputText;

    if (activeTab !== "group") {
      // In private tab: send with @address prefix, but display without it
      messageToSend = `@${activeTab} ${inputText}`;
      messageToDisplay = inputText; // Clean text for display
    }

    const unixTimestamp = Math.floor(Date.now() / 1000);
    const deliveryKey = makeDeliveryKey(selectedAsset, selectedAddress, unixTimestamp, messageToDisplay);

    // Optimistic UI: add message immediately as pending to the specific tab
    if (deliveryKey) {
      const sendDate = formatUnixTimestampNoSeconds(unixTimestamp);
      const expiresDate = computeExpiresDate(unixTimestamp);
      const targetTab = activeTab; // The current tab where message is being sent



      const pendingMsg: Message = {
        id: Date.now(),
        text: messageToDisplay, // Display clean text
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
      };

      setPendingMessagesByTab((prev) => {
        const updated = new Map(prev);
        const tabPending = updated.get(targetTab) || [];
        updated.set(targetTab, [...tabPending, pendingMsg]);
        return updated;
      });
    }

    // Clear input immediately
    setInputText("");

    try {
      // Enviar mensaje a través de DePIN usando el servidor RPC configurado


      const result = await sendDePINMessage(messageToSend);

      // Refrescar mensajes después de un breve delay para dar tiempo al servidor
      setTimeout(async () => {

        await refreshMessages();
      }, 1000);

    } catch (error: any) {
      console.error("Error sending message:", error);
      // Rollback optimistic message if send fails
      if (deliveryKey) {
        setPendingMessagesByTab((prev) => {
          const updated = new Map(prev);
          const targetTab = activeTab;
          const tabPending = updated.get(targetTab) || [];
          updated.set(targetTab, tabPending.filter((m) => m.deliveryKey !== deliveryKey));
          return updated;
        });
      }
      alert(`Failed to send message: ${error.message}`);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setIsPolling(false);
    setSelectedAsset(null);
    setSelectedAddress(null);
    setPendingMessagesByTab(new Map());
    setActiveTab("group");
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
        alert("DePIN Chat identity is not available. Please log in/unlock your mnemonic and reload.");
        return;
      }

      const addresses: Record<string, string> = {};


      let balance: any = null;
      try {
        balance = await wallet.rpc('listassetbalancesbyaddress', [chatAddress]);

      } catch (e: any) {
        console.error('❌ RPC ERROR: listassetbalancesbyaddress failed for chat address');
        console.error(e);
        alert(`Failed to load chat assets for ${chatAddress}.\n\nMake sure your RPC supports listassetbalancesbyaddress and try again.`);
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


    setSelectedAsset(assetName);
    const address = assetAddresses[assetName] || null;


    // Verificar que tenemos una dirección válida
    if (!address || address === "Not found in wallet" || address === "Error loading" || address === "Loading...") {
      console.error('ERROR: No valid address found for asset in assetAddresses');

      setSelectedAddress(null);
      alert(`Could not find a valid address for asset ${assetName}.\n\nPlease wait for the asset list to load completely and try again.`);
      return;
    }

    setSelectedAddress(address);


    // Auto-load addresses list when selecting an asset

    setTimeout(() => {
      loadAddressesWithPubkeysInternal(assetName);
    }, 100);

    // La dirección ya fue validada arriba, proceder a conectar


    const hasPubKey = depinChatPubkeyRevealed;
    const assetTypeLabel = getAssetTypeLabel(assetName);

    // Para cualquier tipo de asset, conectar si tiene pubkey o si no podemos verificar
    if (hasPubKey === true) {
      // Asset con pubkey disponible - conectar

      setValidityStatus({ has_asset: true, valid: 1, blocked: false, amount: chatAssets[assetName] });
      setIsConnected(true);
      setIsPolling(true);

    } else if (hasPubKey === null) {

      // No podemos verificar pubkey - advertencia pero conectamos igual
      setValidityStatus({ has_asset: true, valid: 1, blocked: false, amount: chatAssets[assetName] });
      setIsConnected(true);
      setIsPolling(true);

    } else {
      // No hay pubkey - no podemos descifrar mensajes
      alert(`Cannot connect: Asset ${assetName} doesn't have a public key.\n\nTo use messaging, you need to reveal the public key for this address by sending a transaction from it.`);
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
            {...decorativeIconProps}
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
      // OPTIMIZACIÓN: Usar listdepinaddresses para obtener todas las pubkeys en una sola llamada RPC


      const depinAddressesData: Array<{ address: string, pubkey: string }> = await wallet.rpc("listdepinaddresses", [assetName]) as Array<{ address: string, pubkey: string }>;



      // Crear un mapa de address -> pubkey para búsqueda rápida
      const pubkeyMap = new Map<string, string>();
      for (const item of depinAddressesData) {
        if (item.pubkey) {
          pubkeyMap.set(item.address, item.pubkey);
        }
      }



      // Obtener los amounts de cada dirección
      const addressesData: Record<string, unknown> = await wallet.rpc("listaddressesbyasset", [assetName]) as Record<string, unknown>;



      const addresses = Object.keys(addressesData);
      const results: Array<{ address: string, amount: number, pubkey: string | null }> = [];

      // Combinar amounts con pubkeys obtenidas en batch
      for (const address of addresses) {
        const amount = normalizeAssetAmountMaybe(addressesData[address]);
        const pubkey = pubkeyMap.get(address) ?? null;

        results.push({
          address,
          amount,
          pubkey
        });
      }

      setAddressList(results);


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
            gridTemplateColumns: "auto auto auto",
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
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              justifySelf: "center",
              alignSelf: "center",
            }}
          >
            <button
              type="button"
              aria-label="Burn 0.1 XNA to reveal pubkey"
              title={
                depinChatPubkeyRevealed === true
                  ? "PubKey already revealed"
                  : depinChatPubkeyRevealed === false
                    ? `Burn 0.1 ${wallet.baseCurrency} from ${shortenAddress(chatAddress ?? undefined)} to reveal pubkey`
                    : "Checking pubkey status"
              }
              disabled={
                isBurningDepinPubkey ||
                depinChatPubkeyRevealed !== false ||
                !chatAddress ||
                !depinChatIdentity?.wif
              }
              onClick={handleBurnDepinPubkey}
              style={{
                padding: 0,
                margin: 0,
                border: 0,
                background: "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                cursor: depinChatPubkeyRevealed === false && !isBurningDepinPubkey ? "pointer" : "default",
                opacity: isBurningDepinPubkey ? 0.6 : 1,
              }}
            >
              <FaFireFlameCurved
                className={
                  depinChatPubkeyRevealed === false
                    ? "depin-flame depin-flame-lit"
                    : "depin-flame depin-flame-done"
                }
                style={{ width: "100%", height: "100%", display: "block" }}
                {...decorativeIconProps}
              />
            </button>
          </span>
          <button
            type="button"
            aria-label="Show DePIN address QR"
            disabled={!depinAddressText}
            onClick={() => setShowDepinAddressQr((v) => !v)}
            style={{
              width: "24px",
              height: "24px",
              padding: 0,
              margin: 0,
              border: 0,
              background: "transparent",
              color: "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              cursor: depinAddressText ? "pointer" : "default",
              opacity: depinAddressText ? 0.9 : 0.35,
            }}
          >
            <FaQrcode style={{ fontSize: "1em" }} {...decorativeIconProps} />
          </button>
          <span
            style={{
              gridColumn: "1 / 4",
              fontSize: "0.9rem",
              fontWeight: "normal",
              wordBreak: "break-all",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <button
                type="button"
                aria-label="Copy DePIN chat address"
                title="Copy"
                disabled={!chatAddress}
                onClick={() => copyToClipboard(chatAddress ?? "")}
                style={{
                  padding: 0,
                  margin: 0,
                  border: 0,
                  background: "transparent",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "inherit",
                  cursor: chatAddress ? "pointer" : "default",
                  opacity: chatAddress ? 0.9 : 0.35,
                }}
              >
                <FaRegCopy style={{ fontSize: "1em", lineHeight: 1 }} {...decorativeIconProps} />
              </button>
              <span>{depinAddressText || "-"}</span>
            </span>
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

      {depinChatIdentity?.path && (
        <div
          style={{
            marginTop: "-0.85rem",
            marginBottom: "0",
            fontSize: "0.8rem",
            fontWeight: "normal",
            wordBreak: "break-all",
          }}
        >
          <span style={{ fontWeight: "bold" }}>Derivation:</span>{" "}
          <span>{depinChatIdentity.path}</span>
        </div>
      )}

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
              <strong>Privacy:</strong>{" "}
              {msgInfo?.depinpoolpkey && msgInfo.depinpoolpkey !== "0" ? (
                <span style={{ color: "#22c55e", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  ● Active <span style={{ fontSize: "0.7em", fontFamily: "monospace", color: "#6b7280" }}>({msgInfo.depinpoolpkey.substring(0, 6)}...{msgInfo.depinpoolpkey.substring(60)})</span>
                </span>
              ) : (
                <span style={{ color: "#ef4444" }}>
                  ● Inactive
                </span>
              )}
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
            {(lastPoll || msgInfo) && (
              <div>
                <strong>Last check:</strong> {lastPoll ? lastPoll.toLocaleTimeString() : "-"}
                {typeof msgInfo?.maxmessagesize === "number" && (
                  <>
                    {" "}| <strong>Max message:</strong>{" "}
                    {(msgInfo.maxmessagesize / 1024).toLocaleString(undefined, {
                      maximumFractionDigits: msgInfo.maxmessagesize % 1024 === 0 ? 0 : 1,
                    })}{" "}
                    KB
                  </>
                )}
                {typeof msgInfo?.messageexpiryhours === "number" && (
                  <>
                    {" "}| <strong>Expiry:</strong> {msgInfo.messageexpiryhours}h
                  </>
                )}
                {typeof msgInfo?.maxpoolsizemb === "number" && (
                  <>
                    {" "}| <strong>Max pool:</strong> {msgInfo.maxpoolsizemb} MB
                  </>
                )}
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
                ? `✓ Valid DePIN asset${typeof msgInfo?.cipher === "string" && msgInfo.cipher.trim() ? ` | Cipher: ${msgInfo.cipher.trim()}` : ""}`
                : `✗ Invalid or blocked DePIN asset`}
            </div>
          )}
        </div>
      )}

      {/* Top Asset Selector & Chat Container */}
      <div style={{ position: "relative", marginTop: "0.5rem" }}>

        {/* Asset List Button (Top) */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
          padding: "0 0.5rem"
        }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => {
                setShowAssets(!showAssets);
                loadAssetAddresses();
              }}
              style={{
                fontSize: "0.9rem",
                padding: "0.4rem 1rem",
                borderRadius: "20px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
            >
              {showAssets ? <FaArrowUp /> : <FaArrowDown />}
              {showAssets ? "Hide Asset List" : "Select Asset"}
            </button>


          </div>

          {selectedAsset && (
            <button
              onClick={handleDisconnect}
              style={{
                fontSize: "0.8rem",
                padding: "0.3rem 0.8rem",
                borderRadius: "6px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none"
              }}
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Asset List Slider Overlay */}
        <div
          className={`asset-slider ${showAssets ? "open" : "closed"}`}
          style={{
            position: "absolute",
            top: "50px", // Adjust based on header height
            left: 0,
            right: 0,
            backgroundColor: "#ffffff",
            zIndex: 100,
            borderBottom: showAssets ? "2px solid #e5e7eb" : "none",
            boxShadow: showAssets ? "0 10px 15px -3px rgba(0, 0, 0, 0.1)" : "none",
            transition: "all 0.3s ease-in-out",
            maxHeight: showAssets ? "500px" : "0px",
            overflow: "hidden",
            borderTopLeftRadius: "16px",
            borderTopRightRadius: "16px",
          }}
        >
          <div style={{ padding: "1rem", overflowY: "auto", maxHeight: "480px" }}>
            <h4 style={{ marginTop: 0 }}>Select an Asset to Chat</h4>
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
                    <tr
                      key={assetName}
                      onClick={() => {
                        handleAssetSelection(assetName);
                        setShowAssets(false); // Auto-close on selection
                      }}
                      style={{ cursor: "pointer", backgroundColor: selectedAsset === assetName ? "#eff6ff" : "transparent" }}
                      className="asset-row"
                    >
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="radio"
                          name="selected-asset"
                          checked={selectedAsset === assetName}
                          onChange={() => {
                            handleAssetSelection(assetName);
                            setShowAssets(false);
                          }}
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
        </div>

        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            flexDirection: "row", // Changed to row for sidebar layout
            height: "600px",
            border: "2px solid #e5e7eb",
            borderRadius: "16px",
            overflow: "hidden",
            backgroundColor: "#ffffff",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          }}
          className="chat-container"
        >
          {/* Sidebar */}
          {isConnected && (
            <div
              className={`chat-sidebar ${isSidebarOpen ? "open" : "closed"}`}
              style={{
                width: isSidebarOpen ? "280px" : "0px",
                borderRight: isSidebarOpen ? "1px solid #e5e7eb" : "none",
                backgroundColor: "#f9fafb",
                display: "flex",
                flexDirection: "column",
                transition: "all 0.3s ease",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {/* Sidebar Header */}
              <div style={{ padding: "1rem", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>Contacts</span>
                <button
                  className="chat-icon-button"
                  onClick={() => setSidebarOpen(false)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#666" }}
                >
                  <FaXmark size={18} />
                </button>
              </div>

              {/* Sidebar Content */}
              <div style={{ overflowY: "auto", flex: 1 }}>
                {/* Group Item */}
                <div
                  onClick={() => { setActiveTab("group"); if (window.innerWidth < 768) setSidebarOpen(false); }}
                  className={`chat-sidebar-item ${activeTab === "group" ? "active" : ""}`}
                  style={{
                    padding: "0.75rem 1rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    backgroundColor: "#3b82f6", color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <FaUserGroup size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>Public Group</div>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Everyone</div>
                  </div>
                  {getUnreadCount("group") > 0 && (
                    <span style={{ backgroundColor: "#ef4444", color: "white", borderRadius: "99px", padding: "0.1rem 0.6rem", fontSize: "0.75rem", fontWeight: "bold" }}>
                      {getUnreadCount("group")}
                    </span>
                  )}
                </div>

                {/* Private Conversations */}
                {Array.from(privateConversations.entries())
                  .filter(([address]) => !closedTabs.has(address))
                  .sort((a, b) => b[1].lastMessageTime - a[1].lastMessageTime)
                  .map(([address, conversation]) => (
                    <div
                      key={address}
                      onClick={() => { setActiveTab(address); if (window.innerWidth < 768) setSidebarOpen(false); }}
                      className={`chat-sidebar-item ${activeTab === address ? "active" : ""}`}
                      style={{
                        padding: "0.75rem 1rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <div style={{
                        width: "40px", height: "40px", borderRadius: "50%",
                        backgroundColor: "#10b981", color: "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.9rem", fontWeight: "bold"
                      }}>
                        {conversation.displayName.substring(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {conversation.displayName}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {shortenAddress(address)}
                        </div>
                      </div>
                      {getUnreadCount(address) > 0 && (
                        <span style={{ backgroundColor: "#ef4444", color: "white", borderRadius: "99px", padding: "0.1rem 0.6rem", fontSize: "0.75rem", fontWeight: "bold" }}>
                          {getUnreadCount(address)}
                        </span>
                      )}
                    </div>
                  ))}

                {/* Other Contacts (Holders) */}
                {addressList.length > 0 && addressList.some(item => item.address !== chatAddress && !privateConversations.has(item.address) && item.pubkey) && (
                  <>
                    <div style={{ padding: "1rem 1rem 0.5rem", fontSize: "0.75rem", fontWeight: "bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Other Contacts
                    </div>
                    {addressList
                      .filter(item => item.address !== chatAddress && !privateConversations.has(item.address) && item.pubkey)
                      .map((item) => (
                        <div
                          key={item.address}
                          onClick={() => {
                            createPrivateConversation(item.address);
                            setActiveTab(item.address);
                            if (window.innerWidth < 768) setSidebarOpen(false);
                          }}
                          className={`chat-sidebar-item`}
                          style={{
                            padding: "0.75rem 1rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            borderBottom: "1px solid #f3f4f6",
                            opacity: 0.8,
                          }}
                        >
                          <div style={{
                            width: "36px", height: "36px", borderRadius: "50%",
                            backgroundColor: "#9ca3af", color: "white",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.85rem", fontWeight: "bold"
                          }}>
                            {(item.pubkey ? "👤" : "?")}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: "0.95rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {shortenAddress(item.address)}
                            </div>

                          </div>
                        </div>
                      ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Main Content Area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* Chat Header for Main Content */}
            <div style={{
              height: "60px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              padding: "0 1rem",
              backgroundColor: "#ffffff",
              gap: "1rem"
            }} className="chat-main-header">
              {isConnected && !isSidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", padding: "0.5rem" }}
                  className="chat-toggle-btn"
                >
                  <FaBars size={20} />
                </button>
              )}
              <div style={{ fontWeight: 700, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {activeTab === "group" ? (
                  <>
                    <FaUserGroup className="text-blue-500" />
                    Public Group
                  </>
                ) : (
                  <>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#10b981" }}></div>
                    {privateConversations.get(activeTab)?.displayName || shortenAddress(activeTab)}
                  </>
                )}
              </div>
            </div>

            {/* Messages area - todas las pestañas siempre renderizadas */}
            <div style={{ flex: 1, position: "relative", backgroundColor: "#f9fafb" }}>
              {/* Pestaña General */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  overflowY: "auto",
                  padding: "1.5rem",
                  display: activeTab === "group" ? "flex" : "none",
                  flexDirection: "column",
                  gap: "1rem",
                  backgroundColor: "#f9fafb",
                  backgroundImage: "linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)",
                }}
                className="chat-messages"
              >
                {(messagesByTab.get("group") || []).map((message) => (
                  <div key={message.id} id={`message-${message.id}`}>
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
                          maxWidth: "90%",
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
                                margin: "0",
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
                                    color: "#000",
                                    display: "inline-flex",
                                    alignItems: "baseline",
                                    gap: "0.3rem",
                                  }}
                                >
                                  <FaBomb style={{ color: "#000", fontSize: "1em", lineHeight: 1 }} {...decorativeIconProps} />
                                  <span style={{ fontStyle: "italic" }}>{message.expiresDate}</span>
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
                                  {...decorativeIconProps}
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
                              {...decorativeIconProps}
                            />
                          )}
                          {message.sender === "user" && message.delivery === "confirmed" && (
                            <FaRegCircleCheck
                              size={15}
                              color="#22c55e"
                              style={{ marginRight: "0.35rem", verticalAlign: "middle" }}
                              {...decorativeIconProps}
                            />
                          )}
                          {message.isDePIN && message.sendDate
                            ? message.sendDate
                            : message.timestamp.toLocaleTimeString()}
                        </small>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={(el) => messagesEndRef.current.set("group", el)} />
              </div>

              {/* Pestañas Privadas */}
              {Array.from(privateConversations.keys())
                .filter((address) => !closedTabs.has(address))
                .map((address) => (
                  <div
                    key={address}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      overflowY: "auto",
                      padding: "1.5rem",
                      display: activeTab === address ? "flex" : "none",
                      flexDirection: "column",
                      gap: "1rem",
                      backgroundColor: "#f9fafb",
                      backgroundImage: "linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)",
                    }}
                    className="chat-messages"
                  >
                    {(messagesByTab.get(address) || []).map((message) => (
                      <div key={message.id} id={`message-${message.id}`}>
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
                              maxWidth: "90%",
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
                                    margin: "0",
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
                                        color: "#000",
                                        display: "inline-flex",
                                        alignItems: "baseline",
                                        gap: "0.3rem",
                                      }}
                                    >
                                      <FaBomb style={{ color: "#000", fontSize: "1em", lineHeight: 1 }} {...decorativeIconProps} />
                                      <span style={{ fontStyle: "italic" }}>{message.expiresDate}</span>
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
                                      {...decorativeIconProps}
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
                                  {...decorativeIconProps}
                                />
                              )}
                              {message.sender === "user" && message.delivery === "confirmed" && (
                                <FaRegCircleCheck
                                  size={15}
                                  color="#22c55e"
                                  style={{ marginRight: "0.35rem", verticalAlign: "middle" }}
                                  {...decorativeIconProps}
                                />
                              )}
                              {message.isDePIN && message.sendDate
                                ? message.sendDate
                                : message.timestamp.toLocaleTimeString()}
                            </small>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={(el) => messagesEndRef.current.set(address, el)} />
                  </div>
                ))}
            </div>

            {/* Input area */}
            <div
              style={{
                borderTop: "2px solid #e5e7eb",
                padding: "1rem 1.25rem",
                backgroundColor: "#ffffff",
              }}
              className="chat-input-area"
            >
              <div style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-end",
              }}>
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
                  placeholder=""
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
              {/* Private command indicator */}
              {inputText.trim().match(/^\/private\s+(N[a-zA-Z0-9]{33,34})$/) && (
                <div style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  color: "#0369a1",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}>
                  <span style={{ fontSize: "1rem" }}>💬</span>
                  <span>Press Enter to open private conversation with {inputText.trim().match(/^\/private\s+(N[a-zA-Z0-9]{33,34})$/)?.[1]?.slice(0, 8)}...</span>
                </div>
              )}
            </div>
          </div>
        </div>





        <style>{`
        @keyframes depinFlameFlicker {
          0% { color: #ef4444; }
          50% { color: #f59e0b; }
          100% { color: #ef4444; }
        }

        .depin-flame {
          font-size: 1.05em;
          line-height: 1;
        }

        .depin-flame-lit {
          animation: depinFlameFlicker 700ms infinite;
        }

        .depin-flame-done {
          color: #9ca3af;
        }

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
        
        /* Sidebar Dark Mode */
        [data-theme="dark"] .chat-sidebar {
          background-color: #151515 !important;
          border-right-color: #333333 !important;
        }

        [data-theme="dark"] .chat-sidebar-item {
          border-bottom-color: #2a2a2a !important;
          color: #e0e0e0;
        }

        [data-theme="dark"] .chat-sidebar-item:hover {
          background-color: #252525 !important;
        }

        [data-theme="dark"] .chat-sidebar-item.active {
          background-color: #2a2a2a !important;
          color: #60a5fa !important;
        }

        [data-theme="dark"] .chat-main-header {
          background-color: #1a1a1a !important;
          border-bottom-color: #333333 !important;
          color: #e0e0e0;
        }
        
        [data-theme="dark"] .chat-toggle-btn {
          color: #a0a0a0 !important;
        }

        /* Legacy Tab styles (kept just in case, or remove if fully replaced) */
        [data-theme="dark"] .chat-tab-bar {
          background-color: #1a1a1a !important;
          border-bottom-color: #333333 !important;
        }

        [data-theme="dark"] .chat-tab-bar {
          background-color: #1a1a1a !important;
          border-bottom-color: #333333 !important;
        }

        [data-theme="dark"] .chat-tab {
          color: #a0a0a0 !important;
        }

        [data-theme="dark"] .chat-tab-inactive:hover {
          background-color: #252525 !important;
          color: #e0e0e0 !important;
        }

        [data-theme="dark"] .chat-tab-active {
          color: #3b82f6 !important;
          background-color: #2a2a2a !important;
          border-bottom-color: #3b82f6 !important;
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

        /* Mobile Responsive Sidebar */
        @media (max-width: 768px) {
          .chat-container {
            position: relative;
          }
          
          .chat-sidebar {
            position: absolute !important;
            top: 0;
            left: 0;
            bottom: 0;
            z-index: 50;
            width: 100% !important;
            border-right: none !important;
          }
          
          .chat-sidebar.closed {
            width: 0 !important;
            transform: translateX(-100%);
          }
          
          .chat-sidebar.open {
            transform: translateX(0);
          }
        }
        
        [data-theme="dark"] .asset-slider {
          background-color: #1a1a1a !important;
          border-bottom-color: #333333 !important;
        }
        
        [data-theme="dark"] .asset-row:hover {
          background-color: #252525 !important;
        }

        [data-theme="dark"] .asset-row {
          color: #e0e0e0;
        }

      `}</style>
      </div> {/* Close wrapper div */}
    </article >
  );
}
