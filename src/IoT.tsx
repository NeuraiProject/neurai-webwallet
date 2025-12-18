import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useIoTDevices, IIoTDevice } from "./hooks/useIoTDevices";
import { LiaMapMarkerAltSolid } from "react-icons/lia";
import "./IoT.css";

export function IoT({ wallet }: { wallet: Wallet }) {
  const devices = useIoTDevices();

  const handleAction = (deviceId: string, action: string) => {
    // TODO: Implement actions via RPC or device commands
    alert(`Action ${action} on device ${deviceId}`);
  };

  return (
    <article>
      <h2 className="rebel-iot__title">IoT Device Management (TEST)</h2>
      <table role="grid" className="rebel-iot__table">
        <thead>
          <tr>
            <th>Device</th>
            <th>Last Heartbeat</th>
            <th>Info</th>
            <th>BGrid Location</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id} className="rebel-iot__row">
              <td className="rebel-iot__cell" data-label="Device">{device.name}</td>
              <td className="rebel-iot__cell" data-label="Last Heartbeat">
                {device.lastHeartbeat.toLocaleString()}
              </td>
              <td className="rebel-iot__cell" data-label="Info">{device.info}</td>
              <td className="rebel-iot__cell" data-label="BGrid Location">
                <a
                  href={`https://maps.bgrid.org/?en=${device.bgridLocation.replace(/ /g, ',')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on BGrid Map"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  {device.bgridLocation}
                  <LiaMapMarkerAltSolid style={{ fontSize: '16px', marginLeft: '5px' }} />
                </a>
              </td>
              <td className="rebel-iot__cell" data-label="Actions">
                <button
                  className="outline"
                  onClick={() => handleAction(device.id, "restart")}
                >
                  Restart
                </button>
                <button
                  className="outline"
                  onClick={() => handleAction(device.id, "check")}
                >
                  Check
                </button>
                <button
                  className="outline"
                  onClick={() => handleAction(device.id, "suspend")}
                >
                  Suspend 1h
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}