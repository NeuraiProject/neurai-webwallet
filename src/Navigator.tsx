import React, { ReactNode } from "react";
import { Routes } from "./Routes";
import { LightModeToggle } from "./components/LightModeToggle";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import {
  IconHistory,
  IconHome,
  IconReceive,
  IconSend,
  IconSign,
  IconSweep,
} from "./icons";
import networkInfo, { INetworks } from "./networkInfo";
import { getMnemonicAndPassphrase } from "./utils";

const neuraiLogo = new URL("../neurai-xna-logo.png", import.meta.url);

export function Navigator({
  balance,
  wallet,
  currentRoute,
  setRoute,
}: {
  balance: ReactNode;
  currentRoute: Routes;
  wallet: Wallet;
  setRoute: any;
}) {
  const networkDisplayName = networkInfo[wallet.network].displayName;
  const { passphrase } = getMnemonicAndPassphrase();
  const hasPassphrase = passphrase !== "";
  const isFromESP32 = localStorage.getItem("loginFromESP32") === "true";

  return (
    <article className="rebel-navigator__container">
      <LightModeToggle />
      <a
        href="#"
        className="primary"
        onClick={(event) => {
          setRoute(Routes.HOME);
          event.preventDefault();
          return false;
        }}
      >
        <h2 className="rebel-headline" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <img 
            src={neuraiLogo.href} 
            alt="Neurai logo" 
            style={{ width: "32px", height: "32px" }}
          />
          Neurai
        </h2>
      </a>
        <h5>Rebel Wallet 1.0.8</h5>
        
        {/* Passphrase indicator */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          marginTop: '0.5rem',
          marginBottom: '0.5rem'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: hasPassphrase ? '#22c55e' : '#ef4444',
            boxShadow: hasPassphrase 
              ? '0 0 4px rgba(34, 197, 94, 0.6)' 
              : '0 0 4px rgba(239, 68, 68, 0.6)'
          }} />
          <span style={{ 
            fontSize: '0.85rem',
            color: 'var(--muted-color)'
          }}>
            Passphrase
          </span>
        </div>

        {/* Hardware (ESP32) indicator */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          marginBottom: '0.5rem'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: isFromESP32 ? '#22c55e' : '#ef4444',
            boxShadow: isFromESP32 
              ? '0 0 4px rgba(34, 197, 94, 0.6)' 
              : '0 0 4px rgba(239, 68, 68, 0.6)'
          }} />
          <span style={{ 
            fontSize: '0.85rem',
            color: 'var(--muted-color)'
          }}>
            HW
          </span>
        </div>

      {balance}

      <nav className="rebel-navigator">
        <ul className="rebel-navigator__list">
          <Link
            currentRoute={currentRoute}
            setRoute={setRoute}
            newRoute={Routes.HOME}
            title="Home"
          />
          <Link
            currentRoute={currentRoute}
            setRoute={setRoute}
            newRoute={Routes.SEND}
            title="Send"
          />
          <Link
            currentRoute={currentRoute}
            setRoute={setRoute}
            newRoute={Routes.RECEIVE}
            title="Receive"
          />
          <Link
            currentRoute={currentRoute}
            setRoute={setRoute}
            newRoute={Routes.SWEEP}
            title="Sweep"
          />

          <Link
            currentRoute={currentRoute}
            setRoute={setRoute}
            newRoute={Routes.HISTORY}
            title="History"
          />
          <Link
            currentRoute={currentRoute}
            setRoute={setRoute}
            newRoute={Routes.SIGN}
            title="Sign"
          />
        </ul>
      </nav>
      {/* <small>
        <NetworkSelect wallet={wallet} networks={networkInfo}></NetworkSelect>
      </small> */}
    </article>
  );
}

interface ILinkProps {
  currentRoute: Routes;
  newRoute: Routes;
  setRoute: any;
  title: string;
}

type NetworkInfoProps = {
  wallet: Wallet;
  networks: INetworks;
};

function NetworkSelect({ wallet, networks }: NetworkInfoProps) {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newNetwork = event.target.value;

    // Update the URL and reload the page with the new network query parameter
    const newUrl = `${window.location.pathname}?network=${newNetwork}`;
    window.location.href = newUrl;
  };

  const options = Object.keys(networks).map((network: string) => {
    const info = networks[network];
    return (
      <option key={network} value={network}>
        {info.displayName}
      </option>
    );
  });

  return (
    <select value={wallet.network} onChange={handleChange}>
      {options}
    </select>
  );
}

function Link({ currentRoute, newRoute, setRoute, title }: ILinkProps) {
  const isCurrent = currentRoute === newRoute;
  const classes =
    "rebel-navigator__list-item" +
    (isCurrent ? " rebel-navigator__list-item--active" : "");
  return (
    <li className={classes}>
      <a
        href="#"
        className="primary rebel-navigator__list-item-link"
        onClick={(event) => {
          setRoute(newRoute);
          event.preventDefault();
          return false;
        }}
        style={{ display: "block" }}
      >
        <Icon route={newRoute} />
        {title}
      </a>
    </li>
  );
}
//Icons from https://feathericons.com/
const iconMapper = {
  [Routes.HOME]: <IconHome />,
  [Routes.HISTORY]: <IconHistory />,
  [Routes.RECEIVE]: <IconReceive />,
  [Routes.SEND]: <IconSend />,
  [Routes.SIGN]: <IconSign />,
  [Routes.SWEEP]: <IconSweep />,
};
function Icon({ route }) {
  return <div> {iconMapper[route]}</div>;
}
