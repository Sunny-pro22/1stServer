import express from 'express';
import bcrypt from 'bcryptjs';
import { User, Employee, AssignmentEmployee, Feedback } from '../models';
import { authMiddleware, adminOnly } from '../middleware/auth';

const r = express.Router();
r.use(authMiddleware);

const genCode = async () => `EMP${String(await Employee.countDocuments() + 1).padStart(4, '0')}`;

r.get('/', adminOnly, async (req, res) => {
  const { search, status, page = '1', limit = '100' } = req.query as any;
  const filter: any = {};
  if (status && status !== 'ALL') filter.employmentStatus = status;
  if (search) filter.$or = [
    { fullName: { $regex: search, $options: 'i' } },
    { employeeCode: { $regex: search, $options: 'i' } },
    { phone: { $regex: search, $options: 'i' } },
  ];
  const skip = (+page - 1) * +limit;
  const [items, total] = await Promise.all([
    Employee.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit),
    Employee.countDocuments(filter),
  ]);
  res.json({ items, total });
});

r.post('/', adminOnly, async (req, res) => {
  try {
    const { fullName, phone, whatsappNumber, email, address, designation, department, joiningDate, password, notes } = req.body;
    if (!fullName || !phone || !whatsappNumber || !password) return res.status(400).json({ error: 'Missing fields' });
    const employeeCode = await genCode();
    const loginEmail = email || `${employeeCode.toLowerCase()}@workforce.local`;
    if (await User.findOne({ email: loginEmail })) return res.status(400).json({ error: 'Email exists' });
    const user = await User.create({ email: loginEmail, passwordHash: await bcrypt.hash(password, 10), role: 'EMPLOYEE' });
    const emp = await Employee.create({
      employeeCode, userId: user._id, fullName, phone, whatsappNumber,
      email, address, designation, department, joiningDate, notes,
    });
    res.status(201).json(emp);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.get('/:id', adminOnly, async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  const [assignments, feedback] = await Promise.all([
    AssignmentEmployee.find({ employeeId: emp.id }).populate({ path: 'assignmentId', populate: ['clientId', 'locationId'] }).sort({ createdAt: -1 }).limit(30),
    Feedback.find({ employeeId: emp.id }).populate('clientId').sort({ createdAt: -1 }).limit(30),
  ]);
  const completed = await AssignmentEmployee.countDocuments({ employeeId: emp.id, status: 'COMPLETED' });
  const total = await AssignmentEmployee.countDocuments({ employeeId: emp.id });
  const allFb = await Feedback.find({ employeeId: emp.id });
  const avgRating = allFb.length ? allFb.reduce((s, f) => s + f.overallRating, 0) / allFb.length : 0;
  res.json({ employee: emp, assignments, feedback, stats: { total, completed, avgRating, feedbackCount: allFb.length } });
});

r.put('/:id', adminOnly, async (req, res) => res.json(await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true })));

r.patch('/:id/status', adminOnly, async (req, res) =>
  res.json(await Employee.findByIdAndUpdate(req.params.id, { employmentStatus: req.body.employmentStatus }, { new: true })));

r.post('/:id/reset-password', adminOnly, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  await User.findByIdAndUpdate(emp.userId, { passwordHash: await bcrypt.hash(newPassword, 10) });
  res.json({ ok: true });
});

export default r;