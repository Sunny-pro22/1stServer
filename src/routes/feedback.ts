import express from 'express';
import { Assignment, Client, Employee, FeedbackRequest, Feedback, Location, User, Notification } from '../models';
import { authMiddleware, adminOnly } from '../middleware/auth';

const r = express.Router();

// ---- Public JSON API (used programmatically if needed) ----
r.get('/public/feedback/:token', async (req, res) => {
  const fr = await FeedbackRequest.findOne({ token: req.params.token }).populate('assignmentId').populate('employeeId');
  if (!fr || fr.submittedAt) return res.status(400).json({ error: 'Invalid or already used' });
  if (fr.expiresAt < new Date()) return res.status(400).json({ error: 'Expired' });
  const a: any = fr.assignmentId; const emp: any = fr.employeeId;
  const client = await Client.findById(a.clientId);
  const loc = await Location.findById(a.locationId);
  res.json({ employee: { fullName: emp.fullName }, assignment: { jobTitle: a.jobTitle }, client: { clientName: client?.clientName }, location: { locationName: loc?.locationName } });
});

r.post('/public/feedback/:token/submit', async (req, res) => {
  const fr = await FeedbackRequest.findOne({ token: req.params.token });
  if (!fr || fr.submittedAt || fr.expiresAt < new Date()) return res.status(400).json({ error: 'Invalid link' });
  const a = await Assignment.findById(fr.assignmentId);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  const feedback = await Feedback.create({
    feedbackRequestId: fr._id, assignmentId: a._id, employeeId: fr.employeeId,
    clientId: a.clientId, locationId: a.locationId,
    customerName: req.body.customerName || 'Customer', customerPhone: req.body.customerPhone,
    overallRating: req.body.overallRating, serviceQualityRating: req.body.serviceQualityRating,
    behaviourRating: req.body.behaviourRating, punctualityRating: req.body.punctualityRating,
    comments: req.body.comments, wouldRecommend: req.body.wouldRecommend !== false,
  });
  fr.submittedAt = new Date(); fr.status = 'SUBMITTED'; await fr.save();
  const admins = await User.find({ role: 'ADMIN' });
  for (const ad of admins) await Notification.create({ userId: ad._id, title: 'New Feedback', message: `${a.assignmentCode} rated ${req.body.overallRating}/5`, notificationType: 'FEEDBACK' });
  res.json({ ok: true, id: feedback.id });
});

// ---- Admin list ----
r.get('/feedback', authMiddleware, adminOnly, async (req, res) => {
  const { employeeId, clientId, minRating, page = '1', limit = '100' } = req.query as any;
  const filter: any = {};
  if (employeeId) filter.employeeId = employeeId;
  if (clientId) filter.clientId = clientId;
  if (minRating) filter.overallRating = { $gte: +minRating };
  const skip = (+page - 1) * +limit;
  const [items, total] = await Promise.all([
    Feedback.find(filter).populate('employeeId').populate('clientId').populate('locationId')
      .sort({ createdAt: -1 }).skip(skip).limit(+limit),
    Feedback.countDocuments(filter),
  ]);
  res.json({ items, total });
});

export default r;