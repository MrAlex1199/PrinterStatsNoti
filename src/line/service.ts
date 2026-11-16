import { messagingApi, WebhookEvent } from '@line/bot-sdk';
import { AlertNotifier } from '../alerts/engine.js';
import { JsonStore } from '../storage/store.js';
import { PrinterConfig, PrinterSnapshot, PrinterStatus } from '../types.js';

export class LineService implements AlertNotifier {
  constructor(private readonly store: JsonStore) {}

  private createClient(): messagingApi.MessagingApiClient | null {
    const { lineChannelAccessToken } = this.store.getSettings();
    if (!lineChannelAccessToken.trim()) return null;
    return new messagingApi.MessagingApiClient({
      channelAccessToken: lineChannelAccessToken.trim(),
    });
  }

  async sendPushMessage(text: string): Promise<{ ok: boolean; error?: string }> {
    const settings = this.store.getSettings();
    const client = this.createClient();
    const targetId = settings.lineTargetId.trim();

    if (!client || !targetId) {
      return {
        ok: false,
        error: 'LINE credentials (Channel Access Token / Target ID) not configured',
      };
    }

    try {
      await client.pushMessage({
        to: targetId,
        messages: [{ type: 'text', text }],
      });
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  buildStatusFlexMessage(
    printers: PrinterConfig[],
    snapshots: Record<string, PrinterSnapshot>
  ): messagingApi.FlexMessage {
    const bubbles: messagingApi.FlexBubble[] = printers.slice(0, 10).map((printer) => {
      const snap = snapshots[printer.id];
      const status = snap?.status ?? PrinterStatus.Offline;
      const badgeColor =
        status === PrinterStatus.Online || status === PrinterStatus.Printing
          ? '#10b981'
          : status === PrinterStatus.Warning
            ? '#f59e0b'
            : '#ef4444';

      const supplyRows: messagingApi.FlexComponent[] =
        snap && snap.supplies.length > 0
          ? snap.supplies.map((s) => ({
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              contents: [
                { type: 'text', text: s.name, size: 'xs', color: '#475569', flex: 3, wrap: true },
                {
                  type: 'text',
                  text: s.percent !== null ? `${s.percent}%` : 'N/A',
                  size: 'xs',
                  weight: 'bold',
                  color: s.percent !== null && s.percent <= 15 ? '#ef4444' : '#0f172a',
                  align: 'end',
                  flex: 1,
                },
              ],
            }))
          : [{ type: 'text', text: 'ไม่มีข้อมูลหมึก', size: 'xs', color: '#94a3b8', margin: 'sm' }];

      return {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: badgeColor,
          paddingAll: '12px',
          contents: [
            { type: 'text', text: printer.name, weight: 'bold', color: '#ffffff', size: 'md', wrap: true },
            { type: 'text', text: `${printer.ip} • ${status.toUpperCase()}`, color: '#f8fafc', size: 'xs' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `พิมพ์สะสม: ${snap?.pageCount?.toLocaleString() ?? 'N/A'} หน้า`,
              size: 'xs',
              color: '#64748b',
              margin: 'none',
            },
            { type: 'separator', margin: 'md' },
            ...supplyRows,
          ],
        },
      };
    });

    if (bubbles.length === 0) {
      bubbles.push({
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [{ type: 'text', text: 'ยังไม่มีเครื่องปริ้นในระบบ', weight: 'bold' }],
        },
      });
    }

    return {
      type: 'flex',
      altText: 'สถานะเครื่องปริ้นทั้งหมด (PrinterStatsNoti)',
      contents: {
        type: 'carousel',
        contents: bubbles,
      },
    };
  }

  async handleWebhookEvents(events: WebhookEvent[]): Promise<void> {
    const client = this.createClient();
    if (!client) return;

    for (const event of events) {
      if (event.type !== 'message' || event.message.type !== 'text') continue;
      const text = event.message.text.trim().toLowerCase();

      if (text === 'สถานะ' || text === 'status' || text === 'เช็คหมึก') {
        const printers = this.store.getPrinters().filter((p) => p.enabled);
        const snapshots = this.store.getAllSnapshots();
        const flexMsg = this.buildStatusFlexMessage(printers, snapshots);
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [flexMsg],
        });
      } else if (text === 'help' || text === 'ช่วยเหลือ' || text === 'myid') {
        const sourceId =
          event.source.type === 'group'
            ? event.source.groupId
            : event.source.type === 'room'
              ? event.source.roomId
              : event.source.userId;
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: 'text',
              text: `🖨️ PrinterStatsNoti Commands:\n• พิมพ์ "สถานะ" หรือ "status" เพื่อดูระดับหมึกและสถานะเครื่อง\n• Target ID ของแชทนี้คือ:\n${sourceId ?? 'unknown'}`,
            },
          ],
        });
      }
    }
  }
}
