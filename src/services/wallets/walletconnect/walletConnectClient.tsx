import { WalletConnectContext } from "../../../contexts/WalletConnectContext";
import { useCallback, useContext, useEffect, useState, useRef } from 'react';
import { WalletInterface } from "../walletInterface";
import {
  AccountId,
  ContractExecuteTransaction,
  ContractId,
  LedgerId,
  TokenAssociateTransaction,
  TokenId,
  TransferTransaction,
  Client,
} from "@hashgraph/sdk";
import { ContractFunctionParameterBuilder } from "../contractFunctionParameterBuilder";
import { appConfig } from "../../../config";
import { SignClientTypes } from "@walletconnect/types";
import {
  DAppConnector,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  HederaChainId,
} from "@hashgraph/hedera-wallet-connect";
import EventEmitter from "events";
import { useDispatch, useSelector } from "react-redux";
import { actions, AppStore } from "../../../store";
// Created refreshEvent because `dappConnector.walletConnectClient.on(eventName, syncWithWalletConnectContext)` would not call syncWithWalletConnectContext
// Reference usage from walletconnect implementation https://github.com/hashgraph/hedera-wallet-connect/blob/main/src/lib/dapp/index.ts#L120C1-L124C9
const refreshEvent = new EventEmitter();

// Create a new project in walletconnect cloud to generate a project id
const walletConnectProjectId = "377d75bb6f86a2ffd427d032ff6ea7d3";
const currentNetworkConfig = appConfig.networks.mainnet;
const hederaNetwork = currentNetworkConfig.network;

// Adapted from walletconnect dapp example:
// https://github.com/hashgraph/hedera-wallet-connect/blob/main/src/examples/typescript/dapp/main.ts#L87C1-L101C4
const metadata: SignClientTypes.Metadata = {
  name: "Hedera DAO",
  description: "Hedera DAO",
  url: window.location.origin,
  icons: [window.location.origin + "/logo192.png"],
}

const dappConnector = new DAppConnector(
  metadata,
  LedgerId.fromString(hederaNetwork),
  walletConnectProjectId,
  Object.values(HederaJsonRpcMethod),
  [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
  [HederaChainId.Mainnet],
);

// ensure walletconnect is initialized only once
let walletConnectInitPromise: Promise<void> | undefined = undefined;
const initializeWalletConnect = async () => {
  if (walletConnectInitPromise === undefined) {
    walletConnectInitPromise = dappConnector.init().then(() => {
      console.log("WalletConnect initialized successfully.");
    }).catch((e) => { console.error(e); })
  }
  await walletConnectInitPromise;
};

export const openWalletConnectModal = async () => {
  await initializeWalletConnect();
  await dappConnector.openModal().then((x) => {
    refreshEvent.emit("sync");
  }).catch((e) => { console.error(e); });
};

// Add this type to track wallet info
interface WalletInfo {
  name: string;
  description?: string;
  url?: string;
}

class WalletConnectWallet implements WalletInterface {
  private walletInfo: WalletInfo | null = null;

  setWalletInfo(info: WalletInfo) {
    this.walletInfo = info;
  }

  getWalletInfo(): WalletInfo | null {
    return this.walletInfo;
  }

  private getSigner() {
    if (dappConnector.signers.length === 0) {
      throw new Error('No signers found!');
    }
    return dappConnector.signers[0];
  }

  private getAccountId() {
    // Need to convert from walletconnect's AccountId to hashgraph/sdk's AccountId because walletconnect's AccountId and hashgraph/sdk's AccountId are not the same!
    return AccountId.fromString(this.getSigner().getAccountId().toString());
  }

  async transferHBAR(toAddress: AccountId, amount: number) {
    const transferHBARTransaction = new TransferTransaction()
      .addHbarTransfer(this.getAccountId(), -amount)
      .addHbarTransfer(toAddress, amount);

    const signer = this.getSigner();
    await transferHBARTransaction.freezeWithSigner(signer as any);
    const txResult = await transferHBARTransaction.executeWithSigner(signer as any);
    return txResult ? txResult.transactionId : null;
  }

  async transferFungibleToken(toAddress: AccountId, tokenId: TokenId, amount: number) {
    const transferTokenTransaction = new TransferTransaction()
      .addTokenTransfer(tokenId, this.getAccountId(), -amount)
      .addTokenTransfer(tokenId, toAddress.toString(), amount);

    const signer = this.getSigner();
    await transferTokenTransaction.freezeWithSigner(signer as any);
    const txResult = await transferTokenTransaction.executeWithSigner(signer as any);
    return txResult ? txResult.transactionId : null;
  }

  async transferNonFungibleToken(toAddress: AccountId, tokenId: TokenId, serialNumber: number) {
    const transferTokenTransaction = new TransferTransaction()
      .addNftTransfer(tokenId, serialNumber, this.getAccountId(), toAddress);

    const signer = this.getSigner();
    await transferTokenTransaction.freezeWithSigner(signer as any);
    const txResult = await transferTokenTransaction.executeWithSigner(signer as any);
    return txResult ? txResult.transactionId : null;
  }

  async associateToken(tokenId: TokenId) {
    const associateTokenTransaction = new TokenAssociateTransaction()
      .setAccountId(this.getAccountId())
      .setTokenIds([tokenId]);

    const signer = this.getSigner();
    await associateTokenTransaction.freezeWithSigner(signer as any);
    const txResult = await associateTokenTransaction.executeWithSigner(signer as any);
    return txResult ? txResult.transactionId : null;
  }

  // Purpose: build contract execute transaction and send to wallet for signing and execution
  // Returns: Promise<TransactionId | null>
  async executeContractFunction(contractId: ContractId, functionName: string, functionParameters: ContractFunctionParameterBuilder, gasLimit: number) {
    const tx = new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(gasLimit)
      .setFunction(functionName, functionParameters.buildHAPIParams());

    const signer = this.getSigner();
    await tx.freezeWithSigner(signer as any);
    const txResult = await tx.executeWithSigner(signer as any);

    // in order to read the contract call results, you will need to query the contract call's results form a mirror node using the transaction id
    // after getting the contract call results, use ethers and abi.decode to decode the call_result
    return txResult ? txResult.transactionId : null;
  }
  // Purpose: disconnect wallet
  disconnect() {
    dappConnector.disconnectAll().then(() => {
      this.walletInfo = null;
      refreshEvent.emit("sync");
    }).catch((e) => { console.error(e); });
  }
};

export const walletConnectWallet = new WalletConnectWallet();

// this component will sync the walletconnect state with the context
export const WalletConnectClient = () => {
  const { setAccountId, setIsConnected } = useContext(WalletConnectContext);
  const [connectedWallet, setConnectedWallet] = useState<WalletInfo | null>(null);
  const dispatch = useDispatch();

  const syncWithWalletConnectContext = useCallback(async () => {
    const accountId = dappConnector.signers[0]?.getAccountId()?.toString();
    if (accountId) {
      setAccountId(accountId);
      setIsConnected(true);
      // Get wallet info from the session
      const session = dappConnector.walletConnectClient?.session.get(dappConnector.walletConnectClient.session.keys[0]);
      if (session) {
        const walletInfo: WalletInfo = {
          name: session.peer.metadata.name,
          description: session.peer.metadata.description,
          url: session.peer.metadata.url
        };
        // setConnectedWallet(walletInfo);
        if (session.peer.metadata.name === 'HashPack') {
          const hederaAccounts = session.namespaces?.hedera?.accounts || [];
          const targetAccount = hederaAccounts[0]; // Extract the first account in the array
          // hc.openPairingModal();
          if (targetAccount) {
            const logString = JSON.stringify(targetAccount); // Convert object to string if necessary
            const match = logString.match(/0\.0\.\d+/); // Regex to match IDs in the format 0.0.x
            if (match) {
              const accountID = match[0].split(".").pop();
              dispatch(
                actions.hashconnect.setAccountIds(
                  accountID ? [accountID] : []
                )
              );
              dispatch(actions.hashconnect.setIsConnected(true));
              dispatch(actions.hashconnect.setPairingString('HashPack'));
              window.location.reload();
              // syncWithHashConnect();
              // handleAllowanceApprove(accountID as string)
            } else {
              console.error("Target ID not found.");
            }
          } else {
            console.error("No account found in the logs.");
          }
          console.log('go to the syncWithHashConnect');
        }
        console.log("Connected wallet:", walletInfo);
      }
    } else {
      setAccountId('');
      setIsConnected(false);
      setConnectedWallet(null);
    }
  }, [setAccountId, setIsConnected]);

  useEffect(() => {
    refreshEvent.addListener("sync", syncWithWalletConnectContext);

    // Add session event listeners
    dappConnector.walletConnectClient?.on("session_update", () => {
      syncWithWalletConnectContext();
    });

    dappConnector.walletConnectClient?.on("session_delete", () => {
      setConnectedWallet(null);
    });

    return () => {
      refreshEvent.removeListener("sync", syncWithWalletConnectContext);
    }
  }, [syncWithWalletConnectContext]);

  return null;
};
