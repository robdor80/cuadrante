export type SlotId = 1 | 2 | 3 | 4 | 5 | 6;

export interface User {
  uid: string;
  email: string;
  name: string;
  color: string;
  slotId: SlotId;
}
