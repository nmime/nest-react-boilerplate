import { NetworkCode } from "./network-codes.enum";

export const NetworkDisplay: Record<NetworkCode, string> = {
  [NetworkCode.Mainnet]: "Mainnet",
  [NetworkCode.Testnet]: "Testnet",
};
