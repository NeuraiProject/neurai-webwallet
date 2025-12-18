import React from "react";

export interface IIoTDevice {
  id: string;
  name: string;
  lastHeartbeat: Date;
  info: string;
  bgridLocation: string; // 3-4 BIP39 words
}

export function useIoTDevices() {
  // Mock data for now - in future, fetch from wallet RPC
  const [devices, setDevices] = React.useState<IIoTDevice[]>([
    {
      id: "dev1",
      name: "ESP32 Sensor Hub",
      lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
      info: "Temperature: 22°C, Humidity: 60%",
      bgridLocation: "despair,faculty,crash,evil",
    },
    {
      id: "dev2",
      name: "IoT Gateway",
      lastHeartbeat: new Date(Date.now() - 30 * 1000), // 30 sec ago
      info: "Online, Firmware v1.2",
      bgridLocation: "excuse,polar,reduce,fashion",
    },
  ]);

  // TODO: Fetch from wallet.rpc or API
  // React.useEffect(() => {
  //   if (wallet) {
  //     wallet.rpc("getiotdevices", []).then(setDevices).catch(() => {});
  //   }
  // }, [wallet]);

  return devices;
}