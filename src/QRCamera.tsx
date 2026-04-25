import React from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
export function useQRReader(
    showQRCode: boolean,
    onResult: (value: string | null) => void
  ) {
    const [qr, setQR] = React.useState(<></>);
    const [mode, setMode] = React.useState<"environment" | "user">("environment");
    React.useEffect(() => {
      if (showQRCode === false) {
        setQR(<></>);
      } else {
        const q = (
          <div>
            <Scanner
              key={"qr" + new Date().toISOString()}
              constraints={{
                facingMode: mode,
              }}
              scanDelay={100}
              onScan={(codes) => {
                const value = codes[0]?.rawValue;
                if (value) {
                  onResult(value);
                }
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                className="neurai-btn--secondary flex-1"
                onClick={() => {
                  const newMode = mode === "environment" ? "user" : "environment";
                  setMode(newMode);
                }}
              >
                Toggle mode
              </button>
              <button
                type="button"
                onClick={() => onResult("")}
                className="neurai-btn--secondary flex-1"
              >
                Close camera
              </button>
            </div>
          </div>
        );
        setQR(q);
      }
    }, [showQRCode, mode]);

    return qr;
  }
