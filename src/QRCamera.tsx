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
            <div className="grid">
              <button
                className="secondary"
                onClick={() => {
                  const newMode = mode === "environment" ? "user" : "environment";

                  setMode(newMode);
                }}
              >
                Toggle mode
              </button>
              <button onClick={() => onResult("")} className="secondary">
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
