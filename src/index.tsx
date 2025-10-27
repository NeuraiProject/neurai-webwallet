import NeuraiWallet, { Wallet } from "@neuraiproject/neurai-jswallet";
console.log("NeuraiWallet", !!NeuraiWallet);
import React from "react";
import { getMnemonicAndPassphrase } from "./utils";
import { createRoot } from "react-dom/client";

import { History } from "./history/History";
import { Assets } from "./Assets";
import { Mempool } from "./Mempool";
import { ReceiveAddress } from "./ReceiveAddress";
import { Balance } from "./Balance";
import { Loader } from "./Loader";
import { Send } from "./Send";
import { Login } from "./Login";
import { Sweep } from "./Sweep";
import { Navigator } from "./Navigator";
import { Routes } from "./Routes";
import { Footer } from "./Footer";
import { Sign } from "./sign/Sign";
import { useMempool } from "./hooks/useMempool";
import { useBlockCount } from "./hooks/useBlockCount";
import { useBalance } from "./hooks/useBalance";
import { useAssets } from "./hooks/useAssets";
import { useReceiveAddress } from "./hooks/useReceiveAddress";

let _mnemonic =
  "sight rate burger maid melody slogan attitude gas account sick awful hammer";

type ChainType = "xna" | "xna-test";

const { mnemonic: initMnemonic, passphrase: initPassphrase } = getMnemonicAndPassphrase();

//Set Dark or Light mode if store.
const theme = localStorage.getItem("data-theme");
if (theme) {
  const element = document.querySelector("html");
  element?.setAttribute("data-theme", theme);
}

function App() {
  const [currentRoute, setCurrentRoute] = React.useState(Routes.HOME);

  const [mnemonic] = React.useState(initMnemonic);
  const [passphrase] = React.useState(initPassphrase);

  const [wallet, setWallet] = React.useState<null | Wallet>(null);

  const blockCount = useBlockCount(wallet);
  const receiveAddress = useReceiveAddress(wallet, blockCount);
  const balance = useBalance(wallet, blockCount);

  const mempool = useMempool(wallet, blockCount);
  const assets = useAssets(wallet, blockCount);

  //At startup init wallet
  React.useEffect(() => {
    if (!mnemonic) {
      return;
    }
    let minAmountOfAddresses = 50;
    //Override network to xna-test if present in query string (search)
    const searchParams = new URLSearchParams(window.location.search);
    let network: ChainType = "xna";
    if (searchParams.get("network") === "xna-test") {
      network = "xna-test";
    }

    if (searchParams.get("min")) {
      const v = searchParams.get("min");
      if (v && isFinite(parseInt(v)) === true) {
        minAmountOfAddresses = parseInt(v);
      }
    }

    // Create wallet config
    const walletConfig: any = {
      minAmountOfAddresses,
      mnemonic,
      network,
    };
    
    // Only add passphrase if it exists (backward compatible)
    if (passphrase) {
      walletConfig.passphrase = passphrase;
    }

    NeuraiWallet.createInstance(walletConfig).then(setWallet);
  }, [mnemonic, passphrase]);

  if (!mnemonic) {
    return <Login />;
  }
  if (!wallet || blockCount === 0) {
    return <Loader />;
  }

  const signOut = () => {
    if (confirm("Are you sure you want to sign out?")) {
      localStorage.removeItem("mnemonic");
      window.location.reload();
    }
  };

  const hasMempool = mempool.length > 0;
  return (
    <>
      <Navigator
        balance={
          <Balance balance={balance} mempool={mempool} wallet={wallet} />
        }
        currentRoute={currentRoute}
        setRoute={setCurrentRoute}
        wallet={wallet}
      />

      <div className="rebel-content-container">
        {hasMempool && (
          <div className="rebel-content-container__mempool">
            <Mempool mempool={mempool} wallet={wallet} />
          </div>
        )}

        <div className="rebel-content-container__content">
          {currentRoute === Routes.HOME && (
            <Assets wallet={wallet} assets={assets} mempool={mempool} />
          )}
          {currentRoute === Routes.RECEIVE && (
            <ReceiveAddress receiveAddress={receiveAddress} />
          )}

          {currentRoute === Routes.SEND && (
            <Send
              assets={assets}
              balance={balance}
              mempool={mempool}
              wallet={wallet}
            />
          )}

          {currentRoute === Routes.SWEEP && <Sweep wallet={wallet} />}

          {currentRoute === Routes.HISTORY && (
            <History wallet={wallet} blockCount={blockCount} />
          )}

          {currentRoute === Routes.SIGN && (
            <Sign assets={assets} wallet={wallet} />
          )}
        </div>
      </div>

      <Footer signOut={signOut} mnemonic={mnemonic} />
    </>
  );
}

//Add app to the DOM
const container = document.getElementById("app");
const root = createRoot(container!);
root.render(<App />);
