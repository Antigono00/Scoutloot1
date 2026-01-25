import { Bot, InlineKeyboard, Context } from 'grammy';
import { config } from '../config.js';
import { query } from '../db/index.js';

export const bot = new Bot(config.telegramBotToken);

// Handle /start command with user_id parameter
bot.command('start', async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const username = ctx.from?.username;
  
  if (!chatId || !userId) {
    return;
  }

  // Get the parameter after /start (e.g., /start 123 -> "123")
  const messageText = ctx.message?.text || '';
  const parts = messageText.split(' ');
  const userIdParam = parts.length > 1 ? parts[1] : null;

  console.log(`Telegram /start from chat ${chatId}, user ${userId}, username ${username}, param: ${userIdParam}`);

  if (userIdParam) {
    // User came from website with their user_id
    const scoutlootUserId = parseInt(userIdParam, 10);
    
    if (isNaN(scoutlootUserId)) {
      await ctx.reply(
        '❌ Invalid link. Please go back to ScoutLoot and click "Connect Telegram" again.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    try {
      // Check if user exists
      const userResult = await query(
        'SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL',
        [scoutlootUserId]
      );

      if (userResult.rows.length === 0) {
        await ctx.reply(
          '❌ Account not found. Please make sure you\'re logged into ScoutLoot first.',
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Check if this Telegram is already connected to another account
      const existingResult = await query(
        'SELECT id, email FROM users WHERE telegram_chat_id = $1 AND id != $2 AND deleted_at IS NULL',
        [chatId, scoutlootUserId]
      );

      if (existingResult.rows.length > 0) {
        await ctx.reply(
          `⚠️ This Telegram account is already connected to ${existingResult.rows[0].email}.\n\nTo connect to a different account, first disconnect from the other account in Settings.`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Link the Telegram account
      await query(
        `UPDATE users SET 
           telegram_chat_id = $1,
           telegram_user_id = $2,
           telegram_username = $3,
           telegram_connected_at = NOW(),
           updated_at = NOW()
         WHERE id = $4`,
        [chatId, userId, username || null, scoutlootUserId]
      );

      const userEmail = userResult.rows[0].email;
      await ctx.reply(
        `✅ <b>Telegram connected!</b>\n\nYour account <b>${userEmail}</b> is now linked.\n\n🔔 You'll receive deal alerts here when LEGO sets drop below your target prices.\n\n<i>Go back to ScoutLoot to add sets to your watchlist!</i>`,
        { parse_mode: 'HTML' }
      );

      console.log(`Telegram linked: user ${scoutlootUserId} -> chat ${chatId}`);

    } catch (error) {
      console.error('Error linking Telegram:', error);
      await ctx.reply(
        '❌ Something went wrong. Please try again or contact support.',
        { parse_mode: 'HTML' }
      );
    }
  } else {
    // User just typed /start without coming from website
    await ctx.reply(
      `🧱 <b>Welcome to ScoutLoot!</b>\n\nI send you instant alerts when LEGO deals match your target prices.\n\n<b>To get started:</b>\n1. Go to <a href="https://scoutloot.com">scoutloot.com</a>\n2. Create an account or log in\n3. Click "Connect Telegram" in Settings\n4. Add LEGO sets to your watchlist\n\nThat's it! I'll message you when deals appear. 🎯`,
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
    );
  }
});

// Handle /help command
bot.command('help', async (ctx: Context) => {
  await ctx.reply(
    `🧱 <b>ScoutLoot Bot Help</b>\n\n<b>What I do:</b>\nI monitor eBay for LEGO deals and alert you when prices drop below your targets.\n\n<b>Commands:</b>\n/start - Connect your account\n/help - Show this message\n/status - Check your connection\n\n<b>Need help?</b>\nVisit <a href="https://scoutloot.com/faq">scoutloot.com/faq</a>`,
    { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
  );
});

// Handle /status command
bot.command('status', async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  
  if (!chatId) {
    return;
  }

  try {
    const result = await query(
      `SELECT u.email, u.subscription_tier, COUNT(w.id) as watch_count
       FROM users u
       LEFT JOIN watches w ON u.id = w.user_id AND w.status = 'active'
       WHERE u.telegram_chat_id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id, u.email, u.subscription_tier`,
      [chatId]
    );

    if (result.rows.length === 0) {
      await ctx.reply(
        '❌ <b>Not connected</b>\n\nThis Telegram account is not linked to a ScoutLoot account.\n\nGo to <a href="https://scoutloot.com">scoutloot.com</a> and click "Connect Telegram" in Settings.',
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
      return;
    }

    const user = result.rows[0];
    await ctx.reply(
      `✅ <b>Connected!</b>\n\n📧 Account: ${user.email}\n⭐ Plan: ${user.subscription_tier.charAt(0).toUpperCase() + user.subscription_tier.slice(1)}\n👀 Active watches: ${user.watch_count}\n\n<a href="https://scoutloot.com">Manage your watches →</a>`,
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
    );

  } catch (error) {
    console.error('Error checking status:', error);
    await ctx.reply('❌ Error checking status. Please try again.');
  }
});

bot.catch((err) => {
  console.error('Telegram bot error:', err);
});

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    parse_mode?: 'MarkdownV2' | 'HTML';
    buttons?: InlineButton[][];
  }
): Promise<{ success: boolean; error?: string; errorCode?: number }> {
  try {
    let keyboard: InlineKeyboard | undefined;
    if (options?.buttons && options.buttons.length > 0) {
      keyboard = new InlineKeyboard();
      for (const row of options.buttons) {
        for (const button of row) {
          if (button.url) {
            keyboard.url(button.text, button.url);
          } else if (button.callback_data) {
            keyboard.text(button.text, button.callback_data);
          }
        }
        keyboard.row();
      }
    }

    await bot.api.sendMessage(chatId, text, {
      parse_mode: options?.parse_mode ?? 'MarkdownV2',
      reply_markup: keyboard,
    });
    return { success: true };
  } catch (error: unknown) {
    const err = error as { error_code?: number; description?: string; message?: string };
    const errorCode = err?.error_code;
    const errorMessage = err?.description || err?.message || 'Unknown error';
    
    console.error(`Telegram send error (${errorCode}):`, errorMessage);
    
    return { success: false, error: errorMessage, errorCode };
  }
}

export function isBlockedError(errorCode: number | undefined): boolean {
  return errorCode === 403;
}

export function isRateLimitError(errorCode: number | undefined): boolean {
  return errorCode === 429;
}

// Start bot polling (for receiving messages)
export function startBotPolling(): void {
  bot.start({
    onStart: (botInfo) => {
      console.log(`🤖 Telegram bot @${botInfo.username} started polling`);
    },
  });
}

export default bot;
