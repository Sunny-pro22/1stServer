import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './config/db';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import clientRoutes from './routes/clients';
import locationRoutes from './routes/locations';
import assignmentRoutes from './routes/assignments';
import employeeDashRoutes from './routes/employeeDashboard';
import feedbackRoutes from './routes/feedback';
import analyticsRoutes from './routes/analytics';
import whatsappRoutes from './routes/whatsapp';
import { Assignment, Client, Employee, Feedback, FeedbackRequest, Location, Notification, User } from './models';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/employee', employeeDashRoutes);
app.use('/api', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.get('/api/health', (_, res) => res.json({ ok: true }));

// ---- PUBLIC FEEDBACK FORM (HTML) ----
app.get('/feedback/:token', async (req, res) => {
  const fr = await FeedbackRequest.findOne({ token: req.params.token }).populate('assignmentId').populate('employeeId');
  if (!fr || fr.submittedAt || fr.expiresAt < new Date()) {
    return res.status(400).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f8fafc"><h1 style="color:#dc2626">Invalid or Expired Link</h1></body></html>');
  }
  const a: any = fr.assignmentId; const emp: any = fr.employeeId;
  const client = await Client.findById(a.clientId);
  const loc = await Location.findById(a.locationId);

  const selectFor = (name: string, label: string) =>
    `<label style="display:block;margin-top:14px;font-weight:600;font-size:14px">${label} *</label>
    <select name="${name}" required style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;box-sizing:border-box">
      <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
      <option value="4">⭐⭐⭐⭐ Good</option>
      <option value="3">⭐⭐⭐ Average</option>
      <option value="2">⭐⭐ Poor</option>
      <option value="1">⭐ Very Poor</option>
    </select>`;

  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Feedback</title>
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:20px;background:#f8fafc}
h1{color:#2563eb;font-size:22px}
.info{background:#fff;padding:14px;border-radius:10px;margin:12px 0;font-size:13px;color:#64748b;border:1px solid #e2e8f0}
.info strong{color:#0f172a;font-size:14px}
input,textarea{width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;box-sizing:border-box}
button{background:#2563eb;color:#fff;padding:14px;border:none;border-radius:10px;font-size:16px;font-weight:600;width:100%;margin-top:16px;cursor:pointer}
label{display:block;margin-top:14px;font-weight:600;font-size:14px}
</style></head><body>
<h1>How was your experience?</h1>
<div class="info">
  <div><strong>${client?.clientName || 'Service'}</strong></div>
  <div>${loc?.locationName}</div>
  <div>Employee: ${emp.fullName}</div>
  <div>Job: ${a.jobTitle}</div>
</div>
<form method="POST" action="/feedback/${req.params.token}/submit">
  <label>Your Name *</label><input name="customerName" required>
  <label>Phone (optional)</label><input name="customerPhone">
  ${selectFor('overallRating', 'Overall Experience')}
  ${selectFor('serviceQualityRating', 'Service Quality')}
  ${selectFor('behaviourRating', 'Employee Behaviour')}
  ${selectFor('punctualityRating', 'Punctuality')}
  <label>Comments</label><textarea name="comments" rows="3"></textarea>
  <label style="display:flex;align-items:center;gap:8px;margin-top:14px"><input type="checkbox" name="wouldRecommend" checked style="width:auto"> I would recommend this employee</label>
  <button type="submit">Submit Feedback</button>
</form></body></html>`);
});

app.post('/feedback/:token/submit', express.urlencoded({ extended: true }), async (req, res) => {
  const fr = await FeedbackRequest.findOne({ token: req.params.token });
  if (!fr || fr.submittedAt || fr.expiresAt < new Date()) {
    return res.status(400).send('<html><body style="text-align:center;padding:60px;font-family:sans-serif"><h1 style="color:#dc2626">Invalid Link</h1></body></html>');
  }
  const a = await Assignment.findById(fr.assignmentId);
  if (!a) return res.status(400).send('Assignment not found');
  await Feedback.create({
    feedbackRequestId: fr._id, assignmentId: a._id, employeeId: fr.employeeId,
    clientId: a.clientId, locationId: a.locationId,
    customerName: req.body.customerName || 'Customer', customerPhone: req.body.customerPhone,
    overallRating: +req.body.overallRating, serviceQualityRating: +req.body.serviceQualityRating,
    behaviourRating: +req.body.behaviourRating, punctualityRating: +req.body.punctualityRating,
    comments: req.body.comments, wouldRecommend: !!req.body.wouldRecommend,
  });
  fr.submittedAt = new Date(); fr.status = 'SUBMITTED'; await fr.save();
  const admins = await User.find({ role: 'ADMIN' });
  for (const ad of admins) await Notification.create({ userId: ad._id, title: 'New Feedback', message: `${a.assignmentCode} rated ${req.body.overallRating}/5`, notificationType: 'FEEDBACK' });
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f8fafc"><h1 style="color:#16a34a">Thank You!</h1><p style="color:#64748b">Your feedback has been received.</p></body></html>');
});

const PORT = process.env.PORT || 5000;
connectDB().then(() => app.listen(PORT, () => console.log(`API on :${PORT}`)));