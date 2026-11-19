// backend/src/routes/whatsapp.ts
import express from 'express';
import { WhatsAppLog } from '../models';
import { authMiddleware, adminOnly } from '../middleware/auth';

const r = express.Router();

// 1. Verification endpoint for Meta
r.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.status(403).send('Forbidden');
});

// 2. Webhook for Delivery Statuses (Reads the failure payload you shared)
r.post('/webhook', express.json(), async (req, res) => {
  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    
    if (change?.statuses) {
      for (const status of change.statuses) {
        const updateData: any = { deliveryStatus: status.status.toUpperCase() };
        
        // Catch the exact error (e.g., 131047) and save it to DB
        if (status.status === 'failed' && status.errors) {
          const errObj = status.errors[0];
          updateData.errorMessage = `[${errObj.code}] ${errObj.message} - ${errObj.error_data?.details || ''}`;
          console.log(`❌ WhatsApp Delivery Failed via Webhook: ${updateData.errorMessage}`);
        }
        
        // Update the log using the WAMID
        await WhatsAppLog.updateOne({ providerMessageId: status.id }, updateData);
      }
    }
  } catch (err) {
    console.error('Webhook Error:', err);
  }
  res.json({ ok: true });
});

// 3. Get logs for Admin Dashboard
r.get('/logs', authMiddleware, adminOnly, async (req, res) => {
  const { page = '1', limit = '100' } = req.query as any;
  const skip = (+page - 1) * +limit;
  const [items, total] = await Promise.all([
    WhatsAppLog.find().sort({ createdAt: -1 }).skip(skip).limit(+limit),
    WhatsAppLog.countDocuments(),
  ]);
  res.json({ items, total, configured: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) });
});

export default r;