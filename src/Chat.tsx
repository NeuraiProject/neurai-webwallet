import React from "react";
import { IconSend } from "./icons";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { getAssetBalanceIncludingMempool } from "./utils";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

interface ChatProps {
  wallet: Wallet;
  assets: any[];
  mempool: any;
}

export function Chat({ wallet, assets, mempool }: ChatProps) {
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
  const [pubKeyStatus, setPubKeyStatus] = React.useState<Record<string, boolean | null>>({});
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const allAssets = getAssetBalanceIncludingMempool(wallet, assets, mempool);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (inputText.trim() === "") return;

    const newMessage: Message = {
      id: messages.length + 1,
      text: inputText,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages([...messages, newMessage]);
    setInputText("");

    // Simulate bot response
    setTimeout(() => {
      const botResponse: Message = {
        id: messages.length + 2,
        text: "This is a simulated response from Chat DePIN",
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botResponse]);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const loadAssetAddresses = async () => {
    setShowAssets(!showAssets);

    if (!showAssets && Object.keys(assetAddresses).length === 0) {
      const addresses: Record<string, string> = {};
      const pubKeys: Record<string, boolean> = {};
      const myAddressObjects = wallet.getAddressObjects();
      const myAddresses = myAddressObjects.map(obj => obj.address);

      for (const assetName of Object.keys(allAssets)) {
        if (assetName === wallet.baseCurrency) continue;
        if (allAssets[assetName] === 0) continue;

        try {
          // Get all addresses that have this asset
          const data = await wallet.rpc("listaddressesbyasset", [assetName]);
          const allAddressesWithAsset = Object.keys(data);

          // Filter to get only MY addresses that have this asset
          const myAddressesWithAsset = allAddressesWithAsset.filter(addr =>
            myAddresses.includes(addr)
          );

          if (myAddressesWithAsset.length > 0) {
            // Use the first address found
            const address = myAddressesWithAsset[0];
            addresses[assetName] = address;

            // Check if pubkey is available for this address
            try {
              console.log(`Checking pubkey for ${assetName} at address: ${address}`);
              const pubkeyResult = await wallet.rpc("getpubkey", [address]);
              console.log(`Pubkey result for ${assetName}:`, pubkeyResult);
              
              // If getpubkey returns a valid result, pubkey exists
              pubKeys[assetName] = !!(pubkeyResult && pubkeyResult.pubkey);
              console.log(`PubKey available for ${assetName}: ${pubKeys[assetName]}`);
            } catch (error: any) {
              // If getpubkey fails or is not supported
              console.warn(`Cannot check pubkey for ${assetName}:`, error.description || error.error);
              
              // Mark as null to indicate "not available to check" vs "checked and not found"
              if (error.error === "Not in whitelist" || error.description?.includes("not supported")) {
                pubKeys[assetName] = null as any; // Use null to indicate RPC method not available
              } else {
                pubKeys[assetName] = false;
              }
            }
          } else {
            addresses[assetName] = "Not found in wallet";
            pubKeys[assetName] = false;
          }
        } catch (error) {
          console.error(`Error loading address for ${assetName}:`, error);
          addresses[assetName] = "Error loading";
          pubKeys[assetName] = false;
        }
      }

      setAssetAddresses(addresses);
      setPubKeyStatus(pubKeys);
    }
  };

  return (
    <article>
      <h3>Chat DePIN</h3>

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
                  padding: "0.875rem 1.125rem",
                  borderRadius: message.sender === "user"
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                  backgroundColor:
                    message.sender === "user"
                      ? "#3b82f6"
                      : "#ffffff",
                  color:
                    message.sender === "user"
                      ? "#ffffff"
                      : "#1f2937",
                  boxShadow: message.sender === "user"
                    ? "0 2px 8px rgba(59, 130, 246, 0.3)"
                    : "0 2px 8px rgba(0, 0, 0, 0.08)",
                  border: message.sender === "user"
                    ? "none"
                    : "1px solid #e5e7eb",
                }}
              >
                <p style={{
                  margin: 0,
                  wordWrap: "break-word",
                  lineHeight: "1.5",
                  fontSize: "0.95rem",
                }}>
                  {message.text}
                </p>
                <small
                  style={{
                    display: "block",
                    marginTop: "0.375rem",
                    opacity: message.sender === "user" ? 0.9 : 0.6,
                    fontSize: "0.7rem",
                    textAlign: "right",
                  }}
                >
                  {message.timestamp.toLocaleTimeString()}
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
            alignItems: "center",
            backgroundColor: "#ffffff",
          }}
          className="chat-input-area"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type your message..."
            style={{
              flex: 1,
              padding: "0.875rem 1rem",
              borderRadius: "24px",
              border: "2px solid #e5e7eb",
              backgroundColor: "#f9fafb",
              margin: 0,
              fontSize: "0.95rem",
              outline: "none",
              transition: "all 0.2s",
            }}
            onFocus={(e) => {
              e.target.style.border = "2px solid #3b82f6";
              e.target.style.backgroundColor = "#ffffff";
            }}
            onBlur={(e) => {
              e.target.style.border = "2px solid #e5e7eb";
              e.target.style.backgroundColor = "#f9fafb";
            }}
          />
          <div
            onClick={handleSend}
            className={inputText.trim() ? "chat-send-button-active" : "chat-send-button-inactive"}
            style={{
              cursor: inputText.trim() ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: inputText.trim()
                ? "#3b82f6"
                : "#d1d5db",
              color: "#ffffff",
              transition: "all 0.2s",
              boxShadow: inputText.trim()
                ? "0 4px 12px rgba(59, 130, 246, 0.4)"
                : "none",
              transform: "scale(1)",
            }}
            onMouseEnter={(e) => {
              if (inputText.trim()) {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.backgroundColor = "#2563eb";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              if (inputText.trim()) {
                e.currentTarget.style.backgroundColor = "#3b82f6";
              }
            }}
            title="Send message"
          >
            <IconSend />
          </div>
        </div>
      </div>

      {/* Asset List Button */}
      <div style={{ marginTop: "1rem", textAlign: "center" }}>
        <button onClick={loadAssetAddresses}>
          {showAssets ? "Hide Asset List" : "Asset List"}
        </button>
      </div>

      {/* Asset List Table */}
      {showAssets && (
        <div style={{ marginTop: "1rem" }}>
          <table role="grid">
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Address</th>
                <th style={{ textAlign: "center", width: "100px" }}>PubKey</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(allAssets).map((assetName) => {
                if (assetName === wallet.baseCurrency) return null;
                if (allAssets[assetName] === 0) return null;

                const address = assetAddresses[assetName] || "Loading...";
                const hasPubKey = pubKeyStatus[assetName];

                return (
                  <tr key={assetName}>
                    <td>{assetName}</td>
                    <td style={{
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                      wordBreak: "break-all"
                    }}>
                      {address}
                    </td>
                    <td style={{ textAlign: "center", fontSize: "1.2rem" }}>
                      {address === "Loading..." ? (
                        "..."
                      ) : hasPubKey === null ? (
                        <span style={{ color: "#9ca3af" }} title="PubKey check not available on this RPC server">—</span>
                      ) : hasPubKey ? (
                        <span style={{ color: "#22c55e" }} title="Public key available">✓</span>
                      ) : (
                        <span style={{ color: "#ef4444" }} title="Public key not available">✗</span>
                      )}
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

        [data-theme="dark"] .chat-input-area input {
          background-color: #151515 !important;
          border-color: #333333 !important;
          color: var(--neurai-text) !important;
        }

        [data-theme="dark"] .chat-input-area input::placeholder {
          color: var(--neurai-text-secondary) !important;
        }

        [data-theme="dark"] .chat-input-area input:focus {
          background-color: #1a1a1a !important;
          border-color: var(--neurai-primary) !important;
        }

        [data-theme="dark"] .chat-message-user {
          background-color: var(--neurai-primary) !important;
          box-shadow: 0 2px 8px rgba(108, 92, 231, 0.4) !important;
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
      `}</style>
    </article>
  );
}
