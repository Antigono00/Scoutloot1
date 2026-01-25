import { DateTime } from 'luxon';
import { isInQuietHours, msUntilQuietHoursEnd } from '../utils/time.js';
import { query } from '../db/index.js';
import {
  countUserAlertsToday,
  countUserAlertsThisHour,
  countTelegramAlertsToday,
  countTelegramAlertsThisHour,
} from './alerts.js';

export type DelayReason = 
  | 'quiet_hours' 
  | 'batching_hourly' 
  | 'batching_daily'
  | 'telegram_hourly'
  | 'telegram_daily';

export interface DelayResult {
  shouldDelay: boolean;
  delayMs: number;
  reason: DelayReason | null;
  scheduledFor: Date | null;
  blocked: boolean;
}

export interface TierLimits {
  max_alerts_per_day: number;
  max_alerts_per_hour: number;
  instant_alerts: boolean;
}

// NOTE: 10-minute batching REMOVED
// Deduplication is already handled by:
// - fingerprint/day idempotency key (same listing won't repeat)
// - Best deal only per set (notificationState tracks this)
// - Price improvement checks (only notify if better deal)
// - Hourly/daily tier limits (below) still provide rate limiting

export async function getTierLimitsFromDb(tier: string): Promise<TierLimits> {
  const result = await query<{
    max_alerts_per_day: number;
    max_alerts_per_hour: number;
    instant_alerts: boolean;
  }>(
    `SELECT max_alerts_per_day, max_alerts_per_hour, instant_alerts 
     FROM subscription_tiers WHERE tier_id = $1`,
    [tier]
  );
  
  if (result.rows[0]) {
    return result.rows[0];
  }
  
  return { max_alerts_per_day: 3, max_alerts_per_hour: 3, instant_alerts: false };
}

export async function calculateDelay(
  userId: number,
  telegramUserId: number | null,
  setNumber: string,
  quietHoursStart: string | null,
  quietHoursEnd: string | null,
  timezone: string,
  tierLimits: TierLimits
): Promise<DelayResult> {
  const now = DateTime.utc();

  // Check quiet hours
  if (isInQuietHours(quietHoursStart, quietHoursEnd, timezone)) {
    const delayMs = msUntilQuietHoursEnd(quietHoursEnd!, timezone);
    return {
      shouldDelay: true,
      delayMs,
      reason: 'quiet_hours',
      scheduledFor: now.plus({ milliseconds: delayMs }).toJSDate(),
      blocked: false,
    };
  }

  // Check Telegram-specific limits
  if (telegramUserId) {
    const telegramAlertsThisHour = await countTelegramAlertsThisHour(telegramUserId);
    if (telegramAlertsThisHour >= tierLimits.max_alerts_per_hour) {
      const nextHour = now.plus({ hours: 1 }).startOf('hour');
      const delayMs = nextHour.diff(now).milliseconds;
      return {
        shouldDelay: true,
        delayMs,
        reason: 'telegram_hourly',
        scheduledFor: nextHour.toJSDate(),
        blocked: false,
      };
    }

    const telegramAlertsToday = await countTelegramAlertsToday(telegramUserId);
    if (telegramAlertsToday >= tierLimits.max_alerts_per_day) {
      return {
        shouldDelay: true,
        delayMs: 0,
        reason: 'telegram_daily',
        scheduledFor: null,
        blocked: true,
      };
    }
  }

  // Check hourly limit
  const alertsThisHour = await countUserAlertsThisHour(userId);
  if (alertsThisHour >= tierLimits.max_alerts_per_hour) {
    const nextHour = now.plus({ hours: 1 }).startOf('hour');
    const delayMs = nextHour.diff(now).milliseconds;
    return {
      shouldDelay: true,
      delayMs,
      reason: 'batching_hourly',
      scheduledFor: nextHour.toJSDate(),
      blocked: false,
    };
  }

  // Check daily limit
  const alertsToday = await countUserAlertsToday(userId);
  if (alertsToday >= tierLimits.max_alerts_per_day) {
    return {
      shouldDelay: true,
      delayMs: 0,
      reason: 'batching_daily',
      scheduledFor: null,
      blocked: true,
    };
  }

  // No delay needed
  return {
    shouldDelay: false,
    delayMs: 0,
    reason: null,
    scheduledFor: null,
    blocked: false,
  };
}

export function getTierLimits(tier: string): TierLimits {
  const limits: Record<string, TierLimits> = {
    free: { max_alerts_per_day: 3, max_alerts_per_hour: 3, instant_alerts: false },
    collector: { max_alerts_per_day: 100, max_alerts_per_hour: 30, instant_alerts: true },
    dealer: { max_alerts_per_day: 1000, max_alerts_per_hour: 500, instant_alerts: true },
  };
  return limits[tier] ?? limits.free;
}
