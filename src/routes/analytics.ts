import express from 'express';
import { Assignment, AssignmentEmployee, Employee, Client, Location, Feedback } from '../models';
import { authMiddleware, adminOnly } from '../middleware/auth';

const r = express.Router();
r.use(authMiddleware, adminOnly);

r.get('/dashboard', async (_req, res) => {
  const [totalEmp, activeEmp, totalClients, totalLocations, totalAssignments] = await Promise.all([
    Employee.countDocuments(), Employee.countDocuments({ employmentStatus: 'ACTIVE' }),
    Client.countDocuments(), Location.countDocuments(), Assignment.countDocuments(),
  ]);
  const t = new Date(); t.setHours(0,0,0,0); const n = new Date(t); n.setDate(n.getDate() + 1);
  const todayAssignments = await Assignment.countDocuments({ scheduledDate: { $gte: t, $lt: n } });
  const groups: any[] = await Assignment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const sm: any = {}; groups.forEach(g => sm[g._id] = g.count);
  const allFb = await Feedback.find();
  const avgRating = allFb.length ? allFb.reduce((s, f) => s + f.overallRating, 0) / allFb.length : 0;

  const recentAssignments = await Assignment.find().populate('clientId').populate('locationId').sort({ createdAt: -1 }).limit(10);
  const topPerformers = await AssignmentEmployee.aggregate([
    { $match: { status: 'COMPLETED' } },
    { $group: { _id: '$employeeId', completed: { $sum: 1 } } },
    { $sort: { completed: -1 } }, { $limit: 5 },
    { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'employee' } },
    { $unwind: '$employee' },
  ]);
  const recentFeedback = await Feedback.find().populate('employeeId').populate('clientId').sort({ createdAt: -1 }).limit(10);

  res.json({
    stats: {
      totalEmployees: totalEmp, activeEmployees: activeEmp, inactiveEmployees: totalEmp - activeEmp,
      totalClients, totalLocations, totalAssignments, todayAssignments,
      pendingAssignments: (sm.ASSIGNED || 0) + (sm.ACCEPTED || 0),
      inProgress: sm.IN_PROGRESS || 0, completed: sm.COMPLETED || 0, cancelled: sm.CANCELLED || 0,
      avgRating: Math.round(avgRating * 10) / 10,
    },
    recentAssignments, topPerformers, recentFeedback,
  });
});

r.get('/employees', async (_req, res) => {
  const employees = await Employee.find();
  const items = await Promise.all(employees.map(async emp => {
    const [fb, completed, total] = await Promise.all([
      Feedback.find({ employeeId: emp.id }),
      AssignmentEmployee.countDocuments({ employeeId: emp.id, status: 'COMPLETED' }),
      AssignmentEmployee.countDocuments({ employeeId: emp.id }),
    ]);
    const avg = fb.length ? fb.reduce((s, f) => s + f.overallRating, 0) / fb.length : 0;
    return {
      employeeId: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName,
      completed, total, completionRate: total ? Math.round((completed / total) * 100) : 0,
      avgRating: Math.round(avg * 10) / 10, feedbackCount: fb.length,
    };
  }));
  res.json({ items });
});

export default r;