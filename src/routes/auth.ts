import express from 'express';
import bcrypt from 'bcryptjs';
import { User, Employee } from '../models';
import { signToken, authMiddleware, AuthRequest } from '../middleware/auth';

const r = express.Router();

r.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase(), role: 'ADMIN' });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });
  if (!(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken({ id: user.id, role: 'ADMIN', email: user.email }),
    user: { id: user.id, email: user.email, role: 'ADMIN' } });
});

r.post('/employee/login', async (req, res) => {
  const { employeeCode, phone, password } = req.body;
  const id = employeeCode || phone;
  if (!id) return res.status(400).json({ error: 'Employee code or phone required' });
  const emp = await Employee.findOne({ $or: [{ employeeCode: id }, { phone: id }] });
  if (!emp) return res.status(401).json({ error: 'Invalid credentials' });
  if (emp.employmentStatus !== 'ACTIVE') return res.status(401).json({ error: 'Account inactive' });
  const user = await User.findById(emp.userId);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken({ id: user.id, role: 'EMPLOYEE', email: user.email }),
    user: { id: user.id, role: 'EMPLOYEE', employeeId: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName } });
});

r.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const out: any = { id: user.id, email: user.email, role: user.role };
  if (user.role === 'EMPLOYEE') out.employee = await Employee.findOne({ userId: user.id });
  res.json(out);
});

r.post('/change-password', authMiddleware, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
  const user = await User.findById(req.user!.id);
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ error: 'Current password incorrect' });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.json({ ok: true });
});

export default r;