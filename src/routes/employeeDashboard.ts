import express from 'express';
import { Employee, AssignmentEmployee, Feedback } from '../models';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const r = express.Router();
r.use(authMiddleware);
const me = (req: AuthRequest) => Employee.findOne({ userId: req.user!.id });

r.get('/dashboard', async (req: AuthRequest, res) => {
  const emp = await me(req);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  const t = new Date(); t.setHours(0,0,0,0); const n = new Date(t); n.setDate(n.getDate() + 1);
  const todayAes = await AssignmentEmployee.find({ employeeId: emp.id }).populate({
    path: 'assignmentId', match: { scheduledDate: { $gte: t, $lt: n } },
    populate: [{ path: 'clientId' }, { path: 'locationId' }]
  });
  const today = todayAes.filter((a: any) => a.assignmentId);
  const upcoming = await AssignmentEmployee.find({ employeeId: emp.id, status: { $in: ['ASSIGNED', 'ACCEPTED'] } }).populate({
    path: 'assignmentId', populate: [{ path: 'clientId' }, { path: 'locationId' }]
  });
  const inProgress = await AssignmentEmployee.countDocuments({ employeeId: emp.id, status: 'IN_PROGRESS' });
  const completed = await AssignmentEmployee.countDocuments({ employeeId: emp.id, status: 'COMPLETED' });
  const total = await AssignmentEmployee.countDocuments({ employeeId: emp.id });
  const fb = await Feedback.find({ employeeId: emp.id });
  const avg = fb.length ? fb.reduce((s, f) => s + f.overallRating, 0) / fb.length : 0;
  res.json({
    employee: emp,
    stats: {
      todayJobs: today.length, upcomingJobs: upcoming.length, inProgress, completed, total,
      avgRating: Math.round(avg * 10) / 10,
    },
    todaySchedule: today,
    upcomingAssignments: upcoming.slice(0, 10),
    recentFeedback: await Feedback.find({ employeeId: emp.id }).sort({ createdAt: -1 }).limit(5),
  });
});

r.get('/assignments', async (req: AuthRequest, res) => {
  const emp = await me(req);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  const { filter } = req.query as any;
  const query: any = { employeeId: emp.id };
  if (filter && filter !== 'ALL' && filter !== 'today') query.status = filter;
  let aes = await AssignmentEmployee.find(query).populate({
    path: 'assignmentId', populate: [{ path: 'clientId' }, { path: 'locationId' }]
  }).sort({ createdAt: -1 });
  if (filter === 'today') {
    const d = new Date(); d.setHours(0,0,0,0); const e = new Date(d); e.setDate(e.getDate() + 1);
    aes = aes.filter((a: any) => a.assignmentId && new Date(a.assignmentId.scheduledDate) >= d && new Date(a.assignmentId.scheduledDate) < e);
  }
  res.json({ items: aes });
});

r.get('/performance', async (req: AuthRequest, res) => {
  const emp = await me(req);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  const fb = await Feedback.find({ employeeId: emp.id }).sort({ createdAt: -1 });
  const completed = await AssignmentEmployee.countDocuments({ employeeId: emp.id, status: 'COMPLETED' });
  const pending = await AssignmentEmployee.countDocuments({ employeeId: emp.id, status: { $in: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'] } });
  const total = await AssignmentEmployee.countDocuments({ employeeId: emp.id });
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  res.json({
    totalJobs: total, completedJobs: completed, pendingJobs: pending,
    avgOverall: avg(fb.map(f => f.overallRating)),
    avgService: avg(fb.map(f => f.serviceQualityRating)),
    avgBehaviour: avg(fb.map(f => f.behaviourRating)),
    avgPunctuality: avg(fb.map(f => f.punctualityRating)),
    feedbackCount: fb.length, feedback: fb,
  });
});

r.get('/profile', async (req: AuthRequest, res) => res.json(await me(req)));
r.put('/profile', async (req: AuthRequest, res) => {
  const emp = await me(req);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  const allowed = ['phone', 'whatsappNumber', 'email', 'address'];
  const upd: any = {};
  for (const k of allowed) if (req.body[k] !== undefined) upd[k] = req.body[k];
  res.json(await Employee.findByIdAndUpdate(emp.id, upd, { new: true }));
});

export default r;
