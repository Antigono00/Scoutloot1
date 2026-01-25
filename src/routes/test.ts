import { Router, Request, Response } from 'express';
import { createAlert } from '../services/alerts.js';
import { enqueueTelegramAlert } from '../jobs/telegramQueue.js';
import { formatDealAlertMessage } from '../telegram/escape.js';
import { generateListingFingerprint } from '../utils/fingerprint.js';
import { getUserById } from '../services/users.js';
import { getWatchesByUserId } from '../services/watches.js';

const router = Router();

router.post('/alert', async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      res.status(400).json({ error: 'Missing user_id' });
      return;
    }

    const user = await getUserById(user_id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.telegram_chat_id) {
      res.status(400).json({ error: 'User has no Telegram connected' });
      return;
    }

    const watches = await getWatchesByUserId(user_id);
    const watch = watches[0];

    const fakeListing = {
      platform: 'ebay' as const,
      seller_id: 'test_seller_123',
      title: 'LEGO Star Wars 75192 Millennium Falcon NEW SEALED',
      price_eur: watch ? Number(watch.target_total_price_eur) - 50 : 600,
    };

    const fingerprint = generateListingFingerprint(fakeListing);

    const alert = await createAlert({
      user_id: user.id,
      watch_id: watch?.id ?? 0,
      platform: 'ebay',
      listing_id: `test-${Date.now()}`,
      listing_scanned_for_country: user.ship_to_country,
      set_number: watch?.set_number ?? '75192',
      alert_source: 'ebay',
      price_eur: fakeListing.price_eur,
      shipping_eur: 15,
      total_eur: fakeListing.price_eur + 15,
      target_price_eur: watch ? Number(watch.target_total_price_eur) : 650,
      seller_id: fakeListing.seller_id,
      listing_fingerprint: fingerprint,
      deal_score: 10,
      request_id: 'test',
    });

    if (!alert) {
      res.status(409).json({ 
        error: 'Alert already sent today (dedupe working)',
        message: 'Try again tomorrow or change the test data'
      });
      return;
    }

    const messageText = formatDealAlertMessage({
      setNumber: watch?.set_number ?? '75192',
      setName: 'Millennium Falcon (TEST)',
      price: fakeListing.price_eur,
      shipping: 15,
      total: fakeListing.price_eur + 15,
      target: watch ? Number(watch.target_total_price_eur) : 650,
      savings: (watch ? Number(watch.target_total_price_eur) : 650) - (fakeListing.price_eur + 15),
      sellerName: 'test_seller',
      condition: 'New',
      listingUrl: 'https://www.ebay.com/itm/test123',
    });

    await enqueueTelegramAlert(
      {
        alertId: alert.id,
        chatId: user.telegram_chat_id,
        message: {
          text: messageText,
          reply_markup: {
            inline_keyboard: [[
              { text: '🔗 View on eBay (Test)', url: 'https://www.ebay.com' },
            ]],
          },
        },
      },
      {
        delay: 0,
        jobId: `alert-${alert.id}`,
      }
    );

    res.json({
      success: true,
      message: 'Test alert queued! Check your Telegram.',
      alertId: alert.id,
    });

  } catch (error) {
    console.error('Test alert error:', error);
    res.status(500).json({
      error: 'Failed to send test alert',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
