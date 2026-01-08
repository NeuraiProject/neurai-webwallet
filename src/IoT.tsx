import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useIoTDevices, IIoTDevice } from "./hooks/useIoTDevices";
import { LiaMapMarkerAltSolid, LiaSyncSolid, LiaCheckCircleSolid, LiaPauseCircleSolid } from "react-icons/lia";
import "./IoT.css";

export function IoT({ wallet }: { wallet: Wallet }) {
  const devices = useIoTDevices();

  const handleAction = (deviceId: string, action: string) => {
    // TODO: Implement actions via RPC or device commands
    alert(`Action ${action} on device ${deviceId}`);
  };

  const getStatusTone = (lastHeartbeat: Date) => {
    const diff = Date.now() - lastHeartbeat.getTime();
    if (diff < 2 * 60 * 1000) return "ok"; // Green (2 min)
    if (diff < 10 * 60 * 1000) return "warn"; // Orange (10 min)
    return "error"; // Red
  };

  return (
    <article className="rebel-iot">
      <h2 className="rebel-iot__title">IoT Device Management (TEST)</h2>
      
      <div className="rebel-iot__grid">
        {devices.map((device) => (
          <div key={device.id} className="rebel-iot__card">
            <header className="rebel-iot__card-header">
              <div className="rebel-iot__device-info">
                <span 
                  className={`rebel-iot__status-dot rebel-iot__status-dot--${getStatusTone(device.lastHeartbeat)}`}
                  title={`Last heartbeat: ${device.lastHeartbeat.toLocaleString()}`}
                />
                <h4 className="rebel-iot__device-name">{device.name}</h4>
              </div>
              <div className="rebel-iot__actions">
                <button
                  className="outline contrast rebel-iot__action-btn"
                  onClick={() => handleAction(device.id, "restart")}
                  title="Restart Device"
                >
                  <LiaSyncSolid />
                </button>
                <button
                  className="outline contrast rebel-iot__action-btn"
                  onClick={() => handleAction(device.id, "check")}
                  title="Check Status"
                >
                  <LiaCheckCircleSolid />
                </button>
                <button
                  className="outline contrast rebel-iot__action-btn"
                  onClick={() => handleAction(device.id, "suspend")}
                  title="Suspend 1h"
                >
                  <LiaPauseCircleSolid />
                </button>
              </div>
            </header>

            <div className="rebel-iot__card-body">
              <div className="rebel-iot__data-item">
                <small className="rebel-iot__label">Information</small>
                <p className="rebel-iot__value">{device.info}</p>
              </div>
              
              <div className="rebel-iot__data-item">
                <small className="rebel-iot__label">BGrid Location</small>
                <a
                  href={`https://maps.bgrid.org/?en=${device.bgridLocation.replace(/ /g, ',')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rebel-iot__bgrid-link"
                >
                  {device.bgridLocation}
                  <LiaMapMarkerAltSolid className="rebel-iot__bgrid-icon" />
                </a>
              </div>

              <div className="rebel-iot__data-item">
                <small className="rebel-iot__label">Derivation</small>
                <p className="rebel-iot__value">{device.derivation}</p>
              </div>
            </div>

            <footer className="rebel-iot__card-footer">
              <small className="rebel-iot__heartbeat">
                Last seen: {device.lastHeartbeat.toLocaleTimeString()}
              </small>
            </footer>
          </div>
        ))}
      </div>
    </article>
  );
}
