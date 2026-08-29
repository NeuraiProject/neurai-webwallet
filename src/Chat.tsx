import React from "react";
import { IconSend } from "./icons";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useDePINChat } from "./hooks/useDePINChat";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { FaBomb, FaFireFlameCurved, FaQrcode, FaRegClock, FaRegCircleCheck, FaRegCopy, FaRobot, FaUserGroup, FaBars, FaXmark, FaArrowDown, FaArrowUp } from "react-icons/fa6";
import { betterAlert, betterToast } from "./betterDialog";
import type { DepinChatIdentity } from "./utils/depinChatIdentity";
import { normalizeAssetAmountMaybe, shortenAddress, formatUnixTimestampNoSeconds, formatUnixTimestampNoSecondsShortYear } from './utils/formatting';
import { parsePubkeyMaybe, parsePubkeyRevealedMaybe } from './utils/cryptoUtils';
import { getAssetType, isValidMessagingAsset, getAssetIcon, getAssetTypeLabel } from './utils/assetUtils';
import { copyToClipboard, autoResizeTextarea, scrollToLastUnread } from './utils/domUtils';
import { extractBotModel, computeExpiresDate, getUnreadCount } from './utils/messageUtils';
import { pickForcedUtxosForAmount } from './utils/utxoUtils';
import { isBaseAssetName } from "./utils";
import type { PubkeyResponse, UTXOResponse } from "./types/rpc";
import './styles/chat.css';

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

type AssetValidityStatus = {
  has_asset: boolean;
  amount?: number;
  valid?: 0 | 1;
  blocked?: boolean;
};

type MsgInfo = {
  depinpoolpkey?: string;
  maxmessagesize?: number;
  messageexpiryhours?: number;
  maxpoolsizemb?: number;
  cipher?: string;
};

type TransactionDebug = {
  inputs?: Array<{ address?: unknown }>;
  UTXOs?: Array<{ address?: unknown }>;
  signedTransaction?: unknown;
};

type ForcedUtxo = {
  utxo: UTXOResponse;
  address: string;
  privateKey: string;
};

type CreateTransactionParams = {
  toAddress: string;
  assetName: string;
  amount: number;
  forcedUTXOs: ForcedUtxo[];
  forcedChangeAddressBaseCurrency: string;
  forcedChangeAddressAssets: string;
};

interface ChatProps {
  wallet: Wallet;
  assets: unknown[];
  mempool: unknown;
  depinChatIdentity?: DepinChatIdentity | null;
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
  const [validityStatus, setValidityStatus] = React.useState<AssetValidityStatus | null>(null);
  const [msgInfo, setMsgInfo] = React.useState<MsgInfo | null>(null);
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
  const canBurnDepinPubkey =
    !isBurningDepinPubkey &&
    depinChatPubkeyRevealed === false &&
    !!chatAddress &&
    !!depinChatIdentity?.wif;
  const canShowDepinQr = !!depinAddressText;
  const canCopyDepinAddress = !!chatAddress;

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
        const res = await wallet.rpc('getpubkey', [chatAddress]) as PubkeyResponse | string | null;
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

  const burnDepinPubkeyAddress = React.useMemo(() => {
    return "NbURNXXXXXXXXXXXXXXXXXXXXXXXT65Gdr";
  }, []);

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
      const baseUtxosRaw = await wallet.rpc("getaddressutxos", [
        {
          addresses: [chatAddress],
        },
      ]) as unknown;

      const baseUtxos: UTXOResponse[] = Array.isArray(baseUtxosRaw)
        ? (baseUtxosRaw as UTXOResponse[])
        : [];
      const filtered = baseUtxos.filter((u) =>
        isBaseAssetName(u?.assetName ?? wallet.baseCurrency, wallet.baseCurrency)
      );
      const { picked, sumSats } = pickForcedUtxosForAmount(filtered, requiredSats);

      if (!picked.length || sumSats < requiredSats) {
        betterAlert(
          "Insufficient funds",
          `Send at least ${minSendXna} ${wallet.baseCurrency} to the DePIN address and try again:\n\n${chatAddress}`
        );
        return;
      }

      const forcedUTXOs: ForcedUtxo[] = picked.map((utxo) => ({
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
      } as CreateTransactionParams);

      // Safety: do not allow the wallet to add inputs from other addresses.
      // If it does, abort before broadcasting.
      const debug = (tx as { debug?: TransactionDebug } | null)?.debug;
      const inputAddresses: string[] = Array.isArray(debug?.inputs)
        ? debug.inputs
          .map((input) => (typeof input?.address === "string" ? input.address : null))
          .filter((address): address is string => typeof address === "string")
        : [];
      const utxoAddresses: string[] = Array.isArray(debug?.UTXOs)
        ? debug.UTXOs
          .map((utxo) => (typeof utxo?.address === "string" ? utxo.address : null))
          .filter((address): address is string => typeof address === "string")
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
    } catch (error) {
      console.error("Burn pubkey error", error);
      betterAlert(
        "Error",
        `Unable to burn from the DePIN address. Send at least ${minSendXna} ${wallet.baseCurrency} to the DePIN address and try again:\n\n${chatAddress}`
      );
    } finally {
      setIsBurningDepinPubkey(false);
    }
  }, [isBurningDepinPubkey, chatAddress, depinChatIdentity?.wif, wallet, burnDepinPubkeyAddress]);

  // Wrapper for computeExpiresDate with local messageExpiryHours
  const computeExpiresDateLocal = React.useCallback(
    (unixTimestamp: number) => computeExpiresDate(unixTimestamp, messageExpiryHours, formatUnixTimestampNoSecondsShortYear),
    [messageExpiryHours]
  );

  // Wrapper for getUnreadCount with local state
  const getUnreadCountLocal = React.useCallback(
    (address: string) => getUnreadCount(address, lastReadMessageByTab, messagesByTab),
    [lastReadMessageByTab, messagesByTab]
  );

  // Wrapper for scrollToLastUnread with local refs
  const scrollToLastUnreadLocal = React.useCallback(
    (tabKey: string) => scrollToLastUnread(tabKey, lastReadMessageByTab, messagesByTab, messagesEndRef.current),
    [lastReadMessageByTab, messagesByTab]
  );

  // Wrapper for isValidMessagingAsset with local chatAssets
  const isValidMessagingAssetLocal = React.useCallback(
    (assetName: string) => isValidMessagingAsset(assetName, chatAssets),
    [chatAssets]
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
        expiresDate: computeExpiresDateLocal(unixTimestamp) ?? msg.expires,
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
        // En una conversación con uno mismo (notas personales), mostrar los mensajes confirmados
        // a la izquierda (como "bot") para que parezca que "vienen de fuera" tras ser grabados en el pool.
        const isSelfChat = address === selectedAddress;
        const senderType: "user" | "bot" = (msg.sender === selectedAddress && !isSelfChat) ? "user" : "bot";
        
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
  }, [groupMessages, privateConversations, selectedAddress, selectedAsset, pendingMessagesByTab, messageExpiryHours, computeExpiresDateLocal]);

  // Get messages for current tab from cache
  const messages = messagesByTab.get(activeTab) || [];

  const renderBotMarkdown = (text: string) => {
    const html = DOMPurify.sanitize(
      marked.parse(text, {
        gfm: true,
        breaks: true,
      }) as string
    );

    return <div className="chat-md" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  React.useEffect(() => {
    if (chatInputRef.current) {
      autoResizeTextarea(chatInputRef.current, 48);
    }
  }, [inputText]);

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
      setTimeout(() => scrollToLastUnreadLocal(activeTab), 100);
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
        // Protocol 1 shape. Against a protocol-2 node `depingetmsginfo` answers a
        // signed `{ body, poolsig }` envelope and these fields are absent, so the
        // expiry below simply stays null. Replaced by the verified pool lookup in
        // the protocol-2 migration; cast only to keep the type checker honest
        // about the fact that the RPC returns `unknown`.
        const info = (await getMsgInfo()) as MsgInfo | null;
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

    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
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
      alert(`Failed to send message: ${errorMessage}`);
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


      let balance: Record<string, unknown> | null = null;
      try {
        balance = (await wallet.rpc('listassetbalancesbyaddress', [chatAddress])) as Record<string, unknown> | null;

      } catch (error) {
        console.error('❌ RPC ERROR: listassetbalancesbyaddress failed for chat address');
        console.error(error);
        alert(`Failed to load chat assets for ${chatAddress}.\n\nMake sure your RPC supports listassetbalancesbyaddress and try again.`);
        return;
      }

      const nextChatAssets: Record<string, number> = {};
      if (balance && typeof balance === 'object') {
        for (const assetName of Object.keys(balance)) {
          if (isBaseAssetName(assetName, wallet.baseCurrency)) continue;
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

  // Internal function that accepts asset parameter for auto-loading
  const loadAddressesWithPubkeysInternal = async (assetName: string) => {
    if (!assetName) return;

    setLoadingAddressList(true);
    setShowAddressList(true);

    try {
      // OPTIMIZACIÓN: Usar listdepinaddresses para obtener todas las pubkeys en una sola llamada RPC


      const depinAddressesData = await wallet.rpc("listdepinaddresses", [assetName]) as Array<{ address: string; pubkey?: string }>;



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


    } catch (error) {
      console.error("Error loading addresses with pubkeys:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to load addresses: ${errorMessage}`);
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
    <div className="neurai-card">
      <h3 className="rebel-chat__header">
        <span />
        <span className="rebel-chat__depin-status">
          <span className="rebel-chat__depin-status-bold">
            <span
              aria-label="DePIN pubkey status"
              title={
                depinChatPubkeyRevealed === true
                  ? "PubKey revealed on-chain"
                  : depinChatPubkeyRevealed === false
                    ? "PubKey not revealed on-chain"
                    : "Checking pubkey status"
              }
              className={`rebel-chat__depin-indicator ${
                depinChatPubkeyRevealed === true
                  ? "rebel-chat__depin-indicator--revealed"
                  : depinChatPubkeyRevealed === false
                    ? "rebel-chat__depin-indicator--not-revealed"
                    : "rebel-chat__depin-indicator--checking"
              }`}
            />
            DePIN Address
          </span>
          <span className="rebel-chat__icon-button-container">
            <span
              role="button"
              aria-label="Burn 0.1 XNA to reveal pubkey"
              aria-disabled={!canBurnDepinPubkey}
              title={
                depinChatPubkeyRevealed === true
                  ? "PubKey already revealed"
                  : depinChatPubkeyRevealed === false
                    ? `Burn 0.1 ${wallet.baseCurrency} from ${shortenAddress(chatAddress ?? undefined)} to reveal pubkey`
                    : "Checking pubkey status"
              }
              tabIndex={canBurnDepinPubkey ? 0 : -1}
              onClick={canBurnDepinPubkey ? handleBurnDepinPubkey : undefined}
              onKeyDown={(event) => {
                if (!canBurnDepinPubkey) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleBurnDepinPubkey();
                }
              }}
              className={`rebel-chat__burn-button ${isBurningDepinPubkey ? 'rebel-chat__burn-button--burning' : ''} ${depinChatPubkeyRevealed === false && !isBurningDepinPubkey ? 'rebel-chat__burn-button--active' : ''}`}
            >
              <FaFireFlameCurved
                className={
                  depinChatPubkeyRevealed === false
                    ? "depin-flame depin-flame-lit rebel-chat__icon--block"
                    : "depin-flame depin-flame-done rebel-chat__icon--block"
                }
                {...decorativeIconProps}
              />
            </span>
          </span>
          <span
            role="button"
            aria-label="Show DePIN address QR"
            aria-disabled={!canShowDepinQr}
            tabIndex={canShowDepinQr ? 0 : -1}
            onClick={canShowDepinQr ? () => setShowDepinAddressQr((v) => !v) : undefined}
            onKeyDown={(event) => {
              if (!canShowDepinQr) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setShowDepinAddressQr((v) => !v);
              }
            }}
            className={`rebel-chat__qr-button ${canShowDepinQr ? 'rebel-chat__qr-button--active' : ''}`}
          >
            <FaQrcode className="rebel-chat__icon--inline" {...decorativeIconProps} />
          </span>
          <span className="rebel-chat__depin-address">
            <span className="rebel-chat__address-copy-wrapper">
              <span
                role="button"
                aria-label="Copy DePIN chat address"
                title="Copy"
                aria-disabled={!canCopyDepinAddress}
                tabIndex={canCopyDepinAddress ? 0 : -1}
                onClick={canCopyDepinAddress ? () => copyToClipboard(chatAddress ?? "") : undefined}
                onKeyDown={(event) => {
                  if (!canCopyDepinAddress) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    copyToClipboard(chatAddress ?? "");
                  }
                }}
                className={`rebel-chat__copy-button ${canCopyDepinAddress ? 'rebel-chat__copy-button--active' : ''}`}
              >
                <FaRegCopy className="rebel-chat__icon--inline" {...decorativeIconProps} />
              </span>
              <span>{depinAddressText || "-"}</span>
            </span>
          </span>
        </span>
      </h3>

      {showDepinAddressQr && depinAddressText && (
        <div className="rebel-chat__qr-container">
          <img
            alt="DePIN address QR"
            src={depinAddressQrSrc}
            className="rebel-chat__qr-image"
          />
        </div>
      )}

      <h3 className="rebel-chat__asset-header">
        <span>Asset Messaging</span>
        {selectedAsset && (
          <span className="rebel-chat__asset-current">
            {getAssetIcon(selectedAsset)} {selectedAsset}
          </span>
        )}
      </h3>

      {depinChatIdentity?.path && (
        <div className="rebel-chat__derivation-path">
          <strong>Derivation:</strong>{" "}
          <span>{depinChatIdentity.path}</span>
        </div>
      )}

      {/* Messaging Connection Controls - available for all asset types */}
      {selectedAsset && isValidMessagingAssetLocal(selectedAsset) && (
        <div className="rebel-chat__control-panel">
          {/* Status indicators */}
          <div className="rebel-chat__status-row">
            <div>
              <strong>Status:</strong>{" "}
              <span className={`rebel-chat__status-text ${isConnected ? 'rebel-chat__status-text--connected' : 'rebel-chat__status-text--disconnected'}`}>
                {isConnected ? "● Connected" : "○ Disconnected"}
              </span>
            </div>
            <div>
              <strong>Privacy:</strong>{" "}
              {msgInfo?.depinpoolpkey && msgInfo.depinpoolpkey !== "0" ? (
                <span className="rebel-chat__privacy-active">
                  ● Active <span className="rebel-chat__privacy-key">({msgInfo.depinpoolpkey.substring(0, 6)}...{msgInfo.depinpoolpkey.substring(60)})</span>
                </span>
              ) : (
                <span className="rebel-chat__privacy-inactive">
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
            <div className="rebel-chat__error">
              ⚠ {depinError}
            </div>
          )}

          {/* Validity status */}
          {validityStatus && (
            <div className={validityStatus.valid === 1 && !validityStatus.blocked ? "rebel-chat__success" : "rebel-chat__error"}>
              {validityStatus.valid === 1 && !validityStatus.blocked
                ? `✓ Valid DePIN asset${typeof msgInfo?.cipher === "string" && msgInfo.cipher.trim() ? ` | Cipher: ${msgInfo.cipher.trim()}` : ""}`
                : `✗ Invalid or blocked DePIN asset`}
            </div>
          )}
        </div>
      )}

      {/* Top Asset Selector & Chat Container */}
      <div className="rebel-chat__asset-selector-wrapper">

        {/* Asset List Button (Top) */}
        <div className="rebel-chat__asset-selector-header">
          <div className="rebel-chat__button-group">
            <button
              onClick={() => {
                setShowAssets(!showAssets);
                loadAssetAddresses();
              }}
              className="rebel-chat__select-asset-button"
            >
              {showAssets ? <FaArrowUp /> : <FaArrowDown />}
              {showAssets ? "Hide Asset List" : "Select Asset"}
            </button>


          </div>

          {selectedAsset && (
            <button
              onClick={handleDisconnect}
              className="rebel-chat__disconnect-button"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Asset List Slider Overlay */}
        <div className={`rebel-chat__asset-slider ${showAssets ? "rebel-chat__asset-slider--open" : "rebel-chat__asset-slider--closed"}`}>
          <div className="rebel-chat__asset-slider-content">
            <h4 className="rebel-chat__asset-slider-title">Select an Asset to Chat</h4>
            <table role="grid">
              <thead>
                <tr>
                  <th className="rebel-chat__asset-table-select">Select</th>
                  <th>Asset Name</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(chatAssets).map((assetName) => {
                  if (isBaseAssetName(assetName, wallet.baseCurrency)) return null;
                  if (chatAssets[assetName] === 0) return null;

                  const address = assetAddresses[assetName] || "Loading...";

                  return (
                    <tr
                      key={assetName}
                      onClick={() => {
                        handleAssetSelection(assetName);
                        setShowAssets(false); // Auto-close on selection
                      }}
                      className={`rebel-chat__asset-row ${selectedAsset === assetName ? 'rebel-chat__asset-row--selected' : ''}`}
                    >
                      <td className="rebel-chat__asset-table-select">
                        <input
                          type="radio"
                          name="selected-asset"
                          checked={selectedAsset === assetName}
                          onChange={() => {
                            handleAssetSelection(assetName);
                            setShowAssets(false);
                          }}
                          className="rebel-chat__asset-radio"
                        />
                      </td>
                      <td>
                        <span title={getAssetTypeLabel(assetName)}>{getAssetIcon(assetName)} </span>
                        {assetName}
                      </td>
                      <td className="rebel-chat__asset-address">
                        {address}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rebel-chat__container">
          {/* Sidebar */}
          {isConnected && (
            <div className={`rebel-chat__sidebar ${isSidebarOpen ? "rebel-chat__sidebar--open" : "rebel-chat__sidebar--closed"}`}>
              {/* Sidebar Header */}
              <div className="rebel-chat__sidebar-header">
                <span className="rebel-chat__sidebar-title">Contacts</span>
                <span
                  role="button"
                  aria-label="Close contacts"
                  tabIndex={0}
                  onClick={() => setSidebarOpen(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSidebarOpen(false);
                    }
                  }}
                  className="rebel-chat__copy-button rebel-chat__copy-button--active"
                >
                  <FaXmark className="rebel-chat__icon--inline" {...decorativeIconProps} />
                </span>
              </div>

              {/* Sidebar Content */}
              <div className="rebel-chat__sidebar-content">
                {/* Group Item */}
                <div
                  onClick={() => { setActiveTab("group"); if (window.innerWidth < 768) setSidebarOpen(false); }}
                  className={`rebel-chat__sidebar-item ${activeTab === "group" ? "rebel-chat__sidebar-item--active" : ""}`}
                >
                  <div className="rebel-chat__sidebar-avatar rebel-chat__sidebar-avatar--group">
                    <FaUserGroup size={18} />
                  </div>
                  <div className="rebel-chat__sidebar-info">
                    <div className="rebel-chat__sidebar-name">Public Group</div>
                    <div className="rebel-chat__sidebar-subtitle">Everyone</div>
                  </div>
                  {getUnreadCountLocal("group") > 0 && (
                    <span className="rebel-chat__unread-badge">
                      {getUnreadCountLocal("group")}
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
                      className={`rebel-chat__sidebar-item ${activeTab === address ? "rebel-chat__sidebar-item--active" : ""}`}
                    >
                      <div className="rebel-chat__sidebar-avatar rebel-chat__sidebar-avatar--private rebel-chat__sidebar-avatar--initials">
                        {conversation.displayName.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="rebel-chat__sidebar-info">
                        <div className="rebel-chat__sidebar-name">
                          {conversation.displayName}
                        </div>
                        <div className="rebel-chat__sidebar-subtitle">
                          {shortenAddress(address)}
                        </div>
                      </div>
                      {getUnreadCountLocal(address) > 0 && (
                        <span className="rebel-chat__unread-badge">
                          {getUnreadCountLocal(address)}
                        </span>
                      )}
                    </div>
                  ))}

                {/* Other Contacts (Holders) */}
                {addressList.length > 0 && addressList.some(item => !privateConversations.has(item.address) && item.pubkey) && (
                  <>
                    <div className="rebel-chat__sidebar-section-header">
                      Contacts
                    </div>
                    {addressList
                      .filter(item => !privateConversations.has(item.address) && item.pubkey)
                      .map((item) => (
                        <div
                          key={item.address}
                          onClick={() => {
                            createPrivateConversation(item.address);
                            setActiveTab(item.address);
                            if (window.innerWidth < 768) setSidebarOpen(false);
                          }}
                          className={`rebel-chat__sidebar-item ${item.address === chatAddress ? "rebel-chat__sidebar-item--self" : "rebel-chat__sidebar-item--other"}`}
                        >
                          <div className="rebel-chat__sidebar-avatar rebel-chat__sidebar-avatar--other">
                            {item.address === chatAddress ? "⭐" : (item.pubkey ? "👤" : "?")}
                          </div>
                          <div className="rebel-chat__sidebar-info">
                            <div className="rebel-chat__sidebar-name rebel-chat__sidebar-name--small">
                              {item.address === chatAddress ? "Me (Private Notes)" : shortenAddress(item.address)}
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
          <div className="rebel-chat__main-content">
            {/* Chat Header for Main Content */}
            <div className="rebel-chat__main-header">
              {isConnected && !isSidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="rebel-chat__sidebar-toggle-btn"
                >
                  <FaBars size={20} />
                </button>
              )}
              <div className="rebel-chat__main-header-title">
                {activeTab === "group" ? (
                  <>
                    <FaUserGroup className="text-blue-500" />
                    Public Group
                  </>
                ) : (
                  <>
                    <div className="rebel-chat__online-indicator"></div>
                    {privateConversations.get(activeTab)?.displayName || shortenAddress(activeTab)}
                  </>
                )}
              </div>
            </div>

            {/* Messages area - todas las pestañas siempre renderizadas */}
            <div className="rebel-chat__messages-area">
              {/* Pestaña General */}
              <div
                className={`rebel-chat__messages-container ${activeTab === "group" ? "rebel-chat__messages-container--active" : ""}`}
              >
                {(messagesByTab.get("group") || []).map((message) => (
                  <div key={message.id} id={`message-${message.id}`}>
                    <div className={`rebel-chat__message rebel-chat__message--${message.sender}`}>
                      <div className={`rebel-chat__message-bubble rebel-chat__message-bubble--${message.sender}`}>
                        {/* DePIN Message Format */}
                        {message.isDePIN && (
                          <>
                            {/* Sender (left) + Expires (right) */}
                            <div className={`rebel-chat__message-header rebel-chat__message-header--${message.sender}`}>
                              <span className="rebel-chat__message-sender">
                                {shortenAddress(message.senderAddress)}
                              </span>
                              {message.expiresDate && (
                                <span className="rebel-chat__message-expires">
                                  <FaBomb className="rebel-chat__icon--inline" {...decorativeIconProps} />
                                  <span className="rebel-chat__message-expires-text">{message.expiresDate}</span>
                                </span>
                              )}
                            </div>
                            {/* BOT model (if present in prefix) */}
                            {message.sender === "bot" && extractBotModel(message.text).model && (
                              <p className="rebel-chat__bot-model">
                                <FaRobot
                                  size={14}
                                  className="rebel-chat__icon--copy"
                                  {...decorativeIconProps}
                                />
                                {extractBotModel(message.text).model}
                              </p>
                            )}
                            {/* Message Content */}
                            <div className={`rebel-chat__message-body rebel-chat__message-body--${message.sender}`}>
                              {message.sender === "bot" ? renderBotMarkdown(extractBotModel(message.text).cleanText) : message.text}
                            </div>
                          </>
                        )}
                        {/* Regular Message Format */}
                        {!message.isDePIN && (
                          <div className={`rebel-chat__message-body rebel-chat__message-body--${message.sender}`}>
                            {message.sender === "bot" ? renderBotMarkdown(extractBotModel(message.text).cleanText) : message.text}
                          </div>
                        )}
                        <small className={`rebel-chat__message-timestamp rebel-chat__message-timestamp--${message.sender}`}>
                          {message.sender === "user" && message.delivery === "pending" && (
                            <FaRegClock
                              size={15}
                              color="#835608ff"
                              className="rebel-chat__delivery-icon"
                              {...decorativeIconProps}
                            />
                          )}
                          {message.sender === "user" && message.delivery === "confirmed" && (
                            <FaRegCircleCheck
                              size={15}
                              color="#22c55e"
                              className="rebel-chat__delivery-icon"
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
                <div ref={(el) => { messagesEndRef.current.set("group", el); }} />
              </div>

              {/* Pestañas Privadas */}
              {Array.from(privateConversations.keys())
                .filter((address) => !closedTabs.has(address))
                .map((address) => (
                  <div
                    key={address}
                    className={`rebel-chat__messages-container ${activeTab === address ? "rebel-chat__messages-container--active" : ""}`}
                  >
                    {(messagesByTab.get(address) || []).map((message) => (
                      <div key={message.id} id={`message-${message.id}`}>
                        <div className={`rebel-chat__message rebel-chat__message--${message.sender}`}>
                          <div className={`rebel-chat__message-bubble rebel-chat__message-bubble--${message.sender}`}>
                            {/* DePIN Message Format */}
                            {message.isDePIN && (
                              <>
                                {/* Sender (left) + Expires (right) */}
                                <div className={`rebel-chat__message-header rebel-chat__message-header--${message.sender}`}>
                                  <span className="rebel-chat__message-sender">
                                    {shortenAddress(message.senderAddress)}
                                  </span>
                                  {message.expiresDate && (
                                    <span className="rebel-chat__message-expires">
                                      <FaBomb className="rebel-chat__icon--inline" {...decorativeIconProps} />
                                      <span className="rebel-chat__message-expires-text">{message.expiresDate}</span>
                                    </span>
                                  )}
                                </div>
                                {/* BOT model (if present in prefix) */}
                                {message.sender === "bot" && extractBotModel(message.text).model && (
                                  <p className="rebel-chat__bot-model">
                                    <FaRobot
                                      size={14}
                                      className="rebel-chat__icon--copy"
                                      {...decorativeIconProps}
                                    />
                                    {extractBotModel(message.text).model}
                                  </p>
                                )}
                                {/* Message Content */}
                                <div className={`rebel-chat__message-body rebel-chat__message-body--${message.sender}`}>
                                  {message.sender === "bot" ? renderBotMarkdown(extractBotModel(message.text).cleanText) : message.text}
                                </div>
                              </>
                            )}
                            {/* Regular Message Format */}
                            {!message.isDePIN && (
                              <div className={`rebel-chat__message-body rebel-chat__message-body--${message.sender}`}>
                                {message.sender === "bot" ? renderBotMarkdown(extractBotModel(message.text).cleanText) : message.text}
                              </div>
                            )}
                            <small className={`rebel-chat__message-timestamp rebel-chat__message-timestamp--${message.sender}`}>
                              {message.sender === "user" && message.delivery === "pending" && (
                                <FaRegClock
                                  size={15}
                                  color="#835608ff"
                                  className="rebel-chat__delivery-icon"
                                  {...decorativeIconProps}
                                />
                              )}
                              {message.sender === "user" && message.delivery === "confirmed" && (
                                <FaRegCircleCheck
                                  size={15}
                                  color="#22c55e"
                                  className="rebel-chat__delivery-icon"
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
                    <div ref={(el) => { messagesEndRef.current.set(address, el); }} />
                  </div>
                ))}
            </div>

            {/* Input area */}
            <div className="rebel-chat__input-area">
              <div className="rebel-chat__input-wrapper">
                <textarea
                  ref={chatInputRef}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    autoResizeTextarea(e.target, 48);
                  }}
                  onInput={(e) => {
                    autoResizeTextarea(e.currentTarget, 48);
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder=""
                  disabled={!isConnected}
                  rows={1}
                  className={`rebel-chat__textarea ${isConnected ? 'rebel-chat__textarea--active' : 'rebel-chat__textarea--disabled'}`}
                  onFocus={(e) => {
                    if (isConnected) {
                      e.target.classList.add('rebel-chat__textarea--focused');
                    }
                  }}
                  onBlur={(e) => {
                    e.target.classList.remove('rebel-chat__textarea--focused');
                  }}
                />
                <IconSend
                  onClick={handleSend}
                  className="rebel-chat__send-icon rebel-chat__icon--block"
                  title={!isConnected ? "Select an asset first" : "Send message"}
                />
              </div>
              {/* Private command indicator */}
              {inputText.trim().match(/^\/private\s+(N[a-zA-Z0-9]{33,34})$/) && (
                <div className="rebel-chat__private-command-indicator">
                  <span className="rebel-chat__private-command-emoji">💬</span>
                  <span>Press Enter to open private conversation with {inputText.trim().match(/^\/private\s+(N[a-zA-Z0-9]{33,34})$/)?.[1]?.slice(0, 8)}...</span>
                </div>
              )}
            </div>
          </div>
        </div>





      </div> {/* Close wrapper div */}
    </div>
  );
}
