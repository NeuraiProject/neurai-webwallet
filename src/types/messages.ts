export interface Message {
  id: number;
  sender: "user" | "bot";
  text: string;
  timestamp: number;
  deliveryKey?: string;
  model?: string;
}
