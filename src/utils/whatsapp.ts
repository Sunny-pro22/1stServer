// backend/src/utils/whatsapp.ts
import axios from 'axios';
import { WhatsAppLog } from '../models';

const isConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

// ✅ THIS IS THE UPDATED INTERFACE
interface Opts {
  to: string; 
  messageType: string;
  templateName?: string; 
  templateParams?: string[]; 
  fallbackText?: string;
  assignmentId?: string; employeeId?: string; customerId?: string;
}

export async function sendWhatsApp(opts: Opts) {
  const log = await WhatsAppLog.create({
    recipientNumber: opts.to, messageType: opts.messageType,
    assignmentId: opts.assignmentId, employeeId: opts.employeeId, customerId: opts.customerId,
    messageBody: opts.fallbackText || `Template: ${opts.templateName}`,
    deliveryStatus: isConfigured() ? 'PENDING' : 'NOT_CONFIGURED',
  });

  if (!isConfigured()) {
    console.log('❌ WhatsApp not configured in .env');
    return { success: false, status: 'NOT_CONFIGURED', logId: log.id };
  }

  try {
    const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v18.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const cleanNumber = opts.to.replace(/[^\d]/g, '');

    let payload: any = {
      messaging_product: 'whatsapp',
      to: cleanNumber,
    };

    if (opts.templateName) {
      payload.type = 'template';
      payload.template = {
        name: opts.templateName,
        language: { code: 'en_US' },
      };

      if (opts.templateParams && opts.templateParams.length > 0) {
        payload.template.components = [
          {
            type: 'body',
            parameters: opts.templateParams.map((p) => ({ type: 'text', text: p })),
          },
        ];
      }
    } else {
      payload.type = 'text';
      payload.text = { body: opts.fallbackText || 'Notification from WorkForce CRM' };
    }

    console.log(`📤 Sending WhatsApp to: ${cleanNumber} (Template: ${opts.templateName || 'Text'})`);

    const res = await axios.post(url, payload, { 
      headers: { 
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      } 
    });

    log.providerMessageId = res.data?.messages?.[0]?.id;
    log.deliveryStatus = 'SENT';
    log.sentAt = new Date();
    await log.save();
    
    console.log(`✅ WhatsApp API accepted! Message ID: ${log.providerMessageId}`);
    return { success: true, status: 'SENT', logId: log.id };
    
  } catch (err: any) {
    const metaError = err.response?.data?.error;
    log.deliveryStatus = 'FAILED';
    log.errorMessage = metaError ? `[${metaError.code}] ${metaError.message}` : err.message;
    await log.save();
    
    console.error(`❌ WHATSAPP FAILED [${metaError?.code || 'Unknown'}]:`, metaError?.message || err.message);
    return { success: false, status: 'FAILED', error: log.errorMessage, logId: log.id };
  }
}