import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useIoTDevices, IIoTDevice } from "./hooks/useIoTDevices";
import { LiaMapMarkerAltSolid, LiaSyncSolid, LiaCheckCircleSolid, LiaPauseCircleSolid } from "react-icons/lia";

export function IoT({ wallet }: { wallet: Wallet }) {
  const devices = useIoTDevices();

  const handleAction = (deviceId: string, action: string) => {
    alert(`Action ${action} on device ${deviceId}`);
  };

  const getStatusTone = (lastHeartbeat: Date) => {
    const diff = Date.now() - lastHeartbeat.getTime();
    if (diff < 2 * 60 * 1000) return "bg-success";
    if (diff < 10 * 60 * 1000) return "bg-warning";
    return "bg-error";
  };

  return (
    <div className="neurai-card neurai-stack">
      <h2 className="text-2xl font-bold m-0">IoT Device Management (TEST)</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((device) => (
          <div
            key={device.id}
            className="rounded-md border border-base-300 bg-base-100 p-4 flex flex-col gap-3"
          >
            <header className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${getStatusTone(device.lastHeartbeat)}`}
                  title={`Last heartbeat: ${device.lastHeartbeat.toLocaleString()}`}
                />
                <h4 className="m-0 font-semibold truncate">{device.name}</h4>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="neurai-btn--icon"
                  onClick={() => handleAction(device.id, "restart")}
                  title="Restart Device"
                >
                  <LiaSyncSolid />
                </button>
                <button
                  type="button"
                  className="neurai-btn--icon"
                  onClick={() => handleAction(device.id, "check")}
                  title="Check Status"
                >
                  <LiaCheckCircleSolid />
                </button>
                <button
                  type="button"
                  className="neurai-btn--icon"
                  onClick={() => handleAction(device.id, "suspend")}
                  title="Suspend 1h"
                >
                  <LiaPauseCircleSolid />
                </button>
              </div>
            </header>

            <div className="flex flex-col gap-2 text-sm">
              <div>
                <small className="block text-base-content/60 uppercase tracking-wider text-xs">Information</small>
                <p className="m-0">{device.info}</p>
              </div>

              <div>
                <small className="block text-base-content/60 uppercase tracking-wider text-xs">BGrid Location</small>
                <a
                  href={`https://maps.bgrid.org/?en=${device.bgridLocation.replace(/ /g, ',')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {device.bgridLocation}
                  <LiaMapMarkerAltSolid className="w-4 h-4" />
                </a>
              </div>

              <div>
                <small className="block text-base-content/60 uppercase tracking-wider text-xs">Derivation</small>
                <p className="m-0 font-mono text-xs break-all">{device.derivation}</p>
              </div>
            </div>

            <footer className="border-t border-base-300 pt-2">
              <small className="text-base-content/60">
                Last seen: {device.lastHeartbeat.toLocaleTimeString()}
              </small>
            </footer>
          </div>
        ))}
      </div>
    </div>
  );
}
