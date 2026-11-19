import express from 'express';
import { Location, Assignment } from '../models';
import { authMiddleware, adminOnly } from '../middleware/auth';

const r = express.Router();
r.use(authMiddleware, adminOnly);

r.get('/', async (req, res) => {
  const { clientId, city, search } = req.query as any;
  const filter: any = {};
  if (clientId) filter.clientId = clientId;
  if (city) filter.city = { $regex: city, $options: 'i' };
  if (search) filter.locationName = { $regex: search, $options: 'i' };
  res.json({ items: await Location.find(filter).populate('clientId').sort({ createdAt: -1 }) });
});
r.post('/', async (req, res) => res.status(201).json(await Location.create(req.body)));
r.put('/:id', async (req, res) => res.json(await Location.findByIdAndUpdate(req.params.id, req.body, { new: true })));
r.get('/:id/assignments', async (req, res) => res.json({ items: await Assignment.find({ locationId: req.params.id }).sort({ scheduledDate: -1 }) }));

export default r;