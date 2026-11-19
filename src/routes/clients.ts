import express from 'express';
import { Client, Location } from '../models';
import { authMiddleware, adminOnly } from '../middleware/auth';

const r = express.Router();
r.use(authMiddleware, adminOnly);

r.get('/', async (req, res) => {
  const { search } = req.query as any;
  const filter: any = search ? { clientName: { $regex: search, $options: 'i' } } : {};
  res.json({ items: await Client.find(filter).sort({ createdAt: -1 }) });
});
r.post('/', async (req, res) => res.status(201).json(await Client.create(req.body)));
r.put('/:id', async (req, res) => res.json(await Client.findByIdAndUpdate(req.params.id, req.body, { new: true })));
r.delete('/:id', async (req, res) => { await Client.findByIdAndDelete(req.params.id); await Location.deleteMany({ clientId: req.params.id }); res.json({ ok: true }); });
r.get('/:id/locations', async (req, res) => res.json({ items: await Location.find({ clientId: req.params.id }) }));

export default r;