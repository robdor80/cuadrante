export const DAILY_STATUSES = ['VOY', 'NO_VOY', 'VIALIA'] as const;

export type DailyStatus = (typeof DAILY_STATUSES)[number];

export interface DailyStatusRecord {
  userId: string;
  date: string;
  status: DailyStatus;
  updatedAt?: string;
  updatedBy?: string;
}
